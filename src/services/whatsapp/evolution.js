const crypto = require('node:crypto');

function isMissingInstanceError(error) {
  const message = String(error?.message || error || '');
  return /does not exist|not found|n[aã]o existe|n[aã]o encontrad|404/i.test(message);
}

/**
 * Adaptador da Evolution API v2.
 * A Evolution API deve estar instalada separadamente e acessível pela URL configurada.
 */
class EvolutionWhatsAppProvider {
  constructor(config = {}) {
    this.baseUrl = String(
      config.baseUrl ||
      process.env.EVOLUTION_BASE_URL ||
      process.env.EVOLUTION_INTERNAL_URL ||
      'http://jhowburguer-evolution:8080'
    ).trim().replace(/\/$/, '');

    this.apiKey = String(
      config.apiKey ||
      process.env.EVOLUTION_API_KEY ||
      process.env.AUTHENTICATION_API_KEY ||
      ''
    ).trim();

    this.instance = String(
      config.instanceName ||
      config.instance ||
      process.env.EVOLUTION_INSTANCE ||
      'jhowburguer'
    ).trim();

    this.instanceToken = String(config.instanceToken || '').trim();
  }

  assertConfigured() {
    if (!this.baseUrl || !this.apiKey || !this.instance) {
      throw new Error('Preencha a URL, a chave da Evolution API e o nome da instância.');
    }
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      try {
        const host = new URL(this.baseUrl).hostname.toLowerCase();
        if (['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(host)) {
          throw new Error('Na Discloud, a URL da Evolution API não pode ser localhost. O localhost aponta para o próprio painel. Hospede a Evolution API em outra aplicação e informe a URL ou o hostname privado dela.');
        }
      } catch (error) {
        if (/Na Discloud/.test(String(error?.message || ''))) throw error;
        throw new Error('A URL da Evolution API é inválida. Informe uma URL completa, por exemplo https://evolution.seudominio.com ou http://hostname-interno:8080.');
      }
    }
  }

