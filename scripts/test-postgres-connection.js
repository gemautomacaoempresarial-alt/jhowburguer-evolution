require('dotenv').config({ quiet: true });

const { PostgreSqlSyncDatabase } = require('../src/database/postgres-sync');

const db = new PostgreSqlSyncDatabase();
try {
  const row = db.prepare('SELECT current_database() AS database, current_user AS user_name, version() AS server_version').get();
  console.log('Conexão PostgreSQL realizada com sucesso.');
  console.log(`Banco: ${row.database}`);
  console.log(`Usuário: ${row.user_name}`);
  console.log(`Servidor: ${String(row.server_version || '').split(',')[0]}`);
} finally {
  db.close();
}
