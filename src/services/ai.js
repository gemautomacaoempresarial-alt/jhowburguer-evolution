const { db, nowIso } = require('../db');
const { createCheckoutSession } = require('./website-checkout');
const { reviewProductRequestWithGemini } = require('./gemini-order-reviewer');
const { answerConversationWithGemini } = require('./gemini-conversation');
const { getOrderingStatus, canOrderProduct, unavailableMessage } = require('./order-availability');
const { CATEGORY_ORDER } = require('../data/jhow-menu-2026');
const {
  getLunchStatus,
  isLunchProduct,
  clearSession: clearLunchSession,
  handleLunchConversation,
  beginProductSelection,
  asksForLunch,
  lunchInformationText,
} = require('./lunch-menu');

const DEFAULT_ORDER_START_MESSAGE = `🍔 *FAZER PEDIDO*

Envie o nome do produto e a quantidade.

*Exemplo:*
1 X-Burguer
2 Coca-Cola

Digite *CARDÁPIO* para ver o cardápio.
Ao finalizar seu pedido digite *FINALIZAR*`;

function normalize(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const INFORMAL_EXPANSIONS = new Map([
  ['qro', 'quero'], ['kero', 'quero'], ['qr', 'quero'], ['qria', 'queria'],
  ['vc', 'voce'], ['vcs', 'voces'], ['tb', 'tambem'], ['tbm', 'tambem'],
  ['blz', 'beleza'], ['dboa', 'beleza'], ['suave', 'beleza'], ['jae', 'beleza'], ['pdc', 'pode crer'], ['pd', 'pode'], ['pdser', 'pode ser'], ['podecrer', 'pode crer'],
  ['ss', 'sim'], ['simm', 'sim'], ['s', 'sim'], ['nn', 'nao'], ['n', 'nao'], ['nops', 'nao'],
  ['vlw', 'valeu'], ['tmj', 'valeu'], ['flw', 'falou'], ['obg', 'obrigado'], ['obgd', 'obrigado'],
  ['qnt', 'quanto'], ['qnts', 'quantos'], ['qtd', 'quantidade'], ['q', 'que'],
  ['cardapioo', 'cardapio'], ['finalizarr', 'finalizar'], ['demoro', 'demorou'], ['fecho', 'fechou'],
]);

function normalizeInformal(text = '') {
  const normalized = normalize(text);
  if (!normalized) return '';
  return normalized
    .split(' ')
    .map((token) => INFORMAL_EXPANSIONS.get(token) || token)
    .join(' ')
    .replace(/\bme arruma\b/g, 'me ve')
    .replace(/\bmanda ai\b/g, 'manda')
    .replace(/\bbota\b/g, 'coloca')
    .replace(/\bpoe\b/g, 'coloca')
    .replace(/\bfecha ai\b/g, 'finalizar')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreText(query, text) {
  const terms = normalize(query).split(' ').filter((x) => x.length > 2);
  const target = normalize(text);
  return terms.reduce((score, term) => score + (target.includes(term) ? 1 : 0), 0);
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function safeJson(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function orderStartMessage(settings = {}) {
  return String(settings.bot_order_whatsapp_ai_message || DEFAULT_ORDER_START_MESSAGE).trim();
}


function settingEnabled(settings, key, fallback = true) {
  const value = settings?.[key];
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function productAvailableNow(product, settings = getSettings()) {
  return canOrderProduct(product, settings);
}


function catalogItemsPerPage(settings = {}) {
  return Math.max(4, Math.min(12, Number(settings.bot_catalog_items_per_page || 8)));
}

function getCatalogSession(conversationId) {
  if (!conversationId) return null;
  return db.prepare('SELECT * FROM bot_catalog_sessions WHERE conversation_id=?').get(Number(conversationId)) || null;
}

function saveCatalogSession(conversationId, patch = {}) {
  const current = getCatalogSession(conversationId) || {
    stage: 'categories', category: '', page: 0, product_id: null, resume_order_stage: '',
  };
  const next = { ...current, ...patch };
  db.prepare(`
    INSERT INTO bot_catalog_sessions
      (conversation_id,stage,category,page,product_id,resume_order_stage,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      stage=excluded.stage,category=excluded.category,page=excluded.page,
      product_id=excluded.product_id,resume_order_stage=excluded.resume_order_stage,
      updated_at=excluded.updated_at
  `).run(
    Number(conversationId), String(next.stage || 'categories'), String(next.category || ''),
    Math.max(0, Number(next.page || 0)), next.product_id == null ? null : Number(next.product_id),
    String(next.resume_order_stage || ''), nowIso(),
  );
  return getCatalogSession(conversationId);
}

function clearCatalogSession(conversationId) {
  if (!conversationId) return;
  db.prepare('DELETE FROM bot_catalog_sessions WHERE conversation_id=?').run(Number(conversationId));
}

function orderedCatalogCategories() {
  const lunchEnabled = getLunchStatus(getSettings()).enabled;
  const rows = db.prepare(`
    SELECT category,COUNT(*) AS total
    FROM products
    WHERE active=1
    GROUP BY category
  `).all().filter((row) => lunchEnabled || !isLunchProduct({ category: row.category }));
  const order = new Map(CATEGORY_ORDER.map((name, index) => [normalize(name), index]));
  return rows
    .map((row) => ({ name: String(row.category || 'Produtos').trim() || 'Produtos', total: Number(row.total || 0) }))
    .sort((a, b) => {
      const ai = order.has(normalize(a.name)) ? order.get(normalize(a.name)) : 9999;
      const bi = order.has(normalize(b.name)) ? order.get(normalize(b.name)) : 9999;
      return ai - bi || a.name.localeCompare(b.name, 'pt-BR');
    });
}

function catalogCartFooter(orderSession) {
  if (!Array.isArray(orderSession?.cart) || !orderSession.cart.length) return '';
  const quantity = orderSession.cart.reduce((total, item) => total + Number(item.quantity || 0), 0);
  return `\n\n🛒 Seu pedido atual tem *${quantity} item(ns)*. Ele continuará salvo enquanto você consulta o cardápio.`;
}

function catalogCategoriesText(orderSession = null) {
  const categories = orderedCatalogCategories();
  if (!categories.length) return '📋 *CARDÁPIO*\n\nNosso cardápio está sendo atualizado. Tente novamente em alguns minutos.';
  const lines = categories.map((category, index) => `${index + 1}. ${category.name}`);
  return `📋 *CARDÁPIO*\n\nEscolha uma categoria:\n\n${lines.join('\n')}\n\nResponda com o *número da categoria*.\n\nSe já souber o que deseja, também pode enviar o nome do produto e a quantidade.${catalogCartFooter(orderSession)}`;
}

function catalogProductsForCategory(category) {
  if (isLunchProduct({ category }) && !getLunchStatus(getSettings()).enabled) return [];
  return db.prepare(`
    SELECT * FROM products
    WHERE active=1 AND category=?
    ORDER BY name COLLATE NOCASE,id
  `).all(String(category || ''));
}

function catalogCategoryPageText(category, page, settings = {}, orderSession = null) {
  const products = catalogProductsForCategory(category);
  if (!products.length) return catalogCategoriesText(orderSession);
  const perPage = catalogItemsPerPage(settings);
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page || 0)));
  const visible = products.slice(safePage * perPage, safePage * perPage + perPage);
  const showPrices = settingEnabled(settings, 'bot_catalog_show_prices', true);
  const lines = visible.map((product, index) => {
    const stock = product.stock == null ? '' : Number(product.stock) <= 0 ? ' — indisponível' : '';
    return `${index + 1}. ${product.name}${showPrices ? ` — ${money(product.price)}` : ''}${stock}`;
  });
  const navigation = [];
  if (safePage > 0) navigation.push('90. Página anterior');
  if (safePage < totalPages - 1) navigation.push('91. Próxima página');
  navigation.push('0. Voltar às categorias');
  return `📋 *${String(category).toUpperCase()}*\n\n${lines.join('\n')}\n\nPágina *${safePage + 1} de ${totalPages}*\n\nDigite o número de um produto para ver os detalhes.\n${navigation.join('\n')}\n\nVocê também pode enviar diretamente o nome e a quantidade para pedir.${catalogCartFooter(orderSession)}`;
}

function catalogProductDetailText(product, orderSession = null) {
  if (!product) return catalogCategoriesText(orderSession);
  const lunchStatus = isLunchProduct(product) ? getLunchStatus(getSettings()) : null;
  const available = (product.stock == null || Number(product.stock) > 0) && (!lunchStatus || lunchStatus.available);
  const actions = available
    ? '1. Adicionar 1 unidade ao pedido\n2. Voltar para a categoria\n0. Voltar às categorias'
    : '2. Voltar para a categoria\n0. Voltar às categorias';
  const availabilityText = available
    ? 'Disponível agora'
    : lunchStatus && !lunchStatus.available
      ? `Fora do horário — disponível das ${lunchStatus.start} às ${lunchStatus.end}`
      : 'Indisponível hoje';
  return `🍽️ *${product.name}*\n\n${product.description || 'Produto disponível no cardápio.'}\n\n*Preço:* ${money(product.price)}\n*Disponibilidade:* ${availabilityText}\n\n${actions}${catalogCartFooter(orderSession)}`;
}

function legacyCompactCatalogText() {
  const lunchEnabled = getLunchStatus(getSettings()).enabled;
  const products = db.prepare('SELECT * FROM products WHERE active=1 ORDER BY category,name LIMIT 80').all()
    .filter((product) => lunchEnabled || !isLunchProduct(product))
    .slice(0, 40);
  if (!products.length) return '📋 *CARDÁPIO*\n\nNosso cardápio está sendo atualizado. Tente novamente em alguns minutos.';
  const groups = new Map();
  for (const product of products) {
    const category = String(product.category || 'Produtos').trim() || 'Produtos';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(`• ${product.name} — ${money(product.price)}`);
  }
  return `📋 *CARDÁPIO*\n\n${[...groups.entries()].map(([category, items]) => `*${category}*\n${items.join('\n')}`).join('\n\n')}\n\nEnvie o nome do produto e a quantidade para pedir.`;
}

function catalogResumeText(orderSession, settings = {}) {
  if (!orderSession) return 'Cardápio fechado. Quando quiser vê-lo novamente, digite *CARDÁPIO*.';
  const prompt = resumePromptForStage(orderSession);
  return `Cardápio fechado. Seu pedido continua salvo.\n\n${prompt || orderStartMessage(settings)}`;
}

function directOrderWhileBrowsing(message) {
  const raw = String(message || '').trim();
  if (!raw) return false;
  if (/^\d+\s+\S/.test(raw)) return true;
  return looksLikeOrderAction(message) || finishedAddingItems(message) || wantsToCancelEntireOrder(message);
}

async function handleCatalogNavigation({ conversationId, message, orderSession, settings }) {
  const navigationEnabled = settingEnabled(settings, 'bot_catalog_navigation_enabled', true);
  const existing = getCatalogSession(conversationId);

  if (asksForCatalog(message)) {
    if (!navigationEnabled) {
      clearCatalogSession(conversationId);
      return { text: legacyCompactCatalogText(), transfer: false, source: 'pedido_cardapio_simples' };
    }
    saveCatalogSession(conversationId, {
      stage: 'categories', category: '', page: 0, product_id: null,
      resume_order_stage: orderSession?.stage || '',
    });
    return { text: catalogCategoriesText(orderSession), transfer: false, source: 'pedido_cardapio_categorias' };
  }

  if (!existing || !navigationEnabled) return null;
  if (directOrderWhileBrowsing(message)) {
    clearCatalogSession(conversationId);
    return null;
  }

  const choice = numericChoice(message);
  const normalizedMessage = normalizeInformal(message);
  const categories = orderedCatalogCategories();

  if (existing.stage === 'categories') {
    if (choice === '0') {
      clearCatalogSession(conversationId);
      return { text: catalogResumeText(orderSession, settings), transfer: false, source: 'pedido_cardapio_fechado' };
    }
    let selected = choice ? categories[Number(choice) - 1] : null;
    if (!selected) selected = categories.find((category) => normalize(category.name) === normalizedMessage);
    if (!selected) {
      if (choice) return { text: catalogCategoriesText(orderSession), transfer: false, source: 'pedido_cardapio_categorias' };
      clearCatalogSession(conversationId);
      return null;
    }
    saveCatalogSession(conversationId, { stage: 'products', category: selected.name, page: 0, product_id: null });
    return { text: catalogCategoryPageText(selected.name, 0, settings, orderSession), transfer: false, source: 'pedido_cardapio_categoria' };
  }

  if (existing.stage === 'products') {
    if (choice === '0') {
      saveCatalogSession(conversationId, { stage: 'categories', category: '', page: 0, product_id: null });
      return { text: catalogCategoriesText(orderSession), transfer: false, source: 'pedido_cardapio_categorias' };
    }
    const products = catalogProductsForCategory(existing.category);
    const perPage = catalogItemsPerPage(settings);
    const totalPages = Math.max(1, Math.ceil(products.length / perPage));
    let page = Math.max(0, Math.min(totalPages - 1, Number(existing.page || 0)));
    if (choice === '90') page = Math.max(0, page - 1);
    else if (choice === '91') page = Math.min(totalPages - 1, page + 1);
    else if (choice) {
      const visible = products.slice(page * perPage, page * perPage + perPage);
      const product = visible[Number(choice) - 1];
      if (product) {
        saveCatalogSession(conversationId, { stage: 'detail', product_id: product.id, page });
        return { text: catalogProductDetailText(product, orderSession), transfer: false, source: 'pedido_cardapio_detalhe' };
      }
    } else {
      const ranked = products
        .map((product) => ({ product, match: findProductMatch(message, product) }))
        .filter((entry) => entry.match)
        .sort((a, b) => b.match.score - a.match.score);
      if (ranked[0]?.product) {
        saveCatalogSession(conversationId, { stage: 'detail', product_id: ranked[0].product.id, page });
        return { text: catalogProductDetailText(ranked[0].product, orderSession), transfer: false, source: 'pedido_cardapio_detalhe' };
      }
      clearCatalogSession(conversationId);
      return null;
    }
    saveCatalogSession(conversationId, { stage: 'products', page });
    return { text: catalogCategoryPageText(existing.category, page, settings, orderSession), transfer: false, source: 'pedido_cardapio_categoria' };
  }

  if (existing.stage === 'detail') {
    const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(existing.product_id));
    if (choice === '0') {
      saveCatalogSession(conversationId, { stage: 'categories', category: '', page: 0, product_id: null });
      return { text: catalogCategoriesText(orderSession), transfer: false, source: 'pedido_cardapio_categorias' };
    }
    if (choice === '2') {
      saveCatalogSession(conversationId, { stage: 'products', product_id: null });
      return { text: catalogCategoryPageText(existing.category, existing.page, settings, orderSession), transfer: false, source: 'pedido_cardapio_categoria' };
    }
    if (!choice) {
      if (asksProductDetails(message)) return { text: catalogProductDetailText(product, orderSession), transfer: false, source: 'pedido_cardapio_detalhe' };
      clearCatalogSession(conversationId);
      return null;
    }
    if (choice === '1' && product && (product.stock == null || Number(product.stock) > 0) && productAvailableNow(product, settings)) {
      if (isLunchProduct(product)) {
        clearCatalogSession(conversationId);
        const prompt = beginProductSelection(conversationId, product, 1);
        return { text: prompt || catalogProductDetailText(product, orderSession), transfer: false, source: 'pedido_almoco_personalizar' };
      }
      let nextOrderSession = orderSession || startOrderSession(conversationId);
      const added = [{
        productId: Number(product.id), name: product.name, quantity: 1,
        unitPrice: Number(product.price), price: Number(product.price), notes: '',
      }];
      nextOrderSession = saveSession(conversationId, {
        stage: 'awaiting_items',
        cart: mergeCart(nextOrderSession.cart || [], added),
      });
      saveCatalogSession(conversationId, { stage: 'products', product_id: null, resume_order_stage: 'awaiting_items' });
      return {
        text: `✅ *ITEM ADICIONADO*\n\n• 1x ${product.name} — ${money(product.price)}\n\n${catalogCategoryPageText(existing.category, existing.page, settings, nextOrderSession)}`,
        transfer: false,
        source: 'pedido_cardapio_item_adicionado',
      };
    }
    return { text: catalogProductDetailText(product, orderSession), transfer: false, source: 'pedido_cardapio_detalhe' };
  }

  clearCatalogSession(conversationId);
  return null;
}

function asksProductDetails(message) {
  const text = normalizeInformal(message);
  return /\b(o que vem|oq vem|como e feito|como eh feito|ingredientes?|descricao|detalhes?|acompanha|vem com|qual o valor|quanto custa|preco)\b/.test(text);
}

function looksLikeOrderAction(message) {
  const text = normalizeInformal(message);
  if (!text) return false;
  const startsWithQuantity = /^(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:x\s*)?[a-z]/.test(text);
  return startsWithQuantity || /\b(quero|queria|vou querer|me ve|manda|adiciona|adicionar|coloca|incluir|separa|traz)\b/.test(text);
}

function looksLikeConversationalQuestion(message) {
  const original = String(message || '').trim();
  const text = normalizeInformal(original);
  if (!text) return false;

  const explicitQuestion = /[?？]/.test(original)
    || /^(qual|quais|quanto|quantos|quantas|onde|quando|como|porque|por que|voces?|voce|tem|aceita|abre|fecha|funciona|posso|pode|faz|vende|entrega|demora|fica|seria)\b/.test(text)
    || /\b(quero saber|queria saber|me fala|me diz|me passa|poderia informar|qual o endereco|qual endereco|horario de funcionamento|que horas|taxa de entrega|formas? de pagamento|aceita pix|aceita dinheiro|aceita cartao|tem entrega|faz entrega|entrega onde|demora quanto|tem no cardapio|esta disponivel|ta disponivel)\b/.test(text);
  if (explicitQuestion) {
    if (looksLikeOrderAction(message) && !/\b(quero saber|queria saber|tem|vende|disponivel|quanto custa|qual valor)\b/.test(text)) return false;
    return true;
  }

  // Respostas operacionais continuam sendo interpretadas pelo fluxo normal.
  if (/^\d+$/.test(text)) return false;
  if (/^(sim|s|nao|n|ok|confirmar|cancelar|finalizar|pronto|entrega|retirada|pix|dinheiro|cartao|credito|debito|sem troco|com troco)$/.test(text)) return false;
  if (/\b(rua|avenida|av|travessa|bairro|numero|casa|cep)\b/.test(text) && /\d/.test(text)) return false;
  if (looksLikeOrderAction(message) || looksLikeUnknownProduct(message)) return false;
  const parsed = parseOrderRequest(message, { allowBareProducts: true });
  if (parsed.items.length || parsed.unavailable.length || parsed.ambiguous.length || parsed.matches.length) return false;

  // Frases naturais fora do roteiro também podem receber uma resposta humana.
  return text.split(/\s+/).length >= 2
    || /^(obrigado|obrigada|valeu|tudo bem|beleza|legal|entendi|show|perfeito)$/.test(text);
}

function resumePromptForStage(session) {
  const stage = String(session?.stage || '');
  if (stage === 'awaiting_items') return 'Pode continuar enviando os produtos. Quando terminar, digite *FINALIZAR*.';
  if (stage === 'awaiting_fulfillment') return 'Para continuar o pedido, responda *1* para entrega ou *2* para retirada.';
  if (stage === 'awaiting_address') return 'Para continuar, envie seu endereço com rua, número e bairro.';
  if (stage === 'awaiting_payment') return 'Para continuar, escolha: *1* Pix, *2* Dinheiro ou *3* Cartão.';
  if (stage === 'awaiting_cash_change') return 'Para continuar, responda *1* se precisa de troco ou *2* se não precisa.';
  if (stage === 'awaiting_cash_change_value') return 'Para continuar, informe o valor para o qual precisa de troco.';
  if (stage === 'awaiting_confirmation') return 'Seu pedido continua salvo. Responda *1* para confirmar, *2* para alterar ou *3* para cancelar.';
  return '';
}

async function conversationalOrderReply({ message, conversationId, session, settings, replyContext = null }) {
  if (!looksLikeConversationalQuestion(message)) return null;
  const result = await answerConversationWithGemini({ message, conversationId, session, settings, replyContext });
  if (!result || result.action === 'ignore') return null;
  if (result.action === 'transfer') {
    return {
      text: result.text || 'Entendi. Vou encaminhar você para uma pessoa da equipe.',
      transfer: true,
      reveal: true,
      source: 'gemini_conversa_transferencia',
    };
  }
  const resume = resumePromptForStage(session);
  return {
    text: [result.text, resume].filter(Boolean).join('\n\n'),
    transfer: false,
    source: 'gemini_conversa_pedido',
  };
}

function answerFromKnowledge(message) {
  const rows = db.prepare('SELECT * FROM knowledge WHERE active = 1').all();
  const ranked = rows
    .map((row) => ({ row, score: scoreText(message, `${row.title} ${row.category} ${row.keywords} ${row.content}`) }))
    .sort((a, b) => b.score - a.score);
  if (ranked[0]?.score >= 1) return ranked[0].row.content;
  return null;
}

function productVariants(product) {
  const raw = [product.name, ...String(product.aliases || '').split(/[,;|\n]/g)]
    .map((value) => normalize(value))
    .filter(Boolean);
  const variants = new Set();
  for (const value of raw) {
    variants.add(value);
    variants.add(value.replace(/\s+/g, ''));
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

function tokenRoot(token) {
  let value = String(token || '');
  if (value.length > 5 && value.endsWith('oes')) value = `${value.slice(0, -3)}ao`;
  else if (value.length > 4 && value.endsWith('es')) value = value.slice(0, -2);
  else if (value.length > 3 && value.endsWith('s')) value = value.slice(0, -1);
  return value;
}

function tokenDistance(a, b) {
  const left=String(a||''),right=String(b||'');
  const matrix=Array.from({length:left.length+1},()=>Array(right.length+1).fill(0));
  for(let i=0;i<=left.length;i+=1)matrix[i][0]=i;
  for(let j=0;j<=right.length;j+=1)matrix[0][j]=j;
  for(let i=1;i<=left.length;i+=1){
    for(let j=1;j<=right.length;j+=1){
      matrix[i][j]=Math.min(matrix[i-1][j]+1,matrix[i][j-1]+1,matrix[i-1][j-1]+(left[i-1]===right[j-1]?0:1));
    }
  }
  return matrix[left.length][right.length];
}

function tokenSimilar(candidate, token) {
  if(candidate===token)return true;
  if(token.length>=4&&candidate.startsWith(token))return true;
  if(candidate.length>=4&&token.startsWith(candidate))return true;
  if(candidate.length<4||token.length<4)return false;
  const limit=Math.max(candidate.length,token.length)>=7?2:1;
  return tokenDistance(candidate,token)<=limit;
}

function findVariantMatch(text, compactText, variant) {
  if (!variant) return null;
  const compactVariant = variant.replace(/\s+/g, '');
  const exactIndex = text.indexOf(variant);
  if (exactIndex >= 0) return { start: exactIndex, end: exactIndex + variant.length, score: 100 + variant.length };
  const compactIndex = compactVariant.length >= 4 ? compactText.indexOf(compactVariant) : -1;
  if (compactIndex >= 0) {
    let compactPosition = 0;
    let start = 0;
    let end = text.length;
    let started = false;
    for (let index = 0; index < text.length; index += 1) {
      if (/\s/.test(text[index])) continue;
      if (!started && compactPosition === compactIndex) { start = index; started = true; }
      compactPosition += 1;
      if (started && compactPosition >= compactIndex + compactVariant.length) { end = index + 1; break; }
    }
    return { start, end, score: 80 + compactVariant.length };
  }
  const tokens = variant.split(' ').map(tokenRoot).filter((token) => token.length > 1);
  if (!tokens.length) return null;
  const tokenEntries=[];
  for(const match of text.matchAll(/\S+/g)) tokenEntries.push({raw:match[0],root:tokenRoot(match[0]),index:match.index||0});
  const matchedEntries=[];
  for(const token of tokens){
    const entry=tokenEntries.find((candidate)=>tokenSimilar(candidate.root,token));
    if(entry)matchedEntries.push(entry);
  }
  const coverage = matchedEntries.length / tokens.length;
  if (coverage < (tokens.length <= 2 ? 1 : 0.75)) return null;
  const positions = matchedEntries.map((entry)=>entry.index);
  const endPositions = matchedEntries.map((entry)=>entry.index+entry.raw.length);
  return { start: positions.length ? Math.min(...positions) : 0, end: endPositions.length ? Math.max(...endPositions) : variant.length, score: Math.round(coverage * 60) + tokens.length };
}

function attributeText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/[^a-z0-9.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCriticalAttributes(text = '') {
  const value = attributeText(text);
  const attributes = new Set();
  for (const match of value.matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l|litro|litros)\b/g)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (Number.isFinite(amount)) attributes.add(`volume:${Math.round((unit === 'ml' ? amount : amount * 1000))}`);
  }
  if (/\b(coca|refrigerante|refri|suco|agua|bebida|guarana|fanta|sprite|pepsi)\b/.test(value)) {
    for (const match of value.matchAll(/\b(1[0-9]{2}|[2-9][0-9]{2}|[1-5][0-9]{3})\b/g)) {
      const amount = Number(match[1]);
      if (Number.isFinite(amount)) attributes.add(`volume:${amount}`);
    }
  }
  for (const match of value.matchAll(/\b(\d+(?:\.\d+)?)\s*(g|gr|grama|gramas|kg|quilo|quilos)\b/g)) {
    const amount = Number(match[1]);
    const unit = match[2];
    if (Number.isFinite(amount)) attributes.add(`peso:${Math.round((['kg','quilo','quilos'].includes(unit) ? amount * 1000 : amount))}`);
  }
  const groups = {
    'versao:zero': /\b(zero|sem acucar)\b/,
    'versao:diet': /\bdiet\b/,
    'versao:light': /\blight\b/,
    'versao:tradicional': /\b(tradicional|normal)\b/,
    'tamanho:pequeno': /\b(pequeno|pequena|p)\b/,
    'tamanho:medio': /\b(medio|media|m)\b/,
    'tamanho:grande': /\b(grande|g)\b/,
    'embalagem:lata': /\blata\b/,
    'embalagem:garrafa': /\b(garrafa|pet)\b/,
    'embalagem:long-neck': /\b(long\s*neck|longneck)\b/,
    'tipo:combo': /\b(combo|completo)\b/,
    'tipo:porcao': /\b(porcao|porção)\b/,
  };
  for (const [key, pattern] of Object.entries(groups)) if (pattern.test(value)) attributes.add(key);
  return attributes;
}

function criticalAttributesCompatible(message, product) {
  const requested = extractCriticalAttributes(message);
  if (!requested.size) return true;
  const available = extractCriticalAttributes(`${product.name || ''} ${product.aliases || ''} ${product.description || ''}`);
  for (const attribute of requested) {
    if (!available.has(attribute)) return false;
  }
  return true;
}

function localProductClause(normalizedMessage, match) {
  const text = String(normalizedMessage || '');
  const start = Math.max(0, Number(match?.start || 0));
  const end = Math.max(start, Number(match?.end || start));
  const before = text.slice(0, start);
  const after = text.slice(end);
  const leftMatches = [...before.matchAll(/(?:,|;|\n|\s+e\s+|\s+mais\s+|\s+tambem\s+)/g)];
  const left = leftMatches.length ? (leftMatches[leftMatches.length - 1].index + leftMatches[leftMatches.length - 1][0].length) : 0;
  const rightMatch = after.match(/(?:,|;|\n|\s+e\s+|\s+mais\s+|\s+tambem\s+)/);
  const right = rightMatch ? end + rightMatch.index : text.length;
  return text.slice(left, right).trim() || text;
}

function findProductMatch(message, product) {
  const text = normalizeInformal(message);
  const compactText = text.replace(/\s+/g, '');
  let best = null;
  for (const variant of productVariants(product)) {
    const match = findVariantMatch(text, compactText, variant);
    if (!match || (best && match.score <= best.score)) continue;
    const scopeText = localProductClause(text, match);
    if (!criticalAttributesCompatible(scopeText, product)) continue;
    best = { ...match, variant, scopeText };
  }
  return best;
}

function requestScopeForProduct(message, product) {
  const match = findProductMatch(message, product);
  return match?.scopeText || String(message || '');
}


function normalizedRequestedProductClause(value = '') {
  return normalizeInformal(value)
    .replace(/^(?:quero|queria|vou querer|me ve|manda|adiciona|adicionar|coloca|colocar|traz|separa|pedido|pedir|preciso|gostaria|faz|fazer)\s+/, '')
    .replace(/^(?:o|a|os|as|um|uma)\s+/, '')
    .replace(/^\d+\s*x\s+/, '')
    .replace(/^(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)(?:\s+(?:unidades?|un|de|do|da|dos|das))?\s+/, '')
    .replace(/^(?:o|a|os|as)\s+/, '')
    .trim();
}

const numberWords = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12,
};

function parseQuantityToken(value) {
  const normalized = normalize(value);
  return Number(normalized) || numberWords[normalized] || 0;
}

function quantityNearMatch(message, match) {
  const text = normalize(message);
  const prefix = text.slice(Math.max(0, match.start - 40), match.start).trim();
  const suffix = text.slice(match.end, Math.min(text.length, match.end + 24)).trim();
  const tokenPattern = '(\\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';
  const before = prefix.match(new RegExp(`(?:^|\\s)${tokenPattern}(?:\\s*(?:x|unidades?|un|de|do|da|dos|das))?\\s*$`));
  if (before) return Math.max(1, parseQuantityToken(before[1]));
  const after = suffix.match(new RegExp(`^(?:x\\s*)?${tokenPattern}(?:\\s*(?:unidades?|un))?(?:\\s|$)`));
  if (after) return Math.max(1, parseQuantityToken(after[1]));
  return 1;
}

function spansOverlap(left, right) {
  return left.match.start < right.match.end && right.match.start < left.match.end;
}

function groupProductMatches(matches) {
  const groups = [];
  for (const entry of matches) {
    let group = groups.find((candidate) => candidate.some((existing) => spansOverlap(existing, entry)));
    if (!group) {
      group = [];
      groups.push(group);
    }
    group.push(entry);
  }
  return groups;
}

function candidateSummary(entries = []) {
  return entries.slice(0, 5).map((entry) => ({
    productId: Number(entry.product.id),
    name: entry.product.name,
    price: Number(entry.product.price || 0),
    stock: entry.product.stock == null ? null : Number(entry.product.stock),
  }));
}

function parseOrderRequest(message, options = {}) {
  const normalized = normalizeInformal(message);
  const settings = getSettings();
  const products = db.prepare('SELECT * FROM products WHERE active=1 ORDER BY length(name) DESC,id').all()
    .filter((product) => productAvailableNow(product, settings));
  const intent = /\b(quero|queria|vou querer|pode ser|me ve|me vê|manda|mandar|adiciona|adicionar|pedido|pedir|separa|separar|coloca|colocar|traz|trazer|preciso|gostaria|faz|fazer)\b/.test(normalized);
  const hasQuantity = /\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\b/.test(normalized);
  const looksLikeAddress = /\b(rua|avenida|av|alameda|travessa|bairro|cep|numero|casa|apartamento|apto|bloco)\b/.test(normalized) && /\d/.test(normalized);
  if (looksLikeAddress && !intent) return { items: [], unavailable: [], ambiguous: [], matches: [] };
  const matches = [];
  for (const product of products) {
    const match = findProductMatch(message, product);
    if (!match) continue;
    matches.push({ product, match, quantity: quantityNearMatch(message, match) });
  }
  const allowBareProducts = Boolean(options.allowBareProducts);
  if (!matches.length || (!allowBareProducts && !intent && !hasQuantity && matches.length < 2)) {
    return { items: [], unavailable: [], ambiguous: [], matches: [] };
  }

  matches.sort((a, b) => a.match.start - b.match.start || b.match.score - a.match.score || String(a.product.name).localeCompare(String(b.product.name), 'pt-BR'));
  const groups = groupProductMatches(matches);
  const items = [];
  const unavailable = [];
  const ambiguous = [];
  const used = new Set();

  for (const group of groups) {
    const ranked = [...group].sort((a, b) => b.match.score - a.match.score || String(a.product.name).localeCompare(String(b.product.name), 'pt-BR'));
    const best = ranked[0];
    const second = ranked[1];
    const requestedAttributes = extractCriticalAttributes(best?.match?.scopeText || message);
    const exactAttributeMatches = ranked.filter((entry) => {
      if (!requestedAttributes.size) return false;
      const available = extractCriticalAttributes(`${entry.product.name || ''} ${entry.product.aliases || ''} ${entry.product.description || ''}`);
      return [...requestedAttributes].every((attribute) => available.has(attribute));
    });
    const requestedClause = normalizedRequestedProductClause(best?.match?.scopeText || message);
    const exactVariantMatches = ranked.filter((entry) => {
      const variants = productVariants(entry.product);
      return variants.includes(requestedClause) || variants.includes(requestedClause.replace(/\s+/g, ''));
    });
    let selected = best;

    if (exactVariantMatches.length === 1) selected = exactVariantMatches[0];
    else if (exactAttributeMatches.length === 1) selected = exactAttributeMatches[0];
    else if (ranked.length > 1) {
      const scoreGap = Number(best.match.score || 0) - Number(second.match.score || 0);
      const sameSpan = best.match.start === second.match.start && best.match.end === second.match.end;
      const genericVariant = normalize(best.match.variant).split(' ').length <= 2;
      const exactBestMatch = Number(best.match.score || 0) >= 100;
      if (scoreGap < 12 || sameSpan || (genericVariant && !exactBestMatch)) {
        ambiguous.push({
          requested: String(message || '').trim().slice(0, 160),
          quantity: best.quantity,
          candidates: candidateSummary(ranked),
        });
        continue;
      }
    }

    if (!selected || used.has(selected.product.id)) continue;
    used.add(selected.product.id);
    const stock = selected.product.stock == null ? null : Number(selected.product.stock);
    if (stock !== null && stock < selected.quantity) {
      unavailable.push({ productId: selected.product.id, name: selected.product.name, requested: selected.quantity, stock });
      continue;
    }
    items.push({
      productId: selected.product.id,
      name: selected.product.name,
      quantity: selected.quantity,
      unitPrice: Number(selected.product.price),
      price: Number(selected.product.price),
      notes: '',
    });
  }
  return { items, unavailable, ambiguous, matches };
}

function parseOrderItems(message) {
  return parseOrderRequest(message).items;
}

function unavailableText(unavailable) {
  if (!unavailable.length) return '';
  return unavailable.map((item) => item.stock <= 0
    ? `• ${item.name}: não temos estoque para hoje`
    : `• ${item.name}: você pediu ${item.requested}, mas temos ${item.stock} disponível(is)`
  ).join('\n');
}


function looksLikeUnknownProduct(message) {
  const value = normalizeInformal(message);
  if (!value || /\b(rua|avenida|av|bairro|numero|casa|cep|pix|dinheiro|cartao|credito|debito|entrega|retirada|finalizar|confirmar|cancelar)\b/.test(value)) return false;
  const startsWithQuantity = /^(?:\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:x\s*)?[a-z]/.test(value);
  const orderLanguage = /\b(quero|queria|vou querer|me ve|manda|adiciona|coloca|traz|separa|pedido|pedir)\b/.test(value);
  const foodLanguage = /\b(x[- ]?burg|hamburg|burger|burguer|coca|refrigerante|suco|agua|batata|combo|pizza|lanche|bebida|porcao|hot dog|cachorro quente|sanduiche)\b/.test(value);
  return startsWithQuantity || orderLanguage || foodLanguage;
}

function unrecognizedProductText(message) {
  const requested = String(message || '').trim().replace(/\s+/g,' ').slice(0,90);
  return `⚠️ *PRODUTO NÃO ADICIONADO*\n\nNão encontrei “${requested || 'esse item'}” no cardápio, então ele *não entrou no pedido*.\n\nEnvie o nome novamente ou responda *CARDÁPIO* para consultar os produtos disponíveis.`;
}


function candidateNames(candidates = []) {
  return candidates.slice(0, 5).map((candidate) => {
    const product = candidate.productId
      ? db.prepare('SELECT id,name,price,stock FROM products WHERE id=? AND active=1').get(Number(candidate.productId))
      : null;
    if (!product) return null;
    return `• ${product.name} — ${money(product.price)}${Number(product.stock) === 0 ? ' — indisponível hoje' : ''}`;
  }).filter(Boolean);
}

function ambiguousProductText(message, candidates = [], reason = '') {
  const requested = String(message || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const options = candidateNames(candidates);
  const reasonLine = reason ? `\n\n${String(reason).trim()}` : '';
  const optionsLine = options.length ? `\n\n*Opções parecidas disponíveis:*\n${options.join('\n')}` : '';
  return `⚠️ *PRODUTO NÃO ADICIONADO*\n\nNão encontrei uma correspondência exata para “${requested || 'esse item'}”, então nada foi incluído no pedido.${reasonLine}${optionsLine}\n\nEnvie o nome completo do produto ou responda *CARDÁPIO*.`;
}

function parseIssueText(parsed, message) {
  if (parsed?.clarificationText) return parsed.clarificationText;
  if (parsed?.ambiguous?.length) {
    const candidates = parsed.ambiguous.flatMap((entry) => entry.candidates || []);
    return ambiguousProductText(message, candidates, 'Há mais de uma opção possível ou a variação informada não está cadastrada exatamente.');
  }
  return unrecognizedProductText(message);
}

async function parseOrderRequestReviewed(message, options = {}) {
  const normal = parseOrderRequest(message, options);
  if (!looksLikeUnknownProduct(message) && !normal.items.length && !normal.ambiguous.length && !normal.matches.length) return normal;

  const review = await reviewProductRequestWithGemini(message);
  if (!review || review.action === 'ignore') return normal;

  const candidateById = new Map((review.candidates || []).map((product) => [Number(product.id), product]));
  if (review.action === 'add') {
    const items = [];
    const unavailable = [];
    for (const requested of review.items || []) {
      const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(requested.productId));
      if (!product || !candidateById.has(Number(product.id))) continue;
      if (!productAvailableNow(product)) continue;
      if (!criticalAttributesCompatible(requestScopeForProduct(message, product), product)) continue;
      const quantity = Math.max(1, Math.min(20, Math.floor(Number(requested.quantity || 1))));
      const stock = product.stock == null ? null : Number(product.stock);
      if (stock !== null && stock < quantity) {
        unavailable.push({ productId: product.id, name: product.name, requested: quantity, stock });
        continue;
      }
      items.push({ productId: product.id, name: product.name, quantity, unitPrice: Number(product.price), price: Number(product.price), notes: '' });
    }
    if (items.length || unavailable.length) {
      return { items, unavailable, ambiguous: [], matches: normal.matches, reviewer: 'gemini' };
    }
    return normal;
  }

  const candidates = (review.candidateIds || []).map((id) => ({ productId: id }));
  const reason = review.reason || (review.action === 'not_found'
    ? 'A variação solicitada não está cadastrada exatamente.'
    : 'Preciso confirmar qual opção você deseja.');
  return {
    items: [],
    unavailable: [],
    ambiguous: [{ requested: review.requestedDescription || String(message || '').trim(), candidates }],
    matches: normal.matches,
    reviewer: 'gemini',
    clarificationText: ambiguousProductText(message, candidates, reason),
  };
}

function answerFromProducts(message) {
  const normalized = normalizeInformal(message);
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category,name').all();
  if (/\b(cardapio|menu|produtos|lanches|combos|bebidas|precos|preco)\b/.test(normalized)) {
    return catalogCategoriesText(null);
  }
  const ranked = products.map((product) => ({ product, match: findProductMatch(message, product) })).filter((entry) => entry.match).sort((a, b) => b.match.score - a.match.score);
  if (ranked[0]) {
    const product = ranked[0].product;
    const lunchStatus = isLunchProduct(product) ? getLunchStatus(getSettings()) : null;
    const availability = lunchStatus
      ? `\n\n*Horário do almoço:* ${lunchStatus.start} às ${lunchStatus.end}\n*Status:* ${lunchStatus.available ? 'Disponível agora.' : 'Fora do horário.'}`
      : '';
    return `🍔 *${product.name}*\n\n${product.description || 'Produto disponível no cardápio.'}\n\n*Valor:* ${money(product.price)}${product.stock === 0 ? '\n*Indisponível hoje.*' : ''}${availability}`;
  }
  return null;
}

function getSession(conversationId) {
  const row = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(Number(conversationId));
  return row ? { ...row, cart: safeJson(row.cart_json, []) } : null;
}

function saveSession(conversationId, patch) {
  const current = getSession(conversationId) || { stage: 'awaiting_items', cart: [], fulfillment_method: '', address: '', payment_method: '', needs_change: 0, change_for: null, delivery_fee: 0, customer_notes: '', resume_stage: '' };
  const next = { ...current, ...patch };
  db.prepare(`
    INSERT INTO ai_order_sessions
      (conversation_id,stage,cart_json,fulfillment_method,address,payment_method,needs_change,change_for,delivery_fee,customer_notes,resume_stage,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(conversation_id) DO UPDATE SET
      stage=excluded.stage,cart_json=excluded.cart_json,fulfillment_method=excluded.fulfillment_method,
      address=excluded.address,payment_method=excluded.payment_method,needs_change=excluded.needs_change,change_for=excluded.change_for,delivery_fee=excluded.delivery_fee,
      customer_notes=excluded.customer_notes,resume_stage=excluded.resume_stage,updated_at=excluded.updated_at
  `).run(
    Number(conversationId), next.stage, JSON.stringify(next.cart || []), next.fulfillment_method || '',
    next.address || '', next.payment_method || '', next.needs_change ? 1 : 0, next.change_for == null ? null : Number(next.change_for), Number(next.delivery_fee || 0), next.customer_notes || '', next.resume_stage || '', nowIso(),
  );
  return getSession(conversationId);
}

function clearSession(conversationId) {
  db.prepare('DELETE FROM ai_order_sessions WHERE conversation_id=?').run(Number(conversationId));
  clearCatalogSession(conversationId);
  clearLunchSession(conversationId);
}


function startOrderSession(conversationId, initialCart = []) {
  const settings = getSettings();
  clearSession(conversationId);
  return saveSession(conversationId, {
    stage: 'awaiting_items',
    cart: Array.isArray(initialCart) ? initialCart : [],
    fulfillment_method: '',
    address: '',
    payment_method: '',
    needs_change: 0,
    change_for: null,
    delivery_fee: Number(settings.delivery_fee || 0),
    customer_notes: '',
    resume_stage: '',
  });
}

function wantsToAddMore(message) {
  const text = normalizeInformal(message);
  if (/\b(nao|nunca)\b.*\bmais\b/.test(text)) return false;
  return /\b(quero|queria|vou|pode|posso)?\s*(adicionar|acrescentar|colocar|incluir|pedir)?\s*mais\b|\bmais\s+(alguma\s+coisa|algum\s+item|itens?|produtos?|lanches?|bebidas?)\b|\bfaltou\b|\btambem\s+quero\b/.test(text);
}


function wantsToEditOrder(message) {
  const text = normalizeInformal(message);
  return /\b(alterar|altera|alteracao|editar|edita|mudar|muda|trocar|troca|remover|remove|retirar|tira|excluir|exclui|diminuir|aumentar|corrigir|correcao)\b/.test(text);
}

function findCartItem(cart, message) {
  const text = normalizeInformal(message);
  return (cart || []).find((item) => {
    const name = normalize(item.name || '');
    const words = name.split(/\s+/).filter((word) => word.length > 2);
    return name && (text.includes(name) || words.some((word) => text.includes(word)));
  });
}

function editQuantityFromMessage(message) {
  const text = normalizeInformal(message);
  const digit = text.match(/\b(\d{1,2})\b/);
  if (digit) return Number(digit[1]);
  const words = { um:1, uma:1, dois:2, duas:2, tres:3, quatro:4, cinco:5, seis:6, sete:7, oito:8, nove:9, dez:10 };
  for (const [word,value] of Object.entries(words)) if (new RegExp(`\\b${word}\\b`).test(text)) return value;
  return null;
}

function handleCartEdit(conversationId, session, message, settings) {
  if (!wantsToEditOrder(message)) return null;
  const cart = Array.isArray(session.cart) ? [...session.cart] : [];
  if (!cart.length) return { text: 'Seu pedido ainda não tem itens para alterar. Envie o produto e a quantidade que deseja.', transfer: false, source: 'pedido_edicao_sem_itens' };
  const item = findCartItem(cart, message);
  if (!item) return { text: `Qual item você deseja alterar ou remover?\n${cartText(cart)}\n\nExemplo: *REMOVER COCA-COLA* ou *ALTERAR X-BURGUER PARA 2*.`, transfer: false, source: 'pedido_edicao_item' };
  const text = normalize(message);
  const removing = /\b(remover|remove|retirar|tira|excluir|exclui|sem)\b/.test(text);
  const quantity = editQuantityFromMessage(message);
  let nextCart;
  if (removing || quantity === 0) {
    nextCart = cart.filter((row) => Number(row.productId || row.product_id) !== Number(item.productId || item.product_id));
  } else if (quantity != null) {
    nextCart = cart.map((row) => Number(row.productId || row.product_id) === Number(item.productId || item.product_id) ? { ...row, quantity } : row);
  } else {
    return { text: `Entendi que você quer alterar *${item.name}*. Informe a nova quantidade ou diga *REMOVER ${item.name.toUpperCase()}*.`, transfer: false, source: 'pedido_edicao_quantidade' };
  }
  const next = saveSession(conversationId, { cart: nextCart, stage: nextCart.length ? 'awaiting_items' : 'awaiting_items' });
  if (!nextCart.length) return { text: 'Removi o item. Seu pedido ficou vazio. Envie outro produto e a quantidade para continuar.', transfer: false, source: 'pedido_item_removido' };
  return { text: `${removing ? 'Item removido' : 'Quantidade alterada'} com sucesso.\n\n${cartText(next.cart)}\n\nVocê pode continuar alterando, adicionar mais itens ou responder *FINALIZAR*.`, transfer: false, source: 'pedido_editado' };
}

function finishedAddingItems(message) {
  const text = normalizeInformal(message);
  return /^(finalizar|finaliza|continuar|continua|pronto|so isso|somente isso|nao quero mais|nao vou querer mais|pode fechar|fecha o pedido|fechar pedido|acabou|terminei|terminei o pedido|n|nao)$/.test(text);
}

function asksForCatalog(message) {
  return /\b(cardapio|menu|produtos|lanches|combos|bebidas|precos?|opcoes)\b/.test(normalizeInformal(message));
}

function asksToStartOrder(message) {
  const text = normalizeInformal(message);
  return /\b(quero|queria|gostaria|vou|preciso|desejo)\s+(fazer|montar|iniciar|comecar)?\s*(um\s+)?pedido\b|\b(fazer|montar|iniciar|comecar)\s+(um\s+)?pedido\b/.test(text);
}

function cartSubtotal(cart) {
  return cart.reduce((total, item) => total + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0);
}

function cartText(cart) {
  return cart.map((item) => `• ${item.quantity}x ${item.name} — ${money(Number(item.unitPrice) * Number(item.quantity))}`).join('\n');
}

function numericChoice(message) {
  const value = String(message || '').trim().replace(/[.)-]+$/, '');
  return /^\d+$/.test(value) ? value : '';
}

