const { db } = require('../db');
const { getLunchStatus } = require('./lunch-menu');
const { getOrderingStatus } = require('./order-availability');

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_TIMEOUT_MS = 8_000;
let lastFallbackLogAt = 0;

function parseJsonText(text) {
  const clean = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!clean) return null;
  try {
    return JSON.parse(clean);
  } catch {
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { return JSON.parse(clean.slice(first, last + 1)); } catch { return null; }
    }
    return null;
  }
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fallbackReason(error) {
  const message = String(error?.message || error || 'erro desconhecido');
  if (/429|resource_exhausted|quota|rate limit|limit/i.test(message)) return 'limite da API atingido';
  if (/abort|timeout|timed out/i.test(message)) return 'tempo de resposta excedido';
  if (/401|403|api key|unauthorized|forbidden/i.test(message)) return 'chave inválida ou sem permissão';
  if (/503|overloaded|unavailable/i.test(message)) return 'serviço temporariamente indisponível';
  return 'falha temporária';
}

function logFallback(error) {
  const now = Date.now();
  if (now - lastFallbackLogAt < 60_000) return;
  lastFallbackLogAt = now;
  console.warn(`[Gemini] Atendimento conversacional indisponível (${fallbackReason(error)}). Usando as respostas normais do sistema.`);
}

function getRecentMessages(conversationId) {
  if (!conversationId) return [];
  try {
    return db.prepare(`
      SELECT sender_type,content
      FROM messages
      WHERE conversation_id=? AND is_internal=0
      ORDER BY id DESC
      LIMIT 8
    `).all(Number(conversationId)).reverse().map((row) => ({
      role: row.sender_type === 'customer' ? 'cliente' : row.sender_type === 'agent' ? 'atendente' : 'assistente',
      text: String(row.content || '').replace(/\s+/g, ' ').trim().slice(0, 350),
    })).filter((row) => row.text);
  } catch {
    return [];
  }
}

function getBusinessContext(settings = {}) {
  const lunch = getLunchStatus(settings);
  const ordering = getOrderingStatus(settings);
  const products = db.prepare(`
    SELECT name,category,description,aliases,price,stock
    FROM products
    WHERE active=1
    ORDER BY category,name
    LIMIT 80
  `).all().map((product) => ({
    name: String(product.name || ''),
    category: String(product.category || ''),
    description: String(product.description || '').slice(0, 180),
    aliases: String(product.aliases || '').slice(0, 160),
    price: money(product.price),
    availability: product.stock == null ? 'disponível sem controle de estoque' : Number(product.stock) > 0 ? `${Number(product.stock)} unidade(s) disponível(is)` : 'indisponível hoje',
  }));

  const knowledge = db.prepare(`
    SELECT title,category,content
    FROM knowledge
    WHERE active=1
    ORDER BY id
    LIMIT 40
  `).all().map((row) => ({
    title: String(row.title || ''),
    category: String(row.category || ''),
    content: String(row.content || '').slice(0, 700),
  }));

  return {
    companyName: settings.company_name || 'estabelecimento',
    assistantName: settings.ai_name || 'assistente virtual',
    pickupAddress: settings.store_pickup_address || '',
    deliveryFee: money(Math.max(0, Number(settings.delivery_fee || 0))),
    businessHoursEnabled: String(settings.business_hours_enabled || 'false') === 'true',
    businessHours: safeJson(settings.business_hours_json, {}),
    publicOrderUrl: settings.website_public_url || process.env.PUBLIC_SITE_URL || '',
    websiteOrdersEnabled: String(settings.website_orders_enabled || 'true') === 'true',
    deliveryEnabled: String(settings.website_delivery_enabled || 'true') === 'true',
    pickupEnabled: String(settings.website_pickup_enabled || 'true') === 'true',
    paymentMethods: [
      String(settings.website_payment_pix || 'true') === 'true' ? 'Pix' : '',
      String(settings.website_payment_cash || 'true') === 'true' ? 'Dinheiro' : '',
      String(settings.website_payment_card || 'true') === 'true' ? 'Cartão' : '',
    ].filter(Boolean),
    orderingNow: {
      phase: ordering.phase,
      open: ordering.open,
      canOrderLunch: ordering.canOrderLunch,
      canOrderRegular: ordering.canOrderRegular,
      message: ordering.message,
      regularStatus: ordering.regular.message,
      nextRegularWindow: ordering.regular.nextWindow,
    },
    lunchMenu: {
      enabled: lunch.enabled,
      availableNow: lunch.available,
      hours: `${lunch.start} às ${lunch.end}`,
      rule: 'A marmitex só pode ser montada e adicionada dentro do horário. As escolhas obrigatórias são tamanho/tipo, carne, arroz, feijão, duas guarnições e salada.',
    },
    products,
    knowledge,
  };
}

