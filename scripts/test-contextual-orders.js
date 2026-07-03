const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DB_CLIENT = 'sqlite';
process.env.DB_PATH = path.join(os.tmpdir(), `gm-context-orders-${process.pid}-${Date.now()}.sqlite`);
delete process.env.GEMINI_API_KEY;

const { db, DB_PATH, nowIso } = require('../src/db');
const {
  parseOrderItems,
  handleOrderFlow,
  startOrderSession,
  wantsToCancelEntireOrder,
  normalizeInformal,
} = require('../src/services/ai');

(async () => {
  const multiple = parseOrderItems('Quero os dois x burguer e dois x bacon e a coca 2l');
  const quantities = Object.fromEntries(multiple.map((item) => [item.name, Number(item.quantity)]));
  assert.equal(quantities['X-Burguer'], 2, 'Não reconheceu dois X-Burguer.');
  assert.equal(quantities['X-Bacon'], 2, 'Não reconheceu dois X-Bacon.');
  assert.equal(quantities['Coca-Cola 2L'], 1, 'Não reconheceu uma Coca-Cola 2L.');

  const slang = parseOrderItems('qro 2 x burguer, 2 x bacon e 1 coca 2l');
  assert.equal(slang.length, 3, 'A frase informal não foi dividida em três produtos.');
  assert.equal(normalizeInformal('pdc, qro esse aí'), 'pode crer quero esse ai', 'A normalização de gírias falhou.');
  assert.equal(parseOrderItems('1 Coca-Cola 600 ml')[0]?.name, 'Coca-Cola 600 ml', '600 ml deve ser reconhecida exatamente e nunca substituída por 2L.');

  const stamp = nowIso();
  const contactId = Number(db.prepare("INSERT INTO contacts(name,phone,email,document,notes,tags,created_at,updated_at) VALUES(?,?,?,?,?,'[]',?,?)")
    .run('Cliente Contexto', '553899990077', '', '', '', stamp, stamp).lastInsertRowid);
  const queueId = Number(db.prepare("SELECT id FROM queues WHERE name='Atendimento' LIMIT 1").get().id);
  const conversationId = Number(db.prepare(`INSERT INTO conversations
    (contact_id,queue_id,status,channel,ai_enabled,unread_count,priority,protocol,last_message,last_message_at,created_at,hidden)
    VALUES (?,?,'waiting','whatsapp',1,0,'normal',?,?,?, ?,1)`)
    .run(contactId, queueId, `ATD-CTX-${Date.now()}`, '', stamp, stamp).lastInsertRowid);

  startOrderSession(conversationId);
  const contextual = await handleOrderFlow({
    conversationId,
    message: 'Pode ser então, quanto fica?',
    replyContext: {
      sender_type: 'ai',
      message_type: 'text',
      content: 'Para um dia quente como hoje, uma Coca-Cola gelada de 2L seria uma ótima pedida! 🥤',
    },
  });
  assert.equal(contextual.source, 'pedido_referencia_contextual', 'A resposta citada não foi entendida como confirmação.');
  assert.match(contextual.text, /Coca-Cola 2L/);
  assert.match(contextual.text, /R\$\s*14,00/);
  let session = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(conversationId);
  let cart = JSON.parse(session.cart_json);
  assert.equal(cart.length, 1);
  assert.equal(cart[0].name, 'Coca-Cola 2L');

  assert.equal(wantsToCancelEntireOrder('deixa pra lá, cancela meu pedido'), true);
  const cancelPrompt = await handleOrderFlow({ conversationId, message: 'deixa pra lá, cancela meu pedido' });
  assert.equal(cancelPrompt.source, 'pedido_confirmar_cancelamento');
  session = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(conversationId);
  assert.equal(session.stage, 'awaiting_cancel_confirmation');
  assert.equal(session.resume_stage, 'awaiting_items');

  const keep = await handleOrderFlow({ conversationId, message: '2' });
  assert.equal(keep.source, 'pedido_cancelamento_desfeito');
  session = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(conversationId);
  assert.equal(session.stage, 'awaiting_items');

  // Até na confirmação final, responder “não” apenas abre a confirmação de
  // cancelamento; o rascunho nunca é apagado por uma resposta ambígua.
  startOrderSession(conversationId);
  db.prepare(`UPDATE ai_order_sessions SET stage='awaiting_confirmation',cart_json=?,fulfillment_method='pickup',payment_method='Pix' WHERE conversation_id=?`)
    .run(JSON.stringify([{ productId: 1, name: 'X-Burguer', quantity: 1, unitPrice: 18 }]), conversationId);
  const noAtConfirmation = await handleOrderFlow({ conversationId, message: 'não' });
  assert.equal(noAtConfirmation.source, 'pedido_confirmar_cancelamento');
  assert.equal(db.prepare('SELECT stage FROM ai_order_sessions WHERE conversation_id=?').get(conversationId).stage, 'awaiting_cancel_confirmation');
  await handleOrderFlow({ conversationId, message: '2' });

  await handleOrderFlow({ conversationId, message: 'quero cancelar tudo' });
  const cancelled = await handleOrderFlow({ conversationId, message: '1' });
  assert.equal(cancelled.source, 'pedido_cancelado');
  assert.equal(db.prepare('SELECT 1 FROM ai_order_sessions WHERE conversation_id=?').get(conversationId), undefined);

  const incomingSource = require('fs').readFileSync(require('path').join(__dirname, '../src/services/incoming.js'), 'utf8');
  assert.equal(incomingSource.includes('Encaminhei o cancelamento para um atendente'), false, 'Pedido já enviado não deve gerar cancelamento automático.');
  assert.equal(incomingSource.includes('CANCELAMENTO: ${cleanContent}'), false, 'Cancelamento pós-finalização não deve abrir solicitação automática.');

  console.log('Contexto, gírias, vários itens, validação de volume e cancelamento somente no rascunho validados.');
})().finally(() => {
  try { db.close(); } catch { /* melhor esforço */ }
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${DB_PATH}${suffix}`, { force: true }); } catch { /* melhor esforço */ }
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
