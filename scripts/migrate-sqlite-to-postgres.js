require('dotenv').config({ quiet: true });

const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const client = String(process.env.DB_CLIENT || '').toLowerCase();
if (!['postgres', 'postgresql', 'pg'].includes(client)) {
  throw new Error('Defina DB_CLIENT=postgres no arquivo .env antes de executar a migração.');
}
if (String(process.env.MIGRATE_CONFIRM || '').toUpperCase() !== 'SIM') {
  throw new Error('Migração bloqueada. Execute com MIGRATE_CONFIRM=SIM para confirmar que o banco PostgreSQL de destino será substituído.');
}

const sourcePath = path.resolve(process.env.SOURCE_SQLITE_PATH || path.join(__dirname, '..', 'data', 'atenderbem.sqlite'));
if (!fs.existsSync(sourcePath)) throw new Error(`Banco SQLite de origem não encontrado: ${sourcePath}`);

const source = new DatabaseSync(sourcePath, { readOnly: true });
const { db, DB_TYPE } = require('../src/db');
if (DB_TYPE !== 'postgres') throw new Error('O banco de destino não foi aberto como PostgreSQL.');

function safeIdentifier(value) {
  const name = String(value || '');
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Identificador inválido: ${name}`);
  return `"${name}"`;
}

function sourceTables() {
  return source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row.name);
}

function targetTables() {
  return new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
}

function columns(database, table) {
  return database.prepare(`PRAGMA table_info(${safeIdentifier(table)})`).all().map((row) => row.name);
}

const availableTargets = targetTables();
const tables = sourceTables().filter((table) => availableTargets.has(table));
const targetOnly = [...availableTargets].filter((table) => !tables.includes(table));
const allTargets = [...availableTargets].filter((name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name));

console.log(`Origem SQLite: ${sourcePath}`);
console.log(`Tabelas compatíveis: ${tables.length}`);
if (targetOnly.length) console.log(`Tabelas novas que permanecerão vazias: ${targetOnly.join(', ')}`);

let copiedRows = 0;
db.exec('BEGIN');
try {
  db.exec('SET CONSTRAINTS ALL DEFERRED');
  if (allTargets.length) {
    db.exec(`TRUNCATE TABLE ${allTargets.map(safeIdentifier).join(', ')} RESTART IDENTITY CASCADE`);
  }

  for (const table of tables) {
    const sourceColumns = columns(source, table);
    const destinationColumns = new Set(columns(db, table));
    const shared = sourceColumns.filter((column) => destinationColumns.has(column));
    if (!shared.length) continue;
    const rows = source.prepare(`SELECT ${shared.map(safeIdentifier).join(', ')} FROM ${safeIdentifier(table)}`).all();
    if (!rows.length) {
      console.log(`- ${table}: 0`);
      continue;
    }
    const insert = db.prepare(`INSERT INTO ${safeIdentifier(table)} (${shared.map(safeIdentifier).join(', ')}) VALUES (${shared.map(() => '?').join(', ')})`);
    for (const row of rows) {
      insert.run(...shared.map((column) => row[column]));
      copiedRows += 1;
    }
    console.log(`- ${table}: ${rows.length}`);
  }

  for (const table of tables) {
    const targetColumns = columns(db, table);
    if (!targetColumns.includes('id')) continue;
    const sequence = db.prepare("SELECT pg_get_serial_sequence(?, 'id') AS sequence").get(`public.${table}`)?.sequence;
    if (!sequence) continue;
    const escapedSequence = String(sequence).replaceAll("'", "''");
    db.exec(`SELECT setval('${escapedSequence}', GREATEST((SELECT COALESCE(MAX(id),1) FROM ${safeIdentifier(table)}),1), EXISTS(SELECT 1 FROM ${safeIdentifier(table)}))`);
  }

  db.exec('COMMIT');
  console.log(`Migração concluída: ${copiedRows} registros copiados para o PostgreSQL.`);
} catch (error) {
  try { db.exec('ROLLBACK'); } catch { /* melhor esforço */ }
  throw error;
} finally {
  source.close();
  db.close();
}
