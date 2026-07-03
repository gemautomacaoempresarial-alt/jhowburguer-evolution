const assert = require('node:assert/strict');
const { db, nowIso } = require('../src/db');
const {
  getLunchStatus,
  handleLunchConversation,
  validateLunchNotes,
  clearSession,
} = require('../src/services/lunch-menu');

function dateAtBrazilTime(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

const fixedSettings = { lunch_menu_enabled: 'true', lunch_menu_start: '09:00', lunch_menu_end: '14:00' };
assert.equal(getLunchStatus(fixedSettings, dateAtBrazilTime('2026-07-03', '10:30')).available, true);
assert.equal(getLunchStatus(fixedSettings, dateAtBrazilTime('2026-07-03', '14:00')).available, false);

const stamp = nowIso();
const contactId = Number(db.prepare(`
  INSERT INTO contacts(name,phone,email,notes,tags,created_at,updated_at,last_seen_at)
  VALUES('Teste Almoço',?,'','','[]',?,?,?)
`).run(`55998${Date.now()}`, stamp, stamp, stamp).lastInsertRowid);
const queueId = Number(db.prepare('SELECT id FROM queues ORDER BY id LIMIT 1').get()?.id || 1);
const conversationId = Number(db.prepare(`
  INSERT INTO conversations(contact_id,queue_id,status,channel,ai_enabled,unread_count,priority,protocol,last_message,last_message_at,created_at)
  VALUES(?,?,'open','whatsapp',1,0,'normal',?,'',?,?)
`).run(contactId, queueId, `LUNCH-${Date.now()}`, stamp, stamp).lastInsertRowid);

const alwaysAvailable = { lunch_menu_enabled: 'true', lunch_menu_start: '00:00', lunch_menu_end: '23:59' };
let reply = handleLunchConversation({ conversationId, message: 'quero uma marmitex', settings: alwaysAvailable });
assert.match(reply.text, /ESCOLHA SUA MARMITEX/i);
reply = handleLunchConversation({ conversationId, message: '4', settings: alwaysAvailable });
assert.match(reply.text, /ESCOLHA O ARROZ/i);
reply = handleLunchConversation({ conversationId, message: '1', settings: alwaysAvailable });
assert.match(reply.text, /ESCOLHA O FEIJÃO/i);
reply = handleLunchConversation({ conversationId, message: '1', settings: alwaysAvailable });
assert.match(reply.text, /ESCOLHA 2 GUARNIÇÕES/i);
reply = handleLunchConversation({ conversationId, message: '1 e 3', settings: alwaysAvailable });
assert.match(reply.text, /SALADA/i);
reply = handleLunchConversation({ conversationId, message: '2', settings: alwaysAvailable });
assert.equal(reply.action, 'complete');
assert.equal(reply.item.name, 'Marmitex M - Com Churrasco');
assert.match(reply.item.notes, /Carne: Churrasco/);
assert.match(reply.item.notes, /Batata Frita \+ Purê de Batata/);
const product = db.prepare('SELECT * FROM products WHERE id=?').get(reply.item.productId);
assert.equal(validateLunchNotes(product, reply.item.notes).valid, true);
assert.equal(validateLunchNotes(product, 'sem escolhas').valid, false);

clearSession(conversationId);
db.prepare('DELETE FROM conversations WHERE id=?').run(conversationId);
db.prepare('DELETE FROM contacts WHERE id=?').run(contactId);
console.log('Cardápio de almoço e montagem da marmitex testados com sucesso.');
db.close();
