const { db, nowIso } = require('../db');
const { localParts } = require('./business-hours');

const LUNCH_CATEGORY = 'Marmitex - Almoço';
const DEFAULT_START = '09:00';
const DEFAULT_END = '14:00';

const RICE_OPTIONS = ['Arroz Branco', 'Arroz à Grega', 'Sem Arroz'];
const BEAN_OPTIONS = ['Feijão Tropeiro', 'Feijão de Caldo', 'Sem Feijão'];
const GARNISH_OPTIONS = ['Batata Frita', 'Macarronese', 'Purê de Batata'];
const SALAD_OPTIONS = ['Com Salada', 'Sem Salada'];
const NON_BARBECUE_MEATS = ['Filé de Peixe Empanado', 'Estrogonofe de Frango'];

function normalize(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function timeToMinutes(value) {
  if (!validTime(value)) return null;
  const [hours, minutes] = String(value).split(':').map(Number);
  return hours * 60 + minutes;
}

function settingEnabled(settings = {}, key, fallback = true) {
  const value = settings[key];
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function getLunchStatus(settings = {}, date = new Date()) {
  const parts = localParts(date);
  const start = validTime(settings.lunch_menu_start) ? String(settings.lunch_menu_start) : DEFAULT_START;
  const end = validTime(settings.lunch_menu_end) ? String(settings.lunch_menu_end) : DEFAULT_END;
  const enabled = settingEnabled(settings, 'lunch_menu_enabled', true);
  const current = timeToMinutes(parts.time);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const available = Boolean(enabled && current != null && startMinutes != null && endMinutes != null && current >= startMinutes && current < endMinutes);
  return {
    enabled,
    available,
    date: parts.date,
    currentTime: parts.time,
    start,
    end,
    label: available ? `Disponível agora · até ${end}` : `Fora do horário · disponível das ${start} às ${end}`,
  };
}

function isLunchProduct(product = {}) {
  return String(product.category || '') === LUNCH_CATEGORY || /^marmitex\s+[pmg]\b/i.test(String(product.name || ''));
}

function getSession(conversationId) {
  if (!conversationId) return null;
  const row = db.prepare('SELECT * FROM lunch_order_sessions WHERE conversation_id=?').get(Number(conversationId));
  if (!row) return null;
  let garnishes = [];
  try { garnishes = JSON.parse(row.garnishes_json || '[]'); } catch { garnishes = []; }
  return { ...row, garnishes: Array.isArray(garnishes) ? garnishes : [] };
}

function saveSession(conversationId, patch = {}) {
  const current = getSession(conversationId) || {
    stage: 'offered', product_id: null, size: '', with_barbecue: null, quantity: 1,
    meat: '', rice: '', beans: '', garnishes: [], salad: '',
  };
  const next = { ...current, ...patch };
  db.prepare(`
    INSERT INTO lunch_order_sessions
      (conversation_id,stage,product_id,size,with_barbecue,quantity,meat,rice,beans,garnishes_json,salad,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      stage=excluded.stage,product_id=excluded.product_id,size=excluded.size,
      with_barbecue=excluded.with_barbecue,quantity=excluded.quantity,meat=excluded.meat,
      rice=excluded.rice,beans=excluded.beans,garnishes_json=excluded.garnishes_json,
      salad=excluded.salad,updated_at=excluded.updated_at
  `).run(
    Number(conversationId), String(next.stage || 'offered'), next.product_id == null ? null : Number(next.product_id),
    String(next.size || ''), next.with_barbecue == null ? null : (next.with_barbecue ? 1 : 0),
    Math.max(1, Math.min(20, Number(next.quantity || 1))), String(next.meat || ''), String(next.rice || ''),
    String(next.beans || ''), JSON.stringify(next.garnishes || []), String(next.salad || ''), nowIso(),
  );
  return getSession(conversationId);
}

function clearSession(conversationId) {
  if (!conversationId) return;
  db.prepare('DELETE FROM lunch_order_sessions WHERE conversation_id=?').run(Number(conversationId));
}

function startOffer(conversationId) {
  clearSession(conversationId);
  return saveSession(conversationId, { stage: 'offered' });
}

function lunchOfferText(status) {
  return `🍽️ *CARDÁPIO DO ALMOÇO DISPONÍVEL*\n\nTemos marmitex disponível das *${status.start} às ${status.end}*.\n\n1. Ver e montar uma marmitex\n2. Ver o cardápio completo\n\nResponda com *1* ou *2*.`;
}

function sizePrompt() {
  return `🍱 *ESCOLHA SUA MARMITEX*\n\n1. P sem churrasco — R$ 14,00\n2. P com churrasco — R$ 16,00\n3. M sem churrasco — R$ 16,00\n4. M com churrasco — R$ 18,00\n5. G sem churrasco — R$ 18,00\n6. G com churrasco — R$ 20,00\n\nResponda com o número. Você também pode escrever, por exemplo: *M com churrasco*.`;
}

function meatPrompt() {
  return `🥩 *ESCOLHA A CARNE*\n\n1. Filé de peixe empanado\n2. Estrogonofe de frango\n\nResponda com *1* ou *2*.`;
}

function ricePrompt() {
  return `🍚 *ESCOLHA O ARROZ*\n\n1. Arroz branco\n2. Arroz à grega\n3. Sem arroz`;
}

function beansPrompt() {
  return `🫘 *ESCOLHA O FEIJÃO*\n\n1. Feijão tropeiro\n2. Feijão de caldo\n3. Sem feijão`;
}

function garnishesPrompt(selected = []) {
  const chosen = selected.length ? `\n\nJá escolhido: *${selected.join(' e ')}*.` : '';
  return `🍟 *ESCOLHA 2 GUARNIÇÕES*\n\n1. Batata frita\n2. Macarronese\n3. Purê de batata\n\nEnvie dois números, por exemplo: *1 e 3*.${chosen}`;
}

function saladPrompt() {
  return `🥗 *SALADA*\n\n1. Com salada\n2. Sem salada`;
}

function quantityFromText(text) {
  const normalized = normalize(text);
  const words = { um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5 };
  const match = normalized.match(/\b(\d+|um|uma|dois|duas|tres|quatro|cinco)\s*(?:x\s*)?(?:marmitex|marmita)/);
  if (!match) return 1;
  return Math.max(1, Math.min(20, Number(match[1]) || words[match[1]] || 1));
}

function parseSizeChoice(message) {
  const raw = String(message || '').trim().replace(/[.)-]+$/, '');
  const mapping = {
    '1': ['P', false], '2': ['P', true], '3': ['M', false],
    '4': ['M', true], '5': ['G', false], '6': ['G', true],
  };
  if (mapping[raw]) return { size: mapping[raw][0], withBarbecue: mapping[raw][1], quantity: 1 };
  const text = normalize(message);
  const sizeMatch = text.match(/\b(?:marmitex|marmita)?\s*([pmg])\b/) || text.match(/\b(pequena|media|grande)\b/);
  if (!sizeMatch) return null;
  const sizeToken = sizeMatch[1];
  const size = sizeToken === 'pequena' ? 'P' : sizeToken === 'media' ? 'M' : sizeToken === 'grande' ? 'G' : sizeToken.toUpperCase();
  const without = /\bsem\s+churrasco\b/.test(text);
  const withIt = /\bcom\s+churrasco\b|\bchurrasco\b/.test(text) && !without;
  if (!withIt && !without) return null;
  return { size, withBarbecue: withIt, quantity: quantityFromText(message) };
}

function productFor(size, withBarbecue) {
  const suffix = withBarbecue ? 'Com Churrasco' : 'Sem Churrasco';
  return db.prepare('SELECT * FROM products WHERE active=1 AND category=? AND name=? LIMIT 1')
    .get(LUNCH_CATEGORY, `Marmitex ${size} - ${suffix}`) || null;
}

function beginProductSelection(conversationId, product, quantity = 1) {
  if (!product || !isLunchProduct(product)) return null;
  const match = String(product.name || '').match(/Marmitex\s+([PMG])\s+-\s+(Com|Sem)\s+Churrasco/i);
  if (!match) return null;
  const size = match[1].toUpperCase();
  const withBarbecue = match[2].toLowerCase() === 'com';
  clearSession(conversationId);
  saveSession(conversationId, {
    stage: withBarbecue ? 'rice' : 'meat',
    product_id: Number(product.id),
    size,
    with_barbecue: withBarbecue,
    quantity: Math.max(1, Math.min(20, Number(quantity || 1))),
    meat: withBarbecue ? 'Churrasco' : '',
  });
  return withBarbecue ? ricePrompt() : meatPrompt();
}

function optionFromMessage(message, options, aliases = {}) {
  const raw = String(message || '').trim().replace(/[.)-]+$/, '');
  const number = Number(raw);
  if (Number.isInteger(number) && number >= 1 && number <= options.length) return options[number - 1];
  const text = normalize(message);
  for (const option of options) {
    const candidates = [option, ...(aliases[option] || [])].map(normalize);
    if (candidates.some((candidate) => candidate && text.includes(candidate))) return option;
  }
  return '';
}

