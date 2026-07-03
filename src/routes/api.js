const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');
const { db, nowIso, insertMessage, DB_PATH } = require('../db');
const { signToken, requireAuth, requireAdmin } = require('../middleware/auth');
const realtime = require('../services/realtime');
const whatsapp = require('../services/whatsapp');
const { processIncomingMessage, normalizePhone } = require('../services/incoming');
const { generateGroundedReply } = require('../services/ai');
const { createConfirmedOrder } = require('../services/orders');
const { stampProviderResult, extractStatusUpdates, updateMessageStatusByProviderId } = require('../services/message-status');
const assignment = require('../services/assignment');
const backups = require('../services/backups');
const tables = require('../services/tables');
const { createOrUpdateContact, findContactByPhone, activeConversationForContact, ensureActiveConversation, canonicalPhone, registerAliases } = require('../services/contact-identity');
const businessHours = require('../services/business-hours');

const router = express.Router();

function requireTableOperator(req, res, next) {
  if (!['admin','supervisor','agent'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Acesso restrito à equipe de atendimento.' });
  }
  return next();
}

const webhookRateBuckets = new Map();
const recentWebhookFingerprints = new Map();

function safeSecretEquals(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function allowWebhookRequest(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const bucket = webhookRateBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start >= 60000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1;
  webhookRateBuckets.set(ip, bucket);
  return bucket.count <= 240;
}

function isDuplicateWebhookPayload(body) {
  const now = Date.now();
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
  const previous = recentWebhookFingerprints.get(fingerprint);
  recentWebhookFingerprints.set(fingerprint, now);
  if (recentWebhookFingerprints.size > 2000) {
    for (const [key, stamp] of recentWebhookFingerprints) if (now - stamp > 5 * 60000) recentWebhookFingerprints.delete(key);
  }
  return previous && now - previous < 5 * 60000;
}

function safeJson(value, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2].replace(/\s+/g, '') };
}

function localMediaAsBase64(source) {
  const value = String(source || '').trim();
  if (!value.startsWith('/stickers/')) return value;
  const relative = value.replace(/^\/+/, '');
  const filePath = path.resolve(__dirname, '..', '..', 'public', relative);
  const publicRoot = path.resolve(__dirname, '..', '..', 'public');
  if (!filePath.startsWith(publicRoot) || !fs.existsSync(filePath)) throw new Error('Arquivo da figurinha não encontrado.');
  return fs.readFileSync(filePath).toString('base64');
}

function validateMediaData(dataUrl, maxBytes = 12 * 1024 * 1024) {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('O arquivo enviado não está em um formato válido.');
  const size = Buffer.byteLength(parsed.base64, 'base64');
  if (size > maxBytes) throw new Error(`O arquivo ultrapassa o limite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  return { ...parsed, size };
}


function normalizePublicBaseUrl(value, evolutionBaseUrl = '') {
  let url = String(value || '').trim().replace(/\/$/, '');
  const evo = String(evolutionBaseUrl || '').trim().toLowerCase();
  const localEvolution = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(evo);
  if (!url && localEvolution) return 'http://host.docker.internal:3000';
  if (localEvolution) {
    url = url.replace(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i, (_match, _host, port) => `http://host.docker.internal${port || ':3000'}`);
  }
  return url;
}


function setting(key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function replaceVariables(text, context = {}) {
  const aliases = {
    Cliente: context.client || context.contact_name || 'cliente',
    Atendente: context.agent || context.user_name || 'Equipe',
    Empresa: context.company || setting('company_name', 'G&M Automação'),
    Telefone: context.phone || '',
    Pedido: context.order_id ? String(context.order_id).padStart(4, '0') : '',
    Subtotal: context.subtotal != null ? formatMoney(context.subtotal) : '',
    TaxaEntrega: context.delivery_fee != null ? formatMoney(context.delivery_fee) : '',
    Total: context.total != null ? formatMoney(context.total) : '',
    Endereco: context.address || '',
    Pagamento: context.payment_method || '',
    Instagram: context.instagram || setting('instagram', ''),
    Data: new Date().toLocaleDateString('pt-BR'),
    Hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    RetiradaEntrega: context.fulfillment_text || '',
    Mesa: context.table || context.table_name || '',
  };
  let output = String(text || '');
  for (const [key, value] of Object.entries(aliases)) {
    output = output.replaceAll(`{${key}}`, String(value ?? '')).replaceAll(`{${key.toLowerCase()}}`, String(value ?? ''));
  }
  return output;
}

function emphasizeOrder(text) {
  // Coloca em negrito somente “Pedido #0000”, sem capturar palavras da mesa/endereço.
  const normalized = String(text || '').replace(/\*{1,2}((?:seu\s+)?pedido\s*#\s*\d{1,12})\*{1,2}/gi, '$1');
  return normalized.replace(/((?:seu\s+)?pedido\s*#\s*\d{1,12})/gi, '*$1*');
}

function agentProviderText(content, user, context = {}) {
  if (setting('agent_signature_enabled', 'true') !== 'true') return content;
  const cleanName = String(user?.name || 'Atendente')
    .replace(/[\r\n*_~`]/g, '')
    .replace(/[.:;\-]+$/g, '')
    .trim() || 'Atendente';
  const template = setting('agent_message_prefix', '*{Atendente}:*\n');
  const compactTemplate = String(template || '').replace(/[\r\n]/g, '').trim();
  const defaultLike = /^\*?\s*\{atendente\}\s*[.:;\-]?\s*\*?\s*:?$/i.test(compactTemplate);
  let prefix = defaultLike
    ? `*${cleanName}:*`
    : replaceVariables(template, { ...context, agent: cleanName }).replace(/\s+$/g, '');
  // Corrige modelos antigos como “*Administrador.*:” que quebram o negrito no WhatsApp.
  prefix = prefix.replace(/^\*([^*\n]+?)[.]\*\s*:\s*$/u, '*$1:*');
  return `${prefix}\n${content}`;
}

function canViewAllConversations(user) {
  return ['admin', 'supervisor'].includes(user?.role);
}

function canAccessConversation(user, conversation) {
  if (!conversation) return false;
  if (canViewAllConversations(user)) return true;
  if (user?.role === 'kitchen') return false;
  return Number(conversation.assigned_user_id) === Number(user?.id);
}

function ensureConversationAccess(req, res, conversation) {
  if (!conversation) { res.status(404).json({ error: 'Atendimento não encontrado.' }); return false; }
  if (!canAccessConversation(req.user, conversation)) { res.status(403).json({ error: 'Este atendimento está atribuído a outra pessoa.' }); return false; }
  return true;
}

function assigneeAfterMessage(user, conversation) {
  return user?.role === 'agent' ? Number(user.id) : (Number(conversation?.assigned_user_id) || null);
}

function updateConversationAfterMessage(user, conversation, id, firstResponse = false) {
  const assignedUserId = assigneeAfterMessage(user, conversation);
  const status = assignedUserId ? 'open' : 'waiting_human';
  if (firstResponse) {
    db.prepare('UPDATE conversations SET status=?,assigned_user_id=?,unread_count=0,first_response_at=COALESCE(first_response_at,?) WHERE id=?')
      .run(status, assignedUserId, nowIso(), id);
  } else {
    db.prepare('UPDATE conversations SET status=?,assigned_user_id=?,unread_count=0 WHERE id=?')
      .run(status, assignedUserId, id);
  }
  return assignedUserId;
}

function publicUserRow(row) {
  if (!row) return null;
  return {
    ...row,
    active: Boolean(row.active),
    receive_assignments: Boolean(row.receive_assignments),
  };
}

function presenceUserRow(row) {
  const user = publicUserRow(row);
  if (!user) return null;
  const connected = realtime.isUserOnline(user.id);
  return {
    ...user,
    configured_status: user.status,
    status: connected ? user.status : 'offline',
    connected,
  };
}

function sortPresenceUsers(users) {
  const order = { online: 0, busy: 1, paused: 2, offline: 3 };
  return users.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4)
    || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
}

function protocol() {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ATD-${year}-${random}`;
}

function getConversation(id) {
  const row = db.prepare(`
    SELECT c.*, ct.name AS contact_name, ct.phone, ct.email, ct.notes, ct.tags,
           q.name AS queue_name, q.color AS queue_color,
           u.name AS assigned_user_name,
           cr.name AS close_reason_name, cu.name AS closed_by_user_name,
           (SELECT o.status FROM orders o WHERE o.conversation_id=c.id ORDER BY o.id DESC LIMIT 1) AS active_order_status,
           (SELECT o.id FROM orders o WHERE o.conversation_id=c.id ORDER BY o.id DESC LIMIT 1) AS active_order_id,
           (SELECT rt.name FROM orders o JOIN restaurant_tables rt ON rt.id=o.table_id WHERE o.conversation_id=c.id ORDER BY o.id DESC LIMIT 1) AS table_name,
           (SELECT o.table_id FROM orders o WHERE o.conversation_id=c.id AND o.table_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_id,
           (SELECT o.table_tab_id FROM orders o WHERE o.conversation_id=c.id AND o.table_tab_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_tab_id,
           (SELECT o.table_member_id FROM orders o WHERE o.conversation_id=c.id AND o.table_member_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_member_id,
           (SELECT COALESCE(NULLIF(tm.display_name,''),ct.name) FROM orders o LEFT JOIN table_members tm ON tm.id=o.table_member_id WHERE o.conversation_id=c.id AND o.table_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_member_name
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN queues q ON q.id = c.queue_id
    LEFT JOIN users u ON u.id = c.assigned_user_id
    LEFT JOIN closure_reasons cr ON cr.id = c.close_reason_id
    LEFT JOIN users cu ON cu.id = c.closed_by_user_id
    WHERE c.id = ?
  `).get(id);
  if (!row) return null;
  row.tags = safeJson(row.tags);
  row.ai_enabled = Boolean(row.ai_enabled);
  return row;
}

function contactHistory(contactId) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(contactId));
  if (!contact) return null;
  const orders = db.prepare(`SELECT o.*,u.name cancelled_by_user_name FROM orders o LEFT JOIN users u ON u.id=o.cancelled_by_user_id WHERE o.contact_id=? ORDER BY o.id DESC LIMIT 8`).all(contact.id)
    .map((order) => ({ ...order, items: db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(order.id) }));
  let topProducts = [];
  try {
    topProducts = db.prepare(`
      SELECT oi.product_id,oi.name,SUM(oi.quantity) quantity,COUNT(DISTINCT oi.order_id) orders_count
      FROM order_items oi JOIN orders o ON o.id=oi.order_id
      WHERE o.contact_id=? AND o.status!='cancelled'
      GROUP BY oi.product_id,oi.name
      ORDER BY SUM(oi.quantity) DESC,COUNT(DISTINCT oi.order_id) DESC LIMIT 5
    `).all(contact.id);
  } catch (error) {
    // O histórico de compras é informativo. Uma falha nessa estatística não pode
    // impedir o atendente de abrir a conversa e responder o cliente.
    console.error('[Histórico do cliente] Falha ao carregar produtos frequentes:', error.message);
  }
  let frequentAddress = null;
  try {
    frequentAddress = db.prepare(`
      SELECT MIN(address) AS address,COUNT(*) uses FROM orders
      WHERE contact_id=? AND fulfillment_method='delivery' AND trim(address)!='' AND status!='cancelled'
      GROUP BY lower(trim(address)) ORDER BY COUNT(*) DESC,MAX(id) DESC LIMIT 1
    `).get(contact.id) || null;
  } catch (error) {
    console.error('[Histórico do cliente] Falha ao carregar endereço frequente:', error.message);
  }
  const conversations = db.prepare(`SELECT id,protocol,status,created_at,closed_at,last_message FROM conversations WHERE contact_id=? ORDER BY id DESC LIMIT 50`).all(contact.id);
  return { ...contact, tags: safeJson(contact.tags), orders, topProducts, frequentAddress, conversations };
}

function audit(userId, action, entity, entityId, details = {}) {
  db.prepare(`
    INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId || null, action, entity, entityId || null, JSON.stringify(details), nowIso());
}

function addSystemNote(conversationId, content) {
  return insertMessage({
    conversationId,
    senderType: 'system',
    content,
    isInternal: 1,
    deliveryStatus: 'sent',
  });
}

function notifyUser(userId, type, title, message, entityType = '', entityId = null) {
  if (!userId) return null;
  const result = db.prepare(`INSERT INTO notifications(type,title,message,entity_type,entity_id,target_user_id,target_role,created_at) VALUES(?,?,?,?,?,?,'',?)`)
    .run(type,title,message,entityType,entityId,Number(userId),nowIso());
  const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
  realtime.emitToUser(userId, 'notification:new', notification);
  return notification;
}

function activeTransferAgents(queueId = 0) {
  const targetQueueId=Number(queueId||0);
  const params=[];
  let membershipJoin='';
  let membershipRule='';
  if(targetQueueId){
    membershipJoin='LEFT JOIN queue_memberships qm ON qm.user_id=u.id AND qm.queue_id=? AND qm.active=1 AND COALESCE(qm.joined,1)=1';
    params.push(targetQueueId);
    membershipRule='AND (qm.queue_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM queue_memberships qmx WHERE qmx.user_id=u.id))';
  }
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.sector, u.status, u.avatar_url, u.receive_assignments, u.pause_reason,
      COUNT(CASE WHEN c.status='open' THEN 1 END) AS open_count
    FROM users u
    ${membershipJoin}
    LEFT JOIN conversations c ON c.assigned_user_id=u.id
    WHERE u.active=1 AND u.role='agent'
      ${membershipRule}
    GROUP BY u.id
    ORDER BY CASE u.status WHEN 'online' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,
             open_count ASC, u.name
  `).all(...params).map(presenceUserRow);
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0,120);
}

function requestDevice(req) {
  const userAgent = String(req.headers['user-agent'] || '').slice(0,500);
  const hinted = String(req.body?.deviceName || '').trim().slice(0,120);
  if (hinted) return hinted;
  if (/mobile|android|iphone/i.test(userAgent)) return 'Celular ou tablet';
  if (/windows/i.test(userAgent)) return 'Computador Windows';
  if (/macintosh|mac os/i.test(userAgent)) return 'Computador Mac';
  if (/linux/i.test(userAgent)) return 'Computador Linux';
  return 'Navegador desconhecido';
}

router.post('/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const force = req.body.force === true;
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(email);
  if (!user || !user.active || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  db.prepare("UPDATE user_sessions SET revoked_at=?,revoke_reason='Sessão expirada por inatividade' WHERE user_id=? AND revoked_at IS NULL AND datetime(last_seen_at)<datetime(?)")
    .run(nowIso(), user.id, staleBefore);
  const active = db.prepare(`SELECT id,device_name,ip_address,created_at,last_seen_at FROM user_sessions WHERE user_id=? AND revoked_at IS NULL AND datetime(expires_at)>datetime(?) ORDER BY last_seen_at DESC LIMIT 1`).get(user.id, nowIso());
  if (active && !force) {
    return res.status(409).json({
      error: `Este usuário já está conectado em ${active.device_name || 'outro dispositivo'}. Encerre a sessão anterior para entrar aqui.`,
      code: 'SESSION_ACTIVE',
      activeSession: active,
    });
  }
  if (active && force) {
    db.prepare("UPDATE user_sessions SET revoked_at=?,revoke_reason='Substituída por um novo login' WHERE user_id=? AND revoked_at IS NULL").run(nowIso(), user.id);
    realtime.emitToUser(user.id, 'session:revoked', { reason: 'Sua conta foi acessada em outro dispositivo.' });
  }

  const sessionId = crypto.randomUUID();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + 12 * 3600_000).toISOString();
  const userAgent = String(req.headers['user-agent'] || '').slice(0,500);
  try {
    db.prepare(`INSERT INTO user_sessions(id,user_id,device_name,user_agent,ip_address,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?)`)
      .run(sessionId, user.id, requestDevice(req), userAgent, requestIp(req), createdAt, createdAt, expiresAt);
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Esta conta acabou de ser conectada em outro dispositivo.', code: 'SESSION_ACTIVE' });
    throw error;
  }
  const publicUser = { id: user.id, name: user.name, email: user.email, role: user.role, sector: user.sector, status: user.status, avatar_url: user.avatar_url || '', receive_assignments: Boolean(user.receive_assignments) };
  audit(user.id, 'login', 'session', null, { sessionId, device: requestDevice(req), ip: requestIp(req) });
  return res.json({ token: signToken(publicUser, sessionId), sessionId, user: publicUser });
});

router.post('/auth/logout', requireAuth, (req, res) => {
  db.prepare("UPDATE user_sessions SET revoked_at=?,revoke_reason='Logout realizado' WHERE id=? AND revoked_at IS NULL").run(nowIso(), req.user.sessionId);
  audit(req.user.id, 'logout', 'session', null, { sessionId: req.user.sessionId });
  realtime.emitToUser(req.user.id, 'session:revoked', { sessionId: req.user.sessionId, reason: 'Sessão encerrada.' });
  res.json({ success: true });
});

router.post('/auth/heartbeat', requireAuth, (req, res) => {
  db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE id=?').run(nowIso(), req.user.sessionId);
  db.prepare('UPDATE users SET last_seen_at=?,last_activity_at=? WHERE id=?').run(nowIso(), nowIso(), req.user.id);
  res.json({ success: true, at: nowIso() });
});

router.get('/security/sessions', requireAuth, (req, res) => {
  const userId = req.user.id;
  const rows = db.prepare(`SELECT id,device_name,ip_address,created_at,last_seen_at,expires_at,revoked_at,revoke_reason FROM user_sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 50`).all(userId)
    .map((row) => ({ ...row, current: row.id === req.user.sessionId, active: !row.revoked_at && new Date(row.expires_at).getTime() > Date.now() }));
  res.json(rows);
});

router.post('/security/sessions/:id/revoke', requireAuth, (req, res) => {
  const id = String(req.params.id || '');
  const session = db.prepare('SELECT * FROM user_sessions WHERE id=? AND user_id=?').get(id, req.user.id);
  if (!session) return res.status(404).json({ error: 'Sessão não encontrada.' });
  db.prepare("UPDATE user_sessions SET revoked_at=?,revoke_reason='Encerrada pelo usuário' WHERE id=? AND revoked_at IS NULL").run(nowIso(), id);
  audit(req.user.id, 'revoke_session', 'session', null, { sessionId: id });
  realtime.emitToUser(req.user.id, 'session:revoked', { sessionId: id, reason: 'Sessão encerrada nas configurações.' });
  res.json({ success: true, current: id === req.user.sessionId });
});

router.post('/security/sessions/revoke-others', requireAuth, (req, res) => {
  const result = db.prepare("UPDATE user_sessions SET revoked_at=?,revoke_reason='Outras sessões encerradas' WHERE user_id=? AND id!=? AND revoked_at IS NULL").run(nowIso(), req.user.id, req.user.sessionId);
  audit(req.user.id, 'revoke_other_sessions', 'session', null, { total: Number(result.changes || 0) });
  realtime.emitToUser(req.user.id, 'sessions:refresh', {});
  res.json({ success: true, revoked: Number(result.changes || 0) });
});

router.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, role, sector, status, active, avatar_url, receive_assignments, pause_reason, last_seen_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const preferences = db.prepare('SELECT theme,compact_mode,sounds_enabled,desktop_notifications,density FROM user_preferences WHERE user_id=?').get(req.user.id)
    || { theme: 'light', compact_mode: 0, sounds_enabled: 1, desktop_notifications: 1, density: 'comfortable' };
  db.prepare('UPDATE users SET last_seen_at=?,last_activity_at=? WHERE id=?').run(nowIso(), nowIso(), req.user.id);
  return res.json({ ...publicUserRow(user), sessionId: req.user.sessionId, preferences: { ...preferences, compact_mode: Boolean(preferences.compact_mode), sounds_enabled: Boolean(preferences.sounds_enabled), desktop_notifications: Boolean(preferences.desktop_notifications) } });
});

router.get('/presence-board', requireAuth, (req, res) => {
  const users = sortPresenceUsers(db.prepare(`
    SELECT u.id,u.name,u.email,u.role,u.sector,u.status,u.avatar_url,u.receive_assignments,u.pause_reason,u.last_seen_at,
      COUNT(CASE WHEN c.status='open' THEN 1 END) AS open_count
    FROM users u LEFT JOIN conversations c ON c.assigned_user_id=u.id
    WHERE u.active=1 AND u.role IN ('admin','supervisor','agent','kitchen')
    GROUP BY u.id ORDER BY CASE u.status WHEN 'online' THEN 0 WHEN 'busy' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,u.name
  `).all().map((u)=>({
    ...presenceUserRow(u),
    queues: u.role === 'kitchen' ? [] : db.prepare(`SELECT q.id,q.name,q.color,COALESCE(qm.joined,1) joined FROM queues q LEFT JOIN queue_memberships qm ON qm.queue_id=q.id AND qm.user_id=? WHERE q.active=1 AND (qm.active=1 OR qm.active IS NULL) ORDER BY q.name`).all(u.id),
  })));
  const me = users.find((u)=>Number(u.id)===Number(req.user.id)) || null;
  return res.json({ me, users });
});

router.get('/dashboard', requireAuth, (req, res) => {
  const period = String(req.query.period || 'realtime');
  const today = new Date().toISOString().slice(0, 10);
  const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  let from = String(req.query.from || '');
  let to = String(req.query.to || '');
  if (period === 'today' || period === 'realtime') from = to = today;
  else if (period === 'yesterday') from = to = daysAgo(1);
  else if (period === '7days') { from = daysAgo(6); to = today; }
  else if (period === '30days') { from = daysAgo(29); to = today; }
  else if (period === 'custom') { from = from || today; to = to || today; }
  else { from = daysAgo(6); to = today; }

  const ownOnly = !canViewAllConversations(req.user);
  const conversationWhere = ['COALESCE(c.hidden,0)=0'];
  const conversationParams = [];
  if (ownOnly) { conversationWhere.push('c.assigned_user_id=?'); conversationParams.push(req.user.id); }
  if (period !== 'realtime') { conversationWhere.push('substr(c.created_at,1,10) BETWEEN ? AND ?'); conversationParams.push(from, to); }
  const conversationClause = conversationWhere.length ? ` AND ${conversationWhere.join(' AND ')}` : '';

  const orderWhere = ["o.status!='cancelled'"];
  const orderParams = [];
  if (ownOnly) { orderWhere.push('c.assigned_user_id=?'); orderParams.push(req.user.id); }
  orderWhere.push('substr(o.created_at,1,10) BETWEEN ? AND ?'); orderParams.push(from, to);
  const orderJoin = ownOnly ? ' JOIN conversations c ON c.id=o.conversation_id ' : '';

  const activeConversationSignal = "(TRIM(COALESCE(c.last_message,''))<>'' OR EXISTS (SELECT 1 FROM orders ao WHERE ao.conversation_id=c.id AND ao.status NOT IN ('delivered','picked_up','cancelled')))";
  const counts = {
    waiting: db.prepare(`SELECT COUNT(*) total FROM conversations c WHERE c.status IN ('waiting','waiting_human') AND c.closed_at IS NULL AND ${activeConversationSignal}${conversationClause}`).get(...conversationParams).total,
    open: db.prepare(`SELECT COUNT(*) total FROM conversations c WHERE c.status='open' AND c.closed_at IS NULL AND ${activeConversationSignal}${conversationClause}`).get(...conversationParams).total,
    closedToday: db.prepare(`SELECT COUNT(*) total FROM conversations c WHERE c.status='closed' AND substr(c.closed_at,1,10) BETWEEN ? AND ?${ownOnly ? ' AND c.assigned_user_id=?' : ''}`).get(from, to, ...(ownOnly ? [req.user.id] : [])).total,
    contacts: period === 'realtime'
      ? (ownOnly ? db.prepare('SELECT COUNT(DISTINCT contact_id) total FROM conversations WHERE assigned_user_id=?').get(req.user.id).total : db.prepare('SELECT COUNT(*) total FROM contacts').get().total)
      : db.prepare(`SELECT COUNT(DISTINCT c.contact_id) total FROM conversations c WHERE 1=1${conversationClause}`).get(...conversationParams).total,
    ordersOpen: db.prepare(`SELECT COUNT(*) total FROM orders o${orderJoin} WHERE o.status NOT IN ('delivered','picked_up','cancelled')${ownOnly ? ' AND c.assigned_user_id=?' : ''}${period === 'realtime' ? '' : ' AND substr(o.created_at,1,10) BETWEEN ? AND ?'}`).get(...(ownOnly ? [req.user.id] : []), ...(period === 'realtime' ? [] : [from, to])).total,
    occupiedTables: db.prepare("SELECT COUNT(DISTINCT table_id) total FROM table_tabs WHERE status IN ('open','account_requested') AND closed_at IS NULL").get().total,
    revenue: db.prepare(`SELECT COALESCE(SUM(o.total),0) total FROM orders o${orderJoin} WHERE ${orderWhere.join(' AND ')}`).get(...orderParams).total,
  };

  const queueJoinConditions = ["COALESCE(c.hidden,0)=0", "c.closed_at IS NULL", activeConversationSignal];
  const queueParams = [];
  if (ownOnly) { queueJoinConditions.push('c.assigned_user_id=?'); queueParams.push(req.user.id); }
  if (period !== 'realtime') { queueJoinConditions.push('substr(c.created_at,1,10) BETWEEN ? AND ?'); queueParams.push(from, to); }
  const queues = db.prepare(`
    SELECT q.id,q.name,q.color,
      SUM(CASE WHEN c.status IN ('waiting','waiting_human') THEN 1 ELSE 0 END) waiting,
      SUM(CASE WHEN c.status='open' THEN 1 ELSE 0 END) open
    FROM queues q
    LEFT JOIN conversations c ON c.queue_id=q.id${queueJoinConditions.length ? ` AND ${queueJoinConditions.join(' AND ')}` : ''}
    WHERE q.active=1 GROUP BY q.id ORDER BY q.name
  `).all(...queueParams);

  const recent = db.prepare(`
    SELECT c.id,c.status,c.last_message,c.last_message_at,ct.name contact_name,q.name queue_name,u.name assigned_user_name
    FROM conversations c JOIN contacts ct ON ct.id=c.contact_id JOIN queues q ON q.id=c.queue_id
    LEFT JOIN users u ON u.id=c.assigned_user_id
    WHERE 1=1${conversationClause}
    ORDER BY c.last_message_at DESC LIMIT 8
  `).all(...conversationParams);
  return res.json({ period, from, to, counts, queues, recent, refreshedAt: nowIso() });
});

router.get('/queues', requireAuth, (req, res) => {
  const all = String(req.query.all || '') === '1';
  res.json(db.prepare(`SELECT q.*,COUNT(DISTINCT qm.user_id) member_count FROM queues q LEFT JOIN queue_memberships qm ON qm.queue_id=q.id AND qm.active=1 ${all ? '' : 'WHERE q.active=1'} GROUP BY q.id ORDER BY q.active DESC,q.name`).all());
});

router.post('/queues', requireAuth, requireAdmin, (req,res)=>{
  const name=String(req.body.name||'').trim(); const color=String(req.body.color||'#1458EA').trim();
  if(name.length<2) return res.status(400).json({error:'Informe o nome da fila.'});
  try { const result=db.prepare('INSERT INTO queues(name,color,active,created_at) VALUES(?,?,1,?)').run(name,color,nowIso()); audit(req.user.id,'create','queue',Number(result.lastInsertRowid),{name}); res.status(201).json(db.prepare('SELECT * FROM queues WHERE id=?').get(Number(result.lastInsertRowid))); }
  catch(error){ if(/unique/i.test(String(error.message))) return res.status(409).json({error:'Já existe uma fila com esse nome.'}); throw error; }
});

router.put('/queues/:id', requireAuth, requireAdmin, (req,res)=>{
  const id=Number(req.params.id); const current=db.prepare('SELECT * FROM queues WHERE id=?').get(id); if(!current) return res.status(404).json({error:'Fila não encontrada.'});
  const name=String(req.body.name??current.name).trim(), color=String(req.body.color??current.color).trim(), active=req.body.active==null?current.active:(req.body.active?1:0);
  db.prepare('UPDATE queues SET name=?,color=?,active=? WHERE id=?').run(name,color,active,id); audit(req.user.id,'update','queue',id,{name,active:Boolean(active)}); res.json(db.prepare('SELECT * FROM queues WHERE id=?').get(id));
});

router.get('/queue-memberships', requireAuth, requireAdmin, (req,res)=>{
  const rows=db.prepare(`SELECT qm.user_id,qm.queue_id,qm.active,qm.joined,u.name user_name,u.role,q.name queue_name,q.color FROM queue_memberships qm JOIN users u ON u.id=qm.user_id JOIN queues q ON q.id=qm.queue_id ORDER BY u.name,q.name`).all();
  res.json(rows.map((r)=>({...r,active:Boolean(r.active),joined:Boolean(r.joined)})));
});

router.put('/users/:id/queues', requireAuth, requireAdmin, (req,res)=>{
  const userId=Number(req.params.id); const targetUser=db.prepare('SELECT id,role FROM users WHERE id=?').get(userId); if(!targetUser) return res.status(404).json({error:'Usuário não encontrado.'});
  const queueIds=[...new Set((Array.isArray(req.body.queue_ids)?req.body.queue_ids:[]).map(Number).filter(Boolean))]; const stamp=nowIso();
  const allQueues=db.prepare('SELECT id FROM queues WHERE active=1 ORDER BY id').all();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM queue_memberships WHERE user_id=?').run(userId);
    const insert=db.prepare('INSERT INTO queue_memberships(user_id,queue_id,active,joined,created_at) VALUES(?,?,1,?,?)');
    for(const queue of allQueues) insert.run(userId,queue.id,queueIds.includes(queue.id)?1:0,stamp);
    db.exec('COMMIT');
  } catch(error){ db.exec('ROLLBACK'); throw error; }
  audit(req.user.id,'update_queues','user',userId,{queueIds});
  if(targetUser.role==='agent'){
    if(assignment.shouldReceiveAssignments(userId)) assignment.rebalanceWaitingConversations();
    else assignment.redistributeUserConversations(userId);
  }
  res.json({success:true,queue_ids:queueIds});
});

