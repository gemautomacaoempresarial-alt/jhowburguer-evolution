const crypto = require('node:crypto');
const os = require('node:os');
const { db, nowIso } = require('../db');

function safeJson(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function setting(key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
}

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function localNetworkAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry?.family === 'IPv4' && !entry.internal && !String(entry.address || '').startsWith('169.254.')) return entry.address;
    }
  }
  return 'localhost';
}

function websiteBaseUrl() {
  const configured = process.env.PUBLIC_SITE_URL || setting('website_public_url', '');
  if (configured) return cleanBaseUrl(configured);
  return `http://${localNetworkAddress()}:${Number(process.env.PORT || 3000)}`;
}

function normalizeCart(cart = []) {
  const merged = new Map();
  for (const input of Array.isArray(cart) ? cart : []) {
    const productId = Number(input.productId || input.product_id || 0);
    const quantity = Math.max(0, Math.min(20, Math.floor(Number(input.quantity || 0))));
    if (!productId || quantity < 1) continue;
    const product = db.prepare('SELECT id,name,price,stock,active FROM products WHERE id=?').get(productId);
    if (!product || !product.active || (product.stock != null && Number(product.stock) === 0)) continue;
    const available = product.stock == null ? 20 : Math.min(20, Number(product.stock));
    const existing = merged.get(productId);
    const totalQuantity = Math.min(available, quantity + Number(existing?.quantity || 0));
    merged.set(productId, {
      productId,
      name: product.name,
      quantity: totalQuantity,
      unitPrice: Number(product.price || 0),
      notes: String(input.notes || '').trim().slice(0, 180),
    });
  }
  return [...merged.values()].filter((item) => item.quantity > 0);
}

function cleanupCheckoutSessions() {
  db.prepare("DELETE FROM website_checkout_sessions WHERE datetime(expires_at) < datetime('now','-2 day') OR (consumed_at IS NOT NULL AND datetime(consumed_at) < datetime('now','-2 day'))").run();
}

function createCheckoutSession(conversationId, cart, { ttlHours = 24, allowEmpty = false } = {}) {
  const conversation = db.prepare(`
    SELECT c.id conversation_id,c.contact_id,ct.name contact_name,ct.phone
    FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
    WHERE c.id=?
  `).get(Number(conversationId));
  if (!conversation) return null;
  const normalizedCart = normalizeCart(cart);
  if (!normalizedCart.length && !allowEmpty) return null;
  cleanupCheckoutSessions();
  const token = crypto.randomBytes(24).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + Math.max(1, Number(ttlHours || 24)) * 60 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO website_checkout_sessions
      (token,contact_id,conversation_id,cart_json,expires_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(token, conversation.contact_id, conversation.conversation_id, JSON.stringify(normalizedCart), expiresAt, createdAt, createdAt);
  return {
    token,
    url: `${websiteBaseUrl()}/pedido/checkout/${token}`,
    contact: conversation,
    cart: normalizedCart,
    expiresAt,
  };
}

function getCheckoutSession(token, { includeConsumed = false } = {}) {
  const cleanToken = String(token || '').trim().toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(cleanToken)) return null;
  const row = db.prepare(`
    SELECT s.*,ct.name contact_name,ct.phone,ct.email,c.status conversation_status
    FROM website_checkout_sessions s
    JOIN contacts ct ON ct.id=s.contact_id
    LEFT JOIN conversations c ON c.id=s.conversation_id
    WHERE s.token=?
      AND datetime(s.expires_at) > datetime('now')
      ${includeConsumed ? '' : 'AND s.consumed_at IS NULL'}
  `).get(cleanToken);
  if (!row) return null;
  return { ...row, cart: normalizeCart(safeJson(row.cart_json, [])) };
}

function consumeCheckoutSession(token, orderId) {
  const cleanToken = String(token || '').trim().toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(cleanToken)) return;
  const stamp = nowIso();
  db.prepare('UPDATE website_checkout_sessions SET consumed_at=?,order_id=?,updated_at=? WHERE token=? AND consumed_at IS NULL')
    .run(stamp, Number(orderId), stamp, cleanToken);
}

module.exports = {
  createCheckoutSession,
  getCheckoutSession,
  consumeCheckoutSession,
  normalizeCart,
  websiteBaseUrl,
};
