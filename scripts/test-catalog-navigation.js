const assert = require('node:assert/strict');
const { db, nowIso } = require('../src/db');
const { handleOrderFlow, generateGroundedReply, clearSession } = require('../src/services/ai');

(async () => {
  const stamp = nowIso();
  const phone = `55999${Date.now()}`;
  const contactId = Number(db.prepare(`
    INSERT INTO contacts(name,phone,email,notes,tags,created_at,updated_at,last_seen_at)
    VALUES('Teste Cardápio',?,'','','[]',?,?,?)
  `).run(phone, stamp, stamp, stamp).lastInsertRowid);
  const queueId = Number(db.prepare('SELECT id FROM queues ORDER BY id LIMIT 1').get()?.id || 1);
  const conversationId = Number(db.prepare(`
    INSERT INTO conversations(contact_id,queue_id,status,channel,ai_enabled,unread_count,priority,protocol,last_message,last_message_at,created_at)
    VALUES(?,?,'open','whatsapp',1,0,'normal',?,'',?,?)
  `).run(contactId, queueId, `CAT-${Date.now()}`, stamp, stamp).lastInsertRowid);

  let reply = await handleOrderFlow({ conversationId, message: 'cardápio' });
  assert.match(reply.text, /Escolha uma categoria/i);
  assert.match(reply.text, /Lanches Tradicionais/i);

  reply = await handleOrderFlow({ conversationId, message: '2' });
  assert.match(reply.text, /LANCHES TRADICIONAIS/i);
  assert.match(reply.text, /Página \*1 de/i);

  reply = await handleOrderFlow({ conversationId, message: '1' });
  assert.match(reply.text, /Americano/i);
  assert.match(reply.text, /Preço/i);

  reply = await handleOrderFlow({ conversationId, message: '1' });
  assert.match(reply.text, /ITEM ADICIONADO/i);
  const orderSession = db.prepare('SELECT cart_json FROM ai_order_sessions WHERE conversation_id=?').get(conversationId);
  const cart = JSON.parse(orderSession.cart_json);
  assert.equal(cart[0]?.name, 'Americano');

  const productQuestion = await generateGroundedReply('Como é feito o X-Bacon?', { conversationId });
  assert.match(productQuestion.text, /bacon/i);
  assert.match(productQuestion.text, /muçarela/i);

  clearSession(conversationId);
  db.prepare('DELETE FROM conversations WHERE id=?').run(conversationId);
  db.prepare('DELETE FROM contacts WHERE id=?').run(contactId);
  console.log('Navegação do cardápio testada com sucesso.');
  db.close();
})().catch((error) => {
  console.error(error);
  try { db.close(); } catch {}
  process.exitCode = 1;
});
