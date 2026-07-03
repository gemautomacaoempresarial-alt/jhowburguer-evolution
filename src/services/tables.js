const crypto = require('node:crypto');
const { db, nowIso } = require('../db');

function setting(key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
}

function cleanToken(value, pattern = /^[a-f0-9]{48}$/i) {
  const token = String(value || '').trim().toLowerCase();
  return pattern.test(token) ? token : '';
}

function newQrToken() {
  return crypto.randomBytes(24).toString('hex');
}

function newDeviceToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getTableByToken(qrToken) {
  const token = cleanToken(qrToken);
  if (!token) return null;
  return db.prepare('SELECT * FROM restaurant_tables WHERE qr_token=? AND active=1').get(token) || null;
}

function getTableById(id) {
  return db.prepare('SELECT * FROM restaurant_tables WHERE id=?').get(Number(id)) || null;
}

function activeTab(tableId) {
  return db.prepare("SELECT * FROM table_tabs WHERE table_id=? AND status IN ('open','account_requested') ORDER BY id DESC LIMIT 1").get(Number(tableId)) || null;
}

function sessionHours() {
  return Math.max(1, Math.min(24, Number(setting('restaurant_table_session_hours', '4') || 4)));
}

function sessionExpired(lastSeenAt) {
  const stamp = new Date(lastSeenAt || 0).getTime();
  return !stamp || Date.now() - stamp > sessionHours() * 3600_000;
}

function ensureOpenTab(table) {
  let tab = activeTab(table.id);
  if (tab) return tab;
  const stamp = nowIso();
  const result = db.prepare("INSERT INTO table_tabs(table_id,status,opened_at,notes) VALUES(?,'open',?,'')").run(table.id, stamp);
  db.prepare("UPDATE restaurant_tables SET status='occupied',updated_at=? WHERE id=?").run(stamp, table.id);
  return db.prepare('SELECT * FROM table_tabs WHERE id=?').get(Number(result.lastInsertRowid));
}

function joinTable(qrToken, deviceToken) {
  if (setting('restaurant_tables_enabled', 'false') !== 'true') throw new Error('O atendimento por mesas está desativado no momento.');
  const table = getTableByToken(qrToken);
  if (!table) throw new Error('Este QR Code de mesa é inválido ou foi desativado.');
  if (table.status === 'blocked') throw new Error('Esta mesa está indisponível no momento.');
  let device = cleanToken(deviceToken);
  if (!device) device = newDeviceToken();
  const tab = ensureOpenTab(table);
  if (tab.status === 'account_requested') throw new Error('A conta desta mesa já foi solicitada. Fale com a equipe para iniciar uma nova comanda.');
  const stamp = nowIso();
  let member = db.prepare('SELECT * FROM table_members WHERE tab_id=? AND device_token=?').get(tab.id, device);
  if (member) {
    db.prepare('UPDATE table_members SET active=1,left_at=NULL,last_seen_at=? WHERE id=?').run(stamp, member.id);
  } else {
    const allowMultiple = setting('restaurant_table_allow_multiple_devices', 'true') === 'true';
    if (!allowMultiple) db.prepare('UPDATE table_members SET active=0,left_at=? WHERE tab_id=? AND active=1').run(stamp, tab.id);
    const result = db.prepare("INSERT INTO table_members(tab_id,device_token,display_name,active,joined_at,last_seen_at) VALUES(?,?,'',1,?,?)")
      .run(tab.id, device, stamp, stamp);
    member = db.prepare('SELECT * FROM table_members WHERE id=?').get(Number(result.lastInsertRowid));
  }
  member = db.prepare('SELECT * FROM table_members WHERE tab_id=? AND device_token=?').get(tab.id, device);
  return { table: { ...table, status: 'occupied' }, tab, member, deviceToken: device };
}

function getMemberSession(qrToken, deviceToken, { touch = true } = {}) {
  const table = getTableByToken(qrToken);
  const device = cleanToken(deviceToken);
  if (!table || !device) return null;
  const tab = activeTab(table.id);
  if (!tab) return null;
  const member = db.prepare('SELECT * FROM table_members WHERE tab_id=? AND device_token=? AND active=1').get(tab.id, device);
  // O vínculo permanece ativo enquanto a comanda estiver aberta. Fechar o navegador
  // ou ficar algumas horas sem atividade não remove o cliente da mesa.
  if (!member) return null;
  if (touch) db.prepare('UPDATE table_members SET last_seen_at=? WHERE id=?').run(nowIso(), member.id);
  return { table, tab, member: { ...member, last_seen_at: touch ? nowIso() : member.last_seen_at }, deviceToken: device };
}