router.get('/my-queues', requireAuth, (req,res)=>{
  const hasExplicit=db.prepare('SELECT 1 FROM queue_memberships WHERE user_id=? LIMIT 1').get(req.user.id);
  const rows=db.prepare(`SELECT q.id,q.name,q.color,q.active,qm.active allowed,qm.joined FROM queues q LEFT JOIN queue_memberships qm ON qm.queue_id=q.id AND qm.user_id=? WHERE q.active=1 ORDER BY q.name`).all(req.user.id);
  res.json(rows.map((r)=>({...r,allowed:hasExplicit?Boolean(r.allowed):true,joined:hasExplicit?Boolean(r.allowed&&r.joined):true})));
});
router.put('/my-queues', requireAuth, (req,res)=>{
  const joinedIds=[...new Set((Array.isArray(req.body.queue_ids)?req.body.queue_ids:[]).map(Number).filter(Boolean))];
  const existing=db.prepare('SELECT * FROM queue_memberships WHERE user_id=?').all(req.user.id); const stamp=nowIso();
  db.exec('BEGIN');
  try {
    if(!existing.length){ const all=db.prepare('SELECT id FROM queues WHERE active=1').all(); const ins=db.prepare('INSERT INTO queue_memberships(user_id,queue_id,active,joined,created_at) VALUES(?,?,1,?,?)'); for(const q of all) ins.run(req.user.id,q.id,joinedIds.includes(q.id)?1:0,stamp); }
    else { const update=db.prepare('UPDATE queue_memberships SET joined=? WHERE user_id=? AND queue_id=? AND active=1'); for(const row of existing) update.run(joinedIds.includes(row.queue_id)?1:0,req.user.id,row.queue_id); }
    db.exec('COMMIT');
  } catch(error){db.exec('ROLLBACK');throw error;}
  audit(req.user.id,'join_queues','user',req.user.id,{joinedIds});
  if (req.user.role === 'agent') {
    if (assignment.shouldReceiveAssignments(req.user.id)) assignment.rebalanceWaitingConversations();
    else assignment.redistributeUserConversations(req.user.id);
  }
  res.json({success:true,queue_ids:joinedIds});
});

router.get('/transfer-options', requireAuth, (req, res) => {
  const queues = db.prepare('SELECT id,name,color,active FROM queues WHERE active=1 ORDER BY name').all();
  const users = activeTransferAgents().map((user) => ({ ...user, available: user.status === 'online' && user.connected && user.receive_assignments }));
  res.json({ queues, users });
});

router.post('/conversations/claim-oldest', requireAuth, (req, res) => {
  if (req.user.role !== 'agent') return res.status(403).json({ error: 'Somente atendentes podem receber conversas da fila.' });
  const queueId = Number(req.body.queueId || 0);
  let sql = "SELECT id FROM conversations WHERE status IN ('waiting','waiting_human')";
  const params = [];
  if (queueId) { sql += ' AND queue_id=?'; params.push(queueId); }
  sql += ' ORDER BY last_message_at ASC, id ASC LIMIT 1';
  const row = db.prepare(sql).get(...params);
  if (!row) return res.status(404).json({ error: 'Não há atendimentos aguardando nessa fila.' });
  const before = getConversation(row.id);
  db.prepare("UPDATE conversations SET assigned_user_id=?, status='open', unread_count=0 WHERE id=?").run(req.user.id, row.id);
  addSystemNote(row.id, 'Atendimento assumido pela equipe.');
  audit(req.user.id, 'claim_oldest', 'conversation', row.id, { queueId: before.queue_id });
  const updated = getConversation(row.id);
  realtime.emit('conversation:updated', updated);
  res.json(updated);
});

router.get('/users', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.name,u.email,u.role,u.sector,u.status,u.active,u.avatar_url,u.receive_assignments,u.pause_reason,u.last_seen_at,u.created_at,
      COUNT(CASE WHEN c.status='open' THEN 1 END) AS open_count
    FROM users u LEFT JOIN conversations c ON c.assigned_user_id=u.id
    GROUP BY u.id ORDER BY u.active DESC,u.name
  `).all();
  res.json(sortPresenceUsers(rows.map(presenceUserRow)));
});

router.put('/profile', requireAuth, (req, res) => {
  const current = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const name = String(req.body.name ?? current.name).trim();
  const password = String(req.body.password || '');
  const status = ['online','busy','paused','offline'].includes(String(req.body.status)) ? String(req.body.status) : current.status;
  const pauseReason = status === 'paused' ? String(req.body.pause_reason || current.pause_reason || '').trim().slice(0,120) : '';
  const receiveAssignments = req.body.receive_assignments == null ? current.receive_assignments : (req.body.receive_assignments ? 1 : 0);
  const avatarUrl = String(req.body.avatar_url ?? current.avatar_url ?? '').trim().slice(0,2_000_000);
  if (name.length < 2) return res.status(400).json({ error: 'Informe um nome válido.' });
  if (password && password.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  db.prepare('UPDATE users SET name=?,password_hash=?,status=?,pause_reason=?,receive_assignments=?,avatar_url=?,last_activity_at=? WHERE id=?')
    .run(name, password ? bcrypt.hashSync(password,10) : current.password_hash, status, pauseReason, receiveAssignments, avatarUrl, nowIso(), current.id);
  const pref = req.body.preferences || {};
  const currentPref = db.prepare('SELECT * FROM user_preferences WHERE user_id=?').get(current.id) || {};
  const theme = ['light','dark','system'].includes(String(pref.theme)) ? String(pref.theme) : (currentPref.theme || 'light');
  const density = ['comfortable','compact'].includes(String(pref.density)) ? String(pref.density) : (currentPref.density || 'comfortable');
  db.prepare(`INSERT INTO user_preferences(user_id,theme,compact_mode,sounds_enabled,desktop_notifications,density,updated_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET theme=excluded.theme,compact_mode=excluded.compact_mode,sounds_enabled=excluded.sounds_enabled,desktop_notifications=excluded.desktop_notifications,density=excluded.density,updated_at=excluded.updated_at`)
    .run(current.id,theme,pref.compact_mode ? 1 : 0,pref.sounds_enabled === false ? 0 : 1,pref.desktop_notifications === false ? 0 : 1,density,nowIso());
  audit(req.user.id,'update_profile','user',current.id,{status,receiveAssignments:Boolean(receiveAssignments)});
  const user = db.prepare('SELECT id,name,email,role,sector,status,active,avatar_url,receive_assignments,pause_reason,last_seen_at FROM users WHERE id=?').get(current.id);
  realtime.emit('presence:updated', presenceUserRow(user));
  if (user.role === 'agent') {
    if (assignment.shouldReceiveAssignments(user.id)) assignment.rebalanceWaitingConversations();
    else assignment.redistributeUserConversations(user.id);
  }
  return res.json(publicUserRow(user));
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = ['admin','supervisor','agent','kitchen'].includes(String(req.body.role)) ? String(req.body.role) : 'agent';
  const sector = String(req.body.sector || (role === 'kitchen' ? 'Cozinha' : 'Atendimento')).trim();
  if (name.length < 2 || !email.includes('@')) return res.status(400).json({ error: 'Informe nome e e-mail válidos.' });
  if (password.length < 6) return res.status(400).json({ error: 'A senha precisa ter pelo menos 6 caracteres.' });
  try {
    const result = db.prepare(`INSERT INTO users (name,email,password_hash,role,sector,status,active,receive_assignments,created_at) VALUES (?,?,?,?,?,'online',1,?,?)`)
      .run(name, email, bcrypt.hashSync(password, 10), role, sector, role === 'agent' ? 1 : 0, nowIso());
    audit(req.user.id, 'create', 'user', Number(result.lastInsertRowid), { role });
    const user = db.prepare('SELECT id,name,email,role,sector,status,active,avatar_url,receive_assignments,pause_reason,created_at FROM users WHERE id=?').get(Number(result.lastInsertRowid));
    return res.status(201).json(publicUserRow(user));
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    throw error;
  }
});

router.put('/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const name = String(req.body.name ?? current.name).trim();
  const email = String(req.body.email ?? current.email).trim().toLowerCase();
  const role = ['admin','supervisor','agent','kitchen'].includes(String(req.body.role)) ? String(req.body.role) : current.role;
  const sector = String(req.body.sector ?? current.sector).trim();
  const active = req.body.active == null ? current.active : (req.body.active ? 1 : 0);
  const receiveAssignments = req.body.receive_assignments == null ? current.receive_assignments : (req.body.receive_assignments ? 1 : 0);
  const status = ['online','busy','paused','offline'].includes(String(req.body.status)) ? String(req.body.status) : current.status;
  const password = String(req.body.password || '');
  if (id === req.user.id && !active) return res.status(400).json({ error: 'Você não pode desativar seu próprio usuário.' });
  if (password && password.length < 6) return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 6 caracteres.' });
  try {
    db.prepare('UPDATE users SET name=?,email=?,role=?,sector=?,active=?,receive_assignments=?,status=?,password_hash=? WHERE id=?')
      .run(name,email,role,sector,active,receiveAssignments,status,password ? bcrypt.hashSync(password,10) : current.password_hash,id);
    audit(req.user.id,'update','user',id,{role,active:Boolean(active),receiveAssignments:Boolean(receiveAssignments),status});
    const user = db.prepare('SELECT id,name,email,role,sector,status,active,avatar_url,receive_assignments,pause_reason,last_seen_at,created_at FROM users WHERE id=?').get(id);
    realtime.emit('presence:updated', presenceUserRow(user));
    if(current.role==='agent' || user.role==='agent'){
      if(user.role==='agent' && assignment.shouldReceiveAssignments(user.id)) assignment.rebalanceWaitingConversations();
      else assignment.redistributeUserConversations(user.id);
    }
    return res.json(publicUserRow(user));
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    throw error;
  }
});

router.get('/conversations', requireAuth, (req, res) => {
  const status = String(req.query.status || 'all');
  const search = `%${String(req.query.search || '').trim()}%`;
  const queueId = Number(req.query.queueId || 0);
  const userId = Number(req.query.userId || 0);
  const reasonId = Number(req.query.reasonId || 0);
  const order = String(req.query.order || 'recent');
  let sql = `
    SELECT c.*, ct.name AS contact_name, ct.phone, ct.tags,
           q.name AS queue_name, q.color AS queue_color,
           u.name AS assigned_user_name,
           cr.name AS close_reason_name, cu.name AS closed_by_user_name,
           (SELECT o.status FROM orders o WHERE o.conversation_id=c.id ORDER BY o.id DESC LIMIT 1) AS active_order_status,
           (SELECT o.id FROM orders o WHERE o.conversation_id=c.id ORDER BY o.id DESC LIMIT 1) AS active_order_id,
           (SELECT rt.name FROM orders o JOIN restaurant_tables rt ON rt.id=o.table_id WHERE o.conversation_id=c.id ORDER BY o.id DESC LIMIT 1) AS table_name,
           (SELECT o.table_id FROM orders o WHERE o.conversation_id=c.id AND o.table_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_id,
           (SELECT o.table_tab_id FROM orders o WHERE o.conversation_id=c.id AND o.table_tab_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_tab_id,
           (SELECT o.table_member_id FROM orders o WHERE o.conversation_id=c.id AND o.table_member_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_member_id,
           (SELECT COALESCE(NULLIF(tm.display_name,''),ct.name) FROM orders o LEFT JOIN table_members tm ON tm.id=o.table_member_id WHERE o.conversation_id=c.id AND o.table_id IS NOT NULL ORDER BY o.id DESC LIMIT 1) AS table_member_name
    FROM conversations c
    JOIN contacts ct ON ct.id = c.contact_id
    JOIN queues q ON q.id = c.queue_id
    LEFT JOIN users u ON u.id = c.assigned_user_id
    LEFT JOIN closure_reasons cr ON cr.id = c.close_reason_id
    LEFT JOIN users cu ON cu.id = c.closed_by_user_id
    WHERE (ct.name LIKE ? OR ct.phone LIKE ? OR c.last_message LIKE ? OR c.protocol LIKE ?)
  `;
  const params = [search, search, search, search];
  if (!(canViewAllConversations(req.user) && String(req.query.includeHidden) === 'true')) sql += ' AND COALESCE(c.hidden,0)=0';
  if (!canViewAllConversations(req.user)) { sql += ' AND c.assigned_user_id = ?'; params.push(req.user.id); }
  if (queueId) { sql += ' AND c.queue_id = ?'; params.push(queueId); }
  if (userId && canViewAllConversations(req.user)) { sql += ' AND c.assigned_user_id = ?'; params.push(userId); }
  if (reasonId) { sql += ' AND c.close_reason_id = ?'; params.push(reasonId); }
  if (req.query.from) { sql += ' AND substr(COALESCE(c.closed_at,c.created_at),1,10) >= ?'; params.push(String(req.query.from)); }
  if (req.query.to) { sql += ' AND substr(COALESCE(c.closed_at,c.created_at),1,10) <= ?'; params.push(String(req.query.to)); }
  if (status === 'waiting') sql += " AND c.status IN ('waiting','waiting_human')";
  else if (status === 'all') sql += " AND c.status != 'closed'";
  else if (status === 'history') sql += " AND c.status = 'closed'";
  else { sql += ' AND c.status = ?'; params.push(status); }
  if (order === 'oldest') sql += " ORDER BY COALESCE(c.closed_at,c.last_message_at) ASC";
  else if (order === 'name') sql += " ORDER BY ct.name COLLATE NOCASE ASC";
  else sql += " ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, CASE c.status WHEN 'waiting_human' THEN 0 WHEN 'waiting' THEN 1 WHEN 'open' THEN 2 ELSE 3 END, COALESCE(c.closed_at,c.last_message_at) DESC";
  const rows = db.prepare(sql).all(...params).map((row) => ({
    ...row,
    tags: safeJson(row.tags),
    ai_enabled: Boolean(row.ai_enabled),
    duration_seconds: row.closed_at ? Math.max(0, Math.round((new Date(row.closed_at)-new Date(row.created_at))/1000)) : null,
  }));
  res.json(rows);
});

router.get('/conversations/:id', requireAuth, (req, res, next) => {
  const conversationId = Number(req.params.id);

  try {
    const conversation = getConversation(conversationId);
    if (!ensureConversationAccess(req, res, conversation)) return;

    const managerView = canViewAllConversations(req.user);
    const partialWarnings = [];

    const loadOptional = (label, fallback, loader) => {
      try {
        return loader();
      } catch (error) {
        partialWarnings.push(label);
        console.error(`[Conversa ${conversationId}] Falha ao carregar ${label}:`, error.message);
        return fallback;
      }
    };

    let messages = loadOptional('mensagens completas', null, () => db.prepare(`
      SELECT m.*, u.name AS user_name, du.name AS deleted_by_name,
        rm.content AS reply_content, rm.sender_type AS reply_sender_type, ru.name AS reply_user_name,
        rm.message_type AS reply_message_type, rm.media_url AS reply_media_url, rm.mime_type AS reply_mime_type, rm.file_name AS reply_file_name,
        mc.protocol AS session_protocol,mc.created_at AS session_created_at,mc.closed_at AS session_closed_at,
        mc.id AS session_conversation_id,
        (SELECT json_group_array(json_object('emoji',r.emoji,'user_id',r.user_id,'user_name',rx.name))
         FROM message_reactions r
         LEFT JOIN users rx ON rx.id=r.user_id
         WHERE r.message_id=m.id) AS reactions_json
      FROM messages m
      JOIN conversations mc ON mc.id=m.conversation_id
      LEFT JOIN users u ON u.id=m.user_id
      LEFT JOIN users du ON du.id=m.deleted_by_user_id
      LEFT JOIN messages rm ON rm.id=m.reply_to_message_id
      LEFT JOIN users ru ON ru.id=rm.user_id
      WHERE mc.contact_id=?
        AND NOT EXISTS (
          SELECT 1 FROM message_hidden_users hidden
          WHERE hidden.message_id=m.id AND hidden.user_id=?
        )
      ORDER BY m.created_at ASC,m.id ASC
    `).all(conversation.contact_id, req.user.id));

    if (messages === null) {
      messages = loadOptional('mensagens básicas', [], () => db.prepare(`
        SELECT m.*,u.name AS user_name,du.name AS deleted_by_name,
          rm.content AS reply_content,rm.sender_type AS reply_sender_type,ru.name AS reply_user_name,
          rm.message_type AS reply_message_type,rm.media_url AS reply_media_url,rm.mime_type AS reply_mime_type,rm.file_name AS reply_file_name,
          mc.protocol AS session_protocol,mc.created_at AS session_created_at,mc.closed_at AS session_closed_at,
          mc.id AS session_conversation_id
        FROM messages m
        JOIN conversations mc ON mc.id=m.conversation_id
        LEFT JOIN users u ON u.id=m.user_id
        LEFT JOIN users du ON du.id=m.deleted_by_user_id
        LEFT JOIN messages rm ON rm.id=m.reply_to_message_id
        LEFT JOIN users ru ON ru.id=rm.user_id
        WHERE mc.contact_id=?
        ORDER BY m.created_at ASC,m.id ASC
      `).all(conversation.contact_id));
    }

    messages = messages.map((message) => {
      const row = {
        ...message,
        is_internal: Boolean(message.is_internal),
        pinned: Boolean(message.pinned),
        reactions: safeJson(message.reactions_json, []),
      };

      if (row.deleted_at && !managerView) {
        row.content = '';
        row.media_url = '';
        row.file_name = '';
        row.mime_type = '';
      }

      return row;
    });

    const transfers = loadOptional('transferências', [], () => db.prepare(`
      SELECT t.*,fu.name AS from_user_name,tu.name AS to_user_name,
        fq.name AS from_queue_name,tq.name AS to_queue_name,cu.name AS created_by_name
      FROM conversation_transfers t
      LEFT JOIN users fu ON fu.id=t.from_user_id
      LEFT JOIN users tu ON tu.id=t.to_user_id
      LEFT JOIN queues fq ON fq.id=t.from_queue_id
      LEFT JOIN queues tq ON tq.id=t.to_queue_id
      LEFT JOIN users cu ON cu.id=t.created_by_user_id
      WHERE t.conversation_id=?
      ORDER BY t.created_at DESC,t.id DESC LIMIT 20
    `).all(conversation.id));

    const orderSession = loadOptional('sessão do pedido', null, () => {
      const row = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(conversation.id) || null;
      if (row) row.cart = safeJson(row.cart_json, []);
      return row;
    });

    loadOptional('marcação de leitura', null, () => {
      db.prepare('UPDATE conversations SET unread_count=0 WHERE id=?').run(conversation.id);
      return true;
    });

    const customerHistory = loadOptional(
      'histórico do cliente',
      {
        id: conversation.contact_id,
        name: conversation.contact_name,
        phone: conversation.phone,
        tags: [],
        orders: [],
        topProducts: [],
        frequentAddress: null,
        conversations: [],
      },
      () => contactHistory(conversation.contact_id),
    );

    const orderChangeRequests = loadOptional('alterações de pedidos', [], () => db.prepare(`
      SELECT r.*,o.status order_status,o.total order_total
      FROM order_change_requests r
      JOIN orders o ON o.id=r.order_id
      WHERE r.conversation_id=?
      ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,r.created_at DESC
      LIMIT 10
    `).all(conversation.id));

    const latestOrderContext = loadOptional('contexto do pedido', {}, () => db.prepare(`
      SELECT o.status active_order_status,o.id active_order_id,
        rt.name table_name,rt.id table_id
      FROM orders o
      LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
      WHERE o.conversation_id=?
      ORDER BY o.id DESC LIMIT 1
    `).get(conversation.id) || {});

    Object.assign(conversation, latestOrderContext);

    let siteOrder = null;
    let conversationOrders = [];

    if (conversation.status !== 'closed') {
      conversationOrders = loadOptional('pedidos da conversa', [], () => db.prepare(`
        SELECT o.*,ct.name contact_name,ct.phone,rt.name table_name,tm.display_name table_member_name
        FROM orders o
        JOIN contacts ct ON ct.id=o.contact_id
        LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
        LEFT JOIN table_members tm ON tm.id=o.table_member_id
        WHERE o.contact_id=?
        ORDER BY CASE
          WHEN o.status IN ('new','confirmed','preparing','ready','out_for_delivery') THEN 0
          ELSE 1
        END,o.id DESC
        LIMIT 50
      `).all(conversation.contact_id).map((order) => ({
        ...order,
        items: loadOptional(
          `itens do pedido ${order.id}`,
          [],
          () => db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(order.id),
        ),
      })));

      siteOrder = conversationOrders.find((order) => order.source === 'website')
        || conversationOrders[0]
        || null;
    }

    return res.json({
      conversation: { ...conversation, unread_count: 0 },
      messages,
      transfers,
      orderSession,
      siteOrder,
      conversationOrders,
      customerHistory,
      orderChangeRequests,
      partialWarnings,
    });
  } catch (error) {
    console.error(`[Conversa ${conversationId}] Falha fatal ao abrir atendimento:`, error);
    return next(error);
  }
});

router.post('/conversations/:id/messages', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!ensureConversationAccess(req, res, conversation)) return;
  const content = String(req.body.content || '').trim();
  const internal = Boolean(req.body.internal);
  const replyToMessageId = Number(req.body.replyToMessageId || 0) || null;
  const forwardedFromMessageId = Number(req.body.forwardedFromMessageId || 0) || null;
  if (!content) return res.status(400).json({ error: 'Digite uma mensagem.' });
  let quotedMessageId = '';
  let quotedMessage = null;
  if (replyToMessageId) {
    quotedMessage = db.prepare(`SELECT m.id,m.conversation_id,m.provider_message_id,m.content,m.sender_type,m.message_type,m.media_url,m.mime_type,m.file_name,u.name user_name,c.contact_id
      FROM messages m JOIN conversations c ON c.id=m.conversation_id LEFT JOIN users u ON u.id=m.user_id WHERE m.id=?`).get(replyToMessageId);
    if (!quotedMessage || Number(quotedMessage.contact_id) !== Number(conversation.contact_id)) return res.status(400).json({ error: 'A mensagem respondida não pertence a este contato.' });
    quotedMessageId = quotedMessage.provider_message_id || '';
  }
  const messageId = insertMessage({
    conversationId: id,
    senderType: internal ? 'internal' : 'agent',
    userId: req.user.id,
    content,
    isInternal: internal,
    deliveryStatus: internal ? 'sent' : 'pending',
    replyToMessageId,
    forwardedFromMessageId,
  });
  let message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId);
  if (quotedMessage) {
    message = {
      ...message,
      reply_content: quotedMessage.content || '',
      reply_sender_type: quotedMessage.sender_type || '',
      reply_user_name: quotedMessage.user_name || '',
      reply_message_type: quotedMessage.message_type || '',
      reply_media_url: quotedMessage.media_url || '',
      reply_mime_type: quotedMessage.mime_type || '',
      reply_file_name: quotedMessage.file_name || '',
    };
  }
  if (!internal) {
    updateConversationAfterMessage(req.user, conversation, id, true);
    const providerText = agentProviderText(content, req.user, { client: conversation.contact_name, phone: conversation.phone });
    try {
      const result = await whatsapp.sendText({ phone: conversation.phone, text: providerText, quotedMessageId });
      message = stampProviderResult(messageId, result, 'sent');
    } catch (error) {
      const reason = String(error.message || error);
      console.error('[WhatsApp envio] Falha ao enviar mensagem:', {
        conversationId: id,
        phoneSuffix: String(conversation.phone || '').slice(-4),
        reason,
      });
      const definitive = /não está conectado|nao esta conectado|not connected|logged out|unauthorized|forbidden|invalid number|número inválido|numero invalido|401|403/i.test(reason);
      db.prepare('UPDATE messages SET delivery_status=?,failed_reason=? WHERE id=?').run(definitive ? 'failed' : 'sent', definitive ? reason.slice(0,500) : '', messageId);
      message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
      if (quotedMessage) {
        message = {
          ...message,
          reply_content: quotedMessage.content || '',
          reply_sender_type: quotedMessage.sender_type || '',
          reply_user_name: quotedMessage.user_name || '',
          reply_message_type: quotedMessage.message_type || '',
          reply_media_url: quotedMessage.media_url || '',
          reply_mime_type: quotedMessage.mime_type || '',
          reply_file_name: quotedMessage.file_name || '',
        };
      }
      realtime.emit('message:new', { conversationId: id, message });
      realtime.emit('conversation:updated', getConversation(id));
      if (definitive) return res.status(502).json({ error: `A mensagem foi salva, mas não foi enviada: ${reason}`, message });
      realtime.emit('system:warning', { message: 'A Evolution não confirmou o envio a tempo. A mensagem foi mantida como enviada até o webhook atualizar o status.' });
      audit(req.user.id, 'send_message_pending_confirmation', 'conversation', id, { replyToMessageId, forwardedFromMessageId });
      return res.status(201).json(message);
    }
  }
  if (quotedMessage) {
    message = {
      ...message,
      reply_content: quotedMessage.content || '',
      reply_sender_type: quotedMessage.sender_type || '',
      reply_user_name: quotedMessage.user_name || '',
      reply_message_type: quotedMessage.message_type || '',
      reply_media_url: quotedMessage.media_url || '',
      reply_mime_type: quotedMessage.mime_type || '',
      reply_file_name: quotedMessage.file_name || '',
    };
  }
  audit(req.user.id, 'send_message', 'conversation', id, { internal, replyToMessageId, forwardedFromMessageId });
  realtime.emit('message:new', { conversationId: id, message });
  realtime.emit('conversation:updated', getConversation(id));
  return res.status(201).json(message);
});

router.post('/conversations/:id/media', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!conversation) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  const dataUrl = String(req.body.dataUrl || '');
  let parsed;
  try { parsed = validateMediaData(dataUrl); } catch (error) { return res.status(400).json({ error: error.message }); }
  const fileName = String(req.body.fileName || 'arquivo').slice(0, 180);
  const caption = String(req.body.caption || '').trim().slice(0, 1000);
  const requestedType = String(req.body.messageType || '').toLowerCase();
  const messageType = ['image','video','document'].includes(requestedType)
    ? requestedType
    : parsed.mimeType.startsWith('image/') ? 'image' : parsed.mimeType.startsWith('video/') ? 'video' : 'document';
  const labels = { image: 'Imagem', video: 'Vídeo', document: 'Documento' };
  const content = caption || `[${labels[messageType]}: ${fileName}]`;
  let providerResult;
  try {
    providerResult = await whatsapp.sendMedia({
      phone: conversation.phone,
      mediaType: messageType,
      mimeType: parsed.mimeType,
      media: parsed.base64,
      fileName,
      caption,
    });
  } catch (error) {
    return res.status(502).json({ error: `O anexo não foi enviado: ${error.message}` });
  }
  const messageId = insertMessage({
    conversationId: id, senderType: 'agent', userId: req.user.id, content,
    messageType, mediaUrl: dataUrl, mimeType: parsed.mimeType, fileName, deliveryStatus: 'pending',
  });
  updateConversationAfterMessage(req.user, conversation, id);
  const message = stampProviderResult(messageId, providerResult, 'sent');
  audit(req.user.id, 'send_media', 'conversation', id, { messageType, fileName, size: parsed.size });
  realtime.emit('message:new', { conversationId: id, message });
  realtime.emit('conversation:updated', getConversation(id));
  return res.status(201).json(message);
});

router.post('/conversations/:id/audio', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!conversation) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  const dataUrl = String(req.body.dataUrl || '');
  let parsed;
  try { parsed = validateMediaData(dataUrl, 8 * 1024 * 1024); } catch (error) { return res.status(400).json({ error: error.message }); }
  if (!parsed.mimeType.startsWith('audio/')) return res.status(400).json({ error: 'O arquivo recebido não é um áudio.' });
  let providerResult;
  try {
    providerResult = await whatsapp.sendAudio({ phone: conversation.phone, audio: parsed.base64, mimeType: parsed.mimeType });
  } catch (error) {
    return res.status(502).json({ error: `O áudio não foi enviado: ${error.message}` });
  }
  const messageId = insertMessage({
    conversationId: id, senderType: 'agent', userId: req.user.id, content: '[Áudio]',
    messageType: 'audio', mediaUrl: dataUrl, mimeType: parsed.mimeType, fileName: 'audio-atendimento.webm', deliveryStatus: 'pending',
  });
  updateConversationAfterMessage(req.user, conversation, id);
  const message = stampProviderResult(messageId, providerResult, 'sent');
  audit(req.user.id, 'send_audio', 'conversation', id, { size: parsed.size });
  realtime.emit('message:new', { conversationId: id, message });
  realtime.emit('conversation:updated', getConversation(id));
  return res.status(201).json(message);
});

router.post('/conversations/:id/sticker', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!conversation) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  const sticker = db.prepare('SELECT * FROM stickers WHERE id=? AND active=1').get(Number(req.body.stickerId || 0));
  if (!sticker) return res.status(404).json({ error: 'Figurinha não encontrada ou desativada.' });
  let source;
  try { source = localMediaAsBase64(sticker.source); } catch (error) { return res.status(400).json({ error: error.message }); }
  const parsed = parseDataUrl(source);
  if (parsed) source = parsed.base64;
  let providerResult;
  try {
    providerResult = await whatsapp.sendSticker({ phone: conversation.phone, sticker: source });
  } catch (error) {
    return res.status(502).json({ error: `A figurinha não foi enviada: ${error.message}` });
  }
  const messageId = insertMessage({
    conversationId: id, senderType: 'agent', userId: req.user.id, content: `[Figurinha: ${sticker.name}]`,
    messageType: 'sticker', mediaUrl: sticker.source, mimeType: 'image/png', fileName: `${sticker.name}.png`, deliveryStatus: 'pending',
  });
  updateConversationAfterMessage(req.user, conversation, id);
  const message = stampProviderResult(messageId, providerResult, 'sent');
  audit(req.user.id, 'send_sticker', 'conversation', id, { stickerId: sticker.id });
  realtime.emit('message:new', { conversationId: id, message });
  realtime.emit('conversation:updated', getConversation(id));
  return res.status(201).json(message);
});

router.post('/conversations/:id/assign', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const userId = req.body.userId === null ? null : Number(req.body.userId || req.user.id);
  const conversation = getConversation(id);
  if (!ensureConversationAccess(req,res,conversation)) return;
  if (userId) {
    const target = db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='agent'").get(userId);
    if (!target) return res.status(400).json({ error: 'Somente atendentes podem assumir conversas.' });
  }
  db.prepare(`UPDATE conversations SET assigned_user_id=?, status=? WHERE id=?`)
    .run(userId, userId ? 'open' : 'waiting_human', id);
  audit(req.user.id, userId ? 'assign' : 'unassign', 'conversation', id, { userId });
  const updated = getConversation(id);
  if (userId && Number(userId) !== Number(req.user.id)) notifyUser(userId,'assignment','Novo atendimento atribuído',`${conversation.contact_name} foi atribuído a você.`,'conversation',id);
  realtime.emit('conversation:updated', updated);
  return res.json(updated);
});

router.post('/conversations/:id/transfer', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const current = getConversation(id);
  if (!ensureConversationAccess(req,res,current)) return;
  if (current.status === 'closed') return res.status(400).json({ error: 'Reabra o atendimento antes de transferir.' });

  const type = String(req.body.type || '').trim();
  const note = String(req.body.note || '').trim().slice(0, 500);
  let toUserId = null;
  let toQueueId = Number(req.body.queueId || current.queue_id);
  let status = 'waiting_human';
  let description = '';

  const targetQueue = db.prepare('SELECT * FROM queues WHERE id=? AND active=1').get(toQueueId);
  if (!targetQueue) return res.status(400).json({ error: 'Selecione uma fila válida.' });

  if (type === 'user') {
    toUserId = Number(req.body.userId || 0);
    if (toUserId === Number(req.user.id)) return res.status(400).json({ error: 'Você não pode transferir o atendimento para si mesmo.' });
    const targetUser = db.prepare("SELECT id,name,status,active,receive_assignments FROM users WHERE id=? AND active=1 AND role='agent'").get(toUserId);
    if (!targetUser) return res.status(400).json({ error: 'Selecione um atendente válido.' });
    status = targetUser.status === 'online' && realtime.isUserOnline(targetUser.id) ? 'open' : 'waiting_human';
    description = 'Atendimento transferido para outro atendente.';
  } else if (type === 'auto') {
    const agents = activeTransferAgents(toQueueId).filter((agent) => agent.status === 'online' && agent.receive_assignments && Number(agent.id) !== Number(req.user.id) && Number(agent.id) !== Number(current.assigned_user_id));
    const minLoad = agents.length ? Math.min(...agents.map((agent) => Number(agent.open_count || 0))) : 0;
    const balanced = agents.filter((agent) => Number(agent.open_count || 0) === minLoad);
    const targetUser = balanced[Math.floor(Math.random() * balanced.length)];
    if (!targetUser) return res.status(409).json({ error: 'Nenhum atendente disponível para distribuição automática.' });
    toUserId = targetUser.id;
    status = 'open';
    description = 'Atendimento distribuído automaticamente para a equipe disponível.';
  } else if (type === 'queue') {
    description = `Atendimento transferido para a fila ${targetQueue.name}.`;
  } else {
    return res.status(400).json({ error: 'Escolha como o atendimento será transferido.' });
  }

  db.exec('BEGIN');
  try {
    db.prepare('UPDATE conversations SET queue_id=?, assigned_user_id=?, status=?, unread_count=0 WHERE id=?')
      .run(toQueueId, toUserId, status, id);
    db.prepare(`
      INSERT INTO conversation_transfers
      (conversation_id,from_user_id,to_user_id,from_queue_id,to_queue_id,transfer_type,note,created_by_user_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, current.assigned_user_id, toUserId, current.queue_id, toQueueId, type, note, req.user.id, nowIso());
    addSystemNote(id, note ? `${description}
Observação: ${note}` : description);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  audit(req.user.id, 'transfer', 'conversation', id, { type, fromUserId: current.assigned_user_id, toUserId, fromQueueId: current.queue_id, toQueueId, note });
  const updated = getConversation(id);
  if (toUserId) notifyUser(toUserId,'transfer','Atendimento transferido',`${current.contact_name} foi transferido para você.`,'conversation',id);
  realtime.emit('conversation:updated', updated);
  realtime.emit('message:new', { conversationId: id });
  return res.json(updated);
});

router.put('/conversations/:id/priority', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const priority = ['normal','high','urgent'].includes(String(req.body.priority)) ? String(req.body.priority) : 'normal';
  if (!getConversation(id)) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  db.prepare('UPDATE conversations SET priority=? WHERE id=?').run(priority, id);
  audit(req.user.id, 'set_priority', 'conversation', id, { priority });
  const updated = getConversation(id);
  realtime.emit('conversation:updated', updated);
  res.json(updated);
});

router.post('/conversations/:id/ai', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const enabled = Boolean(req.body.enabled);
  const current = getConversation(id);
  if (!ensureConversationAccess(req,res,current)) return;
  db.prepare('UPDATE conversations SET ai_enabled=? WHERE id=?').run(enabled ? 1 : 0,id);
  addSystemNote(id, enabled ? 'A assistência automática foi ativada nesta conversa.' : 'A assistência automática foi desativada nesta conversa.');
  audit(req.user.id, enabled ? 'enable_ai' : 'disable_ai', 'conversation', id);
  const updated = getConversation(id);
  realtime.emit('conversation:updated', updated);
  return res.json(updated);
});

router.post('/conversations/:id/close', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const current = getConversation(id);
  if (!ensureConversationAccess(req,res,current)) return;
  const reasonId = Number(req.body.reasonId || 0);
  const reason = db.prepare('SELECT * FROM closure_reasons WHERE id=? AND active=1').get(reasonId);
  if (!reason) return res.status(400).json({ error: 'Selecione um motivo de encerramento válido.' });

  const note = String(req.body.note || '').trim();
  const reasonText = note ? `${reason.name}: ${note}` : reason.name;
  const satisfactionEnabled = setting('satisfaction_enabled','false') === 'true';
  const shouldSendClosingMessage = req.body.sendClosingMessage === undefined
    ? true
    : evolutionFlagTrue(req.body.sendClosingMessage);
  const closedStamp = nowIso();

  // Fecha primeiro de forma atômica. Se houver duplo clique, repetição de rede
  // ou duas telas tentando finalizar ao mesmo tempo, somente a primeira chamada
  // altera a conversa e pode disparar mensagens automáticas.
  const closeResult = db.prepare(`
    UPDATE conversations
    SET status='closed',closed_at=?,unread_count=0,close_reason_id=?,close_reason_text=?,closed_by_user_id=?,satisfaction_requested_at=?
    WHERE id=? AND status!='closed'
  `).run(closedStamp,reason.id,reasonText,req.user.id,satisfactionEnabled ? closedStamp : null,id);

  if (!closeResult.changes) {
    return res.json({ ...getConversation(id), alreadyClosed: true, closingMessageSent: false });
  }

  let closingMessageSent = false;
  if (shouldSendClosingMessage && setting('closing_message_enabled','true') === 'true') {
    const closingText = replaceVariables(setting('closing_message','🍔💚 A {Empresa} agradece o seu contato!'), {
      client: current.contact_name, agent: req.user.name, phone: current.phone,
    });
    const messageId = insertMessage({ conversationId:id,senderType:'agent',userId:req.user.id,content:closingText,deliveryStatus:'pending' });
    try {
      // Mensagem automática de desfecho: sem assinatura/nome de quem clicou.
      const result = await whatsapp.sendText({phone:current.phone,text:closingText});
      const message = stampProviderResult(messageId,result,'sent');
      closingMessageSent = true;
      realtime.emit('message:new',{conversationId:id,message});
    } catch (error) {
      db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?").run(String(error.message || error).slice(0,500),messageId);
    }
  }

  if (satisfactionEnabled) {
    const satisfactionText = replaceVariables(setting('satisfaction_message','⭐ Como foi seu atendimento? Responda com uma nota de 1 a 5.'), {
      client: current.contact_name, agent: req.user.name, phone: current.phone,
    });
    const surveyMessageId = insertMessage({ conversationId:id,senderType:'ai',content:satisfactionText,deliveryStatus:'pending' });
    try {
      const result = await whatsapp.sendText({phone:current.phone,text:satisfactionText});
      const surveyMessage = stampProviderResult(surveyMessageId,result,'sent');
      realtime.emit('message:new',{conversationId:id,message:surveyMessage});
    } catch (error) {
      db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?").run(String(error.message || error).slice(0,500),surveyMessageId);
    }
  }

  const tableIdsChanged = tables.leaveConversation(id, req.user.id);
  for (const tableId of tableIdsChanged) realtime.emit('table:updated', { tableId });

  audit(req.user.id,'close','conversation',id,{reasonId:reason.id,reasonText,sendClosingMessage:shouldSendClosingMessage,closingMessageSent,tableIdsChanged});
  const updated = getConversation(id);
  realtime.emit('conversation:updated',updated);
  return res.json({ ...updated, closingMessageSent, tableIdsChanged });
});

