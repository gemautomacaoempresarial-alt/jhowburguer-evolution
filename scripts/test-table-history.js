const assert = require('node:assert/strict');
process.env.DB_CLIENT = 'sqlite';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DB_PATH = path.join(os.tmpdir(), `gm-table-history-${process.pid}-${Date.now()}.sqlite`);

const { db, nowIso, DB_PATH } = require('../src/db');
const tables = require('../src/services/tables');

const stamp = nowIso();

try {
  const contactId = Number(db.prepare("INSERT INTO contacts(name,phone,email,document,notes,tags,created_at,updated_at) VALUES(?,?,?,?,?,'[]',?,?)")
    .run('Cliente Histórico', '553899991111', '', '', '', stamp, stamp).lastInsertRowid);
  const tableId = Number(db.prepare("INSERT INTO restaurant_tables(name,qr_token,status,active,created_at,updated_at) VALUES(?,?,'occupied',1,?,?)")
    .run('Mesa Teste', tables.newQrToken(), stamp, stamp).lastInsertRowid);
  const tabId = Number(db.prepare("INSERT INTO table_tabs(table_id,status,opened_at,notes) VALUES(?,'open',?,'')")
    .run(tableId, stamp).lastInsertRowid);
  const memberId = Number(db.prepare("INSERT INTO table_members(tab_id,device_token,contact_id,display_name,active,joined_at,last_seen_at) VALUES(?,?,?,?,1,?,?)")
    .run(tabId, 'a'.repeat(48), contactId, 'João', stamp, stamp).lastInsertRowid);
  const orderId = Number(db.prepare("INSERT INTO orders(contact_id,status,subtotal,delivery_fee,total,address,payment_method,fulfillment_method,notes,source,created_at,updated_at,table_id,table_tab_id,table_member_id,customer_name) VALUES(?,'delivered',20,0,20,'','pix','table','','website',?,?,?,?,?,?)")
    .run(contactId, stamp, stamp, tableId, tabId, memberId, 'João').lastInsertRowid);

  db.prepare('INSERT INTO order_items(order_id,name,quantity,unit_price,notes) VALUES(?,?,?,?,?)')
    .run(orderId, 'X-Burguer', 1, 20, 'Sem cebola');
  db.prepare("INSERT INTO table_payments(tab_id,member_id,payment_scope,payment_method,amount,note,created_at) VALUES(?,?,?,?,?,'',?)")
    .run(tabId, memberId, 'full', 'pix', 20, stamp);

  tables.releaseTable(tableId, null, 'Teste encerrado');
  const history = tables.tableHistory(tableId, { limit: 10 });

  assert.ok(history, 'O histórico da mesa não foi retornado.');
  assert.equal(history.sessions.length, 1, 'A comanda encerrada não apareceu no histórico.');
  assert.equal(history.sessions[0].orders[0].member_name, 'João', 'O responsável pelo pedido não foi preservado.');
  assert.equal(history.sessions[0].orders[0].items[0].name, 'X-Burguer', 'Os itens do pedido não foram carregados.');
  assert.equal(history.sessions[0].total, 20, 'O total da comanda está incorreto.');
  assert.equal(history.sessions[0].paidTotal, 20, 'O pagamento da comanda está incorreto.');
  assert.equal(history.sessions[0].tab.status, 'closed', 'A comanda não foi encerrada corretamente.');

  console.log('Histórico de mesa validado com pedido, cliente, item, pagamento e fechamento.');
} finally {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${DB_PATH}${suffix}`, { force: true }); } catch { /* melhor esforço */ }
  }
}
