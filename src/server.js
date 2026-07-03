require('dotenv').config({ quiet: true });

const APP_VERSION = '3.11.0';
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

function validateProductionEnvironment() {
  if (!IS_PRODUCTION) return;
  const weakValues = new Set([
    '',
    'troque-por-uma-chave-grande-e-aleatoria',
    'troque-por-outra-chave-grande-e-aleatoria',
    'troque-esta-chave-no-arquivo-env',
    'COLE_AQUI_UMA_CHAVE_FORTE',
    'COLE_AQUI_OUTRA_CHAVE_FORTE',
  ]);
  const required = [
    ['JWT_SECRET', process.env.JWT_SECRET],
    ['APP_ENCRYPTION_KEY', process.env.APP_ENCRYPTION_KEY],
  ];
  const invalid = required.filter(([, value]) => weakValues.has(String(value || '').trim()) || String(value || '').trim().length < 32);
  if (invalid.length) {
    throw new Error(`Configuração de produção incompleta: gere valores fortes para ${invalid.map(([name]) => name).join(' e ')}.`);
  }
  const initialEmail = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const initialPassword = String(process.env.INITIAL_ADMIN_PASSWORD || '');
  if (!initialEmail.includes('@')) throw new Error('Configuração de produção incompleta: defina INITIAL_ADMIN_EMAIL.');
  if (initialPassword.length < 12) throw new Error('Configuração de produção incompleta: INITIAL_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');
}

validateProductionEnvironment();

const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');
const api = require('./routes/api');
const publicStoreApi = require('./routes/public-store');
const realtime = require('./services/realtime');
const assignment = require('./services/assignment');
const { verifyToken, activeSessionForPayload } = require('./middleware/auth');
const { db, nowIso, DB_PATH, DB_TYPE } = require('./db');
const { startBackupScheduler } = require('./services/backups');
const { startWaitingAlertScheduler } = require('./services/waiting-alerts');
const whatsapp = require('./services/whatsapp');
const { reconcileContacts } = require('./services/contact-identity');
const { getBusinessStatus, startBusinessHoursScheduler } = require('./services/business-hours');

const app = express();
if (String(process.env.TRUST_PROXY || '') === '1' || String(process.env.TRUST_PROXY || '').toLowerCase() === 'true') app.set('trust proxy', 1);

const server = http.createServer(app);
const allowedOrigins = String(process.env.APP_ORIGIN || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || !allowedOrigins.length || allowedOrigins.includes(String(origin).replace(/\/$/, ''))) return callback(null, true);
      return callback(new Error('Origem não autorizada.'));
    },
    credentials: true,
  },
});
realtime.setIo(io);

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  if (IS_PRODUCTION && req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ extended: true }));
app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1 AS ready').get();
    return res.json({ ok: true, service: 'G&M Automação', version: APP_VERSION, database: 'ready', database_engine: DB_TYPE, uptime_seconds: Math.floor(process.uptime()) });
  } catch {
    return res.status(503).json({ ok: false, service: 'G&M Automação', version: APP_VERSION, database: 'unavailable' });
  }
});
app.use('/api/public', publicStoreApi);
app.use('/api', api);