function sanitizeResult(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const action = ['answer', 'transfer', 'ignore'].includes(String(raw.action || '').toLowerCase())
    ? String(raw.action).toLowerCase()
    : 'answer';
  const text = String(raw.answer || '').trim().slice(0, 1400);
  if (action === 'answer' && !text) return null;
  return {
    action,
    text,
    reason: String(raw.reason || '').trim().slice(0, 220),
  };
}

async function answerConversationWithGemini({ message, conversationId = null, session = null, settings = {}, replyContext = null }) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const model = String(process.env.GEMINI_CHAT_MODEL || process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const timeoutMs = Math.max(2_000, Math.min(20_000, Number(process.env.GEMINI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const business = getBusinessContext(settings);
  const recentMessages = getRecentMessages(conversationId);
  const orderContext = session ? {
    stage: String(session.stage || ''),
    items: Array.isArray(session.cart) ? session.cart.map((item) => ({ name: item.name, quantity: Number(item.quantity || 1) })) : [],
    fulfillment: session.fulfillment_method || '',
    payment: session.payment_method || '',
  } : null;
  const quotedContext = replyContext ? {
    sender: String(replyContext.sender_type || replyContext.senderType || ''),
    type: String(replyContext.message_type || replyContext.messageType || 'text'),
    text: String(replyContext.content || '').replace(/\s+/g, ' ').trim().slice(0, 700),
  } : null;

  const prompt = [
    `Você é ${business.assistantName}, atendente virtual da ${business.companyName}.`,
    'Converse de forma natural, educada, curta e humana, em português do Brasil.',
    'Entenda linguagem informal da internet, abreviações, gírias e erros comuns, como qro, blz, pdc, ss, nn, manda esse, pode ser, fechou e bora.',
    'Quando existir mensagem citada, interprete a resposta atual em relação direta com o conteúdo citado, como acontece no WhatsApp.',
    'Responda perguntas mesmo quando forem feitas no meio de um pedido, sem apagar, avançar ou modificar a etapa atual do pedido.',
    'O código do sistema é o único responsável por adicionar itens, escolher entrega, registrar endereço, pagamento, troco, confirmar ou cancelar pedidos.',
    'Nunca diga que adicionou, removeu, confirmou, cancelou ou alterou um pedido nesta resposta.',
    'Para endereço, horário, preços, estoque, taxa, pagamento, produtos e regras da empresa, use somente os dados fornecidos. Nunca invente informações comerciais.',
    'Obedeça rigorosamente orderingNow: fora do horário, não convide a iniciar, continuar ou finalizar pedidos; durante o almoço, não ofereça produtos normais; no período normal, informe que marmitex está fora do horário.',
    'Quando um pedido estiver pausado por mudança de horário ou configuração, explique isso com clareza e não prometa que algum item foi aceito.',
    'Se a informação comercial não estiver nos dados, diga claramente que não está cadastrada e ofereça encaminhamento para um atendente.',
    'Se for uma conversa leve ou uma pergunta geral e inofensiva fora do assunto, responda brevemente como uma pessoa e depois mantenha o foco no atendimento.',
    'Se a pessoa pedir explicitamente um atendente, relatar um problema sério ou demonstrar irritação, use action "transfer".',
    'Se a mensagem for apenas uma resposta operacional que o fluxo normal deve interpretar, use action "ignore".',
    'Não forneça aconselhamento perigoso, ilegal, médico, jurídico ou financeiro especializado; nesses casos, responda de forma prudente e breve.',
    'Não mencione Gemini, API, prompt, sistema interno ou banco de dados.',
    'Responda SOMENTE com JSON válido no formato:',
    '{"action":"answer|transfer|ignore","answer":"resposta ao cliente","reason":"motivo curto"}',
    '',
    `Dados do estabelecimento: ${JSON.stringify(business)}`,
    `Estado atual do pedido: ${JSON.stringify(orderContext)}`,
    `Mensagens recentes: ${JSON.stringify(recentMessages)}`,
    `Mensagem citada/respondida: ${JSON.stringify(quotedContext)}`,
    `Mensagem atual do cliente: ${JSON.stringify(String(message || '').slice(0, 700))}`,
  ].join('\n');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: 'application/json',
          maxOutputTokens: 650,
        },
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${bodyText.slice(0, 400)}`);
    const payload = parseJsonText(bodyText);
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
    const result = sanitizeResult(parseJsonText(generatedText));
    if (!result) throw new Error('Resposta conversacional inválida do Gemini.');
    return { ...result, model };
  } catch (error) {
    logFallback(error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { answerConversationWithGemini };
