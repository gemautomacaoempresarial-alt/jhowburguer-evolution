const { db, nowIso, insertMessage } = require('../db');
const { generateGroundedReply, clearSession, startOrderSession, wantsToEditOrder, parseOrderItems } = require('./ai');
const { createConfirmedOrder } = require('./orders');
const { stampProviderResult, markConversationOutboundRead } = require('./message-status');
const realtime = require('./realtime');
const whatsapp = require('./whatsapp');
const { chooseOnlineAgent, notifyAssignedAgent, notifyHumanHandoff } = require('./assignment');
const { createCheckoutSession } = require('./website-checkout');
const { canonicalPhone, createOrUpdateContact, activeConversationForContact, ensureActiveConversation } = require('./contact-identity');
const { getBusinessStatus } = require('./business-hours');
const { getLunchStatus, startOffer: startLunchOffer, lunchOfferText, asksForLunch } = require('./lunch-menu');
const { getOrderingStatus, unavailableMessage } = require('./order-availability');

function protocol() {
  const year = new Date().getFullYear();
  const random = Math.floor(100000 + Math.random() * 900000);
  return `ATD-${year}-${random}`;
}

function normalizePhone(value) {
  return canonicalPhone(value);
}


function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function safeJson(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function getSettings() {
  return Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((row) => [row.key, row.value]));
}

function settingEnabled(settings, key, fallback = true) {
  const value = settings[key];
  if (value == null) return fallback;
  return !['false', '0', 'off', 'nao', 'não'].includes(String(value).toLowerCase());
}

function currentGreeting() {
  const hour = Number(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hour12: false,
  }).format(new Date()));
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function renderTemplate(template, { contact, settings }) {
  const values = {
    nome: contact.name || 'cliente', Cliente: contact.name || 'cliente',
    empresa: settings.company_name || 'nossa empresa', Empresa: settings.company_name || 'nossa empresa',
    assistente: settings.ai_name || 'assistente virtual', Assistente: settings.ai_name || 'assistente virtual',
    saudacao: currentGreeting(), Saudacao: currentGreeting(), Telefone: contact.phone || '',
  };
  let output = String(template || '');
  for (const [key,value] of Object.entries(values)) output = output.replaceAll(`{${key}}`, String(value));
  return output;
}

const DEFAULT_MENU_OPTIONS = [
  { number: '1', label: 'Fazer um pedido', action: 'order' },
  { number: '2', label: 'Ver o cardápio', action: 'catalog' },
  { number: '3', label: 'Acompanhar um pedido', action: 'order_status' },
  { number: '4', label: 'Falar com um atendente', action: 'human' },
  { number: '5', label: 'Endereço e horário', action: 'hours_address' },
];

function configuredMenu(settings) {
  const configured = safeJson(settings.welcome_menu_options, [])
    .filter((option) => option && option.number && option.label && option.action)
    .slice(0, 9);
  return configured.length ? configured : DEFAULT_MENU_OPTIONS;
}

function menuText(settings) {
  if (!settingEnabled(settings, 'welcome_menu_enabled', true)) return '';
  const options = configuredMenu(settings);
  if (!options.length) return '';
  const emojiByAction = { order: '🍔', catalog: '📋', order_status: '🛵', human: '👤', hours_address: '📍', promotion: '🎉', custom: '💬' };
  return `${settings.welcome_menu_title || 'Escolha uma opção:'}\n\n${options.map((option) => `${emojiByAction[option.action] || '•'} ${option.number} — ${option.label}`).join('\n')}`;
}

function isSimpleGreeting(message) {
  const text = normalizeText(message)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|oi tudo bem|ola tudo bem)$/.test(text);
}

function canRepeatGreeting(contact, settings) {
  if (!contact.last_auto_greeting_at) return true;
  const hours = Math.max(1, Number(settings.greeting_cooldown_hours || 12));
  return Date.now() - new Date(contact.last_auto_greeting_at).getTime() >= hours * 3600000;
}

function markGreeting(contactId) {
  const stamp = nowIso();
  db.prepare('UPDATE contacts SET last_auto_greeting_at=?, updated_at=? WHERE id=?').run(stamp, stamp, contactId);
}

function catalogText() {
  const products = db.prepare('SELECT category,name,price FROM products WHERE active=1 ORDER BY category,name').all();
  if (!products.length) return 'Nosso cardápio está sendo atualizado. Vou chamar um atendente para ajudar.';
  const groups = new Map();
  for (const product of products) {
    if (!groups.has(product.category)) groups.set(product.category, []);
    groups.get(product.category).push(`• ${product.name} — R$ ${Number(product.price).toFixed(2).replace('.', ',')}`);
  }
  return [...groups.entries()]
    .map(([category, items]) => `*${category}*\n${items.join('\n')}`)
    .join('\n\n');
}

function orderStatusText(contactId) {
  const rows = db.prepare('SELECT id,status,total,fulfillment_method,created_at FROM orders WHERE contact_id=? ORDER BY id DESC LIMIT 3').all(contactId);
  if (!rows.length) return 'Você ainda não possui pedidos registrados. Para fazer um pedido, responda *1*.';
  const labelFor = (order) => {
    if (order.fulfillment_method === 'pickup' && order.status === 'ready') return 'Pronto para retirada';
    if (order.fulfillment_method === 'pickup' && ['picked_up','delivered'].includes(order.status)) return 'Retirado';
    const labels = {
      new: 'Novo', confirmed: 'Confirmado', preparing: 'Em preparo', ready: 'Pronto',
      out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', picked_up: 'Retirado', cancelled: 'Cancelado',
    };
    return labels[order.status] || order.status;
  };
  return `Seus pedidos mais recentes:\n${rows.map((order) => `• #${String(order.id).padStart(4, '0')} — ${labelFor(order)} — R$ ${Number(order.total).toFixed(2).replace('.', ',')}`).join('\n')}`;
}

