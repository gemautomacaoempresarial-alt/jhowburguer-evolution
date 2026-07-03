const assert = require('node:assert/strict');
const { translateSql } = require('../src/database/postgres-translate');

function translated(sql, options) {
  const output = translateSql(sql, options);
  assert.ok(output, 'A tradução não pode ficar vazia.');
  return output;
}

assert.equal(translated('SELECT * FROM users WHERE id=? AND email=?'), 'SELECT * FROM users WHERE id=$1 AND email=$2');
assert.match(translated('PRAGMA table_info(users)'), /information_schema\.columns/i);
assert.match(translated("SELECT name FROM sqlite_master WHERE type='table' AND name=?"), /information_schema\.tables/i);
assert.match(translated('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)'), /ON CONFLICT DO NOTHING/i);
assert.match(translated('INSERT OR REPLACE INTO notification_reads(notification_id,user_id,read_at) VALUES(?,?,?)'), /ON CONFLICT \(notification_id, user_id\) DO UPDATE/i);
assert.match(translated("DELETE FROM x WHERE datetime(expires_at)<datetime('now','-2 day')"), /CURRENT_TIMESTAMP - INTERVAL '2 day'/i);
assert.match(translated("DELETE FROM conversation_wait_alerts WHERE datetime(notified_at) < datetime('now','-30 day')"), /CAST\(notified_at AS TIMESTAMPTZ\).*CURRENT_TIMESTAMP - INTERVAL '30 day'/i);
assert.match(translated("SELECT json_group_array(json_object('emoji',r.emoji,'user_id',r.user_id,'user_name',rx.name)) FROM reactions r LEFT JOIN users rx ON 1=1"), /json_agg\(json_build_object/i);
assert.match(translated("SELECT GROUP_CONCAT(CAST(oi.quantity AS TEXT)||'x '||oi.name,' • ') FROM order_items oi"), /string_agg/i);
assert.match(translated("SELECT name FROM restaurant_tables ORDER BY name COLLATE NOCASE"), /ORDER BY LOWER\(name\)/i);
assert.match(translated("SELECT AVG((julianday(a)-julianday(b))*86400) FROM x"), /EXTRACT\(EPOCH/i);

const schema = translated(`
CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS children (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (parent_id) REFERENCES parents(id) ON DELETE CASCADE
);
`, { schema: true });
assert.doesNotMatch(schema, /AUTOINCREMENT/i);
assert.match(schema, /id BIGSERIAL PRIMARY KEY/i);
assert.match(schema, /parent_id BIGINT/i);
assert.match(schema, /DOUBLE PRECISION/i);
assert.match(schema, /ALTER TABLE children ADD CONSTRAINT/i);
assert.doesNotMatch(schema, /\?/);

console.log('Tradução SQLite → PostgreSQL validada.');
