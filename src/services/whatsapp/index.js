const { db, nowIso } = require('../../db');
const EvolutionWhatsAppProvider = require('./evolution');
const CloudWhatsAppProvider = require('./cloud');
const MockWhatsAppProvider = require('./mock');
const { encryptConfig, decryptConfig } = require('../secrets');

function safeJson(value, fallback = {}) {
  try { return decryptConfig(JSON.parse(value || '{}')); } catch { return fallback; }
}

function getPrimaryInstance() {
  return db.prepare('SELECT * FROM whatsapp_instances ORDER BY id LIMIT 1').get();
}

function publicInstance(row) {
  if (!row) return null;
  const config = safeJson(row.config_json);
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    status: row.status,
    phone: row.phone,
    updated_at: row.updated_at,
    config: {
      baseUrl: config.baseUrl || '',
      instanceName: config.instanceName || '',
      publicBaseUrl: config.publicBaseUrl || '',
      webhookProtected: Boolean(config.webhookSecret),
      apiKeyConfigured: Boolean(config.apiKey),
    },
  };
}

function providerFor(row = getPrimaryInstance()) {
  if (!row) throw new Error('Nenhuma instância de WhatsApp cadastrada.');
  const config = safeJson(row.config_json);
  if (row.provider === 'evolution') return new EvolutionWhatsAppProvider(config);
  if (row.provider === 'cloud') return new CloudWhatsAppProvider(config);
  return new MockWhatsAppProvider(config);
}


function normalizedConnectionStatus(payload = {}) {
  const raw = String(
    payload?.instance?.state ||
    payload?.instance?.status ||
    payload?.response?.instance?.state ||
    payload?.response?.state ||
    payload?.data?.instance?.state ||
    payload?.data?.state ||
    payload?.state ||
    payload?.status ||
    ''
  ).toLowerCase();
  if (['open', 'connected', 'online'].includes(raw)) return 'connected';
  if (['connecting', 'opening', 'starting'].includes(raw)) return 'connecting';
  return 'disconnected';
}

async function ensureConnected(row = getPrimaryInstance()) {
  if (!row) throw new Error('Nenhuma instância de WhatsApp cadastrada.');
  if (row.provider === 'mock') return row;
  if (row.status === 'connected') return row;
  const provider = providerFor(row);
  if (typeof provider.connectionState === 'function') {
    try {
      const state = await provider.connectionState();
      const status = normalizedConnectionStatus(state);
      const updated = updateInstance(row.id, { status });
      if (status === 'connected') return updated;
    } catch {
      // Mantém a mensagem amigável abaixo. A tela de conexão continua
      // responsável por exibir detalhes de configuração quando necessário.
    }
  }
  throw new Error('O WhatsApp não está conectado.');
}

function markDisconnectedOnProviderError(row, error) {
  const message = String(error?.message || error || '');
  if (!row || row.provider === 'mock') return;
  if (/not connected|connection closed|logged out|disconnected|socket.*closed|connection.*lost|não.*conectad/i.test(message)) {
    try { updateInstance(row.id, { status: 'disconnected' }); } catch { /* melhor esforço */ }
  }
}

async function withConnectedProvider(callback) {
  const row = await ensureConnected(getPrimaryInstance());
  const provider = providerFor(row);
  try {
    const result = await callback(provider, row);
    if (row.status !== 'connected') updateInstance(row.id, { status: 'connected' });
    return result;
  } catch (error) {
    markDisconnectedOnProviderError(row, error);
    throw error;
  }
}

function updateInstance(id, patch = {}) {
  const existing = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
  if (!existing) throw new Error('Instância não encontrada.');
  const config = { ...safeJson(existing.config_json), ...(patch.config || {}) };
  db.prepare(`
    UPDATE whatsapp_instances
    SET name=?, provider=?, status=?, phone=?, config_json=?, updated_at=?
    WHERE id=?
  `).run(
    patch.name ?? existing.name,
    patch.provider ?? existing.provider,
    patch.status ?? existing.status,
    patch.phone ?? existing.phone,
    JSON.stringify(encryptConfig(config)),
    nowIso(),
    id
  );
  return db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(id);
}


function protectStoredCredentials() {
  const rows = db.prepare('SELECT id,config_json FROM whatsapp_instances').all();
  for (const row of rows) {
    const raw = String(row.config_json || '');
    if (/enc:v1:/.test(raw)) continue;
    try { updateInstance(row.id, { config: safeJson(raw) }); } catch { /* preserva configuração inválida para diagnóstico */ }
  }
}