function garnishSelections(message) {
  const text = normalize(message);
  const selected = [];
  const numberMatches = [...text.matchAll(/\b([123])\b/g)].map((match) => Number(match[1]));
  for (const number of numberMatches) {
    const option = GARNISH_OPTIONS[number - 1];
    if (option && !selected.includes(option)) selected.push(option);
  }
  const aliases = {
    'Batata Frita': ['batata', 'fritas', 'batata frita'],
    Macarronese: ['macarronese', 'macarronese'],
    'Purê de Batata': ['pure', 'pure de batata'],
  };
  for (const option of GARNISH_OPTIONS) {
    if ([option, ...(aliases[option] || [])].map(normalize).some((candidate) => candidate && text.includes(candidate)) && !selected.includes(option)) selected.push(option);
  }
  return selected.slice(0, 2);
}

function buildNotes(session) {
  return [
    `Carne: ${session.meat}`,
    `Arroz: ${session.rice}`,
    `Feijão: ${session.beans}`,
    `Guarnições: ${(session.garnishes || []).join(' + ')}`,
    `Salada: ${session.salad}`,
  ].join(' | ');
}

function parseNotes(notes = '') {
  const values = {};
  for (const part of String(notes || '').split('|')) {
    const [label, ...rest] = part.split(':');
    if (!label || !rest.length) continue;
    values[normalize(label)] = rest.join(':').trim();
  }
  return values;
}