function classifyFulfillment(message) {
  const choice = numericChoice(message);
  if (choice === '1') return 'delivery';
  if (choice === '2') return 'pickup';
  const text = normalizeInformal(message);
  if (/\b(retirar|retiro|retirada|buscar|busco|pegar|loja|balcao)\b/.test(text)) return 'pickup';
  if (/\b(entrega|entregar|delivery|mandar|trazer|levar)\b/.test(text)) return 'delivery';
  return '';
}

function classifyPayment(message) {
  const choice = numericChoice(message);
  if (choice === '1') return 'Pix';
  if (choice === '2') return 'Dinheiro';
  if (choice === '3') return 'Cartão';
  const text = normalizeInformal(message);
  if (/\bpix\b/.test(text)) return 'Pix';
  if (/\b(dinheiro|especie|troco)\b/.test(text)) return 'Dinheiro';
  if (/\b(cartao|credito|debito|maquininha)\b/.test(text)) return 'Cartão';
  return '';
}

function isYes(message) {
  if (numericChoice(message) === '1') return true;
  return /^(sim|s|pode ser|fechou|demorou|bora|pode crer|beleza|blz|show|top|ja era|sim pode|sim pode confirmar|confirmo|confirmar|pode confirmar|isso mesmo|isso|ok|certo|correto|fechado|pode fazer|pode mandar|pode)$/i.test(normalize(message));
}

