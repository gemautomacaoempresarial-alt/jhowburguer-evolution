const { db, nowIso, insertMessage } = require('../db');
const realtime = require('./realtime');

function hasJoinedQueue(userId, queueId) {
  const explicit = db.prepare('SELECT 1 FROM queue_memberships WHERE user_id=? LIMIT 1').get(userId);
  if (!explicit) return true;
  return Boolean(db.prepare('SELECT 1 FROM queue_memberships WHERE user_id=? AND queue_id=? AND active=1 AND COALESCE(joined,1)=1').get(userId, queueId));
}

function isEligibleAgent(user, queueId = 0) {
  if (!user || user.role !== 'agent' || !user.active || user.status !== 'online' || !user.receive_assignments) return false;
  if (!realtime.isUserOnline(user.id)) return false;
  return !queueId || hasJoinedQueue(user.id, queueId);
}

function eligibleAgents(queueId = 0, excludeUserIds = []) {
  const excluded = new Set((excludeUserIds || []).map(Number));
  const rows = db.prepare(`
    SELECT u.id,u.name,u.role,u.status,u.active,u.receive_assignments,u.sector,u.avatar_url,
      COUNT(CASE WHEN c.status='open' THEN 1 END) AS open_count
    FROM users u
    LEFT JOIN conversations c ON c.assigned_user_id=u.id AND c.status='open' AND COALESCE(c.hidden,0)=0
    WHERE u.active=1 AND u.role='agent'
    GROUP BY u.id
    ORDER BY open_count ASC,u.name
  `).all();
  return rows.filter((row) => !excluded.has(Number(row.id)) && isEligibleAgent(row, queueId));
}

function chooseOnlineAgent(queueId = 0, excludeUserIds = []) {
  const candidates = eligibleAgents(queueId, excludeUserIds);
  if (!candidates.length) return null;
  const min = Math.min(...candidates.map((row) => Number(row.open_count || 0)));
  const balanced = candidates.filter((row) => Number(row.open_count || 0) === min);
  return balanced[Math.floor(Math.random() * balanced.length)] || candidates[0];
}

function notifyAssignedAgent(userId, conversationId, contactName, title = 'Novo atendimento') {
  if (!userId) return null;
  const result = db.prepare(`INSERT INTO notifications(type,title,message,entity_type,entity_id,target_user_id,target_role,created_at)
    VALUES('assignment',?,?, 'conversation',?,?,'',?)`)
    .run(title, `${contactName || 'Um cliente'} aguarda atendimento.`, conversationId, userId, nowIso());
  const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
  realtime.emitToUser(userId, 'notification:new', notification);
  return notification;
}


function notifyWaitingTeam(conversationId, contactName, title = 'Novo atendimento aguardando') {
  const roles = ['agent', 'supervisor', 'admin'];
  const notifications = [];
  for (const role of roles) {
    const result = db.prepare(`INSERT INTO notifications(type,title,message,entity_type,entity_id,target_user_id,target_role,created_at)
      VALUES('assignment',?,?, 'conversation',?,NULL,?,?)`)
      .run(title, `${contactName || 'Um cliente'} aguarda atendimento.`, conversationId, role, nowIso());
    const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
    realtime.emitToRole(role, 'notification:new', notification);
    notifications.push(notification);
  }
  return notifications;
}

function notifyHumanHandoff(userId, conversationId, contactName, title = 'Novo atendimento') {
  return userId
    ? notifyAssignedAgent(userId, conversationId, contactName, title)
    : notifyWaitingTeam(conversationId, contactName, 'Atendimento aguardando');
}

function assignConversation(conversation, target, { addNote = false } = {}) {
  db.prepare("UPDATE conversations SET assigned_user_id=?,status='open',hidden=0 WHERE id=?").run(target.id, conversation.id);
  if (addNote) {
    const messageId = insertMessage({
      conversationId: conversation.id,
      senderType: 'system',
      content: 'Atendimento redistribuído automaticamente para a equipe disponível.',
      isInternal: 1,
      deliveryStatus: 'sent',
    });
    realtime.emit('message:new', { conversationId: conversation.id, message: db.prepare('SELECT * FROM messages WHERE id=?').get(messageId) });
  }
  notifyAssignedAgent(target.id, conversation.id, conversation.contact_name, 'Atendimento atribuído');
  realtime.emit('conversation:updated', { id: conversation.id });
  return target;
}

function rebalanceWaitingConversations() {
  const waiting = db.prepare(`
    SELECT c.*,ct.name contact_name
    FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
    WHERE c.status IN ('waiting','waiting_human') AND c.assigned_user_id IS NULL AND COALESCE(c.hidden,0)=0
    ORDER BY c.last_message_at ASC,c.id ASC
  `).all();
  let assigned = 0;
  for (const conversation of waiting) {
    const target = chooseOnlineAgent(conversation.queue_id);
    if (!target) continue;
    assignConversation(conversation, target);
    assigned += 1;
  }
  return assigned;
}

function redistributeUserConversations(userId) {
  const rows = db.prepare(`
    SELECT c.*,ct.name contact_name
    FROM conversations c JOIN contacts ct ON ct.id=c.contact_id
    WHERE c.assigned_user_id=? AND c.status!='closed' AND COALESCE(c.hidden,0)=0
    ORDER BY c.last_message_at ASC,c.id ASC
  `).all(Number(userId));
  let moved = 0;
  let waiting = 0;
  for (const conversation of rows) {
    const target = chooseOnlineAgent(conversation.queue_id, [Number(userId)]);
    if (target) {
      assignConversation(conversation, target, { addNote: true });
      moved += 1;
    } else {
      db.prepare("UPDATE conversations SET assigned_user_id=NULL,status='waiting_human' WHERE id=?").run(conversation.id);
      const messageId = insertMessage({
        conversationId: conversation.id,
        senderType: 'system',
        content: 'Atendimento aguardando um atendente disponível.',
        isInternal: 1,
        deliveryStatus: 'sent',
      });
      realtime.emit('message:new', { conversationId: conversation.id, message: db.prepare('SELECT * FROM messages WHERE id=?').get(messageId) });
      realtime.emit('conversation:updated', { id: conversation.id });
      waiting += 1;
    }
  }
  return { moved, waiting };
}

function shouldReceiveAssignments(userId) {
  const user = db.prepare('SELECT id,role,status,active,receive_assignments FROM users WHERE id=?').get(Number(userId));
  if (!user || !isEligibleAgent(user)) return false;
  const explicit = db.prepare('SELECT 1 FROM queue_memberships WHERE user_id=? LIMIT 1').get(user.id);
  if (!explicit) return true;
  return Boolean(db.prepare('SELECT 1 FROM queue_memberships WHERE user_id=? AND active=1 AND COALESCE(joined,1)=1 LIMIT 1').get(user.id));
}

module.exports = {
  chooseOnlineAgent,
  notifyAssignedAgent,
  notifyWaitingTeam,
  notifyHumanHandoff,
  rebalanceWaitingConversations,
  redistributeUserConversations,
  shouldReceiveAssignments,
  isEligibleAgent,
};