function validateLunchNotes(product, notes) {
  if (!isLunchProduct(product)) return { valid: true };
  const values = parseNotes(notes);
  const meat = values.carne || '';
  const rice = values.arroz || '';
  const beans = values.feijao || '';
  const garnishText = values.guarnicoes || '';
  const salad = values.salada || '';
  const withBarbecue = /\bCom Churrasco\b/i.test(String(product.name || ''));
  const allowedMeats = withBarbecue ? ['Churrasco'] : NON_BARBECUE_MEATS;
  const garnishes = garnishText.split('+').map((item) => item.trim()).filter(Boolean);
  const valid = allowedMeats.includes(meat)
    && RICE_OPTIONS.includes(rice)
    && BEAN_OPTIONS.includes(beans)
    && garnishes.length === 2
    && new Set(garnishes).size === 2
    && garnishes.every((item) => GARNISH_OPTIONS.includes(item))
    && SALAD_OPTIONS.includes(salad);
  return valid
    ? { valid: true }
    : { valid: false, error: 'Complete as escolhas da marmitex: carne, arroz, feijão, duas guarnições e salada.' };
}

function lunchSummary(session, product) {
  return `✅ *MARMITEX ADICIONADA*\n\n• ${session.quantity}x ${product.name} — ${Number(product.price).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}\n• ${session.meat}\n• ${session.rice}\n• ${session.beans}\n• ${(session.garnishes || []).join(' e ')}\n• ${session.salad}\n\nVocê pode continuar pedindo ou digitar *FINALIZAR*.`;
}