function isNo(message) {
  if (numericChoice(message) === '3') return true;
  return /^(nao|n|não|nem|cancelar|cancela|desistir|desisto|nao confirmar|não confirmar|deixa pra la|deixa para la)$/i.test(normalize(message));
}

function cashChangePrompt() {
  return `💵 *PAGAMENTO EM DINHEIRO*\n\nVocê precisa de troco?\n\n1. Sim\n2. Não\n\nResponda com *1* ou *2*.`;
}

function classifyCashChange(message) {
  const choice = numericChoice(message);
  if (choice === '1') return 'yes';
  if (choice === '2') return 'no';
  const text = normalizeInformal(message);
  if (/^(sim|s|preciso|quero|com troco|vai precisar)$/.test(text)) return 'yes';
  if (/^(nao|n|sem troco|nao precisa|nao preciso|valor exato)$/.test(text)) return 'no';
  return '';
}

function parseCashValue(message) {
  const raw = String(message || '').replace(/[^0-9,.-]/g, '').trim();
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',') && raw.includes('.')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) normalized = raw.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function sessionTotal(session) {
  const subtotal = cartSubtotal(session.cart || []);
  const fee = session.fulfillment_method === 'delivery' ? Number(session.delivery_fee || 0) : 0;
  return subtotal + fee;
}