function addressAndHoursText(settings) {
  const ordering = getOrderingStatus(settings);
  const schedule = (() => { try { return JSON.parse(settings.business_hours_json || '{}'); } catch { return {}; } })();
  const labels = { mon:'Segunda',tue:'Terça',wed:'Quarta',thu:'Quinta',fri:'Sexta',sat:'Sábado',sun:'Domingo' };
  const regularLines = Object.entries(labels).map(([key,label]) => {
    const range = Array.isArray(schedule[key]) ? schedule[key] : [];
    return range.length >= 2 ? `• ${label}: ${range[0]} às ${range[1]}` : `• ${label}: fechado`;
  }).join('\n');
  const statusLine = ordering.phase === 'lunch'
    ? `Almoço disponível agora até ${ordering.lunch.end}.`
    : ordering.phase === 'regular'
      ? `Pedidos normais disponíveis agora. ${ordering.regular.message}.`
      : 'Estamos fora do horário de pedidos neste momento.';
  return `📍 *ENDEREÇO PARA RETIRADA*
${settings.store_pickup_address || 'Endereço ainda não configurado.'}

🍱 *ALMOÇO E MARMITEX*
Das ${ordering.lunch.start} às ${ordering.lunch.end}.

🌙 *PEDIDOS NORMAIS*
${regularLines}

*Status agora:* ${statusLine}`;
}

function handleAutomation({ message, conversation, contact, settings }) {
  const normalized = normalizeText(message);
  const rows = db.prepare(`SELECT * FROM automations WHERE active=1 AND trigger_type='keyword' ORDER BY id`).all();
  for (const row of rows) {
    const words = String(row.trigger_value || '').split(',').map((value) => normalizeText(value)).filter(Boolean);
    if (!words.length || !words.some((word) => normalized === word || normalized.includes(word))) continue;
    const payload = safeJson(row.action_payload_json, {});
    if (row.action_type === 'reply') {
      return { text: renderTemplate(payload.text || 'Como podemos ajudar?', { contact, settings }), transfer: false, source: `automation_${row.id}` };
    }
    if (row.action_type === 'human') {
      return { text: renderTemplate(payload.text || '👤 Vou encaminhar você para uma pessoa da equipe.', { contact, settings }), transfer: true, source: `automation_${row.id}` };
    }
    if (row.action_type === 'queue' && row.queue_id) {
      const targetAgent = chooseOnlineAgent(row.queue_id);
      db.prepare("UPDATE conversations SET queue_id=?,assigned_user_id=?,status=? WHERE id=?")
        .run(row.queue_id,targetAgent?.id||null,targetAgent?'open':'waiting_human',conversation.id);
      notifyHumanHandoff(targetAgent?.id || null, conversation.id, contact.name, 'Atendimento encaminhado');
      return { text: renderTemplate(payload.text || '✅ Encaminhei seu atendimento para o setor responsável.', { contact, settings }), transfer: !targetAgent, source: `automation_${row.id}` };
    }
  }
  return null;
}

function renderOrderSiteMessage(template, { link, contact, settings }) {
  return String(template || '')
    .replaceAll('{Link}', link || '')
    .replaceAll('{Cliente}', contact?.name || 'cliente')
    .replaceAll('{Empresa}', settings.company_name || 'nossa empresa');
}

function humanOrderReply({ conversationId, contact, settings }) {
  clearSession(conversationId);
  db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
  return {
    text: renderTemplate(
      settings.bot_order_whatsapp_message || `👤 *ATENDIMENTO HUMANO*

Vamos encaminhar sua conversa para um atendente. Continue enviando as informações por aqui enquanto aguarda.`,
      { contact, settings },
    ),
    transfer: true,
    reveal: true,
    disableAi: true,
    source: 'order_whatsapp_human',
  };
}

function formatInitialCart(cart = []) {
  if (!Array.isArray(cart) || !cart.length) return '';
  return cart.map((item) => `• ${Number(item.quantity || 1)}x ${item.name}`).join('\n');
}

function aiOrderReply({ conversationId, contact, settings, cart = [] }) {
  db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
  startOrderSession(conversationId, cart);
  const configured = renderTemplate(
    settings.bot_order_whatsapp_ai_message || `🍔 *FAZER PEDIDO*

Envie o nome do produto e a quantidade.

*Exemplo:*
1 X-Burguer
2 Coca-Cola

Digite *CARDÁPIO* para ver o cardápio.
Ao finalizar seu pedido digite *FINALIZAR*`,
    { contact, settings },
  );
  const initial = formatInitialCart(cart);
  return {
    text: initial
      ? `✅ *ITENS ADICIONADOS*\n\n${initial}\n\nEnvie outros produtos ou responda *FINALIZAR* quando terminar.`
      : configured,
    transfer: false,
    reveal: false,
    disableAi: false,
    source: 'order_whatsapp_ai',
  };
}

function siteOrderReply({ conversationId, contact, settings, cart = [] }) {
  if (!settingEnabled(settings, 'website_orders_enabled', true)) return aiOrderReply({ conversationId, contact, settings, cart });
  const ttlHours = Math.max(1, Math.min(168, Number(settings.bot_order_link_hours || 24)));
  const checkout = createCheckoutSession(conversationId, cart, { ttlHours, allowEmpty: true });
  if (!checkout) return aiOrderReply({ conversationId, contact, settings, cart });
  clearSession(conversationId);
  db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
  return {
    text: renderOrderSiteMessage(settings.bot_order_site_message || `🛒 *PEDIDO PELO SITE*

Acesse o link abaixo para escolher os produtos e finalizar seu pedido:

{Link}`, { link: checkout.url, contact, settings }),
    transfer: false, reveal: false, source: 'order_site',
  };
}