router.post('/conversations/:id/reopen', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!getConversation(id)) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  db.prepare("UPDATE conversations SET status='waiting', closed_at=NULL, close_reason_id=NULL, close_reason_text='', closed_by_user_id=NULL WHERE id=?").run(id);
  audit(req.user.id, 'reopen', 'conversation', id);
  const updated = getConversation(id);
  realtime.emit('conversation:updated', updated);
  return res.json(updated);
});

router.get('/contacts', requireAuth, (req, res) => {
  const search = `%${String(req.query.search || '')}%`;
  let rows;
  try {
    rows = db.prepare(`
      SELECT ct.*, COUNT(DISTINCT c.id) AS conversations_count, COUNT(DISTINCT o.id) AS orders_count,
             COALESCE(SUM(o.total),0) AS total_spent
      FROM contacts ct
      LEFT JOIN conversations c ON c.contact_id=ct.id
      LEFT JOIN orders o ON o.contact_id=ct.id AND o.status!='cancelled'
      WHERE ct.name LIKE ? OR ct.phone LIKE ? OR ct.email LIKE ?
      GROUP BY ct.id ORDER BY ct.updated_at DESC
    `).all(search, search, search);
  } catch (error) {
    console.error('[Contatos] Falha nas estatísticas; usando listagem básica:', error.message);
    rows = db.prepare(`
      SELECT ct.*,0 AS conversations_count,0 AS orders_count,0 AS total_spent
      FROM contacts ct
      WHERE ct.name LIKE ? OR ct.phone LIKE ? OR ct.email LIKE ?
      ORDER BY ct.updated_at DESC
    `).all(search, search, search);
  }
  res.json(rows.map((r) => ({ ...r, tags: safeJson(r.tags) })));
});

router.get('/contacts/:id/history', requireAuth, (req, res) => {
  const history = contactHistory(Number(req.params.id));
  if (!history) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(history);
});

router.post('/contacts', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const phone = canonicalPhone(req.body.phone || '');
  if (!name || phone.length < 10) return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
  const existing = findContactByPhone(phone);
  if (existing) return res.status(409).json({ error: 'Esse número já pertence a um contato existente.', contactId: existing.id });
  const row = createOrUpdateContact({ phone, name, source: 'manual' });
  db.prepare('UPDATE contacts SET email=?,notes=?,tags=?,updated_at=? WHERE id=?')
    .run(String(req.body.email || ''), String(req.body.notes || ''), JSON.stringify(req.body.tags || []), nowIso(), row.id);
  const saved = db.prepare('SELECT * FROM contacts WHERE id=?').get(row.id);
  audit(req.user.id, 'create', 'contact', saved.id);
  res.status(201).json({ ...saved, tags: safeJson(saved.tags) });
});

router.put('/contacts/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM contacts WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Contato não encontrado.' });
  const name = String(req.body.name ?? existing.name).trim();
  const phone = canonicalPhone(req.body.phone ?? existing.phone);
  if (!name || phone.length < 10) return res.status(400).json({ error: 'Nome e telefone são obrigatórios.' });
  try {
    const other = findContactByPhone(phone);
    if (other && Number(other.id) !== id) return res.status(409).json({ error: 'Já existe outro contato com esse telefone.', contactId: other.id });
    db.prepare(`
      UPDATE contacts SET name=?, phone=?, email=?, notes=?, tags=?, updated_at=? WHERE id=?
    `).run(name, phone, String(req.body.email ?? existing.email), String(req.body.notes ?? existing.notes),
      JSON.stringify(Array.isArray(req.body.tags) ? req.body.tags : safeJson(existing.tags)), nowIso(), id);
    registerAliases(id, phone);
    const row = db.prepare('SELECT * FROM contacts WHERE id=?').get(id);
    audit(req.user.id, 'update', 'contact', id);
    res.json({ ...row, tags: safeJson(row.tags) });
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Já existe outro contato com esse telefone.' });
    throw error;
  }
});

router.get('/products', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM products ORDER BY active DESC, category, name').all().map((p) => ({ ...p, active: Boolean(p.active) })));
});

router.post('/products/image', requireAuth, requireAdmin, (req, res) => {
  try {
    const validated = validateMediaData(req.body.dataUrl, 6 * 1024 * 1024);
    const extensionByMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensionByMime[String(validated.mimeType || '').toLowerCase()];
    if (!extension) return res.status(400).json({ error: 'Use uma imagem JPG, PNG, WEBP ou GIF.' });
    const uploadDir = path.resolve(__dirname, '..', '..', 'public', 'assets', 'products');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `produto-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`;
    fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(validated.base64, 'base64'));
    return res.status(201).json({ image_url: `/assets/products/${filename}` });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível salvar a imagem.' });
  }
});

router.post('/settings/site-logo', requireAuth, requireAdmin, (req, res) => {
  try {
    const validated = validateMediaData(req.body.dataUrl, 6 * 1024 * 1024);
    const extensionByMime = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    const extension = extensionByMime[String(validated.mimeType || '').toLowerCase()];
    if (!extension) return res.status(400).json({ error: 'Use uma imagem JPG, PNG, WEBP ou GIF.' });
    const uploadDir = path.resolve(__dirname, '..', '..', 'public', 'assets', 'branding');
    fs.mkdirSync(uploadDir, { recursive: true });
    const filename = `logo-${Date.now()}-${crypto.randomBytes(5).toString('hex')}.${extension}`;
    fs.writeFileSync(path.join(uploadDir, filename), Buffer.from(validated.base64, 'base64'));
    return res.status(201).json({ image_url: `/assets/branding/${filename}` });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Não foi possível salvar a logo.' });
  }
});