function asksForLunch(message) {
  return /\b(almoco|marmitex|marmita|quentinha|prato feito)\b/.test(normalize(message));
}

function lunchInformationText(status) {
  return `🍽️ *MARMITEX DO ALMOÇO*\n\n*Horário:* ${status.start} às ${status.end}\n\n*Tamanhos:*\n• P — R$ 14 sem churrasco / R$ 16 com churrasco\n• M — R$ 16 sem churrasco / R$ 18 com churrasco\n• G — R$ 18 sem churrasco / R$ 20 com churrasco\n\n*Carnes:* churrasco, filé de peixe empanado ou estrogonofe de frango.\n*Escolhas:* 1 arroz, 1 feijão, 2 guarnições e com ou sem salada.\n\n*Status:* ${status.available ? 'Disponível agora.' : `Fora do horário. Disponível das ${status.start} às ${status.end}.`}`;
}

function handleLunchConversation({ conversationId, message, settings = {} }) {
  const status = getLunchStatus(settings);
  let session = getSession(conversationId);
  const text = normalize(message);

  if (session && /\b(cancelar|cancela|desistir|desisto|deixa pra la|esquece)\b/.test(text)) {
    clearSession(conversationId);
    return { text: '❌ A montagem da marmitex foi cancelada. Nenhum item foi adicionado ao pedido.', source: 'almoco_cancelado' };
  }

  if (!status.available) {
    if (session) {
      return {
        text: `🕒 *MONTAGEM PAUSADA*\n\nO horário da marmitex terminou. O seu progresso foi mantido e poderá continuar quando o almoço estiver disponível novamente, das *${status.start} às ${status.end}*.`,
        source: 'almoco_pausado_fora_horario',
      };
    }
    if (asksForLunch(message)) return { text: lunchInformationText(status), source: 'almoco_fora_horario' };
    return null;
  }

  if (!session) {
    if (!asksForLunch(message)) return null;
    session = saveSession(conversationId, { stage: 'size' });
    return { text: sizePrompt(), source: 'almoco_iniciado' };
  }

  if (session.stage === 'offered') {
    const choice = String(message || '').trim().replace(/[.)-]+$/, '');
    if (choice === '2' || /\b(cardapio completo|outro pedido|menu completo)\b/.test(text)) {
      clearSession(conversationId);
      return { action: 'catalog', source: 'almoco_cardapio_completo' };
    }
    if (choice === '1' || asksForLunch(message) || /\b(sim|quero|pode ser|ver)\b/.test(text)) {
      session = saveSession(conversationId, { stage: 'size' });
      return { text: sizePrompt(), source: 'almoco_iniciado' };
    }
    return { text: lunchOfferText(status), source: 'almoco_oferta' };
  }

  if (session.stage === 'size') {
    const choice = parseSizeChoice(message);
    if (!choice) return { text: sizePrompt(), source: 'almoco_tamanho' };
    const product = productFor(choice.size, choice.withBarbecue);
    if (!product) return { text: 'Essa opção de marmitex está temporariamente indisponível. Escolha outra opção.', source: 'almoco_indisponivel' };
    session = saveSession(conversationId, {
      stage: choice.withBarbecue ? 'rice' : 'meat', product_id: product.id, size: choice.size,
      with_barbecue: choice.withBarbecue, quantity: choice.quantity,
      meat: choice.withBarbecue ? 'Churrasco' : '',
    });
    return { text: choice.withBarbecue ? ricePrompt() : meatPrompt(), source: choice.withBarbecue ? 'almoco_arroz' : 'almoco_carne' };
  }

  if (session.stage === 'meat') {
    const meat = optionFromMessage(message, NON_BARBECUE_MEATS, {
      'Filé de Peixe Empanado': ['peixe', 'file de peixe', 'peixe empanado'],
      'Estrogonofe de Frango': ['estrogonofe', 'strogonoff', 'estrogonofe frango'],
    });
    if (!meat) return { text: meatPrompt(), source: 'almoco_carne' };
    saveSession(conversationId, { stage: 'rice', meat });
    return { text: ricePrompt(), source: 'almoco_arroz' };
  }

  if (session.stage === 'rice') {
    const rice = optionFromMessage(message, RICE_OPTIONS, {
      'Arroz Branco': ['branco'], 'Arroz à Grega': ['grega'], 'Sem Arroz': ['sem arroz'],
    });
    if (!rice) return { text: ricePrompt(), source: 'almoco_arroz' };
    saveSession(conversationId, { stage: 'beans', rice });
    return { text: beansPrompt(), source: 'almoco_feijao' };
  }

  if (session.stage === 'beans') {
    const beans = optionFromMessage(message, BEAN_OPTIONS, {
      'Feijão Tropeiro': ['tropeiro'], 'Feijão de Caldo': ['feijao caldo', 'de caldo', 'caldo'], 'Sem Feijão': ['sem feijao'],
    });
    if (!beans) return { text: beansPrompt(), source: 'almoco_feijao' };
    saveSession(conversationId, { stage: 'garnishes', beans, garnishes: [] });
    return { text: garnishesPrompt(), source: 'almoco_guarnicoes' };
  }

  if (session.stage === 'garnishes') {
    const selected = [...new Set([...(session.garnishes || []), ...garnishSelections(message)])].slice(0, 2);
    if (selected.length < 2) {
      saveSession(conversationId, { garnishes: selected });
      return { text: garnishesPrompt(selected), source: 'almoco_guarnicoes' };
    }
    saveSession(conversationId, { stage: 'salad', garnishes: selected });
    return { text: saladPrompt(), source: 'almoco_salada' };
  }

  if (session.stage === 'salad') {
    const salad = optionFromMessage(message, SALAD_OPTIONS, {
      'Com Salada': ['com salada', 'salada sim'], 'Sem Salada': ['sem salada', 'nao quero salada'],
    });
    if (!salad) return { text: saladPrompt(), source: 'almoco_salada' };
    session = saveSession(conversationId, { stage: 'complete', salad });
    const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(session.product_id));
    if (!product) {
      clearSession(conversationId);
      return { text: 'A opção escolhida ficou indisponível. Vamos começar novamente.', source: 'almoco_indisponivel' };
    }
    const item = {
      productId: Number(product.id), name: product.name, quantity: Number(session.quantity || 1),
      unitPrice: Number(product.price || 0), price: Number(product.price || 0), notes: buildNotes(session),
    };
    const response = { action: 'complete', item, text: lunchSummary(session, product), source: 'almoco_adicionado' };
    clearSession(conversationId);
    return response;
  }

  clearSession(conversationId);
  return null;
}

module.exports = {
  LUNCH_CATEGORY,
  RICE_OPTIONS,
  BEAN_OPTIONS,
  GARNISH_OPTIONS,
  SALAD_OPTIONS,
  NON_BARBECUE_MEATS,
  getLunchStatus,
  isLunchProduct,
  startOffer,
  clearSession,
  getSession,
  lunchOfferText,
  lunchInformationText,
  asksForLunch,
  handleLunchConversation,
  beginProductSelection,
  buildNotes,
  validateLunchNotes,
};