function normalizedOrderMode(value) {
  const mode = String(value || 'whatsapp_ai').toLowerCase();
  if (mode === 'whatsapp') return 'whatsapp_ai';
  if (mode === 'hybrid') return 'hybrid_ai';
  return ['whatsapp_ai', 'site', 'human', 'hybrid_ai', 'hybrid_human'].includes(mode) ? mode : 'whatsapp_ai';
}

function beginHybridChoice({ conversationId, settings, cart, choiceMode }) {
  const stamp = nowIso();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO bot_order_mode_sessions(conversation_id,expires_at,cart_json,choice_mode,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET expires_at=excluded.expires_at,cart_json=excluded.cart_json,choice_mode=excluded.choice_mode,created_at=excluded.created_at`)
    .run(conversationId, expiresAt, JSON.stringify(cart || []), choiceMode, stamp);
  const message = choiceMode === 'hybrid_human'
    ? settings.bot_order_hybrid_human_message || `🍔 *COMO DESEJA FAZER O PEDIDO?*

1. Fazer pelo site
2. Falar com um atendente pelo WhatsApp

Responda com *1* ou *2*.`
    : settings.bot_order_hybrid_message || `🍔 *COMO DESEJA FAZER O PEDIDO?*

1. Fazer pelo WhatsApp
2. Fazer pelo site

Responda com *1* ou *2*.`;
  return { text: String(message), transfer: false, reveal: false, source: 'order_hybrid_choice' };
}

function aiOrderReplyForCurrentPeriod({ conversationId, contact, settings, cart = [] }) {
  const orderingStatus = getOrderingStatus(settings);
  if (orderingStatus.canOrderLunch) {
    startLunchOffer(conversationId);
    return { text: lunchOfferText(orderingStatus.lunch), transfer: false, reveal: false, source: 'almoco_oferta_horario' };
  }
  return aiOrderReply({ conversationId, contact, settings, cart });
}

function beginOrderByConfiguredMode({ conversationId, contact, settings, cart = [] }) {
  // Revalida horário e modo em toda nova ação do cliente.
  const orderingStatus = getOrderingStatus(settings);
  if (!orderingStatus.open) {
    return { text: unavailableMessage(orderingStatus), transfer: false, reveal: false, source: 'pedido_fora_horario' };
  }
  const mode = normalizedOrderMode(settings.bot_order_mode);
  if (mode === 'site') return siteOrderReply({ conversationId, contact, settings, cart });
  if (mode === 'human') return humanOrderReply({ conversationId, contact, settings });
  if (mode === 'hybrid_ai') {
    if (!settingEnabled(settings, 'website_orders_enabled', true)) return aiOrderReplyForCurrentPeriod({ conversationId, contact, settings, cart });
    return beginHybridChoice({ conversationId, settings, cart, choiceMode: mode });
  }
  if (mode === 'hybrid_human') {
    if (!settingEnabled(settings, 'website_orders_enabled', true)) return humanOrderReply({ conversationId, contact, settings });
    return beginHybridChoice({ conversationId, settings, cart, choiceMode: mode });
  }
  return aiOrderReplyForCurrentPeriod({ conversationId, contact, settings, cart });
}

function resolvePendingOrderModeChoice({ message, conversationId, contact, settings }) {
  const pending = db.prepare(`SELECT * FROM bot_order_mode_sessions WHERE conversation_id=? AND datetime(expires_at)>datetime('now')`).get(conversationId);
  if (!pending) {
    db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
    return null;
  }
  const normalized = normalizeText(message);
  let choice = String(message || '').trim().replace(/[.)-]+$/, '');
  const mode = normalizedOrderMode(pending.choice_mode || 'hybrid_ai');
  const currentMode = normalizedOrderMode(settings.bot_order_mode);
  if (mode !== currentMode) {
    db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
    return beginOrderByConfiguredMode({ conversationId, contact, settings, cart: [] });
  }
  const orderingStatus = getOrderingStatus(settings);
  if (!orderingStatus.open) {
    db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
    return beginOrderByConfiguredMode({ conversationId, contact, settings, cart: [] });
  }
  if (!['1', '2'].includes(choice)) {
    if (/\b(whatsapp|zap|conversa|ia)\b/.test(normalized)) choice = mode === 'hybrid_human' ? '2' : '1';
    else if (/\b(site|link|cardapio digital)\b/.test(normalized)) choice = mode === 'hybrid_human' ? '1' : '2';
    else if (/\b(atendente|humano|pessoa)\b/.test(normalized) && mode === 'hybrid_human') choice = '2';
  }
  if (!['1','2'].includes(choice)) {
    return {
      text: mode === 'hybrid_human'
        ? 'Responda *1* para fazer pelo site ou *2* para falar com um atendente pelo WhatsApp.'
        : 'Responda *1* para fazer pelo WhatsApp com a IA ou *2* para abrir o site.',
      transfer: false, reveal: false, source: 'order_hybrid_invalid_choice',
    };
  }
  db.prepare('DELETE FROM bot_order_mode_sessions WHERE conversation_id=?').run(conversationId);
  let cart = [];
  try { cart = JSON.parse(pending.cart_json || '[]'); } catch { cart = []; }
  if (mode === 'hybrid_human') {
    return choice === '1'
      ? siteOrderReply({ conversationId, contact, settings, cart })
      : humanOrderReply({ conversationId, contact, settings });
  }
  return choice === '1'
    ? aiOrderReplyForCurrentPeriod({ conversationId, contact, settings, cart })
    : siteOrderReply({ conversationId, contact, settings, cart });
}

function handleConfiguredMenuChoice({ message, contact, conversationId, settings }) {
  const pendingModeChoice = resolvePendingOrderModeChoice({ message, conversationId, contact, settings });
  if (pendingModeChoice) return pendingModeChoice;
  if (db.prepare('SELECT 1 FROM ai_order_sessions WHERE conversation_id=?').get(conversationId)) return null;
  const choice = String(message || '').trim().replace(/[.)-]+$/, '');
  const option = configuredMenu(settings).find((item) => String(item.number) === choice);
  if (!option) return null;

  const stayWithBot = (text, source, repeatMenu = false) => ({
    text: [String(text || '').trim(), repeatMenu ? menuText(settings) : ''].filter(Boolean).join('\n\n'),
    transfer: false,
    reveal: false,
    source,
  });

  if (option.action === 'order') {
    return beginOrderByConfiguredMode({ conversationId, contact, settings });
  }
  if (option.action === 'catalog') {
    return { text: '', transfer: false, reveal: false, action: 'open_catalog', source: 'menu_catalog' };
  }
  if (option.action === 'order_status') {
    return stayWithBot(orderStatusText(contact.id), 'menu_order_status', true);
  }
  if (option.action === 'human') {
    return {
      text: 'Para agilizar, informe seu nome completo e descreva como podemos ajudar.\n\n✅ Seu atendimento foi encaminhado para um atendente. Continue enviando as informações por aqui.',
      transfer: true,
      reveal: true,
      disableAi: true,
      source: 'menu_human',
    };
  }
  if (option.action === 'hours_address') {
    return stayWithBot(addressAndHoursText(settings), 'menu_hours_address', true);
  }
  if (option.action === 'promotion') {
    const promo = db.prepare("SELECT content FROM knowledge WHERE active=1 AND (lower(title) LIKE '%promo%' OR lower(keywords) LIKE '%promo%') ORDER BY id DESC LIMIT 1").get();
    return stayWithBot(promo?.content || 'No momento não há uma promoção cadastrada.', 'menu_promotion', true);
  }
  if (option.action === 'custom') {
    return stayWithBot(String(option.response || 'Como podemos ajudar?'), 'menu_custom', true);
  }
  return null;
}

function orderTriggerMatches(message, settings) {
  const normalized = normalizeText(message);
  const configured = String(settings.bot_order_trigger_phrases || 'quero fazer um pedido,fazer um pedido,quero pedir,iniciar pedido,novo pedido,quero comprar')
    .split(/[,;\n]+/)
    .map((phrase) => normalizeText(phrase))
    .filter(Boolean);
  return configured.some((phrase) => normalized === phrase || normalized.includes(phrase));
}

function directIntentReply({ message, contact, conversationId, settings }) {
  const normalized = normalizeText(message);
  if (/\b(cardapio|menu|produtos|lanches|precos?)\b/.test(normalized)) {
    return null;
  }
  if (/\b(meu pedido|acompanhar pedido|status do pedido|onde esta.*pedido)\b/.test(normalized)) {
    return { text: orderStatusText(contact.id), transfer: false, source: 'intencao_status_pedido' };
  }
  if (orderTriggerMatches(message, settings)) {
    return beginOrderByConfiguredMode({ conversationId, contact, settings });
  }
  if (/\b(endereco|onde fica|horario|que horas|funcionamento)\b/.test(normalized)) {
    return { text: addressAndHoursText(settings), transfer: false, source: 'intencao_endereco_horario' };
  }
  if (/\b(atendente|pessoa|humano|falar com alguem)\b/.test(normalized)) {
    return {
      text: 'Para agilizar seu atendimento, informe seu nome completo e como podemos ajudar. Aguarde que em breve uma pessoa da equipe irá atender você. 🤝',
      transfer: true,
      reveal: true,
      disableAi: true,
      source: 'intencao_humano',
    };
  }
  return null;
}



function signedAiText(text, settings) {
  if (!settingEnabled(settings, 'ai_signature_enabled', true)) return text;
  const prefix = settings.ai_message_prefix || '🤖 *Assistente virtual:*\n';
  return `${prefix}${text}`;
}

function isBusinessOpen(settings) {
  return getOrderingStatus(settings).open;
}


function automaticOpening({ isNewContact, isNewConversation, message, contact, settings, conversationId }) {
  const menu = menuText(settings);
  const lunchStatus = getLunchStatus(settings);
  const lunchOfferEnabled = settingEnabled(settings, 'lunch_offer_first_message', true);
  const alreadyInLunchFlow = conversationId
    ? Boolean(db.prepare('SELECT 1 FROM lunch_order_sessions WHERE conversation_id=?').get(Number(conversationId)))
    : false;
  const shouldOfferLunch = Boolean(isNewConversation || isSimpleGreeting(message));
  const lunchOffer = lunchOfferEnabled && lunchStatus.available && isBusinessOpen(settings)
    && conversationId && shouldOfferLunch && !alreadyInLunchFlow
    ? lunchOfferText(lunchStatus)
    : '';
  const openingMenu = lunchOffer || menu;
  if (lunchOffer) startLunchOffer(conversationId);
  if (!isBusinessOpen(settings) && (isNewConversation || isSimpleGreeting(message)) && canRepeatGreeting(contact, settings)) {
    const afterHours = renderTemplate(settings.after_hours_message || '🌙 Olá, {nome}! No momento estamos fora do horário de atendimento. Assim que retornarmos, responderemos você. 💚', { contact, settings });
    return [afterHours, unavailableMessage(getOrderingStatus(settings))].filter(Boolean).join('\n\n');
  }
  if (isNewContact && settingEnabled(settings, 'welcome_enabled', true)) {
    const intro = renderTemplate(
      settings.first_contact_message || '{saudacao}, {nome}! Seja bem-vindo à {empresa}.',
      { contact, settings },
    );
    return [intro, openingMenu].filter(Boolean).join('\n\n');
  }
  if (isNewConversation && settingEnabled(settings, 'returning_welcome_enabled', true)) {
    const intro = renderTemplate(
      settings.returning_welcome_message || '{saudacao}, {nome}! Que bom ter você de volta.',
      { contact, settings },
    );
    return [intro, openingMenu].filter(Boolean).join('\n\n');
  }
  if (isSimpleGreeting(message) && settingEnabled(settings, 'greeting_enabled', true) && canRepeatGreeting(contact, settings)) {
    const intro = renderTemplate(
      settings.greeting_message || '{saudacao}, {nome}! Como podemos ajudar?',
      { contact, settings },
    );
    return [intro, openingMenu].filter(Boolean).join('\n\n');
  }
  // Uma conversa nova sempre começa pelo menu numérico. Ela só será exibida
  // no painel depois que o cliente escolher uma opção.
  if (isNewConversation) {
    const intro = renderTemplate('{saudacao}, {nome}! Como podemos ajudar?', { contact, settings });
    return [intro, openingMenu].filter(Boolean).join('\n\n');
  }
  return '';
}

function aiTypingDelay(text = '') {
  const plain = String(text || '').replace(/[*_~`]/g, '').trim();
  if (!plain) return 0;
  // Mantém o indicador tempo suficiente para o cliente perceber que o bot
  // está respondendo, sem atrasar demais mensagens curtas ou cardápios.
  const estimated = 1400 + (plain.length * 12);
  return Math.max(1800, Math.min(5500, estimated));
}

