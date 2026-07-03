const jwt = require('jsonwebtoken');
const { db, nowIso } = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'troque-esta-chave-no-arquivo-env';

function signToken(user, sessionId) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, sessionId },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function activeSessionForPayload(payload) {
  if (!payload?.sessionId || !payload?.id) return null;
  return db.prepare(`
    SELECT s.*,u.active,u.role,u.name,u.email
    FROM user_sessions s JOIN users u ON u.id=s.user_id
    WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND datetime(s.expires_at)>datetime(?)
  `).get(String(payload.sessionId), Number(payload.id), nowIso());
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });

  try {
    const payload = verifyToken(token);
    const session = activeSessionForPayload(payload);
    if (!session || !session.active) return res.status(401).json({ error: 'Sessão inválida, encerrada ou expirada.', code: 'SESSION_REVOKED' });
    req.user = { id: Number(payload.id), name: payload.name, email: payload.email, role: session.role, sessionId: payload.sessionId };
    req.session = session;
    const lastSeen = new Date(session.last_seen_at || 0).getTime();
    if (!lastSeen || Date.now() - lastSeen > 30000) {
      db.prepare('UPDATE user_sessions SET last_seen_at=? WHERE id=?').run(nowIso(), session.id);
    }
    return next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.', code: 'SESSION_INVALID' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') {
    return res.status(403).json({ error: 'Acesso restrito.' });
  }
  return next();
}

module.exports = { signToken, verifyToken, activeSessionForPayload, requireAuth, requireAdmin };