function cashChangeValuePrompt(session, error = '') {
  const total = sessionTotal(session);
  const warning = error ? `\n\n⚠️ ${error}` : '';
  return `💵 *TROCO*\n\nO total do pedido é *${money(total)}*.${warning}\n\nTroco para qual valor?\n\n*Exemplo:* R$ 100,00`;
}

function confirmationSummary(session, settings) {
  const subtotal = cartSubtotal(session.cart);
  const fee = session.fulfillment_method === 'delivery' ? Number(session.delivery_fee || 0) : 0;
  const total = subtotal + fee;
  const destination = session.fulfillment_method === 'pickup'
    ? `Retirada na loja\n${settings.store_pickup_address || 'Endereço cadastrado no estabelecimento'}`
    : `Entrega em\n${session.address}`;
  const feeLine = session.fulfillment_method === 'delivery' ? `\nTaxa de entrega: ${money(fee)}` : '';
  const changeLine = session.payment_method === 'Dinheiro'
    ? (session.needs_change && Number(session.change_for || 0) > 0 ? `\nTroco para: ${money(session.change_for)}` : '\nSem troco')
    : '';
  return `🧾 *RESUMO DO PEDIDO*\n\n${cartText(session.cart)}\n\n📍 *Recebimento*\n${destination}${feeLine}\n\n💳 *Pagamento*\n${session.payment_method}${changeLine}\n\n💰 *Total: ${money(total)}*\n\n1. Confirmar pedido\n2. Adicionar ou alterar item\n3. Cancelar pedido\n\nResponda com *1*, *2* ou *3*.`;
}