function isDefinitiveSendFailure(error) {
  const message = String(error?.message || error || '');
  return /não está conectado|nao esta conectado|unauthorized|forbidden|401|403|invalid.*number|número inválido|numero invalido|instance.*not found|instância.*não encontrada|rejeitad|blocked|banid/i.test(message);
}

async function sendAiReply({ conversation, phone, text, provider }) {
  const settings = getSettings();
  const providerText = signedAiText(text, settings);
  console.log('[WhatsApp bot] Preparando resposta automática:', {
    conversationId: conversation.id,
    phoneSuffix: normalizePhone(phone).slice(-4),
    provider,
    textLength: String(providerText || '').length,
  });
  const messageId = insertMessage({
    conversationId: conversation.id,
    senderType: 'ai',
    content: text,
    deliveryStatus: provider === 'mock' ? 'sent' : 'pending',
  });
  let message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
  realtime.emit('message:new', { conversationId: conversation.id, message });
  if (provider !== 'mock') {
    try {
      const result = await whatsapp.sendText({
        phone,
        text: providerText,
        delay: aiTypingDelay(providerText),
      });
      message = stampProviderResult(messageId, result, 'sent');
      realtime.emit('message:status', { conversationId: conversation.id, message });
      console.log('[WhatsApp bot] Resposta automática enviada:', {
        conversationId: conversation.id,
        phoneSuffix: normalizePhone(phone).slice(-4),
        providerMessageId: String(message.provider_message_id || '').slice(-12),
      });
    } catch (error) {
      console.error('[WhatsApp bot] Erro ao enviar resposta automática:', {
        conversationId: conversation.id,
        phoneSuffix: normalizePhone(phone).slice(-4),
        message: error.message,
      });
      const definitive = isDefinitiveSendFailure(error);
      db.prepare("UPDATE messages SET delivery_status=?,failed_reason=? WHERE id=?")
        .run(definitive ? 'failed' : 'sent', definitive ? String(error.message || error).slice(0,500) : null, messageId);
      message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
      realtime.emit('message:status', { conversationId: conversation.id, message });
      realtime.emit('system:warning', { message: definitive
        ? `A resposta da IA não foi aceita pelo WhatsApp: ${error.message}`
        : 'A Evolution não confirmou a resposta a tempo. Como o WhatsApp pode ter aceitado o envio, a mensagem foi mantida como enviada até o webhook atualizar o status.' });
    }
  }
  return message;
}