function configuredEvolutionDefaults() {
  const publicBaseUrl = firstPublicOrigin(
    process.env.APP_PUBLIC_URL ||
    process.env.APP_ORIGIN ||
    'https://jhowburgueratender.discloud.app'
  );

  return {
    // Usa a VLAN privada da Discloud por padrão para o painel falar com a Evolution.
    baseUrl: String(
      process.env.EVOLUTION_BASE_URL ||
      process.env.EVOLUTION_INTERNAL_URL ||
      'http://jhowburguer-evolution:8080'
    ).trim().replace(/\/$/, ''),

    // Aceita o nome recomendado e também o nome usado pela própria Evolution.
    apiKey: String(
      process.env.EVOLUTION_API_KEY ||
      process.env.AUTHENTICATION_API_KEY ||
      ''
    ).trim(),

    instanceName: String(
      process.env.EVOLUTION_INSTANCE ||
      'jhowburguer'
    ).trim(),

    publicBaseUrl,

    // A Evolution entrega mensagens ao painel pela VLAN, evitando ENOTFOUND no domínio público.
    webhookBaseUrl: firstPublicOrigin(
      process.env.EVOLUTION_WEBHOOK_BASE_URL ||
      'http://jhowburguer-atender:8080'
    ),
  };
}

function repairPrimaryEvolutionConfiguration() {
  const defaults = configuredEvolutionDefaults();

  if (!defaults.baseUrl || !defaults.apiKey || !defaults.instanceName || !defaults.publicBaseUrl || !defaults.webhookBaseUrl) {
    const missing = [];
    if (!defaults.baseUrl) missing.push('EVOLUTION_BASE_URL');
    if (!defaults.apiKey) missing.push('EVOLUTION_API_KEY');
    if (!defaults.instanceName) missing.push('EVOLUTION_INSTANCE');
    if (!defaults.publicBaseUrl) missing.push('APP_PUBLIC_URL');
    if (!defaults.webhookBaseUrl) missing.push('EVOLUTION_WEBHOOK_BASE_URL');
    console.warn(`[WhatsApp] Autoconfiguração não aplicada. Variáveis ausentes: ${missing.join(', ')}`);
    return { repaired: false, reason: 'missing_environment', missing };
  }

  let row = getPrimaryInstance();
  const stamp = nowIso();

  if (!row) {
    const webhookSecret = require('node:crypto').randomBytes(18).toString('hex');
    const config = encryptConfig({
      ...defaults,
      webhookSecret,
      instanceToken: '',
    });

    const inserted = db.prepare(`
      INSERT INTO whatsapp_instances
        (name, provider, status, phone, config_json, created_at, updated_at)
      VALUES (?, 'evolution', 'disconnected', '', ?, ?, ?)
    `).run(
      'WhatsApp principal',
      JSON.stringify(config),
      stamp,
      stamp
    );

    row = db.prepare('SELECT * FROM whatsapp_instances WHERE id=?').get(Number(inserted.lastInsertRowid));
  } else {
    const current = safeJson(row.config_json);
    const webhookSecret = String(current.webhookSecret || '').trim()
      || require('node:crypto').randomBytes(18).toString('hex');

    row = updateInstance(row.id, {
      name: 'WhatsApp principal',
      provider: 'evolution',
      config: {
        ...current,
        ...defaults,
        webhookSecret,
        instanceToken: current.instanceToken || '',
      },
    });
  }

  db.prepare(`
    INSERT INTO settings (key,value,updated_at)
    VALUES ('whatsapp_mode','evolution',?)
    ON CONFLICT(key) DO UPDATE
    SET value='evolution',updated_at=excluded.updated_at
  `).run(stamp);

  db.prepare(`
    INSERT INTO settings (key,value,updated_at)
    VALUES ('public_base_url',?,?)
    ON CONFLICT(key) DO UPDATE
    SET value=excluded.value,updated_at=excluded.updated_at
  `).run(defaults.publicBaseUrl, stamp);

  console.log(
    `[WhatsApp] Configuração da Evolution restaurada: ${defaults.baseUrl} | instância ${defaults.instanceName}`
  );
  console.log(
    `[WhatsApp] Webhook privado preparado: ${defaults.webhookBaseUrl}/api/webhooks/evolution/***`
  );

  return { repaired: true, row };
}


function normalizeOutboundPhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  // O sistema é voltado ao Brasil: quando o usuário informa apenas DDD + número,
  // acrescenta o DDI 55 sem alterar números internacionais já completos.
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

async function resolvePhone(phone) {
  const digits = normalizeOutboundPhone(phone);
  if (!digits) return { exists: false, phone: '', jid: '' };
  const row = getPrimaryInstance();
  if (!row || row.provider === 'mock') return { exists: true, phone: digits, jid: '' };
  return withConnectedProvider(async (provider) => {
    if (typeof provider.checkNumber !== 'function') return { exists: true, phone: digits, jid: '' };
    const result = await provider.checkNumber(digits);
    return { ...result, phone: normalizeOutboundPhone(result.phone || digits) };
  });
}

async function sendText({ phone, text, quotedMessageId = '', delay = 0 }) {
  const row = getPrimaryInstance();
  if (!row || row.provider === 'mock') return { mock: true };
  return withConnectedProvider((provider) => provider.sendText({ phone: normalizeOutboundPhone(phone), text, quotedMessageId, delay }));
}