function mergeCart(currentCart, addedItems) {
  const merged = new Map((currentCart || []).map((item) => [Number(item.productId || item.product_id), { ...item }]));
  for (const item of addedItems || []) {
    const id = Number(item.productId || item.product_id);
    const existing = merged.get(id);
    if (existing) existing.quantity = Number(existing.quantity || 0) + Number(item.quantity || 0);
    else merged.set(id, { ...item });
  }
  return [...merged.values()].filter((item) => Number(item.quantity || 0) > 0);
}

function checkoutInvitation(conversationId, cart) {
  try {
    const websiteEnabled = db.prepare("SELECT value FROM settings WHERE key='website_orders_enabled'").get()?.value ?? 'true';
    if (websiteEnabled !== 'true') return '';
    const checkout = createCheckoutSession(conversationId, cart);
    if (!checkout?.url) return '';
    return `\n\nSeu pedido está a um clique de distância 🤩\n\nAcesse o link para revisar e finalizar sua compra 🛒⬇️\n${checkout.url}`;
  } catch (error) {
    console.error('Não foi possível gerar o link de finalização do pedido:', error.message);
    return '';
  }
}

function itemCollectionText(conversationId, session, prefix = 'Pedido atualizado', warning = '') {
  const cart = Array.isArray(session?.cart) ? session.cart : [];
  const current = cart.length ? cartText(cart) : 'Ainda não há itens adicionados.';
  return `✅ *${String(prefix || 'PEDIDO ATUALIZADO').toUpperCase()}*\n\n${current}${warning}\n\nEnvie outro produto ou responda *FINALIZAR* quando terminar.\n\n📋 Você também pode pedir o *CARDÁPIO*.`;
}