function createOrderChangeNotification({ conversation, contact, content, orderId = null }) {
  const stamp = nowIso();
  let requestId = null;
  if (orderId) {
    const result = db.prepare(`INSERT INTO order_change_requests
      (order_id,conversation_id,contact_id,request_text,status,created_at,updated_at)
      VALUES (?,?,?,?, 'pending', ?, ?)`)
      .run(orderId, conversation.id, contact.id, String(content || '').trim(), stamp, stamp);
    requestId = Number(result.lastInsertRowid);
  }
  const current = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
  const assignedAgent = current.assigned_user_id
    ? db.prepare('SELECT id,name FROM users WHERE id=?').get(current.assigned_user_id)
    : chooseOnlineAgent(current.queue_id);
  db.prepare("UPDATE conversations SET hidden=0,ai_enabled=0,assigned_user_id=?,status=? WHERE id=?")
    .run(assignedAgent?.id || null, assignedAgent ? 'open' : 'waiting_human', conversation.id);
  const orderLabel = orderId ? ` do pedido #${String(orderId).padStart(4,'0')}` : ' do pedido em revisão';
  const rawRequest = String(content || '').trim();
  const cancellation = /^CANCELAMENTO:/i.test(rawRequest);
  const requestText = rawRequest.replace(/^CANCELAMENTO:\s*/i, '').trim() || rawRequest;
  const noteId = insertMessage({
    conversationId: conversation.id,
    senderType: 'system',
    content: `${cancellation ? '⚠️' : '✏️'} Cliente solicitou ${cancellation ? 'cancelamento' : 'alteração'}${orderLabel}: ${requestText}`,
    isInternal: 1,
    deliveryStatus: 'sent',
  });
  const note = db.prepare('SELECT * FROM messages WHERE id=?').get(noteId);
  realtime.emit('message:new', { conversationId: conversation.id, message: note });
  if (assignedAgent) notifyAssignedAgent(assignedAgent.id, conversation.id, contact.name);
  return { assignedAgent, requestId };
}

