const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DB_CLIENT = 'sqlite';
process.env.DB_PATH = path.join(os.tmpdir(), `gm-media-replies-${process.pid}-${Date.now()}.sqlite`);
delete process.env.GEMINI_API_KEY;

const { db, DB_PATH, nowIso, insertMessage } = require('../src/db');
const { processIncomingMessage } = require('../src/services/incoming');

(async () => {
  const stamp = nowIso();
  const contactId = Number(db.prepare(`INSERT INTO contacts
    (name,phone,email,document,notes,tags,created_at,updated_at)
    VALUES (?,?,?,?,?,'[]',?,?)`)
    .run('Cliente Mídia', '553899990088', '', '', '', stamp, stamp).lastInsertRowid);
  const queueId = Number(db.prepare("SELECT id FROM queues WHERE name='Atendimento' LIMIT 1").get().id);
  const conversationId = Number(db.prepare(`INSERT INTO conversations
    (contact_id,queue_id,status,channel,ai_enabled,unread_count,priority,protocol,last_message,last_message_at,created_at,hidden)
    VALUES (?,?,'open','whatsapp',0,0,'normal',?,?,?, ?,0)`)
    .run(contactId, queueId, `ATD-MEDIA-${Date.now()}`, '', stamp, stamp).lastInsertRowid);

  const sourceId = insertMessage({
    conversationId,
    senderType: 'agent',
    content: 'Pode enviar a foto por aqui.',
    providerMessageId: 'provider-source-media-test',
    deliveryStatus: 'sent',
  });

  const result = await processIncomingMessage({
    phone: '553899990088',
    name: 'Cliente Mídia',
    content: '[Imagem recebida]',
    provider: 'mock',
    providerMessageId: 'provider-incoming-media-test',
    messageType: 'image',
    mediaUrl: '/uploads/messages/2026-07/imagem-teste.jpg',
    mimeType: 'image/jpeg',
    fileName: 'comprovante.jpg',
    replyToProviderMessageId: 'provider-source-media-test',
  });

  assert.equal(result.duplicate, false);
  const message = db.prepare('SELECT * FROM messages WHERE provider_message_id=?').get('provider-incoming-media-test');
  assert.equal(message.message_type, 'image');
  assert.equal(message.media_url, '/uploads/messages/2026-07/imagem-teste.jpg');
  assert.equal(message.mime_type, 'image/jpeg');
  assert.equal(message.file_name, 'comprovante.jpg');
  assert.equal(Number(message.reply_to_message_id), sourceId);
  assert.equal(result.customerMessage.reply_content, 'Pode enviar a foto por aqui.');

  const appSource = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  assert.match(appSource, /message-media-download/);
  assert.match(appSource, /message-quote/);
  assert.match(appSource, /data-open-media/);
  assert.match(appSource, /message_type==='sticker'/);
  assert.match(appSource, /message_type==='video'/);

  console.log('Mídias recebidas, download e respostas citadas validados.');
})().finally(() => {
  try { db.close(); } catch { /* melhor esforço */ }
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${DB_PATH}${suffix}`, { force: true }); } catch { /* melhor esforço */ }
  }
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
