'use strict';

const { workerData } = require('node:worker_threads');
const { Client, types } = require('pg');
const { translateSql } = require('./postgres-translate');

const port = workerData.port;
const config = workerData.config || {};
let client = null;
let connecting = null;
let transactionDepth = 0;
const idColumnCache = new Map();

// Mantém o mesmo formato numérico que o SQLite devolvia ao restante do sistema.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(21, (value) => Number(value));
types.setTypeParser(23, (value) => Number(value));
types.setTypeParser(700, (value) => Number(value));
types.setTypeParser(701, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

function clientConfig() {
  const sslEnabled = String(config.ssl || '').toLowerCase();
  const ssl = ['1', 'true', 'require', 'required'].includes(sslEnabled)
    ? { rejectUnauthorized: String(config.sslRejectUnauthorized || '').toLowerCase() === 'true' }
    : undefined;
  if (config.connectionString) {
    return {
      connectionString: config.connectionString,
      ssl,
      statement_timeout: Number(config.statementTimeout || 30000),
      query_timeout: Number(config.queryTimeout || 30000),
      application_name: 'gm-automacao',
    };
  }
  return {
    host: config.host,
    port: Number(config.port || 5432),
    user: config.user,
    password: config.password,
    database: config.database,
    ssl,
    statement_timeout: Number(config.statementTimeout || 30000),
    query_timeout: Number(config.queryTimeout || 30000),
    application_name: 'gm-automacao',
  };
}

async function connect() {
  if (client) return client;
  if (connecting) return connecting;
  connecting = (async () => {
    const next = new Client(clientConfig());
    next.on('error', (error) => {
      console.error('[PostgreSQL] conexão interrompida:', error.message);
      if (client === next) client = null;
      transactionDepth = 0;
    });
    await next.connect();
    await next.query("SET TIME ZONE 'UTC'");
    client = next;
    return next;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

async function closeClient() {
  const current = client;
  client = null;
  transactionDepth = 0;
  if (current) await current.end().catch(() => {});
}

function isConnectionError(error) {
  return ['57P01', '57P02', '57P03', '08000', '08003', '08006', '08001', '08004', '08007', '08P01'].includes(error?.code)
    || /connection|socket|terminat|ECONN|EPIPE/i.test(String(error?.message || ''));
}

async function rawQuery(text, params = [], retry = true) {
  try {
    const active = await connect();
    return await active.query(text, params);
  } catch (error) {
    if (retry && transactionDepth === 0 && isConnectionError(error)) {
      await closeClient();
      return rawQuery(text, params, false);
    }
    throw error;
  }
}

function insertMetadata(text) {
  const match = text.match(/^\s*INSERT\s+INTO\s+([\w".]+)\s*(?:\(([^)]+)\))?/i);
  if (!match) return null;
  const table = String(match[1] || '').replaceAll('"', '').split('.').pop();
  const columns = String(match[2] || '').split(',').map((column) => column.trim().replaceAll('"', '').toLowerCase()).filter(Boolean);
  return { table, explicitId: columns.includes('id') };
}

async function tableHasIdColumn(table) {
  if (!table) return false;
  if (idColumnCache.has(table)) return idColumnCache.get(table);

  // Consulta segura: ao contrário de pg_get_serial_sequence(..., 'id'), esta
  // verificação não gera erro quando a tabela usa user_id ou chave composta.
  // Isso é importante dentro de BEGIN/COMMIT, pois qualquer erro no PostgreSQL
  // marca toda a transação como abortada (25P02).
  const found = await rawQuery(`
    SELECT 1 AS found
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
      AND column_name = 'id'
    LIMIT 1
  `, [table], false);
  const hasId = Boolean(found.rows?.length);
  idColumnCache.set(table, hasId);
  return hasId;
}

function appendReturningId(text) {
  const clean = String(text || '').trim().replace(/;\s*$/, '');
  return `${clean} RETURNING id`;
}

async function execute(message) {
  if (message.action === 'init') {
    await connect();
    return { ok: true, database: config.database || 'postgres' };
  }
  if (message.action === 'close') {
    await closeClient();
    return { ok: true };
  }

  const original = String(message.sql || '').trim();
  const schema = message.action === 'exec' && /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(original);
  let text = translateSql(original, { schema });
  const params = Array.isArray(message.params) ? message.params : [];
  const inserted = message.action === 'run' && /^INSERT\b/i.test(text);
  let expectsReturnedId = false;

  if (inserted && !/\bRETURNING\b/i.test(text)) {
    const metadata = insertMetadata(text);
    if (metadata && !metadata.explicitId && await tableHasIdColumn(metadata.table)) {
      text = appendReturningId(text);
      expectsReturnedId = true;
    }
  }

  if (/^BEGIN\b/i.test(text)) transactionDepth += 1;
  try {
    const result = await rawQuery(text, params);
    if (/^(COMMIT|ROLLBACK)\b/i.test(text)) transactionDepth = Math.max(0, transactionDepth - 1);

    if (message.action === 'get') return result.rows?.[0];
    if (message.action === 'all') return result.rows || [];
    if (message.action === 'run') {
      return {
        changes: Number(result.rowCount || 0),
        lastInsertRowid: expectsReturnedId ? (result.rows?.[0]?.id ?? null) : null,
      };
    }
    return { changes: Number(result.rowCount || 0) };
  } catch (error) {
    if (/^(COMMIT|ROLLBACK)\b/i.test(text)) transactionDepth = Math.max(0, transactionDepth - 1);
    error.translatedSql = text;
    throw error;
  }
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    code: error?.code,
    detail: error?.detail,
    constraint: error?.constraint,
    table: error?.table,
    column: error?.column,
    translatedSql: error?.translatedSql,
    stack: error?.stack,
  };
}

port.on('message', async (message) => {
  const signal = new Int32Array(message.signalBuffer);
  try {
    const value = await execute(message);
    port.postMessage({ id: message.id, ok: true, value });
  } catch (error) {
    port.postMessage({ id: message.id, ok: false, error: serializeError(error) });
  } finally {
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0, 1);
  }
});
port.start();
