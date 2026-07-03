const fs = require('node:fs');
const path = require('node:path');

const { db, DB_PATH, nowIso } = require('../src/db');

const operationalTables = [
  'notification_reads',
  'notifications',
  'message_hidden_users',
  'message_reactions',
  'conversation_wait_alerts',
  'conversation_transfers',
  'order_change_requests',
  'satisfaction_responses',
  'table_service_requests',
  'table_payments',
  'table_members',
  'table_tabs',
  'website_checkout_sessions',
  'lunch_order_sessions',
  'ai_order_sessions',
  'fiscal_documents',
  'order_items',
  'orders',
  'messages',
  'conversations',
  'contacts',
  'internal_messages',
  'crm_opportunities',
  'tasks',
  'tickets',
  'campaigns',
  'webhook_events',
  'audit_logs',
  'user_sessions',
];


function clearIncomingMediaFiles() {
  const mediaRoot = path.resolve(__dirname, '..', 'public', 'uploads', 'messages');
  const publicRoot = path.resolve(__dirname, '..', 'public');
  if (!mediaRoot.startsWith(`${publicRoot}${path.sep}`)) throw new Error('Caminho de mídias inválido.');
  fs.rmSync(mediaRoot, { recursive: true, force: true });
  fs.mkdirSync(mediaRoot, { recursive: true });
  fs.writeFileSync(path.join(mediaRoot, '.gitkeep'), '');
}

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

try {
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
  for (const table of operationalTables) {
    if (tableExists(table)) db.exec(`DELETE FROM \"${table}\";`);
  }

  if (tableExists('restaurant_tables')) {
    db.prepare("UPDATE restaurant_tables SET status='free',updated_at=?").run(nowIso());
  }
  if (tableExists('users')) {
    db.prepare("UPDATE users SET status='offline',pause_reason='',last_seen_at=NULL,last_activity_at=NULL").run();
  }
  if (tableExists('whatsapp_instances')) {
    db.prepare("UPDATE whatsapp_instances SET status='disconnected',phone='',updated_at=?").run(nowIso());
  }

  if (tableExists('sqlite_sequence')) {
    const placeholders = operationalTables.map(() => '?').join(',');
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...operationalTables);
  }

  db.exec('COMMIT; PRAGMA foreign_keys=ON;');
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* banco pode não estar em WAL */ }
  try { db.exec('VACUUM;'); } catch { /* compactação é apenas uma melhoria */ }
  clearIncomingMediaFiles();
  console.log(`Dados operacionais e mídias recebidas removidos com sucesso: ${DB_PATH}`);
} catch (error) {
  try { db.exec('ROLLBACK; PRAGMA foreign_keys=ON;'); } catch { /* melhor esforço */ }
  console.error(error);
  process.exitCode = 1;
}
