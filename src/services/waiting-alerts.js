const { db, nowIso } = require('../db');
const realtime = require('./realtime');

function thresholds() {
  const raw = db.prepare("SELECT value FROM settings WHERE key='waiting_alert_minutes'").get()?.value || '2,5,10';
  const values = String(raw).split(',').map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 120);
  return [...new Set(values.length ? values : [2, 5, 10])].sort((a, b) => a - b);
}

function createAlert(row, threshold) {
  const title = `Cliente aguardando há ${threshold} min`;
  const message = `${row.contact_name} está esperando uma resposta no atendimento ${row.protocol}.`;
  const stamp = nowIso();
  const targetUserId = Number(row.assigned_user_id || 0) || null;
  const targetRole = targetUserId ? '' : 'agent';
  const result = db.prepare(`INSERT INTO notifications(type,title,message,entity_type,entity_id,target_user_id,target_role,created_at) VALUES('waiting_alert',?,?,?,?,?,?,?)`)
    .run(title, message, 'conversation', row.id, targetUserId, targetRole, stamp);
  db.prepare('INSERT OR IGNORE INTO conversation_wait_alerts(conversation_id,customer_message_id,threshold_minutes,notified_at) VALUES(?,?,?,?)')
    .run(row.id, row.last_message_id, threshold, stamp);
  const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
  if (targetUserId) realtime.emitToUser(targetUserId, 'notification:new', notification);
  else realtime.emitToRole('agent', 'notification:new', notification);
  realtime.emit('conversation:waiting-alert', { conversationId: row.id, threshold, contactName: row.contact_name });
}

function scanWaitingConversations() {
  const rows = db.prepare(`
    SELECT c.id,c.assigned_user_id,c.protocol,ct.name contact_name,
      m.id last_message_id,m.sender_type last_sender_type,m.created_at last_message_created_at
    FROM conversations c
    JOIN contacts ct ON ct.id=c.contact_id
    JOIN messages m ON m.id=(
      SELECT mx.id FROM messages mx
      WHERE mx.conversation_id=c.id AND mx.is_internal=0 AND mx.deleted_at IS NULL
      ORDER BY mx.created_at DESC,mx.id DESC LIMIT 1
    )
    WHERE c.status IN ('open','waiting_human') AND COALESCE(c.hidden,0)=0
  `).all();
  const limits = thresholds();
  const exists = db.prepare('SELECT 1 FROM conversation_wait_alerts WHERE conversation_id=? AND customer_message_id=? AND threshold_minutes=?');
  for (const row of rows) {
    if (row.last_sender_type !== 'customer') continue;
    const ageMinutes = (Date.now() - new Date(row.last_message_created_at).getTime()) / 60000;
    for (const threshold of limits) {
      if (ageMinutes < threshold) continue;
      if (exists.get(row.id, row.last_message_id, threshold)) continue;
      createAlert(row, threshold);
    }
  }
  const cleanupBefore = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM conversation_wait_alerts WHERE notified_at < ?').run(cleanupBefore);
}

function startWaitingAlertScheduler() {
  setTimeout(() => { try { scanWaitingConversations(); } catch (error) { console.error('Falha ao verificar atendimentos parados:', error.message); } }, 8000);
  const timer = setInterval(() => {
    try { scanWaitingConversations(); } catch (error) { console.error('Falha ao verificar atendimentos parados:', error.message); }
  }, 30000);
  timer.unref?.();
  return timer;
}

module.exports = { scanWaitingConversations, startWaitingAlertScheduler };
