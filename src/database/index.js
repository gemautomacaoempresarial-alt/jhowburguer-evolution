'use strict';

const path = require('node:path');
const fs = require('node:fs');

function selectedClient() {
  const explicit = String(process.env.DB_CLIENT || process.env.DATABASE_CLIENT || '').trim().toLowerCase();
  if (explicit) return explicit;
  if (process.env.DATABASE_URL || process.env.POSTGRES_INTERNAL_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || process.env.PGHOST || process.env.DB_HOST || process.env.POSTGRES_HOST) return 'postgres';
  return 'sqlite';
}

function createDatabase() {
  const client = selectedClient();
  if (['postgres', 'postgresql', 'pg'].includes(client)) {
    const { PostgreSqlSyncDatabase } = require('./postgres-sync');
    return {
      db: new PostgreSqlSyncDatabase(),
      DB_PATH: 'PostgreSQL remoto',
      DB_TYPE: 'postgres',
    };
  }
  if (client !== 'sqlite') throw new Error(`DB_CLIENT não suportado: ${client}. Use sqlite ou postgres.`);

  const { DatabaseSync } = require('node:sqlite');
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  const dbPath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(dataDir, 'atenderbem.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  return { db, DB_PATH: dbPath, DB_TYPE: 'sqlite' };
}

module.exports = { createDatabase, selectedClient };