function paymentPrompt(extra = '') {
  return `💳 *FORMA DE PAGAMENTO*\n\n1. Pix\n2. Dinheiro\n3. Cartão\n\nResponda com *1*, *2* ou *3*.${extra}`;
}

function fulfillmentPrompt() {
  return `🚚 *COMO DESEJA RECEBER?*\n\n1. Entrega\n2. Retirada no local\n\nResponda com *1* ou *2*.`;
}


function wantsToCancelEntireOrder(message) {
  const text = normalizeInformal(message);
  if (!text) return false;
  if (/\b(remover|tira|retirar|excluir)\b/.test(text)) return false;
  return /\b(cancela|cancelar|cancelamento)\b.*\b(pedido|tudo|inteiro|completo)\b/.test(text)
    || /\b(pedido|tudo)\b.*\b(cancela|cancelar|cancelamento)\b/.test(text)
    || /^(cancela|cancelar|pode cancelar|cancela tudo|desisti|desisto|deixa pra la|esquece isso|nao quero mais|nao quero o pedido)$/.test(text)
    || /\b(desisti|desisto|nao quero mais|deixa pra la|esquece)\b.*\b(pedido|compra)\b/.test(text);
}

function cancelOrderPrompt(session) {
  const count = Array.isArray(session?.cart) ? session.cart.reduce((total, item) => total + Number(item.quantity || 0), 0) : 0;
  const detail = count ? `\n\nO pedido atual possui *${count} item(ns)*.` : '';
  return `⚠️ *CANCELAR PEDIDO*${detail}\n\nDeseja realmente cancelar todo o pedido atual?\n\n1. Sim, cancelar pedido\n2. Não, continuar pedido`;
}

function resumeAfterCancelPrompt(session) {
  const stage = String(session?.resume_stage || 'awaiting_items');
  const restored = { ...session, stage };
  if (stage === 'awaiting_fulfillment') return fulfillmentPrompt();
  if (stage === 'awaiting_address') return 'Certo, o pedido continua salvo. Envie o endereço com rua, número e bairro.';
  if (stage === 'awaiting_payment') return paymentPrompt();
  if (stage === 'awaiting_cash_change') return cashChangePrompt();
  if (stage === 'awaiting_cash_change_value') return cashChangeValuePrompt(restored);
  if (stage === 'awaiting_confirmation') return confirmationSummary(restored, getSettings());
  return 'Certo, o pedido continua salvo. Envie outro produto ou digite *FINALIZAR* quando terminar.';
}

function isContextualProductConfirmation(message) {
  const text = normalizeInformal(message);
  return /^(sim|pode ser|pode mandar|manda|manda esse|manda essa|fechou|demorou|bora|beleza|pode crer|show|top|quero|quero esse|quero essa|quero isso|esse|essa|isso|os dois|ambos)(?:\s|$)/.test(text)
    || /\b(quero|manda|adiciona|coloca)\b.*\b(o que voce sugeriu|o que voce me sugeriu|o pedido que voce sugeriu|o pedido que voce me sugeriu|o que voce falou|esse ai|essa ai|os dois|ambos)\b/.test(text)
    || /\b(pode ser)\b.*\b(quanto|valor|fica)\b/.test(text);
}

function usableSuggestionMessage(message) {
  if (!message || !String(message.content || '').trim()) return false;
  const text = normalizeInformal(message.content);
  if (/\b(fazer pedido|resumo do pedido|pedido atualizado|atualizei o pedido|cardapio)\b/.test(text)) return false;
  return ['ai', 'agent'].includes(String(message.sender_type || message.senderType || ''));
}

function recentAssistantSuggestion(conversationId) {
  try {
    const rows = db.prepare(`SELECT id,sender_type,content,message_type,media_url,file_name FROM messages
      WHERE conversation_id=? AND sender_type IN ('ai','agent') AND is_internal=0 AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 5`).all(Number(conversationId));
    return rows.find(usableSuggestionMessage) || null;
  } catch { return null; }
}

async function contextualProductReply({ conversationId, message, session, replyContext }) {
  if (!isContextualProductConfirmation(message)) return null;
  const reference = usableSuggestionMessage(replyContext) ? replyContext : recentAssistantSuggestion(conversationId);
  if (!reference) return null;
  const parsed = await parseOrderRequestReviewed(reference.content, { allowBareProducts: true });
  if (!parsed.items.length || parsed.items.length > 3 || parsed.ambiguous?.length) return null;
  const cart = mergeCart(session.cart, parsed.items);
  const next = saveSession(conversationId, { cart, stage: 'awaiting_items' });
  const subtotal = cartSubtotal(next.cart);
  const added = parsed.items.map((item) => `• ${item.quantity}x ${item.name} — ${money(Number(item.unitPrice) * Number(item.quantity))}`).join('\n');
  return {
    text: `✅ *${parsed.items.length > 1 ? 'ITENS ADICIONADOS' : 'ITEM ADICIONADO'}*\n\n${added}\n\n*Subtotal: ${money(subtotal)}*\n\nPode continuar enviando produtos ou digite *FINALIZAR*.`,
    transfer: false,
    source: 'pedido_referencia_contextual',
  };
}

function beginFulfillment(conversationId, session, method, settings) {
  if (!Array.isArray(session.cart) || !session.cart.length) {
    return { text: 'Envie pelo menos um produto e a quantidade antes de escolher a entrega.', transfer: false, source: 'pedido_sem_itens' };
  }
  if (method === 'delivery') {
    const next = saveSession(conversationId, {
      stage: session.address ? (session.payment_method ? 'awaiting_confirmation' : 'awaiting_payment') : 'awaiting_address',
      fulfillment_method: 'delivery',
      delivery_fee: Number(settings.delivery_fee || 0),
    });
    if (!next.address) {
      return {
        text: `📍 *ENDEREÇO DE ENTREGA*\n\nTaxa de entrega: *${money(next.delivery_fee)}*\n\nEnvie:\n• Rua e número\n• Bairro\n• Ponto de referência, caso tenha`,
        transfer: false,
        source: 'pedido_endereco',
      };
    }
    if (!next.payment_method) return { text: paymentPrompt(), transfer: false, source: 'pedido_pagamento' };
    if (next.payment_method === 'Dinheiro' && next.needs_change && Number(next.change_for || 0) < sessionTotal(next)) {
      const pendingChange = saveSession(conversationId, { stage: 'awaiting_cash_change_value', change_for: null });
      return { text: cashChangeValuePrompt(pendingChange, 'O total mudou. Informe novamente o valor para troco.'), transfer: false, source: 'pedido_valor_troco' };
    }
    const confirmed = saveSession(conversationId, { stage: 'awaiting_confirmation' });
    return { text: confirmationSummary(confirmed, settings), transfer: false, source: 'pedido_confirmacao' };
  }
  const next = saveSession(conversationId, {
    stage: session.payment_method ? 'awaiting_confirmation' : 'awaiting_payment',
    fulfillment_method: 'pickup',
    address: '',
    delivery_fee: 0,
  });
  if (!next.payment_method) {
    return {
      text: `🏪 *RETIRADA NO LOCAL*\n\n${settings.store_pickup_address || 'Endereço cadastrado no estabelecimento'}\n\n${paymentPrompt()}`,
      transfer: false,
      source: 'pedido_pagamento',
    };
  }
  if (next.payment_method === 'Dinheiro' && next.needs_change && Number(next.change_for || 0) < sessionTotal(next)) {
    const pendingChange = saveSession(conversationId, { stage: 'awaiting_cash_change_value', change_for: null });
    return { text: cashChangeValuePrompt(pendingChange, 'O total mudou. Informe novamente o valor para troco.'), transfer: false, source: 'pedido_valor_troco' };
  }
  const confirmed = saveSession(conversationId, { stage: 'awaiting_confirmation' });
  return { text: confirmationSummary(confirmed, settings), transfer: false, source: 'pedido_confirmacao' };
}

function continueAfterItems(conversationId, session, settings) {
  if (!Array.isArray(session.cart) || !session.cart.length) {
    return {
      text: orderStartMessage(settings),
      transfer: false,
      source: 'pedido_sem_itens',
    };
  }
  if (session.fulfillment_method) return beginFulfillment(conversationId, session, session.fulfillment_method, settings);
  saveSession(conversationId, { stage: 'awaiting_fulfillment' });
  return { text: fulfillmentPrompt(), transfer: false, source: 'pedido_modalidade' };
}

