require('dotenv').config({ quiet: true });

const fs = require('node:fs');
const path = require('node:path');
const client = String(process.env.DB_CLIENT || process.env.DATABASE_CLIENT || '').trim().toLowerCase();

if (['postgres', 'postgresql', 'pg'].includes(client)) {
  if (String(process.env.RESET_DATABASE_CONFIRM || '').toUpperCase() !== 'SIM') {
    throw new Error('Reset PostgreSQL bloqueado por segurança. Use RESET_DATABASE_CONFIRM=SIM somente se realmente deseja apagar todo o banco.');
  }
  const { PostgreSqlSyncDatabase } = require('../src/database/postgres-sync');
  const database = new PostgreSqlSyncDatabase();
  database.exec('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  database.close();
  require('../src/db').db.close();
  console.log('Banco PostgreSQL recriado e dados iniciais restaurados.');
} else {
  const base = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.resolve(__dirname, '..', 'data', 'atenderbem.sqlite');
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${base}${suffix}`;
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  require('../src/db').db.close();
  console.log(`Banco SQLite recriado em: ${base}`);
}
