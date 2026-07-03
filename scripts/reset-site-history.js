require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');

const { db, DB_PATH, DB_TYPE, nowIso } = require('../src/db');

if (String(process.env.RESET_OPERATIONAL_DATA_CONFIRM || '').trim().toUpperCase() !== 'SIM') {
  throw new Error('Reset bloqueado por segurança. Execute com RESET_OPERATIONAL_DATA_CONFIRM=SIM.');
}

// Ordem pensada para PostgreSQL: primeiro as tabelas dependentes e, por último,
// conversas e contatos. Configurações, usuários, produtos e a Evolution ficam intactos.
const operationalTables = [
  'notification_reads',
  'notifications',
  'message_hidden_users',
  'message_reactions',
  'conversation_wait_alerts',
  'conversation_transfers',
  'order_change_requests',
  'satisfaction_responses',
  'crm_opportunities',
  'tickets',
  'tasks',
  'table_service_requests',
  'table_payments',
  'table_members',
  'table_tabs',
  'website_checkout_sessions',
  'bot_order_mode_sessions',
  'lunch_order_sessions',
  'ai_order_sessions',
  'fiscal_documents',
  'order_items',
  'orders',
  'contact_phone_aliases',
  'message_hidden_users',
  'messages',
  'conversations',
  'contacts',
  'internal_messages',
  'webhook_events',
  'audit_logs',
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
  if (DB_TYPE === 'postgres') {
    return Boolean(db.prepare("SELECT 1 AS found FROM information_schema.tables WHERE table_schema='public' AND table_name=? LIMIT 1").get(name));
  }
  return Boolean(db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

const removed = [];
try {
  if (DB_TYPE === 'sqlite') db.exec('PRAGMA foreign_keys=OFF;');
  db.exec('BEGIN');

  for (const table of [...new Set(operationalTables)]) {
    if (!tableExists(table)) continue;
    const result = db.prepare(`DELETE FROM \"${table}\"`).run();
    removed.push({ table, rows: Number(result?.changes || result?.rowCount || 0) });
  }

  if (tableExists('restaurant_tables')) {
    db.prepare("UPDATE restaurant_tables SET status='free',updated_at=?").run(nowIso());
  }

  if (DB_TYPE === 'sqlite' && tableExists('sqlite_sequence')) {
    const existing = [...new Set(operationalTables)].filter((table) => tableExists(table));
    if (existing.length) {
      const placeholders = existing.map(() => '?').join(',');
      db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...existing);
    }
  }

  db.exec('COMMIT');
  if (DB_TYPE === 'sqlite') {
    db.exec('PRAGMA foreign_keys=ON;');
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* opcional */ }
    try { db.exec('VACUUM;'); } catch { /* opcional */ }
  }

  clearIncomingMediaFiles();
  console.log('Histórico operacional e mídias recebidas removidos com sucesso.');
  console.log(`Banco: ${DB_TYPE === 'postgres' ? 'PostgreSQL' : DB_PATH}`);
  for (const item of removed) console.log(`- ${item.table}: ${item.rows} registro(s)`);
  console.log('Configurações, usuários, produtos, filas e conexão da Evolution foram preservados.');
  console.log('Reinicie a aplicação para atualizar todas as telas conectadas.');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch { /* melhor esforço */ }
  if (DB_TYPE === 'sqlite') {
    try { db.exec('PRAGMA foreign_keys=ON;'); } catch { /* melhor esforço */ }
  }
  console.error('Não foi possível limpar o histórico:', error.message);
  process.exitCode = 1;
} finally {
  try { db.close(); } catch { /* melhor esforço */ }
}