async function handleOrderFlow({ conversationId, message, replyContext = null }) {
  // As configurações e os horários são lidos em toda mensagem. Assim, qualquer
  // mudança feita no painel passa a valer imediatamente, inclusive no meio de
  // um pedido que já estava sendo montado.
  const settings = getSettings();
  const orderingStatus = getOrderingStatus(settings);
  let session = getSession(conversationId);
  const lunchSession = db.prepare('SELECT 1 FROM lunch_order_sessions WHERE conversation_id=?').get(Number(conversationId));

  if (lunchSession && !orderingStatus.canOrderLunch) {
    return { text: unavailableMessage(orderingStatus), transfer: false, source: 'pedido_almoco_pausado_horario' };
  }
  if (session && !orderingStatus.canOrderRegular) {
    return { text: unavailableMessage(orderingStatus), transfer: false, source: 'pedido_normal_pausado_horario' };
  }

  const lunchReply = handleLunchConversation({ conversationId, message, settings });
  if (lunchReply?.action === 'catalog') {
    return handleCatalogNavigation({ conversationId, message: 'cardapio', orderSession: session, settings });
  }
  if (lunchReply?.action === 'complete' && lunchReply.item) {
    const next = session || startOrderSession(conversationId);
    session = saveSession(conversationId, {
      stage: 'awaiting_items',
      cart: mergeCart(next.cart || [], [lunchReply.item]),
    });
    return { text: lunchReply.text, transfer: false, source: lunchReply.source || 'almoco_adicionado' };
  }
  if (lunchReply?.text) return { text: lunchReply.text, transfer: false, source: lunchReply.source || 'almoco' };

  const catalogReply = await handleCatalogNavigation({ conversationId, message, orderSession: session, settings });
  if (catalogReply) return catalogReply;

  if (!session) {
    if (asksToStartOrder(message)) {
      if (orderingStatus.canOrderLunch) {
        const lunchStart = handleLunchConversation({ conversationId, message: 'marmitex', settings });
        return { text: lunchStart?.text || unavailableMessage(orderingStatus), transfer: false, source: lunchStart?.source || 'almoco_iniciado' };
      }
      if (!orderingStatus.canOrderRegular) {
        return { text: unavailableMessage(orderingStatus), transfer: false, source: 'pedido_fora_horario' };
      }
      startOrderSession(conversationId);
      return {
        text: orderStartMessage(settings),
        transfer: false,
        source: 'pedido_iniciado',
      };
    }
    if (!orderingStatus.canOrderRegular && !asksForLunch(message) && (looksLikeOrderAction(message) || looksLikeUnknownProduct(message))) {
      return { text: unavailableMessage(orderingStatus), transfer: false, source: orderingStatus.phase === 'lunch' ? 'pedido_normal_indisponivel_no_almoco' : 'pedido_fora_horario' };
    }
    const parsed = await parseOrderRequestReviewed(message);
    if (!parsed.items.length && !parsed.unavailable.length && !parsed.ambiguous?.length) return null;
    if (parsed.ambiguous?.length) return { text: parseIssueText(parsed, message), transfer: false, source: 'pedido_produto_ambiguo' };
    if (!parsed.items.length) {
      return { text: `Entendi o que você gostaria, mas hoje temos uma indisponibilidade:\n${unavailableText(parsed.unavailable)}\n\nPosso mostrar o cardápio ou ajudar a escolher outro item.`, transfer: false, source: 'pedido_sem_estoque' };
    }
    session = saveSession(conversationId, {
      stage: 'awaiting_items',
      cart: parsed.items,
      customer_notes: String(message || '').trim(),
      delivery_fee: Number(settings.delivery_fee || 0),
    });
    const warning = parsed.unavailable.length ? `\n\nNão adicionei:\n${unavailableText(parsed.unavailable)}` : '';
    const method = classifyFulfillment(message);
    if (method) return beginFulfillment(conversationId, session, method, settings);
    return { text: itemCollectionText(conversationId, session, 'Anotei estes itens', warning), transfer: false, source: 'pedido_itens' };
  }

  if (session.stage === 'awaiting_agent_review') {
    return { text: '', transfer: true, reveal: true, source: 'pedido_em_revisao' };
  }

  if (session.stage === 'awaiting_cancel_confirmation') {
    const choice = numericChoice(message);
    const text = normalizeInformal(message);
    if (choice === '1' || /^(sim|s|pode cancelar|cancela|cancelar|confirmo|isso)$/.test(text)) {
      clearSession(conversationId);
      return { text: `❌ *PEDIDO CANCELADO*

Seu pedido foi cancelado e não foi enviado para a cozinha.

Quando quiser começar novamente, digite *PEDIDO*.`, transfer: false, source: 'pedido_cancelado' };
    }
    if (choice === '2' || /^(nao|n|continuar|continua|nao cancela|deixa como esta)$/.test(text)) {
      const resumeStage = session.resume_stage || 'awaiting_items';
      session = saveSession(conversationId, { stage: resumeStage, resume_stage: '' });
      return { text: resumeAfterCancelPrompt(session), transfer: false, source: 'pedido_cancelamento_desfeito' };
    }
    return { text: cancelOrderPrompt(session), transfer: false, source: 'pedido_confirmar_cancelamento' };
  }

  if (wantsToCancelEntireOrder(message)) {
    session = saveSession(conversationId, { stage: 'awaiting_cancel_confirmation', resume_stage: session.stage || 'awaiting_items' });
    return { text: cancelOrderPrompt(session), transfer: false, source: 'pedido_confirmar_cancelamento' };
  }

  const editReply = handleCartEdit(conversationId, session, message, settings);
  if (editReply) return editReply;

  // Uma confirmação como “pode ser” ou “quero o que você sugeriu” precisa
  // ser aplicada ao carrinho antes da conversa livre do Gemini. Caso contrário,
  // a IA pode responder ao preço sem efetivamente adicionar o produto citado.
  if (session.stage === 'awaiting_items') {
    const contextual = await contextualProductReply({ conversationId, message, session, replyContext });
    if (contextual) return contextual;
  }

  if (asksProductDetails(message)) {
    const productDetails = answerFromProducts(message);
    if (productDetails) {
      return { text: `${productDetails}\n\n${resumePromptForStage(session)}`.trim(), transfer: false, source: 'produto_detalhes' };
    }
  }

  const conversationalReply = await conversationalOrderReply({ message, conversationId, session, settings, replyContext });
  if (conversationalReply) return conversationalReply;

  if (session.stage === 'awaiting_items') {
    const parsed = await parseOrderRequestReviewed(message, { allowBareProducts: true });
    if (parsed.items.length || parsed.unavailable.length) {
      const cart = mergeCart(session.cart, parsed.items);
      session = saveSession(conversationId, { cart, stage: 'awaiting_items' });
      const warning = parsed.unavailable.length ? `\n\nNão adicionei:\n${unavailableText(parsed.unavailable)}` : '';
      const method = classifyFulfillment(message);
      if (method && cart.length) return beginFulfillment(conversationId, session, method, settings);
      return { text: itemCollectionText(conversationId, session, 'Atualizei o pedido', warning), transfer: false, source: 'pedido_itens_atualizados' };
    }
    if (wantsToAddMore(message)) {
      return { text: 'Claro! Envie o próximo produto e a quantidade.\n\nQuando terminar, responda *FINALIZAR*.', transfer: false, source: 'pedido_adicionar_mais' };
    }
    if (finishedAddingItems(message)) return continueAfterItems(conversationId, session, settings);
    const method = classifyFulfillment(message);
    if (method) return beginFulfillment(conversationId, session, method, settings);
    if (parsed.ambiguous?.length || looksLikeUnknownProduct(message)) return { text: parseIssueText(parsed, message), transfer: false, source: 'pedido_produto_nao_adicionado' };
    if (!session.cart?.length) {
      return { text: orderStartMessage(settings), transfer: false, source: 'pedido_aguardando_itens' };
    }
    return { text: 'Envie o nome do produto e a quantidade. Quando terminar, responda *FINALIZAR*.\n\n📋 Você também pode pedir o *CARDÁPIO*.', transfer: false, source: 'pedido_aguardando_itens' };
  }

  if (session.stage === 'awaiting_fulfillment') {
    const parsed = await parseOrderRequestReviewed(message, { allowBareProducts: true });
    if (parsed.items.length || parsed.unavailable.length) {
      const cart = mergeCart(session.cart, parsed.items);
      session = saveSession(conversationId, { cart, stage: 'awaiting_items' });
      const warning = parsed.unavailable.length ? `\n\nNão adicionei:\n${unavailableText(parsed.unavailable)}` : '';
      return { text: itemCollectionText(conversationId, session, 'Atualizei o pedido', warning), transfer: false, source: 'pedido_itens_atualizados' };
    }
    if (wantsToAddMore(message)) {
      saveSession(conversationId, { stage: 'awaiting_items' });
      return { text: 'Claro! Envie o próximo produto e a quantidade.\n\nQuando terminar, responda *FINALIZAR*.', transfer: false, source: 'pedido_adicionar_mais' };
    }
    if (parsed.ambiguous?.length || looksLikeUnknownProduct(message)) return { text: `${parseIssueText(parsed, message)}\n\nDepois, escolha: *1* Entrega ou *2* Retirada no local.`, transfer: false, source: 'pedido_produto_nao_adicionado' };
    const method = classifyFulfillment(message);
    if (!method) return { text: '🚚 *COMO DESEJA RECEBER?*\n\n1. Entrega\n2. Retirada no local\n\nResponda com *1* ou *2*.\n\nPara acrescentar outro item, envie o produto e a quantidade.', transfer: false, source: 'pedido_modalidade' };
    return beginFulfillment(conversationId, session, method, settings);
  }

  if (session.stage === 'awaiting_address') {
    if (wantsToAddMore(message)) {
      saveSession(conversationId, { stage: 'awaiting_items' });
      return { text: 'Sem problema. Envie o produto e a quantidade que deseja acrescentar. Depois responda *FINALIZAR* para continuar.', transfer: false, source: 'pedido_adicionar_mais' };
    }
    const parsed = await parseOrderRequestReviewed(message);
    if (parsed.items.length || parsed.unavailable.length) {
      const cart = mergeCart(session.cart, parsed.items);
      session = saveSession(conversationId, { cart, stage: 'awaiting_items' });
      const warning = parsed.unavailable.length ? `\n\nNão adicionei:\n${unavailableText(parsed.unavailable)}` : '';
      return { text: itemCollectionText(conversationId, session, 'Atualizei o pedido', warning), transfer: false, source: 'pedido_itens_atualizados' };
    }
    if (parsed.ambiguous?.length || looksLikeUnknownProduct(message)) return { text: `${parseIssueText(parsed, message)}\n\nAinda preciso do endereço com rua, número e bairro.`, transfer: false, source: 'pedido_produto_nao_adicionado' };
    const address = String(message || '').trim();
    if (address.length < 8 || !/\d/.test(address)) {
      return { text: 'Preciso do endereço com pelo menos *rua, número da casa e bairro*. Se quiser acrescentar um produto antes, diga *QUERO ADICIONAR MAIS*.', transfer: false, source: 'pedido_endereco' };
    }
    saveSession(conversationId, { stage: 'awaiting_payment', address });
    return { text: '✅ Endereço registrado.\n\n💳 *FORMA DE PAGAMENTO*\n\n1. Pix\n2. Dinheiro\n3. Cartão\n\nResponda com *1*, *2* ou *3*.', transfer: false, source: 'pedido_pagamento' };
  }

  if (session.stage === 'awaiting_payment') {
    if (wantsToAddMore(message)) {
      saveSession(conversationId, { stage: 'awaiting_items' });
      return { text: 'Claro! Envie o produto e a quantidade que deseja acrescentar. Depois responda *FINALIZAR*.', transfer: false, source: 'pedido_adicionar_mais' };
    }
    const parsed = await parseOrderRequestReviewed(message);
    if (parsed.items.length || parsed.unavailable.length) {
      const cart = mergeCart(session.cart, parsed.items);
      session = saveSession(conversationId, { cart, stage: 'awaiting_items' });
      const warning = parsed.unavailable.length ? `\n\nNão adicionei:\n${unavailableText(parsed.unavailable)}` : '';
      return { text: itemCollectionText(conversationId, session, 'Atualizei o pedido', warning), transfer: false, source: 'pedido_itens_atualizados' };
    }
    if (parsed.ambiguous?.length || looksLikeUnknownProduct(message)) return { text: `${parseIssueText(parsed, message)}\n\nDepois, escolha a forma de pagamento: *1* Pix, *2* Dinheiro ou *3* Cartão.`, transfer: false, source: 'pedido_produto_nao_adicionado' };
    const payment = classifyPayment(message);
    if (!payment) return { text: '💳 *FORMA DE PAGAMENTO*\n\n1. Pix\n2. Dinheiro\n3. Cartão\n\nResponda com *1*, *2* ou *3*.\n\nPara acrescentar outro item, envie o produto e a quantidade.', transfer: false, source: 'pedido_pagamento' };
    if (payment === 'Dinheiro') {
      session = saveSession(conversationId, { stage: 'awaiting_cash_change', payment_method: payment, needs_change: 0, change_for: null });
      return { text: cashChangePrompt(), transfer: false, source: 'pedido_troco' };
    }
    session = saveSession(conversationId, { stage: 'awaiting_confirmation', payment_method: payment, needs_change: 0, change_for: null });
    return { text: confirmationSummary(session, settings), transfer: false, source: 'pedido_confirmacao' };
  }

  if (session.stage === 'awaiting_cash_change') {
    const decision = classifyCashChange(message);
    if (!decision) return { text: cashChangePrompt(), transfer: false, source: 'pedido_troco' };
    if (decision === 'yes') {
      session = saveSession(conversationId, { stage: 'awaiting_cash_change_value', needs_change: 1, change_for: null });
      return { text: cashChangeValuePrompt(session), transfer: false, source: 'pedido_valor_troco' };
    }
    session = saveSession(conversationId, { stage: 'awaiting_confirmation', needs_change: 0, change_for: null });
    return { text: confirmationSummary(session, settings), transfer: false, source: 'pedido_confirmacao' };
  }

  if (session.stage === 'awaiting_cash_change_value') {
    const value = parseCashValue(message);
    const total = sessionTotal(session);
    if (value == null) return { text: cashChangeValuePrompt(session, 'Informe um valor válido.'), transfer: false, source: 'pedido_valor_troco' };
    if (value < total) return { text: cashChangeValuePrompt(session, `O valor para troco não pode ser menor que o total de ${money(total)}.`), transfer: false, source: 'pedido_valor_troco' };
    session = saveSession(conversationId, { stage: 'awaiting_confirmation', needs_change: value > total ? 1 : 0, change_for: value > total ? value : null });
    return { text: confirmationSummary(session, settings), transfer: false, source: 'pedido_confirmacao' };
  }

  if (session.stage === 'awaiting_confirmation') {
    if (numericChoice(message) === '3') {
      session = saveSession(conversationId, { stage: 'awaiting_cancel_confirmation', resume_stage: 'awaiting_confirmation' });
      return { text: cancelOrderPrompt(session), transfer: false, source: 'pedido_confirmar_cancelamento' };
    }
    if (numericChoice(message) === '2') {
      saveSession(conversationId, { stage: 'awaiting_items' });
      return { text: 'Envie o produto e a quantidade que deseja adicionar ou alterar. Quando terminar, responda *FINALIZAR*.', transfer: false, source: 'pedido_adicionar_mais' };
    }
    if (wantsToAddMore(message)) {
      saveSession(conversationId, { stage: 'awaiting_items' });
      return { text: 'Claro! Envie o produto e a quantidade que deseja acrescentar. Quando terminar, responda *FINALIZAR* para voltar à confirmação.', transfer: false, source: 'pedido_adicionar_mais' };
    }
    const parsed = await parseOrderRequestReviewed(message);
    if (parsed.items.length || parsed.unavailable.length) {
      const cart = mergeCart(session.cart, parsed.items);
      session = saveSession(conversationId, { cart, stage: 'awaiting_confirmation' });
      const warning = parsed.unavailable.length ? `\n\nNão adicionei:\n${unavailableText(parsed.unavailable)}` : '';
      if (session.payment_method === 'Dinheiro' && session.needs_change && Number(session.change_for || 0) < sessionTotal(session)) {
        session = saveSession(conversationId, { stage: 'awaiting_cash_change_value', change_for: null });
        return { text: cashChangeValuePrompt(session, 'O total mudou. Informe novamente o valor para troco.'), transfer: false, source: 'pedido_valor_troco' };
      }
      return { text: `${confirmationSummary(session, settings)}${warning}\n\nPara acrescentar outro item, diga *QUERO ADICIONAR MAIS*.`, transfer: false, source: 'pedido_confirmacao_atualizada' };
    }
    if (parsed.ambiguous?.length || looksLikeUnknownProduct(message)) return { text: `${parseIssueText(parsed, message)}\n\nO restante do pedido continua salvo.`, transfer: false, source: 'pedido_produto_nao_adicionado' };
    if (isNo(message)) {
      session = saveSession(conversationId, { stage: 'awaiting_cancel_confirmation', resume_stage: 'awaiting_confirmation' });
      return { text: cancelOrderPrompt(session), transfer: false, source: 'pedido_confirmar_cancelamento' };
    }
    if (finishedAddingItems(message)) {
      return { text: confirmationSummary(session, settings), transfer: false, source: 'pedido_confirmacao' };
    }
    if (!isYes(message)) {
      return { text: `Escolha uma opção: *1* confirmar, *2* adicionar ou alterar item, ou *3* cancelar.\n\n${confirmationSummary(session, settings)}`, transfer: false, source: 'pedido_confirmacao' };
    }
    return { text: '', transfer: true, reveal: true, source: 'pedido_confirmado', action: 'confirm_order', session };
  }

  clearSession(conversationId);
  return null;
}