const publicDir = path.resolve(__dirname, '..', 'public');
const orderSiteDir = path.join(publicDir, 'pedido');
const staticOptions = {
  maxAge: IS_PRODUCTION ? '1h' : 0,
  setHeaders(res, filePath) {
    if (/\.html?$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
};
app.use('/pedido', express.static(orderSiteDir, { ...staticOptions, index: 'index.html' }));
app.get('/pedido/{*splat}', (req, res) => res.sendFile(path.join(orderSiteDir, 'index.html')));
app.use(express.static(publicDir, staticOptions));

app.get('/{*splat}', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Rota não encontrada.' });
  return res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

io.use((socket, next) => {
  const token = String(socket.handshake.auth?.token || '').trim();
  if (!token) return next(new Error('Não autenticado.'));
  try {
    const payload = verifyToken(token);
    const session = activeSessionForPayload(payload);
    const user = db.prepare('SELECT id,name,role,status,active,receive_assignments FROM users WHERE id=?').get(Number(payload.id));
    if (!user?.active) return next(new Error('Usuário inativo.'));
    if (!session) return next(new Error('Sessão encerrada ou expirada.'));
    socket.user = user;
    socket.sessionId = String(payload.sessionId || '');
    return next();
  } catch {
    return next(new Error('Sessão inválida ou expirada.'));
  }
});

const offlineTimers = new Map();

io.on('connection', (socket) => {
  const userId = Number(socket.user.id);
  socket.join(`user:${userId}`);
  socket.join(`role:${socket.user.role}`);
  const pendingOffline = offlineTimers.get(userId);
  if (pendingOffline) { clearTimeout(pendingOffline); offlineTimers.delete(userId); }
  const firstConnection = realtime.registerUserSocket(userId, socket.id);
  db.prepare('UPDATE users SET last_seen_at=?,last_activity_at=? WHERE id=?').run(nowIso(), nowIso(), userId);
  db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL').run(nowIso(), socket.sessionId);
  if (firstConnection) {
    realtime.emit('presence:updated', { userId, connected: true });
    if (socket.user.role === 'agent') setTimeout(() => assignment.rebalanceWaitingConversations(), 100);
  }
  socket.emit('system:ready', { version: APP_VERSION });
  socket.emit('business-hours:updated', getBusinessStatus());

  socket.on('disconnect', () => {
    const becameOffline = realtime.unregisterUserSocket(userId, socket.id);
    if (!becameOffline) return;
    const timer = setTimeout(() => {
      offlineTimers.delete(userId);
      if (realtime.isUserOnline(userId)) return;
      db.prepare('UPDATE users SET last_seen_at=?,last_activity_at=? WHERE id=?').run(nowIso(), nowIso(), userId);
      db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL').run(nowIso(), socket.sessionId);
      realtime.emit('presence:updated', { userId, connected: false });
      if (socket.user.role === 'agent') assignment.redistributeUserConversations(userId);
    }, 5000);
    offlineTimers.set(userId, timer);
  });
});

app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = Number(process.env.PORT || (IS_PRODUCTION ? 8080 : 3000));
const HOST = String(process.env.HOST || '0.0.0.0');
whatsapp.protectStoredCredentials();
whatsapp.repairPrimaryEvolutionConfiguration();
reconcileContacts();
startBackupScheduler();
startWaitingAlertScheduler();
startBusinessHoursScheduler();

server.listen(PORT, HOST, () => {
  console.log(`G&M Automação v${APP_VERSION}: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Banco de dados: ${DB_TYPE === 'postgres' ? 'PostgreSQL remoto' : DB_PATH}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'não informado'} | DB_CLIENT: ${process.env.DB_CLIENT || 'não informado'} | PGHOST: ${process.env.PGHOST || 'não informado'}`);
  if (String(process.env.GEMINI_API_KEY || '').trim()) console.log(`[Gemini] Revisor de produtos e atendimento conversacional ativados · modelo ${process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'} · projeto ${process.env.GEMINI_PROJECT_ID || 'vinculado à chave'}.`);
  else console.log('[Gemini] Revisor externo não configurado; usando somente a IA normal do sistema.');
  if (IS_PRODUCTION && !allowedOrigins.length) console.warn('Aviso: APP_ORIGIN não foi configurado; conexões Socket.IO aceitarão qualquer origem.');

  const maintainWebhook = () => whatsapp.ensurePrimaryEvolutionWebhook()
    .catch((error) => console.error('[WhatsApp] Não foi possível confirmar o webhook da Evolution:', error.message));
  setTimeout(maintainWebhook, 4000).unref?.();
  const webhookTimer = setInterval(maintainWebhook, 10 * 60 * 1000);
  webhookTimer.unref?.();
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recebido. Encerrando a G&M Automação...`);
  io.close();
  server.close(() => {
    if (DB_TYPE === 'sqlite') { try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* melhor esforço */ } }
    try { db.close(); } catch { /* melhor esforço */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