function tabOrders(tabId) {
  return db.prepare(`
    SELECT o.id,o.status,o.subtotal,o.delivery_fee,o.total,o.payment_method,o.notes,o.customer_name,
      o.created_at,o.updated_at,o.table_member_id member_id,ct.name contact_name,
      COALESCE(NULLIF(tm.display_name,''),NULLIF(o.customer_name,''),ct.name) member_name
    FROM orders o JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN table_members tm ON tm.id=o.table_member_id
    WHERE o.table_tab_id=? ORDER BY o.id
  `).all(Number(tabId)).map((order) => ({
    ...order,
    items: db.prepare('SELECT name,quantity,unit_price,notes FROM order_items WHERE order_id=? ORDER BY id').all(order.id),
  }));
}

function tabMembers(tabId, { activeOnly = false } = {}) {
  return db.prepare(`
    SELECT tm.id,tm.display_name,tm.contact_id,tm.conversation_id,tm.active,tm.joined_at,tm.last_seen_at,tm.left_at,
      ct.name contact_name,ct.phone
    FROM table_members tm
    LEFT JOIN contacts ct ON ct.id=tm.contact_id
    WHERE tm.tab_id=? ${activeOnly ? 'AND tm.active=1' : ''}
    ORDER BY tm.joined_at
  `).all(Number(tabId)).map((member) => ({
    ...member,
    active: Boolean(member.active),
    display_name: String(member.display_name || member.contact_name || 'Cliente').trim(),
  }));
}

function tabPayments(tabId) {
  return db.prepare(`
    SELECT tp.*,u.name created_by_user_name,tm.display_name member_display_name,ct.name member_contact_name
    FROM table_payments tp
    LEFT JOIN users u ON u.id=tp.created_by_user_id
    LEFT JOIN table_members tm ON tm.id=tp.member_id
    LEFT JOIN contacts ct ON ct.id=tm.contact_id
    WHERE tp.tab_id=? ORDER BY tp.id DESC
  `).all(Number(tabId)).map((payment) => ({
    ...payment,
    member_name: payment.member_display_name || payment.member_contact_name || '',
  }));
}

function tabTotals(orders, payments) {
  const total = orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total || 0), 0);
  const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return { total, paidTotal, balance: Math.max(0, total - paidTotal) };
}

function tabSummary(tabId) {
  const tab = db.prepare('SELECT * FROM table_tabs WHERE id=?').get(Number(tabId));
  if (!tab) return null;
  const table = getTableById(tab.table_id);
  const orders = tabOrders(tab.id);
  const members = tabMembers(tab.id, { activeOnly: true });
  const requests = db.prepare("SELECT * FROM table_service_requests WHERE tab_id=? AND status='pending' ORDER BY created_at DESC").all(tab.id);
  const payments = tabPayments(tab.id);
  return { table, tab, orders, members, requests, payments, ...tabTotals(orders, payments) };
}

function tableHistory(tableId, { limit = 30 } = {}) {
  const table = getTableById(tableId);
  if (!table) return null;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 30));
  const tabs = db.prepare(`
    SELECT tt.*,u.name closed_by_user_name
    FROM table_tabs tt
    LEFT JOIN users u ON u.id=tt.closed_by_user_id
    WHERE tt.table_id=?
    ORDER BY tt.opened_at DESC,tt.id DESC
    LIMIT ?
  `).all(table.id, safeLimit);

  const sessions = tabs.map((tab) => {
    const orders = tabOrders(tab.id);
    const members = tabMembers(tab.id);
    const payments = tabPayments(tab.id);
    const endedAt = tab.closed_at || nowIso();
    const durationSeconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(tab.opened_at).getTime()) / 1000));
    return {
      tab,
      orders,
      members,
      payments,
      durationSeconds,
      ...tabTotals(orders, payments),
    };
  });

  const allSessions = Number(db.prepare('SELECT COUNT(*) total FROM table_tabs WHERE table_id=?').get(table.id)?.total || 0);
  const allSales = Number(db.prepare(`
    SELECT COALESCE(SUM(o.total),0) total
    FROM orders o
    LEFT JOIN table_tabs tt ON tt.id=o.table_tab_id
    WHERE COALESCE(o.table_id,tt.table_id)=? AND o.status!='cancelled'
  `).get(table.id)?.total || 0);
  const allPaid = Number(db.prepare(`
    SELECT COALESCE(SUM(tp.amount),0) total
    FROM table_payments tp
    JOIN table_tabs tt ON tt.id=tp.tab_id
    WHERE tt.table_id=?
  `).get(table.id)?.total || 0);
  const lastOpenedAt = db.prepare('SELECT opened_at FROM table_tabs WHERE table_id=? ORDER BY opened_at DESC,id DESC LIMIT 1').get(table.id)?.opened_at || null;

  return {
    table,
    sessions,
    summary: {
      totalSessions: allSessions,
      displayedSessions: sessions.length,
      totalSales: allSales,
      totalPaid: allPaid,
      lastOpenedAt,
    },
  };
}