async function processIncomingMessage({
  phone,
  name,
  content,
  provider = 'mock',
  providerMessageId = null,
  messageType = 'text',
  mediaUrl = '',
  mimeType = '',
  fileName = '',
  replyToProviderMessageId = '',
}) {
  const cleanPhone = normalizePhone(phone);
  const cleanContent = String(content || '').trim();
  if (cleanPhone.length < 10 || !cleanContent) throw new Error('Mensagem recebida sem telefone ou conteúdo válido.');

  if (providerMessageId) {
    try {
      db.prepare('INSERT INTO webhook_events (provider, external_id, event_type, created_at) VALUES (?,?,?,?)')
        .run(provider, providerMessageId, 'message', nowIso());
    } catch {
      return { duplicate: true };
    }
  }

  const stamp = nowIso();
  const existingContact = createOrUpdateContact({ phone: cleanPhone, name, source: 'whatsapp' });
  const isNewContact = !db.prepare('SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.contact_id=? LIMIT 1').get(existingContact.id);
  let contact = existingContact;


  // Uma conversa nova/ativa sempre tem prioridade sobre a pesquisa de
  // satisfação da conversa anterior. Assim, depois de finalizar um atendimento,
  // a opção “1” do novo menu não é confundida com uma nota da pesquisa antiga.
  const activeConversation = activeConversationForContact(contact.id);
  const repliedMessage = replyToProviderMessageId
    ? db.prepare(`SELECT m.id,m.content,m.sender_type,m.message_type,m.media_url,m.mime_type,m.file_name,m.provider_message_id,u.name user_name
        FROM messages m LEFT JOIN users u ON u.id=m.user_id
        WHERE m.provider_message_id=? ORDER BY m.id DESC LIMIT 1`).get(String(replyToProviderMessageId))
    : null;

  const scoreMatch = cleanContent.match(/^([1-5])(?:\s|$)/);
  if (scoreMatch && !activeConversation) {
    const surveyConversation = db.prepare(`
      SELECT c.* FROM conversations c
      WHERE c.contact_id=? AND c.status='closed' AND c.satisfaction_requested_at IS NOT NULL
        AND c.satisfaction_score IS NULL
        AND datetime(c.satisfaction_requested_at) >= datetime('now','-7 day')
      ORDER BY c.satisfaction_requested_at DESC LIMIT 1
    `).get(contact.id);
    if (surveyConversation) {
      const score = Number(scoreMatch[1]);
      // A resposta do cliente comprova que as mensagens anteriores chegaram
      // e foram abertas, mesmo quando o provedor não enviou o webhook de ACK.
      markConversationOutboundRead(surveyConversation.id, stamp);
      const customerMessageId = insertMessage({
        conversationId: surveyConversation.id, senderType:'customer', content:cleanContent,
        providerMessageId, messageType, mediaUrl, mimeType, fileName, deliveryStatus:'read',
        replyToMessageId: repliedMessage?.id || null,
      });
      db.prepare('UPDATE conversations SET satisfaction_score=? WHERE id=?').run(score,surveyConversation.id);
      db.prepare('INSERT INTO satisfaction_responses(conversation_id,contact_id,score,comment,created_at) VALUES(?,?,?,?,?)')
        .run(surveyConversation.id,contact.id,score,cleanContent.replace(/^([1-5])\s*/,''),nowIso());
      const customerMessage = {
    ...db.prepare('SELECT * FROM messages WHERE id=?').get(customerMessageId),
    reply_content: repliedMessage?.content || '',
    reply_sender_type: repliedMessage?.sender_type || '',
    reply_user_name: repliedMessage?.user_name || '',
    reply_message_type: repliedMessage?.message_type || '',
    reply_media_url: repliedMessage?.media_url || '',
    reply_mime_type: repliedMessage?.mime_type || '',
    reply_file_name: repliedMessage?.file_name || '',
  };
      realtime.emit('message:new',{conversationId:surveyConversation.id,message:customerMessage});
      const thanks = score >= 4
        ? '💚 Obrigado pela avaliação! Ficamos muito felizes em atender você.'
        : '💚 Obrigado pela avaliação. Sua opinião vai nos ajudar a melhorar cada vez mais.';
      const aiReply = await sendAiReply({conversation:surveyConversation,phone:cleanPhone,text:thanks,provider});
      realtime.emit('conversation:updated',surveyConversation);
      return {conversation:surveyConversation,customerMessage,aiReply,satisfaction:{score},duplicate:false};
    }
  }

  let conversation = activeConversation;
  let isNewConversation = !conversation;
  if (!conversation) {
    const queue = db.prepare("SELECT id FROM queues WHERE name='Atendimento' LIMIT 1").get()
      || db.prepare('SELECT id FROM queues WHERE active=1 ORDER BY id LIMIT 1').get();
    const opened = ensureActiveConversation(contact.id, () => db.prepare(`
      INSERT INTO conversations
      (contact_id, queue_id, assigned_user_id, status, ai_enabled, unread_count, protocol, last_message, last_message_at, created_at, hidden)
      VALUES (?, ?, NULL, 'waiting', 1, 0, ?, '', ?, ?, 1)
    `).run(contact.id, queue.id, protocol(), stamp, stamp));
    conversation = opened.conversation;
    isNewConversation = opened.created;
  }

  // Se o cliente respondeu, as mensagens enviadas antes desta resposta não
  // podem continuar presas em "Aguardando envio". Isso também cobre versões
  // da Evolution que não disparam MESSAGES_UPDATE de forma confiável.
  markConversationOutboundRead(conversation.id, stamp);
  const customerMessageId = insertMessage({
    conversationId: conversation.id,
    senderType: 'customer',
    content: cleanContent,
    providerMessageId,
    messageType,
    mediaUrl,
    mimeType,
    fileName,
    deliveryStatus: 'read',
    replyToMessageId: repliedMessage?.id || null,
  });
  db.prepare('UPDATE conversations SET unread_count=unread_count+1 WHERE id=?').run(conversation.id);
  const customerMessage = {
    ...db.prepare('SELECT * FROM messages WHERE id=?').get(customerMessageId),
    reply_content: repliedMessage?.content || '',
    reply_sender_type: repliedMessage?.sender_type || '',
    reply_user_name: repliedMessage?.user_name || '',
    reply_message_type: repliedMessage?.message_type || '',
    reply_media_url: repliedMessage?.media_url || '',
    reply_mime_type: repliedMessage?.mime_type || '',
    reply_file_name: repliedMessage?.file_name || '',
  };
  realtime.emit('message:new', {
    conversationId: conversation.id,
    message: customerMessage,
    notifyUserId: conversation.assigned_user_id || null,
    suppressNotification: Boolean(conversation.hidden || !conversation.assigned_user_id),
    contactName: contact.name,
  });

  let aiReply = null;
  let handledOrderChangeRequest = false;
  const currentOrderSession = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(conversation.id);
  // Cancelamento automático existe somente enquanto a IA ainda está montando o
  // rascunho do pedido. Depois de FINALIZAR/confirmar, a mensagem segue para a
  // conversa normalmente e o sistema não cancela nem abre solicitação sozinho.
  if (!handledOrderChangeRequest && wantsToEditOrder(cleanContent)) {
    const reviewSession = db.prepare("SELECT * FROM ai_order_sessions WHERE conversation_id=? AND stage='awaiting_agent_review'").get(conversation.id);
    const activeOrder = db.prepare("SELECT id,status FROM orders WHERE contact_id=? AND status NOT IN ('delivered','cancelled') ORDER BY id DESC LIMIT 1").get(contact.id);
    if (reviewSession || activeOrder) {
      createOrderChangeNotification({ conversation, contact, content: cleanContent, orderId: activeOrder?.id || null });
      conversation = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
      aiReply = await sendAiReply({
        conversation,
        phone: cleanPhone,
        text: activeOrder
          ? `Entendi. Encaminhei sua solicitação de alteração do pedido #${String(activeOrder.id).padStart(4,'0')} para um atendente. Aguarde a confirmação antes de considerar a mudança realizada.`
          : 'Entendi. Encaminhei sua solicitação de alteração para um atendente revisar antes de confirmar o pedido.',
        provider,
      });
      handledOrderChangeRequest = true;
    }
  }

  let order = null;
  let pendingAssignmentNotification = null;
  const fresh = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
  if (fresh.ai_enabled && !handledOrderChangeRequest) {
    const settings = getSettings();
    const opening = automaticOpening({ isNewContact, isNewConversation, message: cleanContent, contact, settings, conversationId: conversation.id });
    const configuredOrderMode = normalizedOrderMode(settings.bot_order_mode);
    const explicitOrderRequest = orderTriggerMatches(cleanContent, settings);
    // Intenções de pedido são tratadas uma única vez abaixo. Isso evita criar
    // dois links/sessões quando a mensagem já é uma frase de início de pedido.
    const direct = explicitOrderRequest ? null : directIntentReply({ message: cleanContent, contact, conversationId: conversation.id, settings });
    const hasOrderSessionBeforeReply = Boolean(db.prepare('SELECT 1 FROM ai_order_sessions WHERE conversation_id=?').get(conversation.id));
    const hasPendingModeChoice = Boolean(db.prepare(`SELECT 1 FROM bot_order_mode_sessions WHERE conversation_id=? AND datetime(expires_at)>datetime('now')`).get(conversation.id));
    const firstParsedForSite = parseOrderItems(cleanContent);
    const explicitLunchRequest = asksForLunch(cleanContent);
    const firstOrderRequest = !hasOrderSessionBeforeReply && !hasPendingModeChoice
      && (explicitOrderRequest || firstParsedForSite.length);
    const hasLunchSessionBeforeReply = Boolean(db.prepare('SELECT 1 FROM lunch_order_sessions WHERE conversation_id=?').get(conversation.id));
    const modeRequiresLeavingAi = !['whatsapp_ai','hybrid_ai'].includes(configuredOrderMode);
    let answer;
    if ((hasOrderSessionBeforeReply || hasLunchSessionBeforeReply) && modeRequiresLeavingAi) {
      clearSession(conversation.id);
      answer = beginOrderByConfiguredMode({ conversationId: conversation.id, contact, settings, cart: firstParsedForSite });
    } else if (explicitLunchRequest) {
      answer = await generateGroundedReply(cleanContent, { conversationId: conversation.id, replyContext: repliedMessage });
    } else if (firstOrderRequest) {
      answer = beginOrderByConfiguredMode({ conversationId: conversation.id, contact, settings, cart: firstParsedForSite });
    } else if (opening && isNewConversation) {
      markGreeting(contact.id);
      answer = { text: opening, transfer: false, reveal: false, source: isNewContact ? 'primeiro_contato' : 'saudacao_configurada' };
    } else if (opening && isSimpleGreeting(cleanContent)) {
      markGreeting(contact.id);
      answer = { text: opening, transfer: false, reveal: false, source: 'saudacao_configurada' };
    } else {
      const hasOrderSession = hasOrderSessionBeforeReply;
      const hasLunchSession = Boolean(db.prepare('SELECT 1 FROM lunch_order_sessions WHERE conversation_id=?').get(conversation.id));
      if (hasOrderSession || hasLunchSession) {
        answer = await generateGroundedReply(cleanContent, { conversationId: conversation.id, replyContext: repliedMessage });
      } else {
        const parsedForSite = firstParsedForSite;
        if (parsedForSite.length && !hasPendingModeChoice) {
          answer = beginOrderByConfiguredMode({ conversationId: conversation.id, contact, settings, cart: parsedForSite });
        } else {
          answer = handleConfiguredMenuChoice({
            message: cleanContent,
            contact,
            conversationId: conversation.id,
            settings,
          }) || direct || handleAutomation({ message: cleanContent, conversation, contact, settings });
          if (!answer) answer = await generateGroundedReply(cleanContent, { conversationId: conversation.id, replyContext: repliedMessage });
        }
      }
    }

    if (answer?.action === 'open_catalog') {
      answer = await generateGroundedReply('CARDÁPIO', { conversationId: conversation.id, replyContext: repliedMessage });
    }

    if (answer.reveal || answer.transfer) {
      const current = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
      let assignedAgent = current.assigned_user_id ? db.prepare('SELECT id,name FROM users WHERE id=?').get(current.assigned_user_id) : chooseOnlineAgent(current.queue_id);
      db.prepare('UPDATE conversations SET hidden=0,assigned_user_id=?,status=?,ai_enabled=? WHERE id=?')
        .run(assignedAgent?.id || null, assignedAgent ? 'open' : 'waiting_human', answer.disableAi ? 0 : current.ai_enabled, conversation.id);
      if (current.hidden || current.status !== 'open') pendingAssignmentNotification = { userId: assignedAgent?.id || null, conversationId: conversation.id, contactName: contact.name };
      conversation = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
    }

    if (answer.action === 'confirm_order' && answer.session) {
      db.prepare(`UPDATE ai_order_sessions SET stage='awaiting_agent_review',updated_at=? WHERE conversation_id=?`).run(nowIso(), conversation.id);
      const current = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
      const assignedAgent = current.assigned_user_id ? db.prepare('SELECT id,name FROM users WHERE id=?').get(current.assigned_user_id) : chooseOnlineAgent(current.queue_id);
      db.prepare("UPDATE conversations SET hidden=0,ai_enabled=0,assigned_user_id=?,status=? WHERE id=?")
        .run(assignedAgent?.id || null, assignedAgent ? 'open' : 'waiting_human', conversation.id);
      if (current.hidden || current.status !== 'open') pendingAssignmentNotification = { userId: assignedAgent?.id || null, conversationId: conversation.id, contactName: contact.name };
      insertMessage({
        conversationId: conversation.id,
        senderType: 'system',
        content: '📋 O cliente montou e confirmou um pedido pela IA. Revise as informações no painel lateral antes de confirmar ou cancelar.',
        isInternal: 1,
        deliveryStatus: 'sent',
      });
      conversation = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
      aiReply = await sendAiReply({
        conversation,
        phone: cleanPhone,
        text: '✅ Seu pedido foi enviado para conferência. Aguarde a confirmação da nossa equipe antes de ele seguir para a cozinha.',
        provider,
      });
    } else {
      const current = db.prepare('SELECT * FROM conversations WHERE id=?').get(conversation.id);
      const nextStatus = current.assigned_user_id ? 'open' : ((answer.transfer || answer.reveal || !current.hidden) ? 'waiting_human' : 'waiting');
      db.prepare('UPDATE conversations SET status=? WHERE id=?').run(nextStatus, conversation.id);
      if (String(answer.text || '').trim()) {
        aiReply = await sendAiReply({ conversation: current, phone: cleanPhone, text: answer.text, provider });
      }
    }
  }

  const updated = db.prepare(`
    SELECT c.*, ct.name contact_name, ct.phone, ct.email, ct.notes, ct.tags,
      q.name queue_name, q.color queue_color, u.name assigned_user_name
    FROM conversations c
    JOIN contacts ct ON ct.id=c.contact_id
    JOIN queues q ON q.id=c.queue_id
    LEFT JOIN users u ON u.id=c.assigned_user_id
    WHERE c.id=?
  `).get(conversation.id);
  realtime.emit('conversation:updated', updated);
  if (pendingAssignmentNotification) {
    notifyHumanHandoff(
      pendingAssignmentNotification.userId,
      pendingAssignmentNotification.conversationId,
      pendingAssignmentNotification.contactName,
      'Novo atendimento'
    );
  }
  return { conversation: updated, customerMessage, aiReply, order, duplicate: false };
}

module.exports = { processIncomingMessage, normalizePhone };
