const { db, nowIso } = require('../db');
const realtime = require('./realtime');

function providerMessageIdFrom(result) {
  return String(
    result?.key?.id ||
    result?.message?.key?.id ||
    result?.data?.key?.id ||
    result?.response?.key?.id ||
    result?.id ||
    ''
  ).trim();
}

function normalizeDeliveryStatus(value) {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== '') {
    if (numeric <= 0) return 'failed';
    if (numeric === 1) return 'pending';
    if (numeric === 2) return 'sent';
    if (numeric === 3) return 'delivered';
    if (numeric >= 4) return 'read';
  }
  const text = String(value).trim().toLowerCase().replace(/[.\-\s]+/g, '_');
  if (/error|fail|failed/.test(text)) return 'failed';
  if (/pending/.test(text)) return 'pending';
  if (/played|read|read_by_me/.test(text)) return 'read';
  if (/delivery|delivered|delivery_ack/.test(text)) return 'delivered';
  if (/server_ack|sent|ack/.test(text)) return 'sent';
  return '';
}

function updateMessageStatusByProviderId(providerMessageId, statusValue) {
  const id = String(providerMessageId || '').trim();
  const status = normalizeDeliveryStatus(statusValue);
  if (!id || !status) return null;
  const current = db.prepare('SELECT * FROM messages WHERE provider_message_id=? ORDER BY id DESC LIMIT 1').get(id);
  if (!current) return null;
  const rank = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 };
  if (current.delivery_status !== 'failed' && rank[status] < (rank[current.delivery_status] ?? 0)) return current;
  const stamp = nowIso();
  db.prepare(`
    UPDATE messages SET delivery_status=?,
      delivered_at=CASE WHEN ? IN ('delivered','read') THEN COALESCE(delivered_at,?) ELSE delivered_at END,
      read_at=CASE WHEN ?='read' THEN COALESCE(read_at,?) ELSE read_at END
    WHERE id=?
  `).run(status, status, stamp, status, stamp, current.id);
  const updated = db.prepare('SELECT * FROM messages WHERE id=?').get(current.id);
  realtime.emit('message:status', { conversationId: updated.conversation_id, message: updated });
  return updated;
}

function stampProviderResult(messageId, result, fallbackStatus = 'sent') {
  const providerMessageId = providerMessageIdFrom(result);
  const fallback = normalizeDeliveryStatus(fallbackStatus) || 'sent';
  const providerStatus = normalizeDeliveryStatus(result?.status || result?.message?.status || result?.data?.status || '');
  const rank = { failed: 0, pending: 1, sent: 2, delivered: 3, read: 4 };
  // A Evolution costuma responder PENDING mesmo depois de aceitar o envio.
  // Uma resposta HTTP concluída confirma ao menos o status "sent"; webhooks
  // posteriores continuam podendo promover para entregue ou lida.
  // Se a chamada HTTP de envio terminou com sucesso, a mensagem foi aceita
  // pelo provedor. Alguns retornos da Evolution usam um status numérico
  // transitório que pode parecer "failed" antes do ACK real; nesse ponto
  // mantemos ao menos "sent" e deixamos os webhooks promoverem o status.
  const status = providerStatus && rank[providerStatus] >= rank[fallback]
    ? providerStatus
    : fallback;
  const stamp = nowIso();
  db.prepare(`
    UPDATE messages SET provider_message_id=COALESCE(NULLIF(?,''),provider_message_id), delivery_status=?,
      delivered_at=CASE WHEN ? IN ('delivered','read') THEN COALESCE(delivered_at,?) ELSE delivered_at END,
      read_at=CASE WHEN ?='read' THEN COALESCE(read_at,?) ELSE read_at END
    WHERE id=?
  `).run(providerMessageId, status, status, stamp, status, stamp, Number(messageId));
  return db.prepare('SELECT * FROM messages WHERE id=?').get(Number(messageId));
}

function markConversationOutboundRead(conversationId, beforeCreatedAt = nowIso()) {
  const rows = db.prepare(`
    SELECT id FROM messages
    WHERE conversation_id=? AND is_internal=0 AND sender_type IN ('agent','ai')
      AND delivery_status IN ('pending','sent','delivered') AND created_at<=?
    ORDER BY id
  `).all(Number(conversationId), beforeCreatedAt);
  if (!rows.length) return [];
  const stamp = nowIso();
  const update = db.prepare(`
    UPDATE messages SET delivery_status='read',
      delivered_at=COALESCE(delivered_at,?), read_at=COALESCE(read_at,?)
    WHERE id=?
  `);
  const updated = [];
  db.exec('BEGIN');
  try {
    for (const row of rows) {
      update.run(stamp, stamp, row.id);
      updated.push(db.prepare('SELECT * FROM messages WHERE id=?').get(row.id));
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  for (const message of updated) {
    realtime.emit('message:status', { conversationId: message.conversation_id, message });
  }
  return updated;
}

function extractStatusUpdates(rawData) {
  const list = Array.isArray(rawData) ? rawData : [rawData];
  const updates = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const nested = Array.isArray(entry.messages) ? entry.messages : [];
    const candidates = [entry, entry.update, entry.messageUpdate, entry.data, ...nested].filter(Boolean);
    for (const item of candidates) {
      const key = item.key || item.message?.key || entry.key || {};
      const id = key.id || item.id || item.messageId || item.message_id || entry.id;
      const status = item.status ?? item.update?.status ?? item.messageUpdate?.status ?? item.ack ?? entry.status ?? entry.ack;
      if (id && status != null) updates.push({ id: String(id), status });
    }
  }
  const unique = new Map();
  for (const update of updates) unique.set(`${update.id}:${update.status}`, update);
  return [...unique.values()];
}

module.exports = {
  providerMessageIdFrom,
  normalizeDeliveryStatus,
  updateMessageStatusByProviderId,
  stampProviderResult,
  markConversationOutboundRead,
  extractStatusUpdates,
};