  async request(path, options = {}) {
    this.assertConfigured();
    const {
      timeoutMs = 30000,
      operation = 'responder à solicitação',
      ...fetchOptions
    } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey,
          ...(fetchOptions.headers || {}),
        },
      });
      const text = await response.text();
      let data = {};
      if (text) {
        try { data = JSON.parse(text); } catch { data = { message: text }; }
      }
      if (!response.ok) {
        const rawMessage = data?.response?.message ?? data?.message ?? data?.error ?? `Evolution API respondeu com HTTP ${response.status}.`;
        const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);
        if (response.status === 401 || response.status === 403 || /unauthorized|invalid api.?key|forbidden/i.test(message)) {
          throw new Error('A chave salva no painel não corresponde à chave ativa da Evolution API. Na instalação local, execute CORRIGIR_CONEXAO_LOCAL.bat e depois use o botão “Aplicar configuração local” no painel.');
        }
        throw new Error(message);
      }
      return data;
    } catch (error) {
      if (error.name === 'AbortError') {
        const seconds = Math.ceil(timeoutMs / 1000);
        throw new Error(`A Evolution API demorou mais de ${seconds} segundos para ${operation}. Ela pode ainda estar iniciando. Execute DIAGNOSTICO_EVOLUTION.bat para conferir os containers e os logs.`);
      }
      const code = error?.cause?.code || '';
      if (['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) {
        if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
          throw new Error(`Não foi possível acessar a Evolution API em ${this.baseUrl}. Na Discloud, use a URL pública da Evolution ou o hostname privado da aplicação dela na VLAN; localhost não funciona para outro serviço.`);
        }
        throw new Error('Não foi possível acessar a Evolution API. Confira se o Docker está aberto, se os containers estão em execução e se a URL é http://localhost:8080.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async fetchInstances() {
    return this.request(`/instance/fetchInstances?instanceName=${encodeURIComponent(this.instance)}`, {
      timeoutMs: 30000,
      operation: 'consultar as instâncias',
    });
  }

  async ensureInstance({ webhookUrl = '' } = {}) {
    const found = await this.fetchInstances().catch((error) => {
      if (isMissingInstanceError(error)) return [];
      throw error;
    });
    const list = Array.isArray(found)
      ? found
      : Array.isArray(found?.instances)
        ? found.instances
        : found?.response
          ? [found.response]
          : [];
    const existing = list.find((item) => {
      const name = item.instance?.instanceName || item.instanceName || item.name;
      return name === this.instance;
    });
    if (existing) return { created: false, data: existing };

    const token = this.instanceToken || crypto.randomUUID();
    const body = {
      instanceName: this.instance,
      integration: 'WHATSAPP-BAILEYS',
      token,
      qrcode: true,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
    };
    if (webhookUrl) {
      body.webhook = {
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      };
    }
    const data = await this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 120000,
      operation: 'criar a instância e preparar o QR Code',
    });
    return { created: true, data, token };
  }

  async connect() {
    return this.request(`/instance/connect/${encodeURIComponent(this.instance)}`, {
      timeoutMs: 120000,
      operation: 'gerar o QR Code',
    });
  }

  async connectionState() {
    return this.request(`/instance/connectionState/${encodeURIComponent(this.instance)}`, {
      timeoutMs: 30000,
      operation: 'verificar o estado da conexão',
    });
  }

  async logout() {
    return this.request(`/instance/logout/${encodeURIComponent(this.instance)}`, {
      method: 'DELETE',
      timeoutMs: 30000,
      operation: 'desconectar a instância',
    });
  }

  async findWebhook() {
    return this.request(`/webhook/find/${encodeURIComponent(this.instance)}`, {
      timeoutMs: 30000,
      operation: 'consultar o webhook configurado',
    });
  }

  webhookUrlFrom(data) {
    return String(
      data?.url ||
      data?.webhook?.url ||
      data?.webhook?.webhook?.url ||
      data?.response?.url ||
      ''
    ).trim().replace(/\/$/, '');
  }

  async setWebhook(url) {
    if (!url) throw new Error('Informe a URL de retorno do sistema antes de configurar o webhook.');

    const normalizedUrl = String(url).trim().replace(/\/$/, '');
    const webhook = {
      enabled: true,
      url: normalizedUrl,
      webhookByEvents: false,
      webhookBase64: true,
      events: ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
    };

    let setResult;
    try {
      // A imagem evoapicloud/evolution-api:v2.3.7 valida o DTO externo
      // como { webhook: {...} }. Sem esse invólucro ela responde:
      // instance requires property "webhook".
      setResult = await this.request(`/webhook/set/${encodeURIComponent(this.instance)}`, {
        method: 'POST',
        body: JSON.stringify({ webhook }),
        timeoutMs: 30000,
        operation: 'configurar o webhook',
      });
    } catch (error) {
      // Mantém compatibilidade com builds/documentações da v2 que ainda
      // expõem o mesmo DTO no nível principal.
      if (!/unknown property ["']?webhook|property webhook should not exist|unexpected.*webhook/i.test(String(error?.message || ''))) {
        throw error;
      }
      setResult = await this.request(`/webhook/set/${encodeURIComponent(this.instance)}`, {
        method: 'POST',
        body: JSON.stringify(webhook),
        timeoutMs: 30000,
        operation: 'configurar o webhook',
      });
    }

    // Confirma no próprio banco da Evolution que o endereço antigo foi
    // realmente substituído. Há builds que aceitam a requisição mas mantêm
    // a configuração anterior quando o DTO está em formato incompatível.
    let found = null;
    let activeUrl = '';
    let lastError = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        found = await this.findWebhook();
        activeUrl = this.webhookUrlFrom(found);
        if (activeUrl === normalizedUrl) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }

    if (activeUrl !== normalizedUrl) {
      const detail = activeUrl
        ? `A Evolution ainda informou o endereço antigo: ${activeUrl}`
        : lastError?.message || 'A Evolution não devolveu a configuração atual.';
      throw new Error(`O webhook foi enviado, mas não foi confirmado. ${detail}`);
    }

    return { setResult, webhook: found, verifiedUrl: activeUrl };
  }

  async checkNumber(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return { exists: false, phone: '', jid: '' };
    const data = await this.request(`/chat/whatsappNumbers/${encodeURIComponent(this.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [digits] }),
      timeoutMs: 30000,
      operation: 'validar o número no WhatsApp',
    });
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.response)
        ? data.response
        : Array.isArray(data?.data)
          ? data.data
          : [];
    const row = rows[0] || {};
    const canonical = String(row.number || row.jid || digits).split('@')[0].replace(/\D/g, '');
    return {
      exists: Boolean(row.exists),
      phone: canonical || digits,
      jid: String(row.jid || ''),
    };
  }

  async sendText({ phone, text, quotedMessageId = '', delay = 0 }) {
    const body = { number: phone, text, linkPreview: false };
    const typingDelay = Math.max(0, Math.min(10000, Number(delay || 0)));
    if (typingDelay > 0) body.delay = typingDelay;
    if (quotedMessageId) body.quoted = { key: { id: quotedMessageId } };
    return this.request(`/message/sendText/${encodeURIComponent(this.instance)}`, {
      method: 'POST',
      body: JSON.stringify(body),
      timeoutMs: 60000,
      operation: 'enviar a mensagem',
    });
  }

  async deleteMessageForEveryone({ phone, messageId }) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits || !messageId) throw new Error('A mensagem não possui os dados necessários para ser apagada no WhatsApp.');
    return this.request(`/chat/deleteMessageForEveryone/${encodeURIComponent(this.instance)}`, {
      method: 'DELETE',
      body: JSON.stringify({
        id: String(messageId),
        remoteJid: `${digits}@s.whatsapp.net`,
        fromMe: true,
      }),
      timeoutMs: 60000,
      operation: 'apagar a mensagem para todos',
    });
  }

  async sendMedia({ phone, mediaType, mimeType, media, fileName = '', caption = '' }) {
    return this.request(`/message/sendMedia/${encodeURIComponent(this.instance)}`, {
      method: 'POST',
      body: JSON.stringify({
        number: phone,
        mediatype: mediaType,
        mimetype: mimeType,
        caption,
        media,
        fileName: fileName || undefined,
      }),
      timeoutMs: 120000,
      operation: 'enviar o anexo',
    });
  }

  async getMediaBase64(message) {
    const candidates = [
      message,
      message?.message ? { key: message.key || {}, message: message.message } : null,
      message?.key ? { key: message.key, message: message.message || message } : null,
    ].filter(Boolean);
    const errors = [];
    for (const candidate of candidates) {
      try {
        return await this.request(`/chat/getBase64FromMediaMessage/${encodeURIComponent(this.instance)}`, {
          method: 'POST',
          body: JSON.stringify({ message: candidate, convertToMp4: false }),
          timeoutMs: 120000,
          operation: 'baixar a mídia recebida',
        });
      } catch (error) {
        errors.push(error.message);
      }
    }
    throw new Error(errors.filter(Boolean).join(' | ') || 'A Evolution não devolveu a mídia recebida.');
  }

  async sendAudio({ phone, audio, mimeType = 'audio/webm' }) {
    const cleanMime = String(mimeType || 'audio/webm').split(';')[0];
    const raw = String(audio || '').replace(/^data:[^,]+,/, '');
    const dataUrl = `data:${cleanMime};base64,${raw}`;
    const errors = [];
    for (const payloadAudio of [dataUrl, raw]) {
      try {
        return await this.request(`/message/sendWhatsAppAudio/${encodeURIComponent(this.instance)}`, {
          method: 'POST',
          body: JSON.stringify({ number: phone, audio: payloadAudio, delay: 250, encoding: true }),
          timeoutMs: 120000,
          operation: 'enviar o áudio',
        });
      } catch (error) { errors.push(error.message); }
    }
    try {
      const extension = cleanMime.includes('ogg') ? 'ogg' : cleanMime.includes('mpeg') ? 'mp3' : 'webm';
      return await this.sendMedia({ phone, mediaType: 'audio', mimeType: cleanMime, media: raw, fileName: `audio-atendimento.${extension}` });
    } catch (error) {
      errors.push(`Alternativa de áudio: ${error.message}`);
      throw new Error(errors.join(' | '));
    }
  }

  async sendSticker({ phone, sticker }) {
    return this.request(`/message/sendSticker/${encodeURIComponent(this.instance)}`, {
      method: 'POST',
      body: JSON.stringify({ number: phone, sticker }),
      timeoutMs: 120000,
      operation: 'enviar a figurinha',
    });
  }
}

EvolutionWhatsAppProvider.isMissingInstanceError = isMissingInstanceError;

module.exports = EvolutionWhatsAppProvider;
