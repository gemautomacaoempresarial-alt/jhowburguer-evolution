const assert = require('node:assert/strict');
process.env.DB_CLIENT = 'sqlite';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sourceDb = path.resolve(__dirname, '..', 'data', 'atenderbem.sqlite');
const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gm-contact-test-'));
const temporaryDb = path.join(temporaryDir, 'test.sqlite');
fs.copyFileSync(sourceDb, temporaryDb);
process.env.DB_PATH = temporaryDb;

async function main() {
  const { db, nowIso } = require('../src/db');
  const { processIncomingMessage } = require('../src/services/incoming');
  const { createOrUpdateContact, reconcileContacts } = require('../src/services/contact-identity');

  db.exec('PRAGMA foreign_keys=OFF');
  for (const table of ['ai_order_sessions','website_checkout_sessions','messages','orders','conversations','contact_aliases','contacts']) {
    try { db.prepare(`DELETE FROM ${table}`).run(); } catch { /* tabela opcional nesta versão */ }
  }
  db.exec('PRAGMA foreign_keys=ON');
  db.prepare("UPDATE whatsapp_instances SET provider='mock',status='connected',config_json='{}'").run();
  db.prepare("UPDATE settings SET value='hybrid' WHERE key='bot_order_mode'").run();
  db.prepare("UPDATE settings SET value='true' WHERE key='website_orders_enabled'").run();

  const product = db.prepare('SELECT * FROM products WHERE active=1 ORDER BY id LIMIT 1').get();
  assert(product, 'O banco de teste não possui produto ativo.');

  const first = await processIncomingMessage({
    phone: '38 9999-3411',
    name: 'Contato do WhatsApp',
    content: `2 ${product.name}`,
    provider: 'mock',
    providerMessageId: `contact-test-${Date.now()}-1`,
  });
  assert.match(first.aiReply.content, /WhatsApp|site/i);

  const choice = await processIncomingMessage({
    phone: '5538999993411',
    name: 'Outro nome do provedor',
    content: '2',
    provider: 'mock',
    providerMessageId: `contact-test-${Date.now()}-2`,
  });
  assert.match(choice.aiReply.content, /\/pedido\/checkout\//);

  const websiteContact = createOrUpdateContact({
    phone: '3899993411',
    name: 'Nome diferente no site',
    source: 'website',
  });
  assert.equal(websiteContact.name, 'Contato do WhatsApp');
  assert.equal(db.prepare('SELECT COUNT(*) total FROM contacts').get().total, 1);
  assert.equal(db.prepare("SELECT COUNT(*) total FROM conversations WHERE status!='closed'").get().total, 1);

  // Simula dados antigos que usavam o telefone brasileiro com o nono dígito em formato diferente.
  const stamp = nowIso();
  const duplicate = db.prepare("INSERT INTO contacts(name,phone,tags,created_at,updated_at,last_seen_at) VALUES(?,?,'[]',?,?,?)")
    .run('Contato duplicado antigo', '553899993411', stamp, stamp, stamp);
  const queue = db.prepare('SELECT id FROM queues WHERE active=1 ORDER BY id LIMIT 1').get();
  db.prepare("UPDATE conversations SET status='closed',closed_at=?").run(stamp);
  db.prepare("INSERT INTO conversations(contact_id,queue_id,status,ai_enabled,protocol,last_message,last_message_at,created_at,hidden) VALUES(?,?,'waiting',1,?,?,?, ?,1)")
    .run(Number(duplicate.lastInsertRowid), queue.id, `TEST-${Date.now()}`, 'Mensagem antiga', stamp, stamp);

  reconcileContacts();
  assert.equal(db.prepare('SELECT COUNT(*) total FROM contacts').get().total, 1);
  assert.equal(db.prepare("SELECT COUNT(*) total FROM conversations WHERE status!='closed'").get().total, 1);

  console.log('Regressão de contatos concluída com sucesso.');
  console.log('Um número = um contato; bot, site e formatos com/sem nono dígito foram consolidados.');
}

main().finally(() => {
  try { fs.rmSync(temporaryDir, { recursive: true, force: true }); } catch {}
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