function linkMember(memberId, { contactId = null, conversationId = null, displayName = '' } = {}) {
  db.prepare(`UPDATE table_members SET contact_id=COALESCE(?,contact_id),conversation_id=COALESCE(?,conversation_id),display_name=CASE WHEN ?!='' THEN ? ELSE display_name END,last_seen_at=? WHERE id=?`)
    .run(contactId, conversationId, String(displayName || '').trim(), String(displayName || '').trim(), nowIso(), Number(memberId));
}

function leaveTable(qrToken, deviceToken) {
  const session = getMemberSession(qrToken, deviceToken, { touch: false });
  if (!session) return false;
  const stamp = nowIso();
  db.prepare('UPDATE table_members SET active=0,left_at=?,last_seen_at=? WHERE id=?').run(stamp, stamp, session.member.id);
  return true;
}


function leaveConversation(conversationId, userId = null) {
  const stamp = nowIso();
  const memberships = db.prepare(`
    SELECT tm.id member_id,tt.id tab_id,tt.table_id
    FROM table_members tm
    JOIN table_tabs tt ON tt.id=tm.tab_id
    WHERE tm.conversation_id=? AND tm.active=1 AND tt.status IN ('open','account_requested')
  `).all(Number(conversationId));
  const changedTables = new Set();

  for (const membership of memberships) {
    db.prepare('UPDATE table_members SET active=0,left_at=?,last_seen_at=? WHERE id=?')
      .run(stamp, stamp, membership.member_id);
    changedTables.add(Number(membership.table_id));

    const remaining = Number(db.prepare('SELECT COUNT(*) total FROM table_members WHERE tab_id=? AND active=1').get(membership.tab_id)?.total || 0);
    if (remaining === 0) {
      releaseTable(
        membership.table_id,
        userId,
        'Mesa liberada automaticamente após o encerramento do último atendimento.',
      );
    }
  }

  return [...changedTables];
}

function releaseTable(tableId, userId = null, note = '') {
  const table = getTableById(tableId);
  if (!table) return null;
  const stamp = nowIso();
  const tabs = db.prepare("SELECT id FROM table_tabs WHERE table_id=? AND status IN ('open','account_requested')").all(table.id);
  for (const tab of tabs) {
    db.prepare("UPDATE table_tabs SET status='closed',closed_at=?,closed_by_user_id=?,notes=CASE WHEN ?!='' THEN ? ELSE notes END WHERE id=?")
      .run(stamp, userId, note, note, tab.id);
    db.prepare('UPDATE table_members SET active=0,left_at=COALESCE(left_at,?) WHERE tab_id=? AND active=1').run(stamp, tab.id);
    db.prepare("UPDATE table_service_requests SET status='resolved',resolved_at=?,resolved_by_user_id=? WHERE tab_id=? AND status='pending'").run(stamp, userId, tab.id);
  }
  db.prepare("UPDATE restaurant_tables SET status='free',updated_at=? WHERE id=?").run(stamp, table.id);
  return getTableById(table.id);
}

module.exports = {
  setting,
  newQrToken,
  getTableByToken,
  getTableById,
  activeTab,
  joinTable,
  getMemberSession,
  tabSummary,
  tableHistory,
  linkMember,
  leaveTable,
  leaveConversation,
  releaseTable,
};