router.post('/products', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome do produto.' });
  const stamp = nowIso();
  const result = db.prepare(`
    INSERT INTO products (category,name,description,aliases,price,active,stock,image_url,fiscal_ncm,fiscal_cest,fiscal_cfop,fiscal_cst_csosn,fiscal_origin,fiscal_unit,fiscal_ibs_cbs,fiscal_notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(String(req.body.category || 'Geral'), name, String(req.body.description || ''), String(req.body.aliases || ''), Number(req.body.price || 0),
    req.body.active === false ? 0 : 1, req.body.stock === '' || req.body.stock == null ? null : Math.max(0, Number(req.body.stock)),
    String(req.body.image_url || ''), String(req.body.fiscal_ncm || ''), String(req.body.fiscal_cest || ''), String(req.body.fiscal_cfop || ''),
    String(req.body.fiscal_cst_csosn || ''), String(req.body.fiscal_origin || '0'), String(req.body.fiscal_unit || 'UN'),
    String(req.body.fiscal_ibs_cbs || ''), String(req.body.fiscal_notes || ''), stamp, stamp);
  const row = db.prepare('SELECT * FROM products WHERE id=?').get(Number(result.lastInsertRowid));
  audit(req.user.id, 'create', 'product', row.id);
  res.status(201).json({ ...row, active: Boolean(row.active) });
});

router.put('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });
  db.prepare(`UPDATE products SET category=?,name=?,description=?,aliases=?,price=?,active=?,stock=?,image_url=?,fiscal_ncm=?,fiscal_cest=?,fiscal_cfop=?,fiscal_cst_csosn=?,fiscal_origin=?,fiscal_unit=?,fiscal_ibs_cbs=?,fiscal_notes=?,updated_at=? WHERE id=?`)
    .run(String(req.body.category ?? p.category), String(req.body.name ?? p.name), String(req.body.description ?? p.description), String(req.body.aliases ?? p.aliases ?? ''),
      Number(req.body.price ?? p.price), req.body.active == null ? p.active : (req.body.active ? 1 : 0),
      req.body.stock === '' ? null : Math.max(0, Number(req.body.stock ?? p.stock)), String(req.body.image_url ?? p.image_url),
      String(req.body.fiscal_ncm ?? p.fiscal_ncm ?? ''), String(req.body.fiscal_cest ?? p.fiscal_cest ?? ''), String(req.body.fiscal_cfop ?? p.fiscal_cfop ?? ''),
      String(req.body.fiscal_cst_csosn ?? p.fiscal_cst_csosn ?? ''), String(req.body.fiscal_origin ?? p.fiscal_origin ?? '0'), String(req.body.fiscal_unit ?? p.fiscal_unit ?? 'UN'),
      String(req.body.fiscal_ibs_cbs ?? p.fiscal_ibs_cbs ?? ''), String(req.body.fiscal_notes ?? p.fiscal_notes ?? ''), nowIso(), id);
  const row = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  audit(req.user.id, 'update', 'product', id);
  res.json({ ...row, active: Boolean(row.active) });
});

router.patch('/products/:id/stock', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
  const stock = req.body.stock === '' || req.body.stock == null ? null : Math.max(0, Math.floor(Number(req.body.stock)));
  if (stock !== null && !Number.isFinite(stock)) return res.status(400).json({ error: 'Informe um estoque válido.' });
  db.prepare('UPDATE products SET stock=?,updated_at=? WHERE id=?').run(stock, nowIso(), id);
  audit(req.user.id, 'update_stock', 'product', id, { before: product.stock, stock });
  const row = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  return res.json({ ...row, active: Boolean(row.active) });
});

router.delete('/products/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE products SET active=0, updated_at=? WHERE id=?').run(nowIso(), id);
  audit(req.user.id, 'disable', 'product', id);
  res.status(204).end();
});

router.get('/knowledge', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM knowledge ORDER BY active DESC, category, title').all().map((k) => ({ ...k, active: Boolean(k.active) })));
});

router.post('/knowledge', requireAuth, requireAdmin, (req, res) => {
  const title = String(req.body.title || '').trim();
  const content = String(req.body.content || '').trim();
  if (!title || !content) return res.status(400).json({ error: 'Título e conteúdo são obrigatórios.' });
  const stamp = nowIso();
  const result = db.prepare(`
    INSERT INTO knowledge (title,category,content,keywords,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?)
  `).run(title, String(req.body.category || 'Geral'), content, String(req.body.keywords || ''), req.body.active === false ? 0 : 1, stamp, stamp);
  const row = db.prepare('SELECT * FROM knowledge WHERE id=?').get(Number(result.lastInsertRowid));
  audit(req.user.id, 'create', 'knowledge', row.id);
  res.status(201).json({ ...row, active: Boolean(row.active) });
});

router.put('/knowledge/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const k = db.prepare('SELECT * FROM knowledge WHERE id=?').get(id);
  if (!k) return res.status(404).json({ error: 'Conhecimento não encontrado.' });
  db.prepare(`UPDATE knowledge SET title=?,category=?,content=?,keywords=?,active=?,updated_at=? WHERE id=?`)
    .run(String(req.body.title ?? k.title), String(req.body.category ?? k.category), String(req.body.content ?? k.content),
      String(req.body.keywords ?? k.keywords), req.body.active == null ? k.active : (req.body.active ? 1 : 0), nowIso(), id);
  const row = db.prepare('SELECT * FROM knowledge WHERE id=?').get(id);
  audit(req.user.id, 'update', 'knowledge', id);
  res.json({ ...row, active: Boolean(row.active) });
});

router.delete('/knowledge/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE knowledge SET active=0, updated_at=? WHERE id=?').run(nowIso(), id);
  audit(req.user.id, 'disable', 'knowledge', id);
  res.status(204).end();
});

router.get('/quick-replies', requireAuth, (req, res) => {
  const includeInactive=req.query.all==='1'&&['admin','supervisor'].includes(req.user.role);
  const rows=db.prepare(`SELECT * FROM quick_replies ${includeInactive?'':'WHERE active=1'} ORDER BY favorite DESC,usage_count DESC,category,title`).all();
  res.json(rows.filter((row)=>{const roles=safeJson(row.allowed_roles_json,[]);return includeInactive||!roles.length||roles.includes(req.user.role);}).map((row)=>({...row,active:Boolean(row.active),favorite:Boolean(row.favorite),allowed_roles:safeJson(row.allowed_roles_json,[])})));
});

router.post('/quick-replies', requireAuth, requireAdmin, (req, res) => {
  const shortcut = String(req.body.shortcut || '').trim();
  const title = String(req.body.title || '').trim();
  const category=String(req.body.category||'Geral').trim()||'Geral';
  const content = String(req.body.content || '').trim();
  const favorite=req.body.favorite?1:0;
  const roles=Array.isArray(req.body.allowed_roles)?req.body.allowed_roles.filter((r)=>['admin','supervisor','agent','kitchen'].includes(r)):[];
  if (!shortcut.startsWith('/') || !title || !content) return res.status(400).json({ error: 'Informe atalho iniciado por /, título e mensagem.' });
  try {
    const stamp=nowIso();const result = db.prepare('INSERT INTO quick_replies (shortcut,title,category,content,favorite,usage_count,allowed_roles_json,active,created_at,updated_at) VALUES (?,?,?,?,?,0,?,1,?,?)').run(shortcut,title,category,content,favorite,JSON.stringify(roles),stamp,stamp);
    audit(req.user.id, 'create', 'quick_reply', Number(result.lastInsertRowid));
    const row=db.prepare('SELECT * FROM quick_replies WHERE id=?').get(Number(result.lastInsertRowid));
    res.status(201).json({...row,active:Boolean(row.active),favorite:Boolean(row.favorite),allowed_roles:safeJson(row.allowed_roles_json,[])});
  } catch (error) { return res.status(409).json({ error: 'Esse atalho já existe.' }); }
});

router.put('/quick-replies/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM quick_replies WHERE id=?').get(id);
  if (!current) return res.status(404).json({ error: 'Resposta rápida não encontrada.' });
  const shortcut = String(req.body.shortcut ?? current.shortcut).trim();
  const title = String(req.body.title ?? current.title).trim();
  const category=String(req.body.category??current.category??'Geral').trim()||'Geral';
  const content = String(req.body.content ?? current.content).trim();
  const favorite=req.body.favorite==null?current.favorite:(req.body.favorite?1:0);
  const active=req.body.active==null?current.active:(req.body.active?1:0);
  const roles=Array.isArray(req.body.allowed_roles)?req.body.allowed_roles.filter((r)=>['admin','supervisor','agent','kitchen'].includes(r)):safeJson(current.allowed_roles_json,[]);
  if (!shortcut.startsWith('/') || !title || !content) return res.status(400).json({ error: 'Informe atalho iniciado por /, título e mensagem.' });
  try {
    db.prepare('UPDATE quick_replies SET shortcut=?,title=?,category=?,content=?,favorite=?,allowed_roles_json=?,active=?,updated_at=? WHERE id=?').run(shortcut,title,category,content,favorite,JSON.stringify(roles),active,nowIso(),id);
    audit(req.user.id, 'update', 'quick_reply', id);
    const row=db.prepare('SELECT * FROM quick_replies WHERE id=?').get(id);
    res.json({...row,active:Boolean(row.active),favorite:Boolean(row.favorite),allowed_roles:safeJson(row.allowed_roles_json,[])});
  } catch (error) { return res.status(409).json({ error: 'Esse atalho já existe.' }); }
});

router.post('/quick-replies/:id/use', requireAuth, (req,res)=>{db.prepare('UPDATE quick_replies SET usage_count=usage_count+1,updated_at=? WHERE id=?').run(nowIso(),Number(req.params.id));res.json({success:true});});
router.delete('/quick-replies/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM quick_replies WHERE id=?').run(id);
  audit(req.user.id, 'delete', 'quick_reply', id);
  res.status(204).end();
});

router.get('/closure-reasons', requireAuth, (req, res) => {
  const includeInactive = req.query.all === '1' && ['admin','supervisor'].includes(req.user.role);
  const rows = db.prepare(`SELECT * FROM closure_reasons ${includeInactive ? '' : 'WHERE active=1'} ORDER BY active DESC, name`).all();
  res.json(rows.map((row) => ({ ...row, active: Boolean(row.active) })));
});

router.post('/closure-reasons', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Informe o nome do motivo.' });
  try {
    const result = db.prepare('INSERT INTO closure_reasons (name,active,created_at,updated_at) VALUES (?,1,?,?)').run(name, nowIso(), nowIso());
    audit(req.user.id, 'create', 'closure_reason', Number(result.lastInsertRowid), { name });
    return res.status(201).json(db.prepare('SELECT * FROM closure_reasons WHERE id=?').get(Number(result.lastInsertRowid)));
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Esse motivo já existe.' });
    throw error;
  }
});

router.put('/closure-reasons/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM closure_reasons WHERE id=?').get(id);
  if (!current) return res.status(404).json({ error: 'Motivo não encontrado.' });
  const name = String(req.body.name ?? current.name).trim();
  const active = req.body.active == null ? current.active : (req.body.active ? 1 : 0);
  db.prepare('UPDATE closure_reasons SET name=?,active=?,updated_at=? WHERE id=?').run(name, active, nowIso(), id);
  audit(req.user.id, 'update', 'closure_reason', id, { active: Boolean(active) });
  const row = db.prepare('SELECT * FROM closure_reasons WHERE id=?').get(id);
  res.json({ ...row, active: Boolean(row.active) });
});

router.delete('/closure-reasons/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE closure_reasons SET active=0,updated_at=? WHERE id=?').run(nowIso(), id);
  audit(req.user.id, 'disable', 'closure_reason', id);
  res.status(204).end();
});

router.get('/stickers', requireAuth, (req, res) => {
  const includeInactive = req.query.all === '1' && ['admin','supervisor'].includes(req.user.role);
  const rows = db.prepare(`SELECT * FROM stickers ${includeInactive ? '' : 'WHERE active=1'} ORDER BY active DESC, name`).all();
  res.json(rows.map((row) => ({ ...row, active: Boolean(row.active) })));
});

router.post('/stickers', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  const source = String(req.body.source || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'Informe o nome da figurinha.' });
  if (!source || (!source.startsWith('data:image/') && !/^https?:\/\//i.test(source) && !source.startsWith('/stickers/'))) {
    return res.status(400).json({ error: 'Envie uma imagem ou informe uma URL válida.' });
  }
  if (source.length > 9_000_000) return res.status(400).json({ error: 'A figurinha ultrapassa o limite permitido.' });
  const result = db.prepare('INSERT INTO stickers (name,source,active,created_at,updated_at) VALUES (?,?,1,?,?)').run(name, source, nowIso(), nowIso());
  audit(req.user.id, 'create', 'sticker', Number(result.lastInsertRowid), { name });
  const row = db.prepare('SELECT * FROM stickers WHERE id=?').get(Number(result.lastInsertRowid));
  res.status(201).json({ ...row, active: Boolean(row.active) });
});

router.put('/stickers/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT * FROM stickers WHERE id=?').get(id);
  if (!current) return res.status(404).json({ error: 'Figurinha não encontrada.' });
  const name = String(req.body.name ?? current.name).trim();
  const source = String(req.body.source || current.source).trim();
  const active = req.body.active == null ? current.active : (req.body.active ? 1 : 0);
  if (source.length > 9_000_000) return res.status(400).json({ error: 'A figurinha ultrapassa o limite permitido.' });
  db.prepare('UPDATE stickers SET name=?,source=?,active=?,updated_at=? WHERE id=?').run(name, source, active, nowIso(), id);
  audit(req.user.id, 'update', 'sticker', id, { active: Boolean(active) });
  const row = db.prepare('SELECT * FROM stickers WHERE id=?').get(id);
  res.json({ ...row, active: Boolean(row.active) });
});

router.delete('/stickers/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  db.prepare('UPDATE stickers SET active=0,updated_at=? WHERE id=?').run(nowIso(), id);
  audit(req.user.id, 'disable', 'sticker', id);
  res.status(204).end();
});


function getSetting(key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
}

function createNotification({ type, title, message, entityType = '', entityId = null, targetRole = '' }) {
  const result = db.prepare(`
    INSERT INTO notifications (type,title,message,entity_type,entity_id,target_role,created_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(type, title, message, entityType, entityId, targetRole, nowIso());
  return db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
}

router.get('/order-config', requireAuth, (req, res) => {
  res.json({
    deliveryFee: Math.max(0, Number(getSetting('delivery_fee', '0') || 0)),
    pickupAddress: getSetting('store_pickup_address', ''),
  });
});

router.get('/branding', requireAuth, (req, res) => {
  res.json({
    companyName: getSetting('company_name', 'G&M Automação'),
    assistantName: getSetting('ai_name', 'Assistente virtual'),
    instagram: getSetting('instagram', ''),
    primaryColor: getSetting('primary_color', '#1458EA'),
    emojisEnabled: getSetting('emojis_enabled', 'true') !== 'false',
    tablesEnabled: getSetting('restaurant_tables_enabled', 'false') === 'true',
    fiscalEnabled: getSetting('fiscal_module_enabled', 'false') === 'true',
    orderStatusColorsEnabled: getSetting('order_status_colors_enabled', 'true') !== 'false',
    orderStatusColors: {
      confirmed: getSetting('order_status_color_confirmed', '#2f6fed'),
      preparing: getSetting('order_status_color_preparing', '#f59e0b'),
      ready: getSetting('order_status_color_ready', '#7c3aed'),
      out_for_delivery: getSetting('order_status_color_out_for_delivery', '#1e40af'),
      delivered: getSetting('order_status_color_delivered', '#16a34a'),
      picked_up: getSetting('order_status_color_delivered', '#16a34a'),
      cancelled: getSetting('order_status_color_cancelled', '#dc2626'),
    },
  });
});

function orderWithItems(id) {
  const order = db.prepare(`
    SELECT o.*, ct.name contact_name, ct.phone, eu.name edited_by_user_name,rt.name table_name
    FROM orders o JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN users eu ON eu.id=o.edited_by_user_id
    LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
    WHERE o.id=?
  `).get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
  return order;
}

router.post('/orders', requireAuth, async (req, res) => {
  const conversationId = Number(req.body.conversationId || 0);
  const conversation = getConversation(conversationId);
  if (!conversation) return res.status(404).json({ error: 'Atendimento não encontrado para criar o pedido.' });
  try {
    const created = createConfirmedOrder({
      conversation: { ...conversation, id: conversationId },
      requestedItems: Array.isArray(req.body.items) ? req.body.items : [],
      deliveryFee: req.body.deliveryFee,
      address: req.body.address,
      paymentMethod: req.body.paymentMethod,
      fulfillmentMethod: req.body.fulfillmentMethod,
      notes: req.body.notes,
      userId: req.user.id,
      source: 'agent',
    });
    audit(req.user.id, 'create', 'order', created.order.id, { items: created.items.length, total: created.total, fulfillmentMethod: created.order.fulfillment_method });
    const methodText = created.order.fulfillment_method === 'pickup' ? 'Retirada na loja' : `Entrega em ${created.order.address}`;
    const confirmationText = `Pedido #${String(created.order.id).padStart(4, '0')} confirmado! Itens: ${created.summary}. ${methodText}. Total: R$ ${created.total.toFixed(2).replace('.', ',')}. Já enviamos para a cozinha.`;
    try {
      const outgoingId = insertMessage({ conversationId, senderType: 'agent', userId: req.user.id, content: confirmationText, deliveryStatus: 'pending' });
      const result = await whatsapp.sendText({ phone: conversation.phone, text: confirmationText });
      const outgoing = stampProviderResult(outgoingId, result, 'sent');
      realtime.emit('message:new', { conversationId, message: outgoing });
    } catch {
      // O pedido não deve ser perdido se o WhatsApp estiver desconectado.
    }
    return res.status(201).json(created.order);
  } catch (error) {
    return res.status(400).json({ error: `Não foi possível criar o pedido: ${error.message}` });
  }
});

router.get('/kitchen/orders', requireAuth, (req, res) => {
  const period=String(req.query.period||'today');
  let dateFilter=''; const params=[];
  if(period==='today'){ dateFilter=" AND substr(o.created_at,1,10)=?"; params.push(new Date().toISOString().slice(0,10)); }
  if(req.query.from){ dateFilter += ' AND substr(o.created_at,1,10)>=?'; params.push(String(req.query.from)); }
  if(req.query.to){ dateFilter += ' AND substr(o.created_at,1,10)<=?'; params.push(String(req.query.to)); }
  const rows=db.prepare(`SELECT o.*,ct.name contact_name,ct.phone,rt.name table_name FROM orders o JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN restaurant_tables rt ON rt.id=o.table_id WHERE o.status IN ('confirmed','preparing','ready') ${dateFilter} ORDER BY CASE o.status WHEN 'confirmed' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END,o.created_at ASC`).all(...params);
  for(const row of rows) row.items=db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(row.id);
  res.json(rows);
});

router.post('/kitchen/orders/seen', requireAuth, (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`UPDATE orders SET kitchen_seen_at=COALESCE(kitchen_seen_at,?) WHERE id IN (${placeholders})`).run(nowIso(), ...ids);
  }
  res.json({ success: true });
});