async function generateGroundedReply(message, context = {}) {
  if (context.conversationId) {
    const orderReply = await handleOrderFlow({ conversationId: context.conversationId, message, replyContext: context.replyContext || null });
    if (orderReply) return orderReply;
  }
  const settings = getSettings();
  const normalized = normalizeInformal(message);
  if (asksForLunch(message)) {
    const lunchStatus = getLunchStatus(settings);
    return { text: lunchInformationText(lunchStatus), transfer: false, source: lunchStatus.available ? 'almoco_disponivel' : 'almoco_fora_horario' };
  }
  if (/\b(taxa|valor|quanto|preco)\b.*\b(entrega|delivery)\b|\b(entrega|delivery)\b.*\b(taxa|valor|quanto|preco)\b/.test(normalized)) {
    return { text: `A taxa de entrega cadastrada é ${money(Math.max(0, Number(settings.delivery_fee || 0)))}. Ao montar o pedido, eu confirmo se será retirada ou entrega antes de pedir o endereço.`, transfer: false, source: 'configuracao_entrega' };
  }
  if (/\b(endereco|onde)\b.*\b(retirar|retirada|buscar|loja)\b|\b(retirar|retirada|buscar)\b.*\b(endereco|onde)\b/.test(normalized)) {
    return { text: `A retirada é feita em ${settings.store_pickup_address || 'nosso endereço cadastrado'}.`, transfer: false, source: 'configuracao_retirada' };
  }
  if (/\b(oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalized) && normalized.split(' ').length <= 5) {
    return { text: `Olá! Eu sou ${settings.ai_name || 'a assistente virtual'} da ${settings.company_name || 'empresa'}. Como posso ajudar?`, transfer: false, source: 'saudacao' };
  }
  if (/\b(atendente|humano|pessoa|reclamacao|problema|cancelar atendimento|gerente)\b/.test(normalized)) {
    return { text: 'Entendi. Vou encaminhar seu atendimento para uma pessoa da equipe.', transfer: true, source: 'transferencia_solicitada' };
  }
  if (context.conversationId && asksForCatalog(message)) {
    const catalogReply = await handleCatalogNavigation({
      conversationId: context.conversationId,
      message,
      orderSession: getSession(context.conversationId),
      settings,
    });
    if (catalogReply) return catalogReply;
  }
  if (context.conversationId && asksToStartOrder(message)) {
    clearCatalogSession(context.conversationId);
    const orderingStatus = getOrderingStatus(settings);
    if (orderingStatus.canOrderLunch) {
      const lunchStart = handleLunchConversation({ conversationId: context.conversationId, message: 'marmitex', settings });
      return { text: lunchStart?.text || unavailableMessage(orderingStatus), transfer: false, source: lunchStart?.source || 'almoco_iniciado' };
    }
    if (!orderingStatus.canOrderRegular) return { text: unavailableMessage(orderingStatus), transfer: false, source: 'pedido_fora_horario' };
    startOrderSession(context.conversationId);
    return { text: orderStartMessage(settings), transfer: false, source: 'pedido_iniciado' };
  }
  const productAnswer = answerFromProducts(message);
  if (productAnswer) return { text: productAnswer, transfer: false, source: 'cardapio' };
  const knowledgeAnswer = answerFromKnowledge(message);
  if (knowledgeAnswer) return { text: knowledgeAnswer, transfer: false, source: 'conhecimento' };
  const conversational = await answerConversationWithGemini({ message, conversationId: context.conversationId || null, settings, replyContext: context.replyContext || null });
  if (conversational?.action === 'transfer') return { text: conversational.text || 'Entendi. Vou encaminhar você para uma pessoa da equipe.', transfer: true, source: 'gemini_conversa_transferencia' };
  if (conversational?.action === 'answer' && conversational.text) return { text: conversational.text, transfer: false, source: 'gemini_conversa' };
  return { text: settings.ai_fallback || 'Não encontrei essa informação. Vou encaminhar você para um atendente humano.', transfer: true, source: 'fallback' };
}

module.exports = { generateGroundedReply, handleOrderFlow, clearSession, startOrderSession, parseOrderItems, parseOrderRequest, normalize, normalizeInformal, wantsToEditOrder, wantsToCancelEntireOrder };