async function sendMedia(payload) {
  const row = getPrimaryInstance();
  if (!row || row.provider === 'mock') return { mock: true };
  return withConnectedProvider((provider) => {
    if (typeof provider.sendMedia !== 'function') throw new Error('Esta conexão não oferece envio de anexos.');
    return provider.sendMedia(payload);
  });
}

async function sendAudio(payload) {
  const row = getPrimaryInstance();
  if (!row || row.provider === 'mock') return { mock: true };
  return withConnectedProvider((provider) => {
    if (typeof provider.sendAudio !== 'function') throw new Error('Esta conexão não oferece envio de áudio.');
    return provider.sendAudio(payload);
  });
}

async function sendSticker(payload) {
  const row = getPrimaryInstance();
  if (!row || row.provider === 'mock') return { mock: true };
  return withConnectedProvider((provider) => {
    if (typeof provider.sendSticker !== 'function') throw new Error('Esta conexão não oferece envio de figurinhas.');
    return provider.sendSticker(payload);
  });
}

async function deleteMessageForEveryone(payload) {
  const row = getPrimaryInstance();
  if (!row) throw new Error('Nenhuma instância de WhatsApp cadastrada.');
  if (row.provider === 'mock') return providerFor(row).deleteMessageForEveryone(payload);
  return withConnectedProvider((provider) => {
    if (typeof provider.deleteMessageForEveryone !== 'function') throw new Error('Esta conexão não permite apagar mensagens para todos.');
    return provider.deleteMessageForEveryone(payload);
  });
}

async function getMediaBase64(message) {
  const row = getPrimaryInstance();
  if (!row || row.provider !== 'evolution') return null;
  const provider = providerFor(row);
  if (typeof provider.getMediaBase64 !== 'function') return null;
  return provider.getMediaBase64(message);
}


let webhookMaintenancePromise = null;

function firstPublicOrigin(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .find((item) => /^https?:\/\//i.test(item)) || '';
}

async function ensurePrimaryEvolutionWebhook() {
  if (webhookMaintenancePromise) return webhookMaintenancePromise;
  webhookMaintenancePromise = (async () => {
    let row = getPrimaryInstance();
    if (!row || row.provider !== 'evolution') return { skipped: true, reason: 'provider' };

    let config = safeJson(row.config_json);
    let publicBaseUrl = firstPublicOrigin(
      config.publicBaseUrl ||
      db.prepare("SELECT value FROM settings WHERE key='public_base_url'").get()?.value ||
      process.env.APP_PUBLIC_URL ||
      process.env.APP_ORIGIN ||
      'https://jhowburgueratender.discloud.app'
    );
    if (!publicBaseUrl) return { skipped: true, reason: 'public_base_url' };

    const webhookBaseUrl = firstPublicOrigin(
      config.webhookBaseUrl ||
      process.env.EVOLUTION_WEBHOOK_BASE_URL ||
      'http://jhowburguer-atender:8080'
    );
    if (!webhookBaseUrl) return { skipped: true, reason: 'webhook_base_url' };

    let webhookSecret = String(config.webhookSecret || '').trim();
    if (!webhookSecret) {
      webhookSecret = require('node:crypto').randomBytes(18).toString('hex');
      row = updateInstance(row.id, { config: { publicBaseUrl, webhookBaseUrl, webhookSecret } });
      config = safeJson(row.config_json);
    } else if (
      config.publicBaseUrl !== publicBaseUrl ||
      config.webhookBaseUrl !== webhookBaseUrl
    ) {
      row = updateInstance(row.id, { config: { publicBaseUrl, webhookBaseUrl } });
      config = safeJson(row.config_json);
    }

    const expectedUrl = `${webhookBaseUrl}/api/webhooks/evolution/${webhookSecret}`;
    const provider = providerFor(row);
    let activeUrl = '';
    try {
      const current = await provider.findWebhook();
      activeUrl = provider.webhookUrlFrom(current);
    } catch {
      // Se a consulta falhar, tentamos reaplicar abaixo.
    }
    if (activeUrl !== expectedUrl) await provider.setWebhook(expectedUrl);

    try {
      const state = await provider.connectionState();
      const status = normalizedConnectionStatus(state);
      if (status !== row.status) row = updateInstance(row.id, { status });
    } catch {
      // O webhook pode ser confirmado mesmo durante uma breve indisponibilidade do estado.
    }

    console.log(`[WhatsApp] Webhook da Evolution confirmado em ${webhookBaseUrl}/api/webhooks/evolution/***`);
    return { success: true, publicBaseUrl, webhookBaseUrl };
  })();
  try {
    return await webhookMaintenancePromise;
  } finally {
    webhookMaintenancePromise = null;
  }
}

module.exports = {
  safeJson,
  getPrimaryInstance,
  publicInstance,
  providerFor,
  updateInstance,
  protectStoredCredentials,
  repairPrimaryEvolutionConfiguration,
  normalizeOutboundPhone,
  resolvePhone,
  sendText,
  sendMedia,
  sendAudio,
  sendSticker,
  deleteMessageForEveryone,
  getMediaBase64,
  ensurePrimaryEvolutionWebhook,
};