router.post('/conversations/:id/order-review/approve', requireAuth, async (req, res) => {
  const conversation = getConversation(Number(req.params.id));
  if (!ensureConversationAccess(req,res,conversation)) return;
  const session = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(conversation.id);
  if (!session) return res.status(404).json({ error: 'Não há pedido aguardando revisão.' });
  const requestedItems = Array.isArray(req.body.items) && req.body.items.length ? req.body.items : safeJson(session.cart_json, []);
  if (!requestedItems.length) return res.status(400).json({ error: 'Inclua pelo menos um item.' });
  try {
    const created = createConfirmedOrder({
      conversation,
      requestedItems,
      deliveryFee: Number(req.body.deliveryFee ?? session.delivery_fee ?? 0),
      address: String(req.body.address ?? session.address ?? '').trim(),
      paymentMethod: String(req.body.paymentMethod ?? session.payment_method ?? '').trim(),
      needsChange: String(req.body.paymentMethod ?? session.payment_method ?? '').trim() === 'Dinheiro' && Boolean(req.body.needsChange ?? session.needs_change),
      changeFor: String(req.body.paymentMethod ?? session.payment_method ?? '').trim() === 'Dinheiro' ? (req.body.changeFor ?? session.change_for ?? null) : null,
      fulfillmentMethod: String(req.body.fulfillmentMethod ?? session.fulfillment_method ?? 'delivery'),
      notes: String(req.body.notes ?? session.customer_notes ?? '').trim(),
      userId: req.user.id,
      source: 'agent_review',
    });
    db.prepare('DELETE FROM ai_order_sessions WHERE conversation_id=?').run(conversation.id);
    db.prepare("UPDATE conversations SET ai_enabled=0,hidden=0,status=CASE WHEN assigned_user_id IS NULL THEN 'waiting_human' ELSE 'open' END WHERE id=?").run(conversation.id);
    addSystemNote(conversation.id, `✅ **Pedido #${String(created.order.id).padStart(4,'0')}** revisado e confirmado.`);
    const text = emphasizeOrder(replaceVariables(setting('order_confirmed_message','✅ *Pedido #{Pedido}* confirmado! Já enviamos tudo para a cozinha. Total: {Total}'), {
      client: conversation.contact_name, agent: req.user.name, order_id: created.order.id, total: created.order.total,
      subtotal: created.order.subtotal, delivery_fee: created.order.delivery_fee, address: created.order.address,
      payment_method: created.order.payment_method,
    }));
    const messageId = insertMessage({ conversationId: conversation.id, senderType:'agent', userId:req.user.id, content:text, deliveryStatus:'pending' });
    let message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
    try {
      // Confirmação automática do pedido: sem assinatura/nome de quem clicou.
      const result = await whatsapp.sendText({ phone: conversation.phone, text });
      message = stampProviderResult(messageId,result,'sent');
    } catch (error) {
      const reason = String(error.message || error);
      const definitive = /não está conectado|nao esta conectado|not connected|unauthorized|forbidden|invalid number|número inválido|numero invalido|401|403/i.test(reason);
      db.prepare('UPDATE messages SET delivery_status=?,failed_reason=? WHERE id=?').run(definitive ? 'failed' : 'sent', definitive ? reason.slice(0,500) : '', messageId);
      message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
      realtime.emit('system:warning',{message:definitive ? `Pedido criado, mas a confirmação foi rejeitada: ${reason}` : 'A confirmação foi enviada, mas a Evolution não retornou o status a tempo. A mensagem foi mantida como enviada.'});
    }
    realtime.emit('message:new',{conversationId:conversation.id,message});
    realtime.emit('message:status',{conversationId:conversation.id,message});
    realtime.emit('conversation:updated',getConversation(conversation.id));
    return res.status(201).json(created);
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.delete('/conversations/:id/order-review', requireAuth, (req, res) => {
  const conversation = getConversation(Number(req.params.id));
  if (!ensureConversationAccess(req,res,conversation)) return;
  db.prepare('DELETE FROM ai_order_sessions WHERE conversation_id=?').run(conversation.id);
  db.prepare("UPDATE conversations SET ai_enabled=0,hidden=0,status=CASE WHEN assigned_user_id IS NULL THEN 'waiting_human' ELSE 'open' END WHERE id=?").run(conversation.id);
  addSystemNote(conversation.id, '🗑️ Revisão de pedido cancelada. O atendimento seguirá manualmente, sem mensagem automática ao cliente.');
  realtime.emit('conversation:updated',getConversation(conversation.id));
  return res.status(204).end();
});

router.get('/orders', requireAuth, (req, res) => {
  const view=String(req.query.view||'all'); const period=String(req.query.period||'all'); const status=String(req.query.status||'');
  const where=[]; const params=[];
  if(view==='delivery') where.push("o.fulfillment_method='delivery' AND o.status IN ('out_for_delivery','delivered')");
  else if(view==='active') where.push("o.status NOT IN ('delivered','cancelled')");
  if(status) { where.push('o.status=?'); params.push(status); }
  if(period==='today'){where.push('substr(o.created_at,1,10)=?');params.push(new Date().toISOString().slice(0,10));}
  if(req.query.from){where.push('substr(o.created_at,1,10)>=?');params.push(String(req.query.from));}
  if(req.query.to){where.push('substr(o.created_at,1,10)<=?');params.push(String(req.query.to));}
  const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
  const rows=db.prepare(`SELECT o.*,ct.name contact_name,ct.phone,eu.name edited_by_user_name,rt.name table_name,(SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) items_count FROM orders o JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN users eu ON eu.id=o.edited_by_user_id LEFT JOIN restaurant_tables rt ON rt.id=o.table_id ${clause} ORDER BY CASE o.status WHEN 'out_for_delivery' THEN 0 WHEN 'ready' THEN 1 WHEN 'preparing' THEN 2 ELSE 3 END,o.updated_at DESC`).all(...params);
  res.json(rows);
});

router.get('/orders/:id', requireAuth, (req, res) => {
  const order = db.prepare(`
    SELECT o.*,ct.name contact_name,ct.phone,ct.email contact_email,
      eu.name edited_by_user_name,cu.name cancelled_by_user_name,
      rt.name table_name,tt.status table_tab_status,tt.opened_at table_tab_opened_at,
      tt.account_requested_at table_account_requested_at,tt.closed_at table_tab_closed_at,
      tm.display_name table_member_name,c.protocol conversation_protocol
    FROM orders o
    JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN users eu ON eu.id=o.edited_by_user_id
    LEFT JOIN users cu ON cu.id=o.cancelled_by_user_id
    LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
    LEFT JOIN table_tabs tt ON tt.id=o.table_tab_id
    LEFT JOIN table_members tm ON tm.id=o.table_member_id
    LEFT JOIN conversations c ON c.id=o.conversation_id
    WHERE o.id=?
  `).get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(order.id);
  order.history = db.prepare(`
    SELECT a.action,a.details,a.created_at,u.name user_name
    FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
    WHERE a.entity='order' AND a.entity_id=?
    ORDER BY a.created_at ASC,a.id ASC
  `).all(order.id).map((row) => ({ ...row, details: safeJson(row.details, {}) }));
  res.json(order);
});


router.post('/orders/:id/repeat', requireAuth, (req, res) => {
  const source = orderWithItems(Number(req.params.id));
  if (!source) return res.status(404).json({ error: 'Pedido original não encontrado.' });
  if (source.fulfillment_method === 'table') return res.status(400).json({ error: 'Pedidos de mesa devem ser refeitos pelo cardápio da comanda ativa.' });
  const requestedConversationId = Number(req.body.conversationId || 0);
  const conversation = requestedConversationId
    ? getConversation(requestedConversationId)
    : getConversation(db.prepare("SELECT id FROM conversations WHERE contact_id=? AND status!='closed' ORDER BY id DESC LIMIT 1").get(source.contact_id)?.id);
  if (!conversation || Number(conversation.contact_id) !== Number(source.contact_id)) return res.status(400).json({ error: 'Abra um atendimento ativo desse cliente antes de repetir o pedido.' });
  if (!ensureConversationAccess(req, res, conversation)) return;
  try {
    const created = createConfirmedOrder({
      conversation,
      requestedItems: source.items.map((item) => ({ productId: item.product_id, quantity: item.quantity, notes: item.notes })),
      deliveryFee: source.delivery_fee,
      address: source.address,
      paymentMethod: source.payment_method,
      notes: `Pedido repetido a partir do #${String(source.id).padStart(4,'0')}${source.notes ? ` · ${source.notes}` : ''}`,
      fulfillmentMethod: source.fulfillment_method,
      userId: req.user.id,
      source: 'repeat',
    });
    audit(req.user.id, 'repeat', 'order', created.order.id, { sourceOrderId: source.id, total: created.total });
    return res.status(201).json(created.order);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.put('/orders/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const existing = orderWithItems(id);
  if (!existing) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (['delivered','cancelled'].includes(existing.status)) return res.status(400).json({ error: 'Pedidos entregues ou cancelados não podem ser editados.' });

  const requestedItems = Array.isArray(req.body.items) ? req.body.items : [];
  if (!requestedItems.length) return res.status(400).json({ error: 'Inclua pelo menos um produto no pedido.' });

  const oldItems = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
  const oldByProduct = new Map();
  for (const item of oldItems) {
    if (item.product_id) oldByProduct.set(Number(item.product_id), (oldByProduct.get(Number(item.product_id)) || 0) + Number(item.quantity || 0));
  }

  const items = [];
  let subtotal = 0;
  for (const input of requestedItems) {
    const productId = Number(input.productId || 0);
    const quantity = Math.max(0, Math.floor(Number(input.quantity || 0)));
    if (!productId || quantity < 1) continue;
    const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
    if (!product) return res.status(400).json({ error: 'Um dos produtos não foi encontrado.' });
    if (!product.active && !oldByProduct.has(productId)) return res.status(400).json({ error: `${product.name} está inativo e não pode ser incluído.` });
    const available = product.stock == null ? null : Number(product.stock) + Number(oldByProduct.get(productId) || 0);
    if (available != null && quantity > available) return res.status(400).json({ error: `Estoque insuficiente para ${product.name}. Disponível: ${available}.` });
    const unitPrice = Number(product.price || 0);
    subtotal += unitPrice * quantity;
    items.push({ product, quantity, unitPrice, notes: String(input.notes || '').trim() });
  }
  if (!items.length) return res.status(400).json({ error: 'Nenhum item válido foi informado.' });

  const requestedFulfillment = String(req.body.fulfillmentMethod || existing.fulfillment_method || 'delivery');
  const fulfillmentMethod = existing.fulfillment_method === 'table'
    ? 'table'
    : requestedFulfillment === 'pickup' ? 'pickup' : 'delivery';
  const deliveryFee = fulfillmentMethod === 'delivery' ? Math.max(0, Number(req.body.deliveryFee ?? existing.delivery_fee ?? 0)) : 0;
  const total = subtotal + deliveryFee;
  const address = fulfillmentMethod === 'delivery' ? String(req.body.address ?? existing.address ?? '').trim() : '';
  const paymentMethod = fulfillmentMethod === 'table' ? '' : String(req.body.paymentMethod ?? existing.payment_method ?? '').trim();
  const notes = String(req.body.notes ?? existing.notes ?? '').trim();
  const stamp = nowIso();

  db.exec('BEGIN');
  try {
    for (const item of oldItems) {
      if (!item.product_id) continue;
      const product = db.prepare('SELECT stock FROM products WHERE id=?').get(Number(item.product_id));
      if (product && product.stock != null) db.prepare('UPDATE products SET stock=stock+?,updated_at=? WHERE id=?').run(Number(item.quantity || 0), stamp, Number(item.product_id));
    }
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(id);
    const insertItem = db.prepare('INSERT INTO order_items (order_id,product_id,name,quantity,unit_price,notes) VALUES (?,?,?,?,?,?)');
    for (const item of items) {
      insertItem.run(id, item.product.id, item.product.name, item.quantity, item.unitPrice, item.notes);
      if (item.product.stock != null) db.prepare('UPDATE products SET stock=stock-?,updated_at=? WHERE id=?').run(item.quantity, stamp, item.product.id);
    }
    db.prepare(`UPDATE orders SET subtotal=?,delivery_fee=?,total=?,address=?,payment_method=?,fulfillment_method=?,notes=?,edited_at=?,edited_by_user_id=?,updated_at=?,kitchen_seen_at=NULL WHERE id=?`)
      .run(subtotal, deliveryFee, total, address, paymentMethod, fulfillmentMethod, notes, stamp, req.user.id, stamp, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return res.status(400).json({ error: `Não foi possível editar o pedido: ${error.message}` });
  }

  const row = orderWithItems(id);
  db.prepare("UPDATE order_change_requests SET status='resolved',resolved_by_user_id=?,resolved_at=?,updated_at=? WHERE order_id=? AND status='pending'")
    .run(req.user.id, stamp, stamp, id);
  audit(req.user.id, 'edit', 'order', id, { before: { total: existing.total, items: oldItems.length }, after: { total, items: items.length } });
  if (row.conversation_id) addSystemNote(row.conversation_id, `✏️ **Pedido #${String(id).padStart(4,'0')} editado.** A cozinha recebeu os dados atualizados.`);
  const notification = createNotification({
    type: 'order_edited',
    title: `Pedido #${String(id).padStart(4,'0')} editado`,
    message: `${row.contact_name}: confira os itens e observações atualizados.`,
    entityType: 'order',
    entityId: id,
    targetRole: 'kitchen',
  });
  realtime.emit('order:updated', row);
  realtime.emit('notification:new', notification);
  return res.json(row);
});

router.put('/order-change-requests/:id/resolve', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const request = db.prepare('SELECT * FROM order_change_requests WHERE id=?').get(id);
  if (!request) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const stamp = nowIso();
  db.prepare("UPDATE order_change_requests SET status='resolved',resolved_by_user_id=?,resolved_at=?,updated_at=? WHERE id=?")
    .run(req.user.id, stamp, stamp, id);
  audit(req.user.id, 'resolve_change_request', 'order', request.order_id, { requestId: id });
  res.json({ success: true });
});

router.put('/orders/:id/status', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const allowed = ['new','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled'];
  const status = String(req.body.status || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const existing = orderWithItems(id);
  if (!existing) return res.status(404).json({ error: 'Pedido não encontrado.' });
  if (existing.status === 'cancelled' && status !== 'cancelled') return res.status(400).json({ error: 'Um pedido cancelado não pode voltar para outro status.' });
  if (['delivered','picked_up'].includes(existing.status) && status !== existing.status) {
    const terminalMessage = existing.fulfillment_method === 'pickup'
      ? 'Um pedido retirado não pode voltar para outro status.'
      : existing.fulfillment_method === 'table'
        ? 'Um pedido entregue na mesa não pode voltar para outro status.'
        : 'Um pedido entregue não pode voltar para outro status.';
    return res.status(400).json({ error: terminalMessage });
  }
  if (existing.fulfillment_method === 'pickup' && ['out_for_delivery','delivered'].includes(status)) return res.status(400).json({ error: 'Pedidos para retirada não podem entrar no fluxo de entrega. Use Pronto para retirada e depois Retirado.' });
  if (existing.fulfillment_method === 'table' && ['out_for_delivery','picked_up'].includes(status)) return res.status(400).json({ error: 'Pedidos de mesa não entram no fluxo de entrega ou retirada. Use Pronto para servir e depois Entregue na mesa.' });
  if (!['pickup'].includes(existing.fulfillment_method) && status === 'picked_up') return res.status(400).json({ error: 'O status Retirado é exclusivo para pedidos com retirada na loja.' });
  if (status === existing.status) return res.json(existing);

  const cancelReason = String(req.body.cancelReason || '').trim();
  if (status === 'cancelled' && cancelReason.length < 3) return res.status(400).json({ error: 'Informe o motivo do cancelamento.' });
  const stamp = nowIso();
  db.exec('BEGIN');
  try {
    if (status === 'cancelled') {
      for (const item of existing.items || []) {
        if (!item.product_id) continue;
        const product = db.prepare('SELECT stock FROM products WHERE id=?').get(item.product_id);
        if (product && product.stock != null) db.prepare('UPDATE products SET stock=stock+?,updated_at=? WHERE id=?').run(Number(item.quantity || 0), stamp, item.product_id);
      }
      db.prepare(`UPDATE orders SET status='cancelled',cancel_reason=?,cancelled_at=?,cancelled_by_user_id=?,updated_at=? WHERE id=?`)
        .run(cancelReason, stamp, req.user.id, stamp, id);
    } else {
      db.prepare(`UPDATE orders SET status=?,updated_at=?,confirmed_at=CASE WHEN ?='confirmed' THEN COALESCE(confirmed_at,?) ELSE confirmed_at END WHERE id=?`)
        .run(status, stamp, status, stamp, id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return res.status(400).json({ error: `Não foi possível atualizar o pedido: ${error.message}` });
  }

  const row = orderWithItems(id);
  audit(req.user.id, status === 'cancelled' ? 'cancel' : 'status', 'order', id, { status, cancelReason: status === 'cancelled' ? cancelReason : '' });
  realtime.emit('order:updated', row);
  if (row.table_id) realtime.emit('table:updated', { tableId: row.table_id, tabId: row.table_tab_id || null });
  if (row.conversation_id) realtime.emit('conversation:updated', { id: row.conversation_id });
  if (existing.source === 'website' && existing.status === 'new' && status === 'confirmed') {
    const kitchenNotification = createNotification({
      type: 'new_order',
      title: `Pedido #${String(row.id).padStart(4, '0')} confirmado`,
      message: `${row.contact_name}: pedido do site liberado para a cozinha.`,
      entityType: 'order',
      entityId: row.id,
      targetRole: 'kitchen',
    });
    realtime.emit('notification:new', kitchenNotification);
  }

  const templates = {
    confirmed: setting('order_confirmed_message','✅ Pedido #{Pedido} confirmado! 👨‍🍳 Já enviamos para a cozinha.'),
    preparing: setting('order_preparing_message','👨‍🍳 Seu pedido #{Pedido} está em preparo!'),
    ready: row.fulfillment_method === 'pickup'
      ? setting('order_pickup_ready_message','✅ Seu pedido #{Pedido} está pronto para retirada!\n\n{RetiradaEntrega}')
      : row.fulfillment_method === 'table'
        ? setting('order_table_ready_message','🍽️ Seu pedido #{Pedido} está pronto para ser servido na {RetiradaEntrega}!')
        : setting('order_ready_message','✅ Seu pedido #{Pedido} está pronto!\n\n{RetiradaEntrega}'),
    out_for_delivery: setting('order_out_delivery_message','🛵 Seu pedido #{Pedido} saiu para entrega!'),
    delivered: row.fulfillment_method === 'table'
      ? setting('order_table_delivered_message','✅ Pedido #{Pedido} entregue na {RetiradaEntrega}. Bom apetite! 💚')
      : setting('order_delivered_message','🎉 Pedido #{Pedido} entregue! Obrigado pela preferência. 💚'),
    picked_up: setting('order_picked_up_message','✅ Pedido #{Pedido} retirado com sucesso! Obrigado pela preferência. 💚'),
    cancelled: '❌ Seu pedido #{Pedido} foi cancelado. Fale com nossa equipe em caso de dúvida.',
  };
  const fulfillmentText = row.fulfillment_method === 'pickup'
    ? `📍 Retirada em: ${setting('store_pickup_address','')}`
    : row.fulfillment_method === 'table'
      ? `${row.table_name || 'Mesa'}`
      : `🛵 Entrega em: ${row.address || ''}`;
  const statusMessage = templates[status] ? emphasizeOrder(replaceVariables(templates[status], {
    client: row.contact_name, agent: req.user.name, order_id: row.id, subtotal: row.subtotal,
    delivery_fee: row.delivery_fee, total: row.total, address: row.address,
    payment_method: row.payment_method, fulfillment_text: fulfillmentText,
  })) : '';
  if (setting('notify_order_status', 'true') === 'true' && statusMessage && row.conversation_id) {
    const messageId = insertMessage({ conversationId: row.conversation_id, senderType: 'agent', userId: req.user.id, content: statusMessage, deliveryStatus: 'pending' });
    const pendingMessage = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
    realtime.emit('message:new', { conversationId: row.conversation_id, message: pendingMessage });
    void (async () => {
      try {
        const result = await whatsapp.sendText({ phone: row.phone, text: statusMessage });
        const message = stampProviderResult(messageId, result, 'sent');
        if (row.source === 'website' && !result?.mock) {
          db.prepare("UPDATE orders SET whatsapp_receipt_status='sent',whatsapp_notified_at=?,whatsapp_error='',updated_at=? WHERE id=?")
            .run(nowIso(), nowIso(), row.id);
        }
        realtime.emit('message:status', { conversationId: row.conversation_id, message });
      } catch (error) {
        const reason = String(error.message || error);
        const definitive = /não está conectado|not connected|logged out|unauthorized|forbidden|invalid number|número inválido|bad request|401|403|404/i.test(reason);
        db.prepare('UPDATE messages SET delivery_status=?,failed_reason=? WHERE id=?').run(definitive ? 'failed' : 'sent', definitive ? reason.slice(0,500) : '', messageId);
        const message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
        realtime.emit('message:status', { conversationId: row.conversation_id, message });
        if (!definitive) realtime.emit('system:warning', { message: 'O WhatsApp não confirmou a atualização do pedido a tempo. Como ela pode ter sido aceita, a mensagem foi mantida como enviada.' });
      }
    })();
  }
  return res.json(row);
});


function tableAdminRow(table) {
  const tab = tables.activeTab(table.id);
  const summary = tab ? tables.tabSummary(tab.id) : null;
  return {
    ...table,
    active: Boolean(table.active),
    tab: summary?.tab || null,
    total: Number(summary?.total || 0),
    paidTotal: Number(summary?.paidTotal || 0),
    balance: Number(summary?.balance || 0),
    payments: summary?.payments || [],
    members: summary?.members || [],
    orders: summary?.orders || [],
    pendingRequests: summary?.requests || [],
  };
}

router.get('/tables', requireAuth, requireTableOperator, (req, res) => {
  const rows = db.prepare('SELECT * FROM restaurant_tables ORDER BY active DESC,name COLLATE NOCASE').all().map(tableAdminRow);
  res.json({ enabled: setting('restaurant_tables_enabled','false') === 'true', tables: rows });
});

router.get('/tables/:id/history', requireAuth, requireTableOperator, (req, res) => {
  const history = tables.tableHistory(req.params.id, { limit: req.query.limit });
  if (!history) return res.status(404).json({ error: 'Mesa não encontrada.' });
  return res.json(history);
});

router.post('/tables', requireAuth, requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0,80);
  if (name.length < 2) return res.status(400).json({ error: 'Informe o nome ou número da mesa.' });
  try {
    const stamp = nowIso();
    const result = db.prepare("INSERT INTO restaurant_tables(name,qr_token,status,active,created_at,updated_at) VALUES(?,?,'free',1,?,?)")
      .run(name, tables.newQrToken(), stamp, stamp);
    const row = tableAdminRow(tables.getTableById(Number(result.lastInsertRowid)));
    audit(req.user.id,'create','restaurant_table',row.id,{name});
    realtime.emit('table:updated',{tableId:row.id});
    return res.status(201).json(row);
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Já existe uma mesa com esse nome.' });
    throw error;
  }
});

router.put('/tables/:id', requireAuth, requireAdmin, (req, res) => {
  const table = tables.getTableById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' });
  const name = String(req.body.name ?? table.name).trim().slice(0,80);
  const active = req.body.active == null ? table.active : (req.body.active ? 1 : 0);
  const blocked = req.body.blocked == null ? table.status === 'blocked' : Boolean(req.body.blocked);
  if (name.length < 2) return res.status(400).json({ error: 'Informe um nome válido.' });
  if (blocked && tables.activeTab(table.id)) return res.status(400).json({ error: 'Feche a comanda antes de bloquear esta mesa.' });
  const status = blocked ? 'blocked' : (table.status === 'blocked' ? 'free' : table.status);
  try {
    db.prepare('UPDATE restaurant_tables SET name=?,active=?,status=?,updated_at=? WHERE id=?').run(name,active,status,nowIso(),table.id);
    audit(req.user.id,'update','restaurant_table',table.id,{name,active:Boolean(active),status});
    realtime.emit('table:updated',{tableId:table.id});
    res.json(tableAdminRow(tables.getTableById(table.id)));
  } catch (error) {
    if (/unique/i.test(String(error.message))) return res.status(409).json({ error: 'Já existe uma mesa com esse nome.' });
    throw error;
  }
});

router.post('/tables/:id/regenerate-qr', requireAuth, requireAdmin, (req, res) => {
  const table = tables.getTableById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' });
  const token = tables.newQrToken();
  db.prepare('UPDATE restaurant_tables SET qr_token=?,updated_at=? WHERE id=?').run(token,nowIso(),table.id);
  audit(req.user.id,'regenerate_qr','restaurant_table',table.id,{});
  res.json(tableAdminRow(tables.getTableById(table.id)));
});

router.get('/tables/:id/qr', requireAuth, requireAdmin, async (req, res) => {
  const table = tables.getTableById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' });
  const configured = String(process.env.PUBLIC_SITE_URL || setting('website_public_url','') || '').trim().replace(/\/$/,'');
  const origin = configured || `${req.protocol}://${req.get('host')}`;
  const url = `${origin}/pedido/mesa/${table.qr_token}`;
  const dataUrl = await QRCode.toDataURL(url,{width:720,margin:2,errorCorrectionLevel:'M'});
  res.json({ table: { id:table.id,name:table.name }, url, dataUrl });
});

router.post('/tables/:id/payments', requireAuth, requireTableOperator, (req, res) => {
  const table = tables.getTableById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' });
  const tab = tables.activeTab(table.id);
  if (!tab) return res.status(409).json({ error: 'Esta mesa não possui uma comanda aberta.' });
  const summary = tables.tabSummary(tab.id);
  const balance = Number(summary?.balance || 0);
  if (balance <= 0.001) return res.status(409).json({ error: 'A comanda já está totalmente paga.' });
  const methods = new Set(['pix','card','cash','other']);
  const method = methods.has(String(req.body.paymentMethod || '').trim()) ? String(req.body.paymentMethod).trim() : '';
  if (!method) return res.status(400).json({ error: 'Escolha uma forma de pagamento.' });
  const scopes = new Set(['full','equal','member','partial']);
  const scope = scopes.has(String(req.body.scope || '').trim()) ? String(req.body.scope).trim() : 'partial';
  const memberId = req.body.memberId ? Number(req.body.memberId) : null;
  if (scope === 'member' && !memberId) return res.status(400).json({ error: 'Escolha quem está realizando o pagamento.' });
  if (memberId && !summary.members.some((member) => Number(member.id) === memberId)) return res.status(400).json({ error: 'A pessoa selecionada não pertence a esta comanda.' });
  let amount = Number(req.body.amount || 0);
  if (scope === 'full') amount = balance;
  amount = Math.round(amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Informe um valor de pagamento válido.' });
  if (amount > balance + 0.001) return res.status(400).json({ error: `O valor máximo restante é R$ ${balance.toFixed(2).replace('.', ',')}.` });
  const note = String(req.body.note || '').trim().slice(0,240);
  const stamp = nowIso();
  const result = db.prepare(`INSERT INTO table_payments(tab_id,member_id,payment_scope,payment_method,amount,note,created_by_user_id,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run(tab.id, memberId, scope, method, amount, note, req.user.id, stamp);
  audit(req.user.id,'create','table_payment',Number(result.lastInsertRowid),{tableId:table.id,tabId:tab.id,memberId,scope,method,amount});
  realtime.emit('table:updated',{tableId:table.id,tabId:tab.id});
  res.status(201).json(tableAdminRow(tables.getTableById(table.id)));
});

router.delete('/table-payments/:id', requireAuth, requireAdmin, (req, res) => {
  const payment = db.prepare('SELECT tp.*,tt.table_id FROM table_payments tp JOIN table_tabs tt ON tt.id=tp.tab_id WHERE tp.id=?').get(Number(req.params.id));
  if (!payment) return res.status(404).json({ error: 'Pagamento não encontrado.' });
  db.prepare('DELETE FROM table_payments WHERE id=?').run(payment.id);
  audit(req.user.id,'delete','table_payment',payment.id,{tableId:payment.table_id,amount:payment.amount});
  realtime.emit('table:updated',{tableId:payment.table_id,tabId:payment.tab_id});
  res.json({success:true});
});

router.post('/tables/:id/release', requireAuth, requireTableOperator, async (req, res) => {
  const table = tables.getTableById(req.params.id);
  if (!table) return res.status(404).json({ error: 'Mesa não encontrada.' });

  const activeTabs = db.prepare("SELECT id FROM table_tabs WHERE table_id=? AND status IN ('open','account_requested')").all(table.id);
  const conversationIds = new Set();
  for (const tab of activeTabs) {
    for (const row of db.prepare(`
      SELECT DISTINCT conversation_id
      FROM (
        SELECT conversation_id FROM table_members WHERE tab_id=? AND conversation_id IS NOT NULL
        UNION
        SELECT conversation_id FROM orders WHERE table_tab_id=? AND conversation_id IS NOT NULL
      ) linked_conversations
    `).all(tab.id, tab.id)) {
      if (row.conversation_id) conversationIds.add(Number(row.conversation_id));
    }
  }

  const closingReason = db.prepare("SELECT * FROM closure_reasons WHERE name='Mesa liberada' AND active=1 ORDER BY id LIMIT 1").get()
    || db.prepare("SELECT * FROM closure_reasons WHERE active=1 ORDER BY id LIMIT 1").get();
  const messageTemplate = setting('table_closing_message','Obrigado pela visita, {Cliente}! A sua comanda foi encerrada. Volte sempre! 🍔💚');
  let finalizedAttendances = 0;
  let messagesSent = 0;

  for (const conversationId of conversationIds) {
    const current = getConversation(conversationId);
    if (!current || current.status === 'closed') continue;
    const stamp = nowIso();
    const closeResult = db.prepare(`
      UPDATE conversations
      SET status='closed',closed_at=?,unread_count=0,close_reason_id=?,close_reason_text=?,closed_by_user_id=?
      WHERE id=? AND status!='closed'
    `).run(stamp, closingReason?.id || null, closingReason?.name || 'Mesa liberada', req.user.id, conversationId);
    if (!closeResult.changes) continue;
    finalizedAttendances += 1;

    const closingText = replaceVariables(messageTemplate, {
      client: current.contact_name,
      agent: req.user.name,
      phone: current.phone,
      table: table.name,
    });
    const messageId = insertMessage({
      conversationId,
      senderType:'agent',
      userId:req.user.id,
      content:closingText,
      deliveryStatus:'pending',
    });
    try {
      const result = await whatsapp.sendText({ phone:current.phone, text:closingText });
      const message = stampProviderResult(messageId,result,'sent');
      messagesSent += 1;
      realtime.emit('message:new',{conversationId,message});
    } catch (error) {
      db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?")
        .run(String(error.message || error).slice(0,500),messageId);
    }
    realtime.emit('conversation:updated', getConversation(conversationId));
  }

  const released = tables.releaseTable(table.id,req.user.id,String(req.body.note||'').trim().slice(0,300));
  audit(req.user.id,'release','restaurant_table',released.id,{finalizedAttendances,messagesSent});
  realtime.emit('table:updated',{tableId:released.id});
  res.json({ ...tableAdminRow(released), finalizedAttendances, messagesSent });
});

router.post('/table-requests/:id/resolve', requireAuth, requireTableOperator, (req, res) => {
  const requestRow = db.prepare('SELECT * FROM table_service_requests WHERE id=?').get(Number(req.params.id));
  if (!requestRow) return res.status(404).json({ error: 'Chamado não encontrado.' });
  db.prepare("UPDATE table_service_requests SET status='resolved',resolved_at=?,resolved_by_user_id=? WHERE id=?").run(nowIso(),req.user.id,requestRow.id);
  audit(req.user.id,'resolve','table_service_request',requestRow.id,{});
  realtime.emit('table:updated',{tableId:requestRow.table_id,tabId:requestRow.tab_id});
  res.json({success:true});
});

router.get('/whatsapp-summary', requireAuth, (req, res) => {
  const row = whatsapp.getPrimaryInstance();
  const item = whatsapp.publicInstance(row);
  if (item?.config) delete item.config;
  res.json(item || { status: 'disconnected', provider: 'mock', name: 'WhatsApp' });
});

router.get('/business-hours/status', requireAuth, (req, res) => {
  res.json(businessHours.getBusinessStatus());
});

router.post('/business-hours/extend', requireAuth, (req, res) => {
  try {
    const status = businessHours.extendToday(req.body?.until, req.user.id);
    audit(req.user.id, 'extend', 'business_hours', null, { date: status.date, until: status.extension?.until || req.body?.until });
    return res.json(status);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/settings', requireAuth, requireAdmin, (req, res) => {
  const settings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((r) => [r.key, r.value]));
  const instances = db.prepare('SELECT * FROM whatsapp_instances ORDER BY id').all().map(whatsapp.publicInstance);
  res.json({ settings, instances, databasePath: DB_PATH });
});

router.put('/settings', requireAuth, requireAdmin, (req, res) => {
  const allowed = ['company_name','primary_color','ai_name','ai_fallback','whatsapp_mode','public_base_url','notify_order_status','kitchen_sound','emoji_set','delivery_fee','store_pickup_address','welcome_enabled','first_contact_message','returning_welcome_enabled','returning_welcome_message','greeting_enabled','greeting_message','greeting_cooldown_hours','welcome_menu_enabled','welcome_menu_title','welcome_menu_options','agent_signature_enabled','ai_signature_enabled','agent_message_prefix','ai_message_prefix','closing_message_enabled','closing_message','table_closing_message','instagram','default_live_filter','assignment_mode','allow_agents_view_all','internal_chat_enabled','emojis_enabled','business_hours_enabled','business_hours_json','after_hours_message','order_confirmed_message','order_preparing_message','order_ready_message','order_pickup_ready_message','order_out_delivery_message','order_delivered_message','order_picked_up_message','satisfaction_enabled','satisfaction_message','default_conversation_filter','ai_auto_create_orders','automatic_backups_enabled','backup_retention_days','waiting_alert_minutes','bot_order_mode','bot_order_whatsapp_ai_message','bot_order_whatsapp_message','bot_order_site_message','bot_order_hybrid_message','bot_order_hybrid_human_message','bot_order_link_hours','bot_order_trigger_phrases','bot_catalog_navigation_enabled','bot_catalog_items_per_page','bot_catalog_show_prices','lunch_menu_enabled','lunch_menu_start','lunch_menu_end','lunch_offer_first_message','website_orders_enabled','website_accept_outside_hours','website_public_url','website_hero_title','website_hero_text','website_subtitle','website_logo_url','website_delivery_enabled','website_pickup_enabled','website_payment_pix','website_payment_card','website_payment_cash','website_checkout_notice','website_whatsapp_receipt_message','restaurant_tables_enabled','restaurant_table_session_hours','restaurant_table_allow_multiple_devices','restaurant_table_customer_edit_enabled','restaurant_table_customer_cancel_enabled','restaurant_table_edit_minutes','order_status_colors_enabled','order_status_color_confirmed','order_status_color_preparing','order_status_color_ready','order_status_color_out_for_delivery','order_status_color_delivered','order_status_color_cancelled','order_table_ready_message','order_table_delivered_message'];
  const upsert = db.prepare(`
    INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
  `);
  for (const key of allowed) {
    if (req.body[key] != null) upsert.run(key, String(req.body[key]), nowIso());
  }
  audit(req.user.id, 'update', 'settings', null, { keys: Object.keys(req.body) });
  if (req.body.business_hours_enabled != null || req.body.business_hours_json != null) {
    realtime.emit('business-hours:updated', businessHours.getBusinessStatus());
  }
  res.json({ success: true });
});

router.post('/whatsapp/:id/local-config', requireAuth, requireAdmin, (req, res) => {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return res.status(400).json({ error: 'A configuração local usa Docker no computador e não funciona na Discloud. Informe a URL de uma Evolution API hospedada separadamente.' });
  }
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Instância não encontrada.' });
  const current = whatsapp.safeJson(existing.config_json);
  const config = {
    baseUrl: 'http://localhost:8080',
    apiKey: 'atenderbem-local-test-key',
    instanceName: 'atenderbem',
    publicBaseUrl: 'http://host.docker.internal:3000',
    webhookSecret: current.webhookSecret || crypto.randomBytes(18).toString('hex'),
    instanceToken: current.instanceToken || '',
  };
  const row = whatsapp.updateInstance(id, {
    name: 'WhatsApp principal',
    provider: 'evolution',
    status: 'disconnected',
    config,
  });
  db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('whatsapp_mode','evolution',?) ON CONFLICT(key) DO UPDATE SET value='evolution',updated_at=excluded.updated_at`).run(nowIso());
  db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('public_base_url',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`).run(config.publicBaseUrl, nowIso());
  audit(req.user.id, 'apply_local_config', 'whatsapp_instance', id, { baseUrl: config.baseUrl, instanceName: config.instanceName });
  return res.json({ success: true, instance: whatsapp.publicInstance(row) });
});

router.get('/whatsapp/:id/diagnose', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Instância não encontrada.' });
  const config = whatsapp.safeJson(row.config_json);
  const result = {
    provider: row.provider,
    baseUrl: config.baseUrl || '',
    instanceName: config.instanceName || '',
    apiKeyConfigured: Boolean(config.apiKey),
    publicBaseUrl: config.publicBaseUrl || '',
    apiReachable: false,
    authenticated: false,
    instanceExists: false,
    state: 'unknown',
  };
  if (row.provider !== 'evolution') return res.json({ ...result, message: 'A conexão ainda não está no modo Evolution API.' });
  try {
    const provider = whatsapp.providerFor(row);
    const data = await provider.fetchInstances();
    result.apiReachable = true;
    result.authenticated = true;
    const list = Array.isArray(data) ? data : Array.isArray(data?.instances) ? data.instances : data?.response ? [data.response] : [];
    result.instanceExists = list.some((item) => (item.instance?.instanceName || item.instanceName || item.name) === config.instanceName);
    if (result.instanceExists) {
      try {
        const stateData = await provider.connectionState();
        result.state = stateData?.instance?.state || stateData?.instance?.status || stateData?.state || 'unknown';
      } catch (error) {
        result.state = 'unavailable';
        result.stateError = error.message;
      }
      try {
        const webhookData = await provider.findWebhook();
        result.webhookUrl = provider.webhookUrlFrom(webhookData);
        const expectedBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl, config.baseUrl);
        result.expectedWebhookUrl = expectedBaseUrl && config.webhookSecret
          ? `${expectedBaseUrl}/api/webhooks/evolution/${config.webhookSecret}`
          : '';
        result.webhookMatches = Boolean(result.webhookUrl && result.webhookUrl === result.expectedWebhookUrl);
      } catch (error) {
        result.webhookError = error.message;
        result.webhookMatches = false;
      }
    }
    if (!result.instanceExists) {
      result.message = 'Evolution autenticada. A instância ainda será criada ao gerar o QR Code.';
    } else if (result.webhookMatches) {
      result.message = `Evolution autenticada. Instância encontrada (${result.state}) e webhook correto.`;
    } else {
      result.message = `Evolution autenticada. Instância encontrada (${result.state}), mas o webhook precisa ser corrigido.`;
    }
    return res.json(result);
  } catch (error) {
    result.error = error.message;
    return res.status(502).json(result);
  }
});

router.put('/whatsapp/:id/config', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'Instância não encontrada.' });
  const current = whatsapp.safeJson(existing.config_json);
  const webhookSecret = String(req.body.webhookSecret || current.webhookSecret || crypto.randomBytes(18).toString('hex'));
  const baseUrl = String(req.body.baseUrl || current.baseUrl || '').trim().replace(/\/$/, '');
  const config = {
    baseUrl,
    apiKey: String(req.body.apiKey || current.apiKey || ''),
    instanceName: String(req.body.instanceName || current.instanceName || 'atenderbem'),
    publicBaseUrl: normalizePublicBaseUrl(
      req.body.publicBaseUrl || current.publicBaseUrl || getSetting('public_base_url', 'http://host.docker.internal:3000'),
      baseUrl,
    ),
    webhookSecret,
    instanceToken: current.instanceToken || '',
  };
  const row = whatsapp.updateInstance(id, {
    name: String(req.body.name || existing.name || 'WhatsApp principal'),
    provider: String(req.body.provider || 'evolution'),
    phone: normalizePhone(req.body.phone || existing.phone),
    status: 'disconnected',
    config,
  });
  db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('whatsapp_mode',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .run(row.provider, nowIso());
  db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('public_base_url',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .run(config.publicBaseUrl, nowIso());
  audit(req.user.id, 'configure', 'whatsapp_instance', id, { provider: row.provider, instanceName: config.instanceName, publicBaseUrl: config.publicBaseUrl });
  res.json(whatsapp.publicInstance(row));
});

router.get('/whatsapp/:id/status', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Instância não encontrada.' });
  if (row.provider === 'mock') return res.json({ status: 'connected', instance: whatsapp.publicInstance(row) });
  try {
    const data = await whatsapp.providerFor(row).connectionState();
    const state = data?.instance?.state || data?.instance?.status || data?.state || 'disconnected';
    const status = state === 'open' || state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected';
    const updated = whatsapp.updateInstance(id, { status });
    realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
    res.json({ status, rawState: state, instance: whatsapp.publicInstance(updated) });
  } catch (error) {
    if (whatsapp.providerFor(row).constructor.isMissingInstanceError?.(error)) {
      const updated = whatsapp.updateInstance(id, { status: 'disconnected' });
      realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
      return res.json({
        status: 'disconnected',
        rawState: 'instance_not_created',
        exists: false,
        message: 'A instância ainda não foi criada. Clique em Gerar QR Code.',
        instance: whatsapp.publicInstance(updated),
      });
    }
    res.status(502).json({ error: error.message });
  }
});

router.post('/whatsapp/:id/connect', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  let row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Instância não encontrada.' });
  if (row.provider === 'mock') {
    const updated = whatsapp.updateInstance(id, { status: 'connected' });
    return res.json({ instance: whatsapp.publicInstance(updated), connected: true });
  }
  if (row.provider !== 'evolution') return res.status(400).json({ error: 'A conexão por QR Code está disponível no modo Evolution API.' });

  try {
    let provider = whatsapp.providerFor(row);
    let config = whatsapp.safeJson(row.config_json);
    const correctedPublicBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl, config.baseUrl);
    if (correctedPublicBaseUrl !== config.publicBaseUrl) {
      row = whatsapp.updateInstance(id, { config: { publicBaseUrl: correctedPublicBaseUrl } });
      config = whatsapp.safeJson(row.config_json);
      provider = whatsapp.providerFor(row);
      db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('public_base_url',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
        .run(correctedPublicBaseUrl, nowIso());
    }
    const publicBaseUrl = String(config.publicBaseUrl || '').replace(/\/$/, '');
    const webhookUrl = publicBaseUrl && config.webhookSecret
      ? `${publicBaseUrl}/api/webhooks/evolution/${config.webhookSecret}`
      : '';

    const ensured = await provider.ensureInstance({ webhookUrl });
    if (ensured.token && !config.instanceToken) {
      row = whatsapp.updateInstance(id, { config: { instanceToken: ensured.token } });
      provider = whatsapp.providerFor(row);
      config = whatsapp.safeJson(row.config_json);
    }

    try {
      const currentState = await provider.connectionState();
      const rawState = currentState?.instance?.state || currentState?.instance?.status || currentState?.state || '';
      if (rawState === 'open' || rawState === 'connected') {
        let webhookWarning = '';
        if (webhookUrl) {
          try { await provider.setWebhook(webhookUrl); }
          catch (error) { webhookWarning = `WhatsApp conectado, mas o webhook não foi confirmado: ${error.message}`; }
        } else {
          webhookWarning = 'WhatsApp conectado, mas a URL de retorno está vazia.';
        }
        const updated = whatsapp.updateInstance(id, { status: 'connected' });
        realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
        return res.json({
          instance: whatsapp.publicInstance(updated),
          connected: true,
          webhookUrl,
          webhookWarning,
        });
      }
    } catch {
      // Instâncias recém-criadas ainda podem não possuir estado consultável.
    }

    // Algumas versões devolvem o QR Code já na criação; outras exigem a rota connect.
    let connection = ensured.data || {};
    let rawCode = String(
      connection?.code || connection?.qrcode?.code || connection?.qr || connection?.qrcode || ''
    );
    let qrCode = connection?.base64 || connection?.qrcode?.base64 || '';
    let pairingCode = connection?.pairingCode || connection?.pairing_code || '';

    if (!qrCode && !rawCode && !pairingCode) {
      connection = await provider.connect();
      rawCode = String(
        connection?.code || connection?.qrcode?.code || connection?.qr || connection?.qrcode || ''
      );
      qrCode = connection?.base64 || connection?.qrcode?.base64 || '';
      pairingCode = connection?.pairingCode || connection?.pairing_code || '';
    }

    let webhookWarning = '';
    if (webhookUrl) {
      // Reafirma sempre o webhook. Isso corrige instâncias que ficaram salvas com localhost:3000.
      try { await provider.setWebhook(webhookUrl); }
      catch (error) { webhookWarning = `QR Code disponível, mas o webhook não foi configurado: ${error.message}`; }
    } else {
      webhookWarning = 'A URL de retorno está vazia. O número pode conectar, mas as mensagens recebidas não chegarão ao painel.';
    }

    if (qrCode && !String(qrCode).startsWith('data:image')) qrCode = `data:image/png;base64,${qrCode}`;
    if (!qrCode && rawCode) qrCode = await QRCode.toDataURL(rawCode, { width: 360, margin: 2 });
    const status = qrCode || pairingCode || rawCode ? 'waiting_qr' : 'connecting';
    const updated = whatsapp.updateInstance(id, { status });
    audit(req.user.id, 'connect', 'whatsapp_instance', id, { created: ensured.created, webhookConfigured: !webhookWarning });
    realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
    return res.json({
      instance: whatsapp.publicInstance(updated),
      connected: false,
      qrCode,
      pairingCode,
      rawCode: qrCode ? '' : rawCode,
      webhookUrl,
      webhookWarning,
    });
  } catch (error) {
    const failedConfig = whatsapp.safeJson(row?.config_json);
    console.error('[WhatsApp QR] Falha ao gerar QR Code:', {
      instanceId: id,
      instanceName: failedConfig.instanceName || '',
      baseUrl: failedConfig.baseUrl || '',
      message: error.message,
    });
    return res.status(502).json({ error: error.message });
  }
});

router.post('/whatsapp/:id/repair-webhook', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  let row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Instância não encontrada.' });
  if (row.provider !== 'evolution') return res.status(400).json({ error: 'A conexão precisa estar no modo Evolution API.' });
  let config = whatsapp.safeJson(row.config_json);
  const publicBaseUrl = normalizePublicBaseUrl(config.publicBaseUrl, config.baseUrl);
  if (!publicBaseUrl) return res.status(400).json({ error: 'Informe a URL de retorno do sistema.' });
  if (publicBaseUrl !== config.publicBaseUrl) {
    row = whatsapp.updateInstance(id, { config: { publicBaseUrl } });
    config = whatsapp.safeJson(row.config_json);
  }
  db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('public_base_url',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .run(publicBaseUrl, nowIso());
  const webhookUrl = `${publicBaseUrl}/api/webhooks/evolution/${config.webhookSecret}`;
  try {
    const result = await whatsapp.providerFor(row).setWebhook(webhookUrl);
    const verifiedUrl = result?.verifiedUrl || webhookUrl;
    audit(req.user.id, 'repair_webhook', 'whatsapp_instance', id, { webhookUrl: verifiedUrl });
    return res.json({
      success: true,
      webhookUrl: verifiedUrl,
      verified: true,
      message: 'Webhook corrigido, reaplicado e confirmado pela Evolution API.',
    });
  } catch (error) {
    return res.status(502).json({ error: error.message, webhookUrl });
  }
});

router.post('/whatsapp/:id/test', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Instância não encontrada.' });
  const phone = normalizePhone(req.body.phone);
  const text = String(req.body.text || 'Teste de conexão da G&M Automação.').trim();
  if (phone.length < 10) return res.status(400).json({ error: 'Informe o telefone com DDI e DDD.' });
  if (!text) return res.status(400).json({ error: 'Digite a mensagem de teste.' });
  if (row.provider === 'mock') return res.json({ success: true, mock: true });
  try {
    await whatsapp.providerFor(row).sendText({ phone, text });
    audit(req.user.id, 'test_message', 'whatsapp_instance', id, { phone });
    return res.json({ success: true });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

router.post('/whatsapp/:id/disconnect', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Instância não encontrada.' });
  try {
    if (row.provider === 'evolution') await whatsapp.providerFor(row).logout();
    const updated = whatsapp.updateInstance(id, { status: 'disconnected' });
    audit(req.user.id, 'disconnect', 'whatsapp_instance', id);
    realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
    res.json({ instance: whatsapp.publicInstance(updated) });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});


// ======================== AtenderBem 3.0 ========================
router.get('/pause-reasons', requireAuth, (req, res) => {
  const all=String(req.query.all||'')==='1';
  res.json(db.prepare(`SELECT * FROM pause_reasons ${all?'':'WHERE active=1'} ORDER BY active DESC,name`).all().map((r)=>({...r,active:Boolean(r.active)})));
});
router.post('/pause-reasons', requireAuth, requireAdmin, (req,res)=>{
  const name=String(req.body.name||'').trim(); if(name.length<2) return res.status(400).json({error:'Informe o motivo da pausa.'});
  try{const stamp=nowIso();const result=db.prepare('INSERT INTO pause_reasons(name,active,created_at,updated_at) VALUES(?,1,?,?)').run(name,stamp,stamp);audit(req.user.id,'create','pause_reason',Number(result.lastInsertRowid));res.status(201).json(db.prepare('SELECT * FROM pause_reasons WHERE id=?').get(Number(result.lastInsertRowid)));}
  catch(error){if(/unique/i.test(String(error.message))) return res.status(409).json({error:'Esse motivo já existe.'});throw error;}
});
router.put('/pause-reasons/:id', requireAuth, requireAdmin, (req,res)=>{
  const id=Number(req.params.id),current=db.prepare('SELECT * FROM pause_reasons WHERE id=?').get(id);if(!current)return res.status(404).json({error:'Motivo não encontrado.'});
  const name=String(req.body.name??current.name).trim(),active=req.body.active==null?current.active:(req.body.active?1:0);db.prepare('UPDATE pause_reasons SET name=?,active=?,updated_at=? WHERE id=?').run(name,active,nowIso(),id);audit(req.user.id,'update','pause_reason',id,{active:Boolean(active)});res.json(db.prepare('SELECT * FROM pause_reasons WHERE id=?').get(id));
});

router.put('/presence', requireAuth, (req, res) => {
  const status = ['online','busy','paused','offline'].includes(String(req.body.status)) ? String(req.body.status) : 'online';
  const pauseReason = status === 'paused' ? String(req.body.pause_reason || '').trim().slice(0,120) : '';
  const receiveAssignments = req.body.receive_assignments == null
    ? db.prepare('SELECT receive_assignments FROM users WHERE id=?').get(req.user.id)?.receive_assignments
    : (req.body.receive_assignments ? 1 : 0);
  db.prepare('UPDATE users SET status=?,pause_reason=?,receive_assignments=?,last_seen_at=?,last_activity_at=? WHERE id=?')
    .run(status,pauseReason,receiveAssignments,nowIso(),nowIso(),req.user.id);
  const user = db.prepare('SELECT id,name,email,role,sector,status,active,avatar_url,receive_assignments,pause_reason,last_seen_at FROM users WHERE id=?').get(req.user.id);
  realtime.emit('presence:updated', presenceUserRow(user));
  if (req.user.role === 'agent') {
    if (assignment.shouldReceiveAssignments(req.user.id)) assignment.rebalanceWaitingConversations();
    else assignment.redistributeUserConversations(req.user.id);
  }
  audit(req.user.id,'presence','user',req.user.id,{status,pauseReason,receiveAssignments:Boolean(receiveAssignments)});
  res.json(publicUserRow(user));
});

router.get('/supervision', requireAuth, requireAdmin, (req, res) => {
  const users = sortPresenceUsers(db.prepare(`
    SELECT u.id,u.name,u.email,u.role,u.sector,u.status,u.active,u.avatar_url,u.receive_assignments,u.pause_reason,u.last_seen_at,
      COUNT(CASE WHEN c.status='open' THEN 1 END) open_count,
      SUM(CASE WHEN c.status IN ('waiting','waiting_human') THEN 1 ELSE 0 END) waiting_count,
      SUM(CASE WHEN c.unread_count>0 THEN 1 ELSE 0 END) unread_chats
    FROM users u LEFT JOIN conversations c ON c.assigned_user_id=u.id AND c.status!='closed'
    WHERE u.active=1 AND u.role IN ('admin','supervisor','agent','kitchen')
    GROUP BY u.id ORDER BY CASE u.status WHEN 'online' THEN 0 WHEN 'busy' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,u.name
  `).all().map(presenceUserRow));
  const conversations = db.prepare(`
    SELECT c.id,c.status,c.priority,c.ai_enabled,c.unread_count,c.last_message,c.last_message_at,c.assigned_user_id,
      ct.name contact_name,ct.phone,q.name queue_name,u.name assigned_user_name
    FROM conversations c JOIN contacts ct ON ct.id=c.contact_id JOIN queues q ON q.id=c.queue_id
    LEFT JOIN users u ON u.id=c.assigned_user_id
    WHERE c.status!='closed' AND COALESCE(c.hidden,0)=0
    ORDER BY CASE c.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,c.last_message_at DESC
  `).all().map((row)=>({...row,ai_enabled:Boolean(row.ai_enabled)}));
  res.json({ users, conversations, totals: {
    online: users.filter((u)=>u.status==='online').length,
    paused: users.filter((u)=>u.status==='paused').length,
    active: conversations.length,
    unread: conversations.filter((c)=>c.unread_count>0).length,
  }});
});

router.post('/conversations/open', requireAuth, async (req, res) => {
  let phone = whatsapp.normalizeOutboundPhone(req.body.phone || '');
  const contactId = Number(req.body.contactId || 0);
  const initialMessage = String(req.body.message || '').trim();
  let contact = contactId ? db.prepare('SELECT * FROM contacts WHERE id=?').get(contactId) : null;
  if (contact) phone = whatsapp.normalizeOutboundPhone(contact.phone || phone);

  if (!contact && phone.length < 12) {
    return res.status(400).json({ error: 'Informe um telefone válido com DDI e DDD. Exemplo: 5538999999999.' });
  }

  // Quando existe mensagem inicial, valida antes de criar o atendimento. Isso evita
  // abrir uma conversa com uma mensagem já marcada como falha para número inexistente.
  if (initialMessage && phone) {
    try {
      const resolved = await whatsapp.resolvePhone(phone);
      if (!resolved.exists) {
        return res.status(400).json({
          error: 'Esse número não foi encontrado no WhatsApp. Confira DDI, DDD e número antes de abrir a conversa.',
          code: 'WHATSAPP_NUMBER_NOT_FOUND',
        });
      }
      phone = resolved.phone || phone;
    } catch (error) {
      return res.status(503).json({
        error: `Não foi possível validar o número agora: ${String(error.message || error)}`,
        code: 'WHATSAPP_NUMBER_CHECK_FAILED',
      });
    }
  }

  if (!contact && phone) contact = findContactByPhone(phone);
  if (!contact) {
    contact = createOrUpdateContact({
      phone,
      name: String(req.body.name || `Cliente ${phone.slice(-4)}`).trim(),
      source: 'manual',
    });
  } else {
    contact = createOrUpdateContact({ phone: contact.phone || phone, name: req.body.name || '', source: 'manual' });
    registerAliases(contact.id, phone || contact.phone);
  }
  phone = canonicalPhone(contact.phone || phone);

  let conversation = activeConversationForContact(contact.id);
  const queue = db.prepare('SELECT * FROM queues WHERE id=? AND active=1').get(Number(req.body.queueId || 0))
    || db.prepare("SELECT * FROM queues WHERE name='Atendimento' AND active=1 LIMIT 1").get()
    || db.prepare('SELECT * FROM queues WHERE active=1 ORDER BY id LIMIT 1').get();
  const requestedUserId = Number(req.body.userId || 0);
  let assignedUserId;
  if (req.user.role === 'agent') assignedUserId = req.user.id;
  else if (canViewAllConversations(req.user)) {
    const requestedAgent = requestedUserId ? db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='agent'").get(requestedUserId) : null;
    assignedUserId = requestedAgent?.id || req.user.id || assignment.chooseOnlineAgent(queue.id)?.id || null;
  } else assignedUserId = null;
  const openingStatus = assignedUserId ? 'open' : 'waiting_human';
  const wasHumanOpen = Boolean(conversation && conversation.status === 'open' && !conversation.ai_enabled && !conversation.hidden);
  if (!conversation) {
    const stamp = nowIso();
    const opened = ensureActiveConversation(contact.id, () => db.prepare(`INSERT INTO conversations(contact_id,queue_id,assigned_user_id,status,ai_enabled,unread_count,protocol,last_message,last_message_at,created_at,hidden)
      VALUES(?,?,?,?,0,0,?,'',?,?,0)`).run(contact.id,queue.id,assignedUserId,openingStatus,protocol(),stamp,stamp));
    conversation = getConversation(opened.conversation.id);
    if (opened.created) audit(req.user.id,'open_conversation','conversation',conversation.id,{contactId:contact.id,assignedUserId});
    else db.prepare('UPDATE conversations SET assigned_user_id=?,queue_id=?,status=?,ai_enabled=0,hidden=0 WHERE id=?')
      .run(assignedUserId,queue.id,openingStatus,conversation.id);
    conversation = getConversation(conversation.id);
  } else {
    db.prepare('UPDATE conversations SET assigned_user_id=?,queue_id=?,status=?,ai_enabled=0,hidden=0 WHERE id=?')
      .run(assignedUserId,queue.id,openingStatus,conversation.id);
    conversation = getConversation(conversation.id);
  }
  if (!wasHumanOpen) {
    const noteId = addSystemNote(conversation.id, `👤 Atendimento humano iniciado por ${req.user.name || 'atendente'}.`);
    const note = db.prepare('SELECT * FROM messages WHERE id=?').get(noteId);
    realtime.emit('message:new',{conversationId:conversation.id,message:note});
  }


  let initialMessageSent = false;
  let warning = '';
  if (initialMessage) {
    const messageId = insertMessage({conversationId:conversation.id,senderType:'agent',userId:req.user.id,content:initialMessage,deliveryStatus:'pending'});
    try {
      const result = await whatsapp.sendText({phone:contact.phone,text:agentProviderText(initialMessage,req.user,{client:contact.name,phone:contact.phone})});
      const message = stampProviderResult(messageId,result,'sent');
      initialMessageSent = true;
      realtime.emit('message:new',{conversationId:conversation.id,message});
    } catch (error) {
      warning = String(error.message || error).slice(0,500);
      db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?").run(warning,messageId);
      const message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
      realtime.emit('message:new',{conversationId:conversation.id,message});
    }
  }
  const updated = getConversation(conversation.id);
  realtime.emit('conversation:updated',updated);
  res.status(201).json({
    ...updated,
    initial_message_sent: initialMessage ? initialMessageSent : null,
    warning,
  });
});

router.put('/conversations/:id/hide', requireAuth, requireAdmin, (req, res) => {
  const id=Number(req.params.id); const current=getConversation(id);
  if(!current) return res.status(404).json({error:'Atendimento não encontrado.'});
  db.prepare('UPDATE conversations SET hidden=? WHERE id=?').run(req.body.hidden ? 1 : 0,id);
  audit(req.user.id,'hide','conversation',id,{hidden:Boolean(req.body.hidden)});
  realtime.emit('conversation:updated',getConversation(id));
  res.json(getConversation(id));
});

router.post('/messages/:id/reaction', requireAuth, (req,res)=>{
  const id=Number(req.params.id); const emoji=String(req.body.emoji || '').trim().slice(0,8);
  const message=db.prepare('SELECT m.*,c.assigned_user_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=?').get(id);
  if(!message || !canAccessConversation(req.user,message)) return res.status(404).json({error:'Mensagem não encontrada.'});
  if(!emoji) return res.status(400).json({error:'Escolha uma reação.'});
  const exists=db.prepare('SELECT id FROM message_reactions WHERE message_id=? AND user_id=? AND emoji=?').get(id,req.user.id,emoji);
  if(exists) db.prepare('DELETE FROM message_reactions WHERE id=?').run(exists.id);
  else db.prepare('INSERT INTO message_reactions(message_id,user_id,emoji,created_at) VALUES(?,?,?,?)').run(id,req.user.id,emoji,nowIso());
  realtime.emit('message:updated',{conversationId:message.conversation_id,messageId:id});
  res.json({success:true});
});

router.put('/messages/:id/pin', requireAuth, (req,res)=>{
  const id=Number(req.params.id); const message=db.prepare('SELECT m.*,c.assigned_user_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=?').get(id);
  if(!message || !canAccessConversation(req.user,message)) return res.status(404).json({error:'Mensagem não encontrada.'});
  db.prepare('UPDATE messages SET pinned=? WHERE id=?').run(req.body.pinned ? 1 : 0,id);
  audit(req.user.id,'pin','message',id,{pinned:Boolean(req.body.pinned)});
  realtime.emit('message:updated',{conversationId:message.conversation_id,messageId:id});
  res.json({success:true});
});

router.put('/messages/:id', requireAuth, (req,res)=>{
  const id=Number(req.params.id); const message=db.prepare('SELECT m.*,c.assigned_user_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=?').get(id);
  if(!message || !canAccessConversation(req.user,message)) return res.status(404).json({error:'Mensagem não encontrada.'});
  if(!message.is_internal && !canViewAllConversations(req.user)) return res.status(403).json({error:'Apenas notas internas podem ser editadas.'});
  const content=String(req.body.content || '').trim(); if(!content) return res.status(400).json({error:'Digite o conteúdo.'});
  db.prepare('UPDATE messages SET content=?,edited_at=? WHERE id=?').run(content,nowIso(),id);
  audit(req.user.id,'edit','message',id);
  realtime.emit('message:updated',{conversationId:message.conversation_id,messageId:id});
  res.json(db.prepare('SELECT * FROM messages WHERE id=?').get(id));
});

router.delete('/messages/:id', requireAuth, (req,res)=>{
  const id=Number(req.params.id); const message=db.prepare('SELECT m.*,c.assigned_user_id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=?').get(id);
  if(!message || !canAccessConversation(req.user,message)) return res.status(404).json({error:'Mensagem não encontrada.'});
  if(!message.is_internal && !canViewAllConversations(req.user)) return res.status(403).json({error:'Somente administradores podem ocultar mensagens externas.'});
  db.prepare("UPDATE messages SET deleted_at=?,content='[Mensagem removida]' WHERE id=?").run(nowIso(),id);
  audit(req.user.id,'delete','message',id);
  realtime.emit('message:updated',{conversationId:message.conversation_id,messageId:id});
  res.status(204).end();
});

router.post('/messages/delete-selection', requireAuth, async (req,res)=>{
  const ids=[...new Set((Array.isArray(req.body.messageIds)?req.body.messageIds:[]).map(Number).filter(Boolean))];
  const scope=String(req.body.scope||'me');
  if(!ids.length) return res.status(400).json({error:'Selecione ao menos uma mensagem.'});
  if(!['me','everyone'].includes(scope)) return res.status(400).json({error:'Modo de exclusão inválido.'});
  const placeholders=ids.map(()=>'?').join(',');
  const rows=db.prepare(`
    SELECT m.*,c.assigned_user_id,ct.phone,ct.name AS contact_name
    FROM messages m
    JOIN conversations c ON c.id=m.conversation_id
    JOIN contacts ct ON ct.id=c.contact_id
    WHERE m.id IN (${placeholders})
    ORDER BY m.id
  `).all(...ids).filter((row)=>canAccessConversation(req.user,row));
  if(!rows.length) return res.status(404).json({error:'Nenhuma mensagem acessível foi encontrada.'});

  if(scope==='me'){
    const insert=db.prepare('INSERT OR REPLACE INTO message_hidden_users (message_id,user_id,hidden_at) VALUES (?,?,?)');
    const stamp=nowIso();
    db.exec('BEGIN');
    try {
      rows.forEach((row)=>insert.run(row.id,req.user.id,stamp));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    audit(req.user.id,'hide_for_me','messages',null,{messageIds:rows.map((row)=>row.id)});
    return res.json({scope:'me',hidden:rows.length,deleted:0,failed:[]});
  }

  const deleted=[]; const failed=[]; const skipped=[];
  for(const message of rows){
    const ownMessage=Number(message.user_id)===Number(req.user.id);
    const allowed=canViewAllConversations(req.user)||ownMessage;
    const eligible=!message.is_internal && ['agent','ai'].includes(message.sender_type) && !message.deleted_at && allowed;
    if(!eligible){
      skipped.push({id:message.id,reason:'Esta mensagem não pode ser apagada para todos.'});
      continue;
    }
    if(!String(message.provider_message_id||'').trim()){
      skipped.push({id:message.id,reason:'A mensagem não possui identificação do WhatsApp.'});
      continue;
    }
    try{
      await whatsapp.deleteMessageForEveryone({phone:message.phone,messageId:message.provider_message_id});
      db.prepare("UPDATE messages SET deleted_at=?,deleted_by_user_id=?,deleted_scope='everyone',pinned=0 WHERE id=?").run(nowIso(),req.user.id,message.id);
      audit(req.user.id,'delete_for_everyone','message',message.id,{conversationId:message.conversation_id});
      realtime.emit('message:updated',{conversationId:message.conversation_id,messageId:message.id,deleted:true});
      deleted.push(message.id);
    }catch(error){
      failed.push({id:message.id,error:String(error.message||error)});
    }
  }
  if(!deleted.length && failed.length) return res.status(502).json({error:failed[0].error,deleted,failed,skipped});
  if(!deleted.length && skipped.length) return res.status(400).json({error:skipped[0].reason,deleted,failed,skipped});
  res.json({scope:'everyone',deleted:deleted.length,deletedIds:deleted,failed,skipped});
});

router.post('/messages/:id/retry', requireAuth, async (req,res)=>{
  const id=Number(req.params.id); const message=db.prepare('SELECT m.*,c.assigned_user_id,ct.phone,ct.name contact_name FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN contacts ct ON ct.id=c.contact_id WHERE m.id=?').get(id);
  if(!message || !canAccessConversation(req.user,message)) return res.status(404).json({error:'Mensagem não encontrada.'});
  if(message.is_internal) return res.status(400).json({error:'Mensagem interna não é enviada ao WhatsApp.'});
  try {
    const result=await whatsapp.sendText({phone:message.phone,text:agentProviderText(message.content,req.user,{client:message.contact_name})});
    db.prepare("UPDATE messages SET failed_reason='',delivery_status='pending' WHERE id=?").run(id);
    const updated=stampProviderResult(id,result,'sent');
    realtime.emit('message:status',{conversationId:message.conversation_id,message:updated});
    res.json(updated);
  } catch(error){ db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?").run(String(error.message||error).slice(0,500),id); res.status(502).json({error:error.message}); }
});

router.post('/conversations/:id/forward', requireAuth, async (req,res)=>{
  const sourceId=Number(req.params.id); const source=getConversation(sourceId); if(!ensureConversationAccess(req,res,source)) return;
  const targetId=Number(req.body.targetConversationId || 0); const target=getConversation(targetId); if(!target || !canAccessConversation(req.user,target)) return res.status(400).json({error:'Selecione uma conversa de destino válida.'});
  const ids=(Array.isArray(req.body.messageIds)?req.body.messageIds:[]).map(Number).filter(Boolean);
  if(!ids.length) return res.status(400).json({error:'Selecione ao menos uma mensagem.'});
  const placeholders=ids.map(()=>'?').join(',');
  const rows=db.prepare(`SELECT * FROM messages WHERE conversation_id=? AND id IN (${placeholders}) ORDER BY created_at`).all(sourceId,...ids);
  const sent=[];
  for(const row of rows){
    const text=`↪️ *Mensagem encaminhada*\n${row.content}`;
    const messageId=insertMessage({conversationId:targetId,senderType:'agent',userId:req.user.id,content:text,deliveryStatus:'pending',forwardedFromMessageId:row.id});
    try{ const result=await whatsapp.sendText({phone:target.phone,text:agentProviderText(text,req.user,{client:target.contact_name})}); sent.push(stampProviderResult(messageId,result,'sent')); }
    catch(error){ db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?").run(String(error.message||error).slice(0,500),messageId); }
  }
  realtime.emit('message:new',{conversationId:targetId}); audit(req.user.id,'forward','conversation',targetId,{sourceId,ids}); res.json({sent:sent.length});
});

router.post('/conversations/:id/forward-internal', requireAuth, (req,res)=>{
  const sourceId=Number(req.params.id);
  const source=getConversation(sourceId);
  if(!ensureConversationAccess(req,res,source)) return;
  const ids=(Array.isArray(req.body.messageIds)?req.body.messageIds:[]).map(Number).filter(Boolean);
  if(!ids.length) return res.status(400).json({error:'Selecione ao menos uma mensagem.'});
  const targetType=String(req.body.targetType||'').toLowerCase();
  const targetId=Number(req.body.targetId||0);
  if(!['channel','user'].includes(targetType)||!targetId) return res.status(400).json({error:'Selecione um destino interno válido.'});
  const placeholders=ids.map(()=>'?').join(',');
  const rows=db.prepare(`SELECT m.*,u.name user_name FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? AND m.id IN (${placeholders}) ORDER BY m.created_at,m.id`).all(sourceId,...ids);
  if(!rows.length) return res.status(404).json({error:'As mensagens selecionadas não foram encontradas.'});
  const forwarded=rows.map((row)=>{
    const author=row.sender_type==='customer'?(source.contact_name||'Cliente'):row.sender_type==='ai'?'IA':row.sender_type==='system'?'Sistema':row.user_name||'Atendente';
    const mediaLabel=row.message_type==='audio'?'[Áudio]':row.message_type==='image'?'[Imagem]':row.message_type==='video'?'[Vídeo]':row.message_type==='document'?`[Documento${row.file_name?`: ${row.file_name}`:''}]`:row.message_type==='sticker'?'[Figurinha]':'';
    const body=String(row.content||mediaLabel||'').trim() || mediaLabel || '[Mensagem]';
    return `• ${author}: ${body}`;
  }).join('\n');
  const content=`↪️ Encaminhado do atendimento de ${source.contact_name||'Cliente'}\n${forwarded}`.slice(0,10000);
  const stamp=nowIso();
  let message;
  if(targetType==='channel'){
    const channel=db.prepare('SELECT * FROM internal_channels WHERE id=? AND active=1').get(targetId);
    if(!channel) return res.status(404).json({error:'Canal interno não encontrado.'});
    const result=db.prepare('INSERT INTO internal_messages(channel_id,user_id,recipient_user_id,content,reply_to_id,attachment_url,created_at) VALUES(?,?,NULL,?,NULL,?,?)')
      .run(channel.id,req.user.id,content,'',stamp);
    message=db.prepare('SELECT m.*,u.name user_name,u.avatar_url FROM internal_messages m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(Number(result.lastInsertRowid));
    realtime.emit('internal:new',{channelId:channel.id,message});
    const recipients=db.prepare("SELECT id FROM users WHERE active=1 AND id<>? AND role IN ('admin','supervisor','agent','kitchen')").all(req.user.id);
    for(const recipient of recipients) notifyUser(recipient.id,'internal_message','Mensagem encaminhada',`${req.user.name} encaminhou mensagens de ${source.contact_name||'um cliente'}.`,'internal_message',message.id);
  }else{
    const other=db.prepare(`SELECT id,name FROM users WHERE id=? AND active=1 AND role IN ('admin','supervisor','agent','kitchen')`).get(targetId);
    if(!other) return res.status(404).json({error:'Pessoa da equipe não encontrada.'});
    const channel=db.prepare('SELECT id FROM internal_channels WHERE active=1 ORDER BY id LIMIT 1').get();
    const result=db.prepare('INSERT INTO internal_messages(channel_id,user_id,recipient_user_id,content,reply_to_id,attachment_url,created_at) VALUES(?,?,?,?,NULL,?,?)')
      .run(channel?.id||1,req.user.id,other.id,content,'',stamp);
    message=db.prepare('SELECT m.*,u.name user_name,u.avatar_url FROM internal_messages m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(Number(result.lastInsertRowid));
    realtime.emit('internal:new',{direct:true,userIds:[req.user.id,other.id],message});
    notifyUser(other.id,'internal_message','Mensagem encaminhada',`${req.user.name} encaminhou mensagens de ${source.contact_name||'um cliente'}.`,'internal_message',message.id);
  }
  audit(req.user.id,'forward_internal','conversation',sourceId,{ids,targetType,targetId});
  res.status(201).json(message);
});

router.post('/conversations/:id/ai-tools', requireAuth, async (req,res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!ensureConversationAccess(req,res,conversation)) return;
  const action = String(req.body.action || 'suggest');
  const input = String(req.body.text || '').trim();
  const messages = db.prepare(`SELECT m.*,u.name user_name FROM messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.conversation_id=? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 30`).all(id).reverse();
  const lastCustomer = [...messages].reverse().find((message)=>message.sender_type==='customer');
  let result = input;
  if (action === 'suggest') {
    const answer = await generateGroundedReply(lastCustomer?.content || input || 'Como posso ajudar?', { conversationId:id });
    result = answer.text;
  } else if (action === 'summary') {
    const relevant = messages.filter((message)=>!message.is_internal && ['customer','agent','ai'].includes(message.sender_type)).slice(-12);
    result = `📌 Resumo do atendimento\n\n${relevant.map((message)=>`• ${message.sender_type==='customer'?conversation.contact_name:message.user_name||message.sender_type==='ai'?'IA':'Atendente'}: ${String(message.content).slice(0,180)}`).join('\n') || 'Sem mensagens suficientes.'}`;
  } else if (action === 'friendly') {
    result = input ? `Olá! 😊\n\n${input.replace(/^ol[aá][,!]?\s*/i,'')}\n\nQualquer dúvida, estamos por aqui! 💚` : '';
  } else if (action === 'formal') {
    result = input ? input.replace(/\boi\b/gi,'Olá').replace(/\bvc\b/gi,'você').replace(/\btá\b/gi,'está').replace(/\bpra\b/gi,'para') : '';
  } else if (action === 'shorter') {
    result = input.length > 180 ? `${input.slice(0,177).replace(/\s+\S*$/,'')}...` : input;
  } else if (action === 'expand') {
    result = input ? `${input}\n\nEstamos à disposição para esclarecer qualquer dúvida e ajudar no que for necessário. 😊` : '';
  } else if (action === 'spelling') {
    result = input.replace(/\s+/g,' ').replace(/\s+([,.!?])/g,'$1').replace(/(^|[.!?]\s+)([a-zá-ú])/g,(_m,a,b)=>a+b.toUpperCase()).trim();
  }
  audit(req.user.id,'ai_tool','conversation',id,{action});
  res.json({action,text:result});
});

router.get('/templates', requireAuth, (req,res)=>{
  res.json(db.prepare('SELECT * FROM message_templates WHERE active=1 ORDER BY category,name').all().map((r)=>({
    ...r, variables:safeJson(r.variables_json,[]), buttons:safeJson(r.buttons_json,[]), active:Boolean(r.active),
  })));
});
router.post('/templates', requireAuth, requireAdmin, (req,res)=>{
  const name=String(req.body.name||'').trim(), body=String(req.body.body||'').trim(); if(!name||!body) return res.status(400).json({error:'Informe nome e corpo do template.'});
  const type=['internal','official'].includes(String(req.body.template_type))?String(req.body.template_type):'internal';
  const status=['draft','pending','approved','rejected'].includes(String(req.body.official_status))?String(req.body.official_status):'draft';
  const stamp=nowIso(); const result=db.prepare(`INSERT INTO message_templates(name,category,language,body,media_type,media_url,variables_json,template_type,official_name,official_status,header_text,footer_text,buttons_json,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(name,String(req.body.category||'Geral'),String(req.body.language||'pt_BR'),body,String(req.body.media_type||'none'),String(req.body.media_url||''),JSON.stringify(req.body.variables||[]),type,String(req.body.official_name||''),status,String(req.body.header_text||''),String(req.body.footer_text||''),JSON.stringify(req.body.buttons||[]),1,stamp,stamp);
  audit(req.user.id,'create','template',Number(result.lastInsertRowid),{type,status}); res.status(201).json(db.prepare('SELECT * FROM message_templates WHERE id=?').get(Number(result.lastInsertRowid)));
});
router.put('/templates/:id', requireAuth, requireAdmin, (req,res)=>{
  const id=Number(req.params.id), current=db.prepare('SELECT * FROM message_templates WHERE id=?').get(id); if(!current) return res.status(404).json({error:'Template não encontrado.'});
  const type=['internal','official'].includes(String(req.body.template_type))?String(req.body.template_type):current.template_type;
  const status=['draft','pending','approved','rejected'].includes(String(req.body.official_status))?String(req.body.official_status):current.official_status;
  db.prepare('UPDATE message_templates SET name=?,category=?,language=?,body=?,media_type=?,media_url=?,variables_json=?,template_type=?,official_name=?,official_status=?,header_text=?,footer_text=?,buttons_json=?,active=?,updated_at=? WHERE id=?')
    .run(String(req.body.name??current.name),String(req.body.category??current.category),String(req.body.language??current.language),String(req.body.body??current.body),String(req.body.media_type??current.media_type),String(req.body.media_url??current.media_url),JSON.stringify(req.body.variables??safeJson(current.variables_json,[])),type,String(req.body.official_name??current.official_name),status,String(req.body.header_text??current.header_text),String(req.body.footer_text??current.footer_text),JSON.stringify(req.body.buttons??safeJson(current.buttons_json,[])),req.body.active===false?0:1,nowIso(),id);
  audit(req.user.id,'update','template',id,{type,status}); res.json(db.prepare('SELECT * FROM message_templates WHERE id=?').get(id));
});
router.delete('/templates/:id', requireAuth, requireAdmin, (req,res)=>{ db.prepare('UPDATE message_templates SET active=0,updated_at=? WHERE id=?').run(nowIso(),Number(req.params.id)); audit(req.user.id,'disable','template',Number(req.params.id)); res.status(204).end(); });

router.get('/internal/channels', requireAuth, (req,res)=>{ res.json(db.prepare('SELECT * FROM internal_channels WHERE active=1 ORDER BY name').all()); });
router.get('/internal/users', requireAuth, (req,res)=>{
  const users=db.prepare(`SELECT id,name,role,status,pause_reason,avatar_url,last_seen_at FROM users WHERE active=1 AND id<>? AND role IN ('admin','supervisor','agent','kitchen')`).all(req.user.id).map(presenceUserRow);
  res.json(sortPresenceUsers(users));
});
router.get('/internal/channels/:id/messages', requireAuth, (req,res)=>{
  res.json(db.prepare(`SELECT m.*,u.name user_name,u.avatar_url,rm.content reply_content FROM internal_messages m JOIN users u ON u.id=m.user_id LEFT JOIN internal_messages rm ON rm.id=m.reply_to_id WHERE m.channel_id=? AND m.recipient_user_id IS NULL AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 150`).all(Number(req.params.id)).reverse());
});
router.post('/internal/channels/:id/messages', requireAuth, (req,res)=>{
  const channel=db.prepare('SELECT * FROM internal_channels WHERE id=? AND active=1').get(Number(req.params.id)); if(!channel) return res.status(404).json({error:'Canal interno não encontrado.'});
  const content=String(req.body.content||'').trim(); if(!content) return res.status(400).json({error:'Digite uma mensagem interna.'});
  const result=db.prepare('INSERT INTO internal_messages(channel_id,user_id,recipient_user_id,content,reply_to_id,attachment_url,created_at) VALUES(?,?,NULL,?,?,?,?)')
    .run(channel.id,req.user.id,content,Number(req.body.replyToId||0)||null,String(req.body.attachment_url||''),nowIso());
  const message=db.prepare('SELECT m.*,u.name user_name,u.avatar_url FROM internal_messages m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(Number(result.lastInsertRowid));
  const recipients=db.prepare("SELECT id FROM users WHERE active=1 AND id<>? AND role IN ('admin','supervisor','agent','kitchen')").all(req.user.id);
  realtime.emit('internal:new',{channelId:channel.id,message});
  for (const recipient of recipients) notifyUser(recipient.id,'internal_message','Nova mensagem interna',`${req.user.name}: ${content.slice(0,120)}`,'internal_message',Number(result.lastInsertRowid));
  res.status(201).json(message);
});
router.get('/internal/direct/:userId/messages', requireAuth, (req,res)=>{
  const otherId=Number(req.params.userId); const other=db.prepare(`SELECT id FROM users WHERE id=? AND active=1 AND role IN ('admin','supervisor','agent','kitchen')`).get(otherId);
  if(!other) return res.status(404).json({error:'Atendente não encontrado.'});
  res.json(db.prepare(`SELECT m.*,u.name user_name,u.avatar_url,rm.content reply_content FROM internal_messages m JOIN users u ON u.id=m.user_id LEFT JOIN internal_messages rm ON rm.id=m.reply_to_id WHERE m.deleted_at IS NULL AND ((m.user_id=? AND m.recipient_user_id=?) OR (m.user_id=? AND m.recipient_user_id=?)) ORDER BY m.created_at DESC LIMIT 150`).all(req.user.id,otherId,otherId,req.user.id).reverse());
});
router.post('/internal/direct/:userId/messages', requireAuth, (req,res)=>{
  const otherId=Number(req.params.userId); const other=db.prepare(`SELECT id,name FROM users WHERE id=? AND active=1 AND role IN ('admin','supervisor','agent','kitchen')`).get(otherId);
  if(!other) return res.status(404).json({error:'Atendente não encontrado.'});
  const content=String(req.body.content||'').trim(); if(!content) return res.status(400).json({error:'Digite uma mensagem interna.'});
  const channel=db.prepare('SELECT id FROM internal_channels WHERE active=1 ORDER BY id LIMIT 1').get();
  const result=db.prepare('INSERT INTO internal_messages(channel_id,user_id,recipient_user_id,content,reply_to_id,attachment_url,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(channel?.id||1,req.user.id,otherId,content,Number(req.body.replyToId||0)||null,String(req.body.attachment_url||''),nowIso());
  const message=db.prepare('SELECT m.*,u.name user_name,u.avatar_url FROM internal_messages m JOIN users u ON u.id=m.user_id WHERE m.id=?').get(Number(result.lastInsertRowid));
  realtime.emit('internal:new',{direct:true,userIds:[req.user.id,otherId],message});
  notifyUser(otherId,'internal_message','Nova mensagem interna',`${req.user.name}: ${content.slice(0,120)}`,'internal_message',Number(result.lastInsertRowid));
  res.status(201).json(message);
});

router.get('/crm/funnels', requireAuth, (req,res)=>{
  const funnels=db.prepare('SELECT * FROM crm_funnels WHERE active=1 ORDER BY name').all();
  for(const funnel of funnels) funnel.stages=db.prepare('SELECT * FROM crm_stages WHERE funnel_id=? ORDER BY position').all(funnel.id);
  res.json(funnels);
});
router.get('/crm/opportunities', requireAuth, (req,res)=>{
  res.json(db.prepare(`SELECT o.*,ct.name contact_name,u.name assigned_user_name,s.name stage_name,s.color stage_color,f.name funnel_name FROM crm_opportunities o LEFT JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN users u ON u.id=o.assigned_user_id JOIN crm_stages s ON s.id=o.stage_id JOIN crm_funnels f ON f.id=o.funnel_id WHERE o.status!='archived' ORDER BY o.updated_at DESC`).all());
});
router.post('/crm/opportunities', requireAuth, (req,res)=>{
  const funnelId=Number(req.body.funnel_id||0), stageId=Number(req.body.stage_id||0); const stamp=nowIso();
  if(!db.prepare('SELECT id FROM crm_stages WHERE id=? AND funnel_id=?').get(stageId,funnelId)) return res.status(400).json({error:'Selecione uma etapa válida.'});
  const result=db.prepare(`INSERT INTO crm_opportunities(title,contact_id,conversation_id,funnel_id,stage_id,assigned_user_id,value,status,source,notes,due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',?,?,?,?,?)`)
    .run(String(req.body.title||'Nova oportunidade'),Number(req.body.contact_id||0)||null,Number(req.body.conversation_id||0)||null,funnelId,stageId,Number(req.body.assigned_user_id||req.user.id),Number(req.body.value||0),String(req.body.source||'Atendimento'),String(req.body.notes||''),req.body.due_at||null,stamp,stamp);
  audit(req.user.id,'create','opportunity',Number(result.lastInsertRowid)); res.status(201).json({id:Number(result.lastInsertRowid)});
});
router.put('/crm/opportunities/:id', requireAuth, (req,res)=>{
  const id=Number(req.params.id), current=db.prepare('SELECT * FROM crm_opportunities WHERE id=?').get(id); if(!current) return res.status(404).json({error:'Oportunidade não encontrada.'});
  db.prepare('UPDATE crm_opportunities SET title=?,stage_id=?,assigned_user_id=?,value=?,status=?,notes=?,due_at=?,updated_at=? WHERE id=?')
    .run(String(req.body.title??current.title),Number(req.body.stage_id||current.stage_id),Number(req.body.assigned_user_id||current.assigned_user_id)||null,Number(req.body.value??current.value),String(req.body.status??current.status),String(req.body.notes??current.notes),req.body.due_at??current.due_at,nowIso(),id);
  audit(req.user.id,'update','opportunity',id); res.json({success:true});
});

router.get('/tickets', requireAuth, (req,res)=>{ res.json(db.prepare(`SELECT t.*,ct.name contact_name,u.name assigned_user_name,q.name queue_name FROM tickets t LEFT JOIN contacts ct ON ct.id=t.contact_id LEFT JOIN users u ON u.id=t.assigned_user_id LEFT JOIN queues q ON q.id=t.queue_id ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'waiting_customer' THEN 1 ELSE 2 END,t.updated_at DESC`).all()); });
router.post('/tickets', requireAuth, (req,res)=>{
  const stamp=nowIso(), proto=`TKT-${new Date().getFullYear()}-${Math.floor(100000+Math.random()*900000)}`;
  const result=db.prepare(`INSERT INTO tickets(protocol,title,description,contact_id,conversation_id,assigned_user_id,queue_id,priority,status,category,sla_due_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(proto,String(req.body.title||'Novo ticket'),String(req.body.description||''),Number(req.body.contact_id||0)||null,Number(req.body.conversation_id||0)||null,Number(req.body.assigned_user_id||req.user.id),Number(req.body.queue_id||0)||null,String(req.body.priority||'normal'),'open',String(req.body.category||'Geral'),req.body.sla_due_at||null,stamp,stamp);
  audit(req.user.id,'create','ticket',Number(result.lastInsertRowid)); res.status(201).json({id:Number(result.lastInsertRowid),protocol:proto});
});
router.put('/tickets/:id', requireAuth, (req,res)=>{
  const id=Number(req.params.id), current=db.prepare('SELECT * FROM tickets WHERE id=?').get(id); if(!current) return res.status(404).json({error:'Ticket não encontrado.'});
  const status=String(req.body.status??current.status), resolved=status==='resolved'?nowIso():current.resolved_at;
  db.prepare('UPDATE tickets SET title=?,description=?,assigned_user_id=?,queue_id=?,priority=?,status=?,category=?,sla_due_at=?,updated_at=?,resolved_at=? WHERE id=?')
    .run(String(req.body.title??current.title),String(req.body.description??current.description),Number(req.body.assigned_user_id||current.assigned_user_id)||null,Number(req.body.queue_id||current.queue_id)||null,String(req.body.priority??current.priority),status,String(req.body.category??current.category),req.body.sla_due_at??current.sla_due_at,nowIso(),resolved,id);
  audit(req.user.id,'update','ticket',id,{status}); res.json({success:true});
});

router.get('/tasks', requireAuth, (req,res)=>{
  let where=''; const params=[]; if(!canViewAllConversations(req.user)){ where='WHERE t.assigned_user_id=? OR t.created_by_user_id=?'; params.push(req.user.id,req.user.id); }
  res.json(db.prepare(`SELECT t.*,u.name assigned_user_name,ct.name contact_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_user_id LEFT JOIN contacts ct ON ct.id=t.contact_id ${where} ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,COALESCE(t.due_at,t.created_at)`).all(...params));
});
router.post('/tasks', requireAuth, (req,res)=>{
  const stamp=nowIso(); const result=db.prepare(`INSERT INTO tasks(title,description,assigned_user_id,contact_id,conversation_id,status,priority,due_at,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,'pending',?,?,?,?,?)`)
    .run(String(req.body.title||'Nova tarefa'),String(req.body.description||''),Number(req.body.assigned_user_id||req.user.id),Number(req.body.contact_id||0)||null,Number(req.body.conversation_id||0)||null,String(req.body.priority||'normal'),req.body.due_at||null,req.user.id,stamp,stamp);
  audit(req.user.id,'create','task',Number(result.lastInsertRowid)); res.status(201).json({id:Number(result.lastInsertRowid)});
});
router.put('/tasks/:id', requireAuth, (req,res)=>{
  const id=Number(req.params.id), current=db.prepare('SELECT * FROM tasks WHERE id=?').get(id); if(!current) return res.status(404).json({error:'Tarefa não encontrada.'});
  if(!canViewAllConversations(req.user) && current.assigned_user_id!==req.user.id && current.created_by_user_id!==req.user.id) return res.status(403).json({error:'Sem permissão para alterar esta tarefa.'});
  const status=String(req.body.status??current.status); db.prepare('UPDATE tasks SET title=?,description=?,assigned_user_id=?,status=?,priority=?,due_at=?,updated_at=?,completed_at=? WHERE id=?')
    .run(String(req.body.title??current.title),String(req.body.description??current.description),Number(req.body.assigned_user_id||current.assigned_user_id),status,String(req.body.priority??current.priority),req.body.due_at??current.due_at,nowIso(),status==='completed'?nowIso():null,id);
  audit(req.user.id,'update','task',id,{status}); res.json({success:true});
});

router.get('/reports/summary', requireAuth, requireAdmin, (req,res)=>{
  const from=String(req.query.from||new Date(Date.now()-6*86400000).toISOString().slice(0,10)); const to=String(req.query.to||new Date().toISOString().slice(0,10));
  const fromIso=`${from}T00:00:00.000Z`,toIso=`${to}T23:59:59.999Z`;
  const byAgent=db.prepare(`SELECT u.id,u.name,COUNT(c.id) total,SUM(CASE WHEN c.status='closed' THEN 1 ELSE 0 END) closed,AVG(CASE WHEN c.first_response_at IS NOT NULL THEN (julianday(c.first_response_at)-julianday(c.created_at))*86400 END) avg_first_response_seconds FROM users u LEFT JOIN conversations c ON c.assigned_user_id=u.id AND c.created_at BETWEEN ? AND ? WHERE u.active=1 AND u.role IN ('admin','supervisor','agent') GROUP BY u.id ORDER BY total DESC`).all(fromIso,toIso);
  const byQueue=db.prepare(`SELECT q.name,COUNT(c.id) total,SUM(CASE WHEN c.status='closed' THEN 1 ELSE 0 END) closed FROM queues q LEFT JOIN conversations c ON c.queue_id=q.id AND c.created_at BETWEEN ? AND ? GROUP BY q.id ORDER BY total DESC`).all(fromIso,toIso);
  const orderStats=db.prepare(`SELECT COUNT(*) total,COALESCE(SUM(total),0) revenue,COALESCE(AVG(total),0) average FROM orders WHERE created_at BETWEEN ? AND ? AND status!='cancelled'`).get(fromIso,toIso);
  const orderList=db.prepare(`
    SELECT o.id,o.status,o.subtotal,o.delivery_fee,o.total,o.address,o.payment_method,o.fulfillment_method,
      o.notes,o.source,o.created_at,o.updated_at,o.confirmed_at,o.cancel_reason,o.cancelled_at,
      ct.name contact_name,ct.phone,rt.name table_name,
      (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id=o.id) items_count,
      (SELECT GROUP_CONCAT(CAST(oi.quantity AS TEXT)||'x '||oi.name,' • ') FROM order_items oi WHERE oi.order_id=o.id) items_summary
    FROM orders o
    JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
    WHERE o.created_at BETWEEN ? AND ?
    ORDER BY o.created_at DESC,o.id DESC
  `).all(fromIso,toIso);
  const satisfaction=db.prepare(`SELECT COUNT(*) total,COALESCE(AVG(score),0) average FROM satisfaction_responses WHERE created_at BETWEEN ? AND ?`).get(fromIso,toIso);
  const cancellations=db.prepare(`SELECT o.id,o.cancel_reason,o.cancelled_at,o.total,ct.name contact_name,u.name cancelled_by_name FROM orders o JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN users u ON u.id=o.cancelled_by_user_id WHERE o.status='cancelled' AND COALESCE(o.cancelled_at,o.updated_at) BETWEEN ? AND ? ORDER BY COALESCE(o.cancelled_at,o.updated_at) DESC`).all(fromIso,toIso);
  res.json({from,to,byAgent,byQueue,orders:{...orderStats,list:orderList},satisfaction,cancellations,totalCancelled:cancellations.length});
});

router.get('/campaigns', requireAuth, requireAdmin, (req,res)=>{
  res.json(db.prepare(`SELECT c.*,t.name template_name,u.name created_by_name FROM campaigns c LEFT JOIN message_templates t ON t.id=c.template_id LEFT JOIN users u ON u.id=c.created_by_user_id ORDER BY c.updated_at DESC`).all().map((r)=>({...r,audience_filter:safeJson(r.audience_filter_json,{})})));
});
router.post('/campaigns', requireAuth, requireAdmin, (req,res)=>{
  const name=String(req.body.name||'').trim(); if(name.length<2)return res.status(400).json({error:'Informe o nome da campanha.'}); const stamp=nowIso();
  const status=['draft','scheduled','paused','completed'].includes(String(req.body.status))?String(req.body.status):'draft';
  const result=db.prepare('INSERT INTO campaigns(name,description,template_id,audience_filter_json,status,scheduled_at,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(name,String(req.body.description||''),Number(req.body.template_id||0)||null,JSON.stringify(req.body.audience_filter||{}),status,req.body.scheduled_at||null,req.user.id,stamp,stamp);
  audit(req.user.id,'create','campaign',Number(result.lastInsertRowid),{status});res.status(201).json({id:Number(result.lastInsertRowid)});
});
router.put('/campaigns/:id', requireAuth, requireAdmin, (req,res)=>{
  const id=Number(req.params.id),current=db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);if(!current)return res.status(404).json({error:'Campanha não encontrada.'});
  const status=['draft','scheduled','paused','completed'].includes(String(req.body.status))?String(req.body.status):current.status;
  db.prepare('UPDATE campaigns SET name=?,description=?,template_id=?,audience_filter_json=?,status=?,scheduled_at=?,updated_at=? WHERE id=?').run(String(req.body.name??current.name),String(req.body.description??current.description),Number(req.body.template_id||current.template_id)||null,JSON.stringify(req.body.audience_filter??safeJson(current.audience_filter_json,{})),status,req.body.scheduled_at??current.scheduled_at,nowIso(),id);
  audit(req.user.id,'update','campaign',id,{status});res.json({success:true});
});

router.get('/automations', requireAuth, requireAdmin, (req,res)=>{
  res.json(db.prepare(`SELECT a.*,q.name queue_name,u.name created_by_name FROM automations a LEFT JOIN queues q ON q.id=a.queue_id LEFT JOIN users u ON u.id=a.created_by_user_id ORDER BY a.active DESC,a.name`).all().map((r)=>({...r,active:Boolean(r.active),action_payload:safeJson(r.action_payload_json,{})})));
});
router.post('/automations', requireAuth, requireAdmin, (req,res)=>{
  const name=String(req.body.name||'').trim();if(name.length<2)return res.status(400).json({error:'Informe o nome da automação.'});const stamp=nowIso();
  const result=db.prepare('INSERT INTO automations(name,trigger_type,trigger_value,action_type,action_payload_json,queue_id,active,created_by_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?,?)').run(name,String(req.body.trigger_type||'keyword'),String(req.body.trigger_value||''),String(req.body.action_type||'reply'),JSON.stringify(req.body.action_payload||{}),Number(req.body.queue_id||0)||null,req.user.id,stamp,stamp);
  audit(req.user.id,'create','automation',Number(result.lastInsertRowid));res.status(201).json({id:Number(result.lastInsertRowid)});
});
router.put('/automations/:id', requireAuth, requireAdmin, (req,res)=>{
  const id=Number(req.params.id),current=db.prepare('SELECT * FROM automations WHERE id=?').get(id);if(!current)return res.status(404).json({error:'Automação não encontrada.'});
  const active=req.body.active==null?current.active:(req.body.active?1:0);db.prepare('UPDATE automations SET name=?,trigger_type=?,trigger_value=?,action_type=?,action_payload_json=?,queue_id=?,active=?,updated_at=? WHERE id=?').run(String(req.body.name??current.name),String(req.body.trigger_type??current.trigger_type),String(req.body.trigger_value??current.trigger_value),String(req.body.action_type??current.action_type),JSON.stringify(req.body.action_payload??safeJson(current.action_payload_json,{})),Number(req.body.queue_id||current.queue_id)||null,active,nowIso(),id);
  audit(req.user.id,'update','automation',id,{active:Boolean(active)});res.json({success:true});
});

router.get('/security/overview', requireAuth, requireAdmin, (req, res) => {
  const instance = whatsapp.getPrimaryInstance();
  const config = instance ? whatsapp.safeJson(instance.config_json) : {};
  const jwtSecret = String(process.env.JWT_SECRET || '');
  const encryptionKey = String(process.env.APP_ENCRYPTION_KEY || '');
  const strongSecret = (value) => value.length >= 24 && !/(troque|change|exemplo|example)/i.test(value);
  res.json({
    jwtSecretConfigured: strongSecret(jwtSecret),
    encryptionKeyConfigured: strongSecret(encryptionKey),
    whatsappApiKeyProtected: Boolean(config.apiKey),
    webhookSecretProtected: Boolean(config.webhookSecret),
    automaticBackupsEnabled: setting('automatic_backups_enabled','true') === 'true',
    backupRetentionDays: Number(setting('backup_retention_days','14')) || 14,
    waitingAlertMinutes: setting('waiting_alert_minutes','2,5,10'),
  });
});

router.get('/security/backups', requireAuth, requireAdmin, (req, res) => {
  res.json({ backups: backups.listBackups(), databasePath: path.basename(DB_PATH) });
});

router.post('/security/backups', requireAuth, requireAdmin, (req, res) => {
  try {
    const result = backups.createBackup('manual');
    audit(req.user.id, 'create_backup', 'database', null, { name: result.name, size: result.size });
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: `Não foi possível criar o backup: ${error.message}` });
  }
});

router.post('/security/backups/:name/test', requireAuth, requireAdmin, (req, res) => {
  try {
    const result = backups.testBackup(req.params.name);
    audit(req.user.id, 'test_backup', 'database', null, { name: req.params.name, ok: true });
    res.json(result);
  } catch (error) {
    audit(req.user.id, 'test_backup', 'database', null, { name: req.params.name, ok: false, error: error.message });
    res.status(400).json({ error: error.message });
  }
});

router.get('/audit', requireAuth, requireAdmin, (req,res)=>{
  const where=[]; const params=[];
  if(req.query.userId){where.push('a.user_id=?');params.push(Number(req.query.userId));}
  if(req.query.action){where.push('a.action=?');params.push(String(req.query.action));}
  if(req.query.entity){where.push('a.entity=?');params.push(String(req.query.entity));}
  if(req.query.from){where.push('substr(a.created_at,1,10)>=?');params.push(String(req.query.from));}
  if(req.query.to){where.push('substr(a.created_at,1,10)<=?');params.push(String(req.query.to));}
  const limit=Math.min(1000,Math.max(1,Number(req.query.limit||300)));
  const clause=where.length?`WHERE ${where.join(' AND ')}`:'';
  const rows=db.prepare(`SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ${clause} ORDER BY a.created_at DESC LIMIT ${limit}`).all(...params).map((r)=>({...r,details:safeJson(r.details,{})}));
  const users=db.prepare('SELECT id,name FROM users ORDER BY name').all();
  const actions=db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all().map((r)=>r.action);
  const entities=db.prepare('SELECT DISTINCT entity FROM audit_logs ORDER BY entity').all().map((r)=>r.entity);
  res.json({rows,users,actions,entities});
});
router.get('/notifications', requireAuth, (req,res)=>{
  res.json(db.prepare(`SELECT n.*,CASE WHEN nr.read_at IS NULL THEN 0 ELSE 1 END is_read FROM notifications n LEFT JOIN notification_reads nr ON nr.notification_id=n.id AND nr.user_id=? WHERE (n.target_user_id IS NULL OR n.target_user_id=?) AND (n.target_role='' OR n.target_role=?) ORDER BY n.created_at DESC LIMIT 100`).all(req.user.id,req.user.id,req.user.role).map((r)=>({...r,is_read:Boolean(r.is_read)})));
});
router.post('/notifications/read-all', requireAuth, (req,res)=>{
  const rows=db.prepare(`SELECT id FROM notifications WHERE (target_user_id IS NULL OR target_user_id=?) AND (target_role='' OR target_role=?)`).all(req.user.id,req.user.role);
  const save=db.prepare('INSERT OR REPLACE INTO notification_reads(notification_id,user_id,read_at) VALUES(?,?,?)');
  const stamp=nowIso();
  db.exec('BEGIN');
  try {
    for(const item of rows) save.run(item.id,req.user.id,stamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  res.json({success:true,read:rows.length});
});
router.post('/notifications/:id/read', requireAuth, (req,res)=>{ db.prepare('INSERT OR REPLACE INTO notification_reads(notification_id,user_id,read_at) VALUES(?,?,?)').run(Number(req.params.id),req.user.id,nowIso()); res.json({success:true}); });


function evolutionFlagTrue(...values) {
  return values.some((value) => {
    if (value === true || value === 1) return true;
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  });
}

function extractEvolutionText(message = {}) {
  const contextInfo = message.extendedTextMessage?.contextInfo
    || message.imageMessage?.contextInfo
    || message.videoMessage?.contextInfo
    || message.audioMessage?.contextInfo
    || message.documentMessage?.contextInfo
    || message.stickerMessage?.contextInfo
    || message.locationMessage?.contextInfo
    || {};
  const quotedProviderMessageId = String(contextInfo.stanzaId || '').trim();
  if (message.conversation) return { content: message.conversation, messageType: 'text', quotedProviderMessageId, mimeType: '', fileName: '' };
  if (message.extendedTextMessage?.text) return { content: message.extendedTextMessage.text, messageType: 'text', quotedProviderMessageId, mimeType: '', fileName: '' };
  if (message.imageMessage) return {
    content: message.imageMessage.caption || '[Imagem recebida]', messageType: 'image', quotedProviderMessageId,
    mimeType: String(message.imageMessage.mimetype || 'image/jpeg').split(';')[0],
    fileName: String(message.imageMessage.fileName || `imagem-${Date.now()}.jpg`),
  };
  if (message.videoMessage) return {
    content: message.videoMessage.caption || '[Vídeo recebido]', messageType: 'video', quotedProviderMessageId,
    mimeType: String(message.videoMessage.mimetype || 'video/mp4').split(';')[0],
    fileName: String(message.videoMessage.fileName || `video-${Date.now()}.mp4`),
  };
  if (message.audioMessage) return {
    content: '[Áudio recebido]', messageType: 'audio', quotedProviderMessageId,
    mimeType: String(message.audioMessage.mimetype || 'audio/ogg').split(';')[0],
    fileName: String(message.audioMessage.fileName || `audio-${Date.now()}.ogg`),
  };
  if (message.documentMessage) return {
    content: `[Documento recebido: ${message.documentMessage.fileName || 'arquivo'}]`, messageType: 'document', quotedProviderMessageId,
    mimeType: String(message.documentMessage.mimetype || 'application/octet-stream').split(';')[0],
    fileName: String(message.documentMessage.fileName || `documento-${Date.now()}`),
  };
  if (message.stickerMessage) return {
    content: '[Figurinha recebida]', messageType: 'sticker', quotedProviderMessageId,
    mimeType: String(message.stickerMessage.mimetype || 'image/webp').split(';')[0],
    fileName: String(message.stickerMessage.fileName || `figurinha-${Date.now()}.webp`),
  };
  if (message.locationMessage) return { content: '[Localização recebida]', messageType: 'location', quotedProviderMessageId, mimeType: '', fileName: '' };
  return { content: '', messageType: 'unknown', quotedProviderMessageId, mimeType: '', fileName: '' };
}

function mediaExtension(mimeType = '', fileName = '') {
  const fromName = path.extname(String(fileName || '')).replace('.', '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (fromName && fromName.length <= 6) return fromName;
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
    'application/pdf': 'pdf',
  };
  return map[String(mimeType || '').toLowerCase()] || 'bin';
}

function safeIncomingFileName(fileName, fallback, extension) {
  const base = path.basename(String(fileName || fallback || 'arquivo'))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || fallback || 'arquivo';
  return path.extname(base) ? base : `${base}.${extension}`;
}

function persistIncomingMedia({ rawBase64, mimeType, fileName, messageType, providerMessageId }) {
  let encoded = String(rawBase64 || '').trim();
  let resolvedMime = String(mimeType || 'application/octet-stream').split(';')[0];
  const dataMatch = encoded.match(/^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i);
  if (dataMatch) {
    resolvedMime = dataMatch[1] || resolvedMime;
    encoded = dataMatch[2];
  }
  encoded = encoded.replace(/\s+/g, '');
  if (!encoded) return { mediaUrl: '', mimeType: resolvedMime, fileName: String(fileName || '') };
  const buffer = Buffer.from(encoded, 'base64');
  const maxBytes = messageType === 'video' ? 55 * 1024 * 1024 : 18 * 1024 * 1024;
  if (!buffer.length || buffer.length > maxBytes) throw new Error(`A mídia recebida ultrapassa o limite de ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  const extension = mediaExtension(resolvedMime, fileName);
  const month = new Date().toISOString().slice(0, 7);
  const relativeDir = path.join('uploads', 'messages', month);
  const absoluteDir = path.resolve(__dirname, '..', '..', 'public', relativeDir);
  fs.mkdirSync(absoluteDir, { recursive: true });
  const original = safeIncomingFileName(fileName, messageType || 'midia', extension);
  const stem = path.basename(original, path.extname(original)).slice(0, 60);
  const idPart = String(providerMessageId || crypto.randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '').slice(-28) || crypto.randomUUID();
  const storedName = `${Date.now()}-${idPart}-${stem}.${extension}`;
  fs.writeFileSync(path.join(absoluteDir, storedName), buffer);
  return {
    mediaUrl: `/${relativeDir.replaceAll(path.sep, '/')}/${storedName}`,
    mimeType: resolvedMime,
    fileName: original,
  };
}


router.post('/webhooks/evolution/:secret', async (req, res) => {
  if (!allowWebhookRequest(req)) return res.status(429).json({ error: 'Muitas chamadas no webhook. Tente novamente em instantes.' });
  const row = whatsapp.getPrimaryInstance();
  const config = row ? whatsapp.safeJson(row.config_json) : {};
  if (!row || !config.webhookSecret || !safeSecretEquals(req.params.secret, config.webhookSecret)) return res.status(403).json({ error: 'Webhook inválido.' });
  if (isDuplicateWebhookPayload(req.body)) return res.json({ received: true, duplicate: true });
  const event = String(req.body.event || req.body.type || '').toUpperCase().replace(/[.\-]/g, '_');
  const rawData = req.body.data || req.body;
  const data = Array.isArray(rawData) ? (rawData[0] || {}) : rawData;

  if (event.includes('QRCODE_UPDATED')) {
    const updated = whatsapp.updateInstance(row.id, { status: 'waiting_qr' });
    realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
    return res.json({ received: true });
  }

  if (event.includes('CONNECTION_UPDATE')) {
    const rawState = data.state || data.status || data.instance?.state || '';
    const status = rawState === 'open' || rawState === 'connected' ? 'connected' : rawState === 'connecting' ? 'connecting' : 'disconnected';
    const updated = whatsapp.updateInstance(row.id, { status, phone: normalizePhone(data.wuid || data.owner || row.phone) });
    realtime.emit('whatsapp:status', whatsapp.publicInstance(updated));
    return res.json({ received: true });
  }
  if (event.includes('MESSAGES_UPDATE') || event.includes('MESSAGE_UPDATE')) {
    const updates = extractStatusUpdates(rawData);
    let matched = 0;
    for (const update of updates) {
      if (updateMessageStatusByProviderId(update.id, update.status)) matched += 1;
    }
    return res.json({ received: true, updates: updates.length, matched });
  }

  if (!event.includes('MESSAGES_UPSERT') && !event.includes('MESSAGE_UPSERT')) return res.json({ received: true, ignored: true });

  console.log(`[WhatsApp webhook] Evento de mensagem recebido: ${event || 'SEM_EVENTO'}`);

  // Se uma mensagem acabou de chegar pela Evolution, a conexão está ativa.
  // Corrige estados locais antigos que ficaram como “desconectado” mesmo com
  // o WhatsApp recebendo normalmente e evita bloquear a resposta do atendente.
  if (row.status !== 'connected') {
    const connected = whatsapp.updateInstance(row.id, { status: 'connected' });
    realtime.emit('whatsapp:status', whatsapp.publicInstance(connected));
  }

  const messageEnvelope = data.message || data.messages?.[0] || data;
  const key = data.key || messageEnvelope?.key || {};
  const primaryRemoteJid = String(key.remoteJid || data.remoteJid || data.sender || messageEnvelope?.sender || '').trim();
  const alternateRemoteJid = String(
    key.remoteJidAlt || data.remoteJidAlt || data.key?.remoteJidAlt ||
    messageEnvelope?.key?.remoteJidAlt || messageEnvelope?.remoteJidAlt || ''
  ).trim();
  // O WhatsApp atual pode entregar contatos usando @lid. Quando houver
  // remoteJidAlt, ele contém o telefone real e deve ser usado para responder.
  const remoteJid = primaryRemoteJid.endsWith('@lid') && alternateRemoteJid
    ? alternateRemoteJid
    : (primaryRemoteJid || alternateRemoteJid);
  const fromMe = evolutionFlagTrue(
    req.body?.fromMe,
    rawData?.fromMe,
    rawData?.key?.fromMe,
    data?.fromMe,
    data?.key?.fromMe,
    data?.message?.key?.fromMe,
    messageEnvelope?.fromMe,
    messageEnvelope?.key?.fromMe,
    key?.fromMe,
  );
  if (fromMe || String(remoteJid).endsWith('@g.us')) {
    console.log(`[WhatsApp webhook] Mensagem ignorada: fromMe=${fromMe} grupo=${String(remoteJid).endsWith('@g.us')}`);
    return res.json({ received: true, ignored: true, fromMe });
  }
  const message = messageEnvelope?.message || data.message?.message || messageEnvelope || {};
  const extracted = extractEvolutionText(message);
  if (!extracted.content) {
    console.warn('[WhatsApp webhook] Mensagem ignorada porque nenhum conteúdo compatível foi encontrado.');
    return res.json({ received: true, ignored: true });
  }

  const phoneDigitsForLog = normalizePhone(remoteJid);
  console.log('[WhatsApp webhook] Mensagem válida recebida:', {
    phoneSuffix: phoneDigitsForLog.slice(-4),
    type: extracted.messageType,
    providerMessageId: String(key.id || data.id || '').slice(-12),
  });
  let rawBase64 = String(data.base64 || messageEnvelope?.base64 || req.body.base64 || '').trim();
  const mediaNode = message.audioMessage || message.imageMessage || message.videoMessage || message.documentMessage || message.stickerMessage || {};
  let incomingMime = String(extracted.mimeType || mediaNode.mimetype || (extracted.messageType === 'audio' ? 'audio/ogg' : 'application/octet-stream')).split(';')[0];
  let incomingFileName = String(extracted.fileName || mediaNode.fileName || '');
  if (!rawBase64 && !['text', 'location', 'unknown'].includes(extracted.messageType)) {
    try {
      const downloaded = await whatsapp.getMediaBase64(messageEnvelope);
      rawBase64 = String(
        downloaded?.base64 || downloaded?.data?.base64 || downloaded?.media?.base64
        || downloaded?.response?.base64 || downloaded?.response?.data?.base64 || ''
      ).trim();
      incomingMime = String(downloaded?.mimetype || downloaded?.mimeType || downloaded?.data?.mimetype || downloaded?.response?.mimetype || incomingMime).split(';')[0];
      incomingFileName = String(downloaded?.fileName || downloaded?.data?.fileName || downloaded?.response?.fileName || incomingFileName);
    } catch (error) {
      realtime.emit('system:warning', { message: `A mídia recebida foi registrada, mas não pôde ser baixada: ${error.message}` });
    }
  }
  let storedMedia = { mediaUrl: '', mimeType: incomingMime, fileName: incomingFileName };
  if (rawBase64) {
    try {
      storedMedia = persistIncomingMedia({
        rawBase64,
        mimeType: incomingMime,
        fileName: incomingFileName,
        messageType: extracted.messageType,
        providerMessageId: key.id || data.id || '',
      });
    } catch (error) {
      console.error('[WhatsApp webhook] Falha ao salvar mídia recebida:', error.message);
      realtime.emit('system:warning', { message: `A mídia chegou, mas não pôde ser salva: ${error.message}` });
    }
  }
  try {
    const result = await processIncomingMessage({
      phone: remoteJid,
      name: data.pushName || messageEnvelope?.pushName || data.senderName || 'Cliente WhatsApp',
      content: extracted.content,
      provider: 'evolution',
      providerMessageId: key.id || data.id || null,
      messageType: extracted.messageType,
      mediaUrl: storedMedia.mediaUrl,
      mimeType: storedMedia.mimeType,
      fileName: storedMedia.fileName,
      replyToProviderMessageId: extracted.quotedProviderMessageId,
    });

    console.log('[WhatsApp bot] Mensagem processada:', {
      phoneSuffix: phoneDigitsForLog.slice(-4),
      duplicate: Boolean(result.duplicate),
      conversationId: result.conversation?.id || null,
      aiReplyCreated: Boolean(result.aiReply),
    });
    res.json({ received: true, duplicate: Boolean(result.duplicate) });
  } catch (error) {
    console.error('[WhatsApp bot] Falha ao processar mensagem recebida:', {
      phoneSuffix: phoneDigitsForLog.slice(-4),
      message: error.message,
    });
    res.status(400).json({ error: error.message });
  }
});


function fiscalSettingsObject() {
  const keys = [
    'fiscal_module_enabled','fiscal_environment','fiscal_provider','fiscal_auto_prepare','fiscal_legal_name','fiscal_trade_name',
    'fiscal_cnpj','fiscal_state_registration','fiscal_crt','fiscal_address','fiscal_city','fiscal_state','fiscal_zip_code',
    'fiscal_default_table_document','fiscal_default_pickup_document','fiscal_default_delivery_document','fiscal_default_website_document','fiscal_accountant_notes',
  ];
  const rows = db.prepare(`SELECT key,value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`).all(...keys);
  return Object.fromEntries(rows.map((row)=>[row.key,row.value]));
}

function fiscalDocumentTypeForOrder(order, settings) {
  if (order.fulfillment_method === 'table') return settings.fiscal_default_table_document || 'unconfigured';
  if (order.fulfillment_method === 'pickup') return settings.fiscal_default_pickup_document || 'unconfigured';
  if (order.source === 'website') return settings.fiscal_default_website_document || 'unconfigured';
  return settings.fiscal_default_delivery_document || 'unconfigured';
}

function fiscalOrderSnapshot(orderId, requestedType, customerDocument = '') {
  const settings = fiscalSettingsObject();
  const order = db.prepare(`SELECT o.*,ct.name contact_name,ct.phone,rt.name table_name FROM orders o JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN restaurant_tables rt ON rt.id=o.table_id WHERE o.id=?`).get(orderId);
  if (!order) throw new Error('Pedido não encontrado.');
  if (order.status === 'cancelled') throw new Error('Pedido cancelado não pode gerar prévia fiscal.');
  const items = db.prepare(`SELECT oi.*,p.fiscal_ncm,p.fiscal_cest,p.fiscal_cfop,p.fiscal_cst_csosn,p.fiscal_origin,p.fiscal_unit,p.fiscal_ibs_cbs,p.fiscal_notes FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? ORDER BY oi.id`).all(orderId);
  const documentType = ['nfce','nfe','unconfigured'].includes(String(requestedType||'')) ? String(requestedType) : fiscalDocumentTypeForOrder(order, settings);
  const missing = [];
  if (!settings.fiscal_cnpj) missing.push('CNPJ do emitente');
  if (!settings.fiscal_legal_name) missing.push('Razão social');
  if (!settings.fiscal_state_registration) missing.push('Inscrição estadual');
  if (!settings.fiscal_crt) missing.push('Regime tributário/CRT');
  if (!settings.fiscal_address || !settings.fiscal_city || !settings.fiscal_state) missing.push('Endereço fiscal completo');
  if (documentType === 'unconfigured') missing.push('Tipo de documento definido pelo contador');
  items.forEach((item, index) => {
    if (!item.fiscal_ncm) missing.push(`Item ${index+1}: NCM`);
    if (!item.fiscal_cfop) missing.push(`Item ${index+1}: CFOP`);
    if (!item.fiscal_cst_csosn) missing.push(`Item ${index+1}: CST/CSOSN`);
  });
  return {
    order,
    items,
    settings,
    documentType,
    customerDocument: String(customerDocument||'').replace(/\D/g,''),
    missing: [...new Set(missing)],
    payload: {
      preparationOnly: true,
      warning: 'Prévia sem valor fiscal. Não transmitida à SEFAZ.',
      issuer: {
        legalName: settings.fiscal_legal_name || '', tradeName: settings.fiscal_trade_name || '', cnpj: settings.fiscal_cnpj || '',
        stateRegistration: settings.fiscal_state_registration || '', crt: settings.fiscal_crt || '', address: settings.fiscal_address || '',
        city: settings.fiscal_city || '', state: settings.fiscal_state || '', zipCode: settings.fiscal_zip_code || '',
      },
      documentType,
      customer: { name: order.contact_name, phone: order.phone, document: String(customerDocument||'').replace(/\D/g,'') },
      sale: { orderId: order.id, source: order.source, fulfillmentMethod: order.fulfillment_method, tableName: order.table_name || '', subtotal: order.subtotal, deliveryFee: order.delivery_fee, total: order.total, createdAt: order.created_at },
      items: items.map((item)=>({ name:item.name, quantity:item.quantity, unitPrice:item.unit_price, total:Number(item.quantity)*Number(item.unit_price), notes:item.notes||'', ncm:item.fiscal_ncm||'', cest:item.fiscal_cest||'', cfop:item.fiscal_cfop||'', cstCsosn:item.fiscal_cst_csosn||'', origin:item.fiscal_origin||'0', unit:item.fiscal_unit||'UN', ibsCbs:item.fiscal_ibs_cbs||'', fiscalNotes:item.fiscal_notes||'' })),
    },
  };
}

router.get('/fiscal/overview', requireAuth, requireAdmin, (req, res) => {
  const settings = fiscalSettingsObject();
  const products = db.prepare(`SELECT id,name,category,active,fiscal_ncm,fiscal_cest,fiscal_cfop,fiscal_cst_csosn,fiscal_origin,fiscal_unit,fiscal_ibs_cbs,fiscal_notes FROM products ORDER BY active DESC,category,name`).all();
  const productRows = products.map((product)=>({ ...product, complete: Boolean(product.fiscal_ncm && product.fiscal_cfop && product.fiscal_cst_csosn && product.fiscal_unit) }));
  const orders = db.prepare(`SELECT o.id,o.status,o.source,o.fulfillment_method,o.total,o.created_at,ct.name contact_name,rt.name table_name,fd.id fiscal_document_id,fd.status fiscal_status,fd.document_type fiscal_document_type,fd.updated_at fiscal_updated_at FROM orders o JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN restaurant_tables rt ON rt.id=o.table_id LEFT JOIN fiscal_documents fd ON fd.order_id=o.id WHERE o.status!='cancelled' ORDER BY o.created_at DESC LIMIT 80`).all();
  const documents = db.prepare(`SELECT fd.*,o.total,o.fulfillment_method,o.source,ct.name contact_name,u.name created_by_name FROM fiscal_documents fd JOIN orders o ON o.id=fd.order_id JOIN contacts ct ON ct.id=o.contact_id LEFT JOIN users u ON u.id=fd.created_by_user_id ORDER BY fd.updated_at DESC LIMIT 80`).all().map((row)=>({ ...row, missing_fields:safeJson(row.missing_fields_json,[]), payload:safeJson(row.payload_json,{}) }));
  const issuerReady = Boolean(settings.fiscal_cnpj && settings.fiscal_legal_name && settings.fiscal_state_registration && settings.fiscal_crt && settings.fiscal_address && settings.fiscal_city && settings.fiscal_state);
  return res.json({ settings, issuerReady, products: productRows, counts: { products: productRows.length, productsComplete: productRows.filter((p)=>p.complete).length, ordersWithoutPreview: orders.filter((o)=>!o.fiscal_document_id).length, previewsReady: documents.filter((d)=>d.status==='preview_ready').length, needsReview: documents.filter((d)=>d.status==='needs_review').length }, orders, documents });
});

router.put('/fiscal/settings', requireAuth, requireAdmin, (req, res) => {
  const allowed = ['fiscal_module_enabled','fiscal_auto_prepare','fiscal_legal_name','fiscal_trade_name','fiscal_cnpj','fiscal_state_registration','fiscal_crt','fiscal_address','fiscal_city','fiscal_state','fiscal_zip_code','fiscal_default_table_document','fiscal_default_pickup_document','fiscal_default_delivery_document','fiscal_default_website_document','fiscal_accountant_notes'];
  const stamp = nowIso();
  const upsert = db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
  db.exec('BEGIN');
  try {
    for (const key of allowed) if (Object.hasOwn(req.body,key)) upsert.run(key,String(req.body[key] ?? ''),stamp);
    upsert.run('fiscal_environment','homologation',stamp);
    upsert.run('fiscal_provider','preparation',stamp);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  audit(req.user.id,'update','fiscal_settings',null,{preparationOnly:true});
  return res.json({ success:true, settings:fiscalSettingsObject() });
});

router.post('/fiscal/documents/preview', requireAuth, requireAdmin, (req, res) => {
  if (setting('fiscal_module_enabled','false') !== 'true') return res.status(400).json({ error:'Ative o módulo fiscal antes de gerar uma prévia.' });
  try {
    const snapshot = fiscalOrderSnapshot(Number(req.body.orderId), req.body.documentType, req.body.customerDocument);
    const stamp = nowIso();
    const status = snapshot.missing.length ? 'needs_review' : 'preview_ready';
    db.prepare(`INSERT INTO fiscal_documents (order_id,document_type,environment,provider,status,customer_document,missing_fields_json,payload_json,response_json,created_by_user_id,created_at,updated_at) VALUES (?,?,?,'preparation',?,?,?,?, '{}',?,?,?) ON CONFLICT(order_id) DO UPDATE SET document_type=excluded.document_type,environment=excluded.environment,provider='preparation',status=excluded.status,customer_document=excluded.customer_document,missing_fields_json=excluded.missing_fields_json,payload_json=excluded.payload_json,response_json='{}',created_by_user_id=excluded.created_by_user_id,updated_at=excluded.updated_at`)
      .run(snapshot.order.id,snapshot.documentType,'homologation',status,snapshot.customerDocument,JSON.stringify(snapshot.missing),JSON.stringify(snapshot.payload),req.user.id,stamp,stamp);
    const row = db.prepare('SELECT * FROM fiscal_documents WHERE order_id=?').get(snapshot.order.id);
    audit(req.user.id,'prepare_preview','fiscal_document',row.id,{orderId:snapshot.order.id,status,missing:snapshot.missing});
    return res.status(201).json({ ...row, missing_fields:snapshot.missing, payload:snapshot.payload });
  } catch (error) { return res.status(400).json({ error:error.message }); }
});

router.delete('/fiscal/documents/:id', requireAuth, requireAdmin, (req, res) => {
  const id=Number(req.params.id); const row=db.prepare('SELECT * FROM fiscal_documents WHERE id=?').get(id);
  if(!row)return res.status(404).json({error:'Prévia fiscal não encontrada.'});
  db.prepare('DELETE FROM fiscal_documents WHERE id=?').run(id);
  audit(req.user.id,'delete_preview','fiscal_document',id,{orderId:row.order_id});
  return res.status(204).end();
});

module.exports = router;
