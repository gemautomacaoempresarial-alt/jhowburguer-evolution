'use strict';

const path = require('node:path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');

function postgresConfigFromEnv() {
  const connectionString = String(process.env.DATABASE_URL || process.env.POSTGRES_INTERNAL_URL || process.env.POSTGRES_URL || process.env.POSTGRESQL_URL || '').trim();
  const host = String(process.env.PGHOST || process.env.DB_HOST || process.env.POSTGRES_HOST || '').trim();
  const database = String(process.env.PGDATABASE || process.env.DB_NAME || process.env.POSTGRES_DB || process.env.POSTGRES_DATABASE || '').trim();
  const user = String(process.env.PGUSER || process.env.DB_USER || process.env.POSTGRES_USER || '').trim();
  const password = String(process.env.PGPASSWORD || process.env.DB_PASSWORD || process.env.POSTGRES_PASSWORD || '');
  if (!connectionString && (!host || !database || !user)) {
    throw new Error('PostgreSQL não configurado. Informe DATABASE_URL ou PGHOST, PGDATABASE, PGUSER e PGPASSWORD.');
  }
  return {
    connectionString,
    host,
    port: Number(process.env.PGPORT || process.env.DB_PORT || process.env.POSTGRES_PORT || 5432),
    database,
    user,
    password,
    ssl: process.env.PGSSL || process.env.DB_SSL || 'false',
    sslRejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED || 'false',
    statementTimeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 30000),
    queryTimeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 30000),
  };
}

class PostgreSqlSyncDatabase {
  constructor(config = postgresConfigFromEnv()) {
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.sequence = 0;
    this.timeout = Math.max(5000, Number(process.env.DB_SYNC_TIMEOUT_MS || 60000));
    this.closed = false;
    this.worker = new Worker(path.join(__dirname, 'postgres-worker.js'), {
      workerData: { port: port2, config },
      transferList: [port2],
    });
    this.worker.unref();
    this.worker.on('error', (error) => {
      this.workerError = error;
    });
    this._request('init');
  }

  _request(action, sql = '', params = []) {
    if (this.closed && action !== 'close') throw new Error('A conexão PostgreSQL já foi encerrada.');
    if (this.workerError) throw this.workerError;
    const id = ++this.sequence;
    const signalBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
    const signal = new Int32Array(signalBuffer);
    this.port.postMessage({ id, action, sql, params, signalBuffer });
    const waitResult = Atomics.wait(signal, 0, 0, this.timeout);
    if (waitResult === 'timed-out') {
      throw new Error(`Tempo esgotado ao executar consulta PostgreSQL (${this.timeout} ms).`);
    }

    const started = Date.now();
    let packet;
    while (Date.now() - started < 1000) {
      const received = receiveMessageOnPort(this.port)?.message;
      if (!received) {
        Atomics.wait(signal, 0, 1, 1);
        continue;
      }
      if (received.id === id) {
        packet = received;
        break;
      }
    }
    if (!packet) throw new Error('O PostgreSQL concluiu a consulta, mas não devolveu a resposta esperada.');
    if (!packet.ok) {
      const error = new Error(packet.error?.message || 'Falha no PostgreSQL.');
      Object.assign(error, packet.error || {});
      if (error.translatedSql && String(process.env.DB_DEBUG_SQL || '') === 'true') {
        console.error('[PostgreSQL SQL]', error.translatedSql);
      }
      throw error;
    }
    return packet.value;
  }

  prepare(sql) {
    const database = this;
    return {
      get(...params) { return database._request('get', sql, params); },
      all(...params) { return database._request('all', sql, params); },
      run(...params) { return database._request('run', sql, params); },
    };
  }

  exec(sql) {
    return this._request('exec', sql, []);
  }

  close() {
    if (this.closed) return;
    try { this._request('close'); } finally {
      this.closed = true;
      this.port.close();
      this.worker.terminate().catch(() => {});
    }
  }
}

module.exports = { PostgreSqlSyncDatabase, postgresConfigFromEnv };
