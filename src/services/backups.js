const fs = require('node:fs');
const path = require('node:path');
const { db, DB_PATH, DB_TYPE, nowIso } = require('../db');

const BACKUP_DIR = process.env.BACKUP_DIR ? path.resolve(process.env.BACKUP_DIR) : path.resolve(__dirname, '..', '..', 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

function setting(key, fallback) {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
}

function safeName(name) {
  return path.basename(String(name || '')).replace(/[^a-zA-Z0-9_.-]/g, '');
}

function backupPattern(name) {
  return /^gm-automacao-\d{8}-\d{6}\.(sqlite|postgres\.json)$/.test(name);
}

function listBackups() {
  return fs.readdirSync(BACKUP_DIR)
    .filter(backupPattern)
    .map((name) => {
      const filePath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(filePath);
      return { name, size: stat.size, created_at: stat.birthtime.toISOString(), modified_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
}

function pruneBackups() {
  const retentionDays = Math.max(3, Math.min(90, Number(setting('backup_retention_days', '14')) || 14));
  const limit = Date.now() - retentionDays * 86400000;
  const rows = listBackups();
  for (const row of rows) {
    if (new Date(row.modified_at).getTime() < limit && rows.indexOf(row) >= 3) {
      fs.rmSync(path.join(BACKUP_DIR, row.name), { force: true });
    }
  }
}

function stampName() {
  const date = new Date();
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
}

function postgresTables() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
}

function createPostgresBackup(reason) {
  const name = `gm-automacao-${stampName()}.postgres.json`;
  const filePath = path.join(BACKUP_DIR, name);
  const tableNames = postgresTables();
  const tables = {};
  db.exec('BEGIN');
  try {
    for (const table of tableNames) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) continue;
      tables[table] = db.prepare(`SELECT * FROM "${table}"`).all();
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* melhor esforço */ }
    throw error;
  }
  fs.writeFileSync(filePath, JSON.stringify({
    format: 'gm-automacao-postgres-backup-v1',
    engine: 'postgresql',
    created_at: nowIso(),
    reason,
    tables,
  }));
  pruneBackups();
  const stat = fs.statSync(filePath);
  return { name, size: stat.size, created_at: nowIso(), reason, database: 'PostgreSQL' };
}

function createSqliteBackup(reason) {
  const name = `gm-automacao-${stampName()}.sqlite`;
  const filePath = path.join(BACKUP_DIR, name);
  const escaped = filePath.replaceAll("'", "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  pruneBackups();
  const stat = fs.statSync(filePath);
  return { name, size: stat.size, created_at: nowIso(), reason, database: path.basename(DB_PATH) };
}

function createBackup(reason = 'manual') {
  return DB_TYPE === 'postgres' ? createPostgresBackup(reason) : createSqliteBackup(reason);
}

function testPostgresBackup(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (parsed?.format !== 'gm-automacao-postgres-backup-v1' || parsed?.engine !== 'postgresql') {
    throw new Error('Formato de backup PostgreSQL não reconhecido.');
  }
  const required = ['users', 'contacts', 'conversations', 'messages', 'orders', 'settings'];
  const tables = Object.keys(parsed.tables || {}).sort();
  const missing = required.filter((name) => !Array.isArray(parsed.tables?.[name]));
  if (missing.length) throw new Error(`Backup incompleto. Tabelas ausentes: ${missing.join(', ')}.`);
  return { ok: true, result: 'ok', tables, checked_at: nowIso(), engine: 'postgresql' };
}

function testSqliteBackup(filePath) {
  const { DatabaseSync } = require('node:sqlite');
  const testDb = new DatabaseSync(filePath, { readOnly: true });
  try {
    const check = testDb.prepare('PRAGMA quick_check').get();
    const result = String(Object.values(check || {})[0] || '');
    const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','contacts','conversations','messages','orders','settings') ORDER BY name").all().map((row) => row.name);
    if (result.toLowerCase() !== 'ok' || tables.length < 6) throw new Error(`O arquivo não passou no teste de integridade: ${result || 'estrutura incompleta'}.`);
    return { ok: true, result, tables, checked_at: nowIso(), engine: 'sqlite' };
  } finally {
    testDb.close();
  }
}

function testBackup(name) {
  const clean = safeName(name);
  const filePath = path.join(BACKUP_DIR, clean);
  if (!clean || !filePath.startsWith(BACKUP_DIR) || !fs.existsSync(filePath) || !backupPattern(clean)) throw new Error('Backup não encontrado.');
  return clean.endsWith('.postgres.json') ? testPostgresBackup(filePath) : testSqliteBackup(filePath);
}

function maybeCreateDailyBackup() {
  if (String(setting('automatic_backups_enabled', 'true')) !== 'true') return null;
  const latest = listBackups()[0];
  if (latest && Date.now() - new Date(latest.modified_at).getTime() < 23 * 3600000) return null;
  return createBackup('automatic');
}

function startBackupScheduler() {
  setTimeout(() => {
    try { maybeCreateDailyBackup(); } catch (error) { console.error('Falha no backup automático:', error.message); }
  }, 12000);
  const timer = setInterval(() => {
    try { maybeCreateDailyBackup(); } catch (error) { console.error('Falha no backup automático:', error.message); }
  }, 60 * 60 * 1000);
  timer.unref?.();
  return timer;
}

module.exports = { BACKUP_DIR, listBackups, createBackup, testBackup, maybeCreateDailyBackup, startBackupScheduler };
