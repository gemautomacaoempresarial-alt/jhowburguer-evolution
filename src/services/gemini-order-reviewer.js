const { db } = require('../db');

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_TIMEOUT_MS = 8_000;
let lastFallbackLogAt = 0;

function normalize(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactProduct(product) {
  return {
    id: Number(product.id),
    name: String(product.name || ''),
    aliases: String(product.aliases || ''),
    category: String(product.category || ''),
    description: String(product.description || '').slice(0, 180),
    stock: product.stock == null ? null : Number(product.stock),
  };
}

function lexicalScore(message, product) {
  const terms = new Set(normalize(message).split(/\s+/).filter((term) => term.length > 1));
  const target = normalize(`${product.name} ${product.aliases || ''} ${product.category || ''}`);
  let score = 0;
  for (const term of terms) {
    if (target.includes(term)) score += term.length >= 4 ? 3 : 1;
  }
  return score;
}

function candidateProducts(message, limit = 18) {
  return db.prepare('SELECT id,name,aliases,category,description,stock,active FROM products WHERE active=1 ORDER BY name').all()
    .map((product) => ({ product, score: lexicalScore(message, product) }))
    .sort((left, right) => right.score - left.score || String(left.product.name).localeCompare(String(right.product.name), 'pt-BR'))
    .slice(0, Math.max(6, limit))
    .map(({ product }) => compactProduct(product));
}

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

function safeQuantity(value) {
  const quantity = Math.floor(Number(value || 1));
  return Number.isFinite(quantity) ? Math.max(1, Math.min(20, quantity)) : 1;
}

function sanitizeDecision(raw, candidates) {
  if (!raw || typeof raw !== 'object') return null;
  const allowedIds = new Set(candidates.map((product) => Number(product.id)));
  const items = Array.isArray(raw.items)
    ? raw.items
      .map((item) => ({ productId: Number(item?.productId), quantity: safeQuantity(item?.quantity) }))
      .filter((item) => allowedIds.has(item.productId))
    : [];
  const candidateIds = Array.isArray(raw.candidateIds)
    ? raw.candidateIds.map(Number).filter((id) => allowedIds.has(id)).slice(0, 5)
    : [];
  const action = ['add', 'clarify', 'not_found', 'ignore'].includes(String(raw.action || '').toLowerCase())
    ? String(raw.action).toLowerCase()
    : (items.length ? 'add' : 'clarify');
  return {
    action,
    items,
    candidateIds,
    reason: String(raw.reason || '').trim().slice(0, 300),
    requestedDescription: String(raw.requestedDescription || '').trim().slice(0, 160),
  };
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
  console.warn(`[Gemini] Revisor indisponível (${fallbackReason(error)}). Usando a IA normal do sistema.`);
}

async function reviewProductRequestWithGemini(message) {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;

  const candidates = candidateProducts(message);
  if (!candidates.length) return null;

  const model = String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const timeoutMs = Math.max(2_000, Math.min(20_000, Number(process.env.GEMINI_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const prompt = [
    'Você é uma camada de revisão de pedidos de uma lanchonete.',
    'Sua única tarefa é comparar a frase do cliente com a lista fechada de produtos cadastrados.',
    'Nunca invente produtos, IDs, tamanhos, sabores ou volumes.',
    'Tamanho, volume, peso, sabor, versão zero/diet/tradicional, embalagem e indicação de combo são atributos obrigatórios quando o cliente os informa.',
    'Exemplo: se o cliente pedir Coca-Cola 600 ml e só existir Coca-Cola 2 L, NÃO adicione a de 2 L. Use clarify ou not_found.',
    'Quando houver mais de uma opção plausível e faltar uma característica, use clarify.',
    'Erros simples de digitação podem ser corrigidos somente se todos os atributos informados continuarem compatíveis.',
    'A quantidade deve vir da mensagem. Se não houver quantidade, use 1.',
    'Responda SOMENTE com JSON no formato:',
    '{"action":"add|clarify|not_found|ignore","items":[{"productId":1,"quantity":1}],"candidateIds":[1,2],"requestedDescription":"descrição curta","reason":"motivo curto"}',
    '',
    `Mensagem do cliente: ${JSON.stringify(String(message || '').slice(0, 500))}`,
    `Produtos permitidos: ${JSON.stringify(candidates)}`,
  ].join('\n');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          maxOutputTokens: 700,
        },
      }),
    });
    const bodyText = await response.text();
    if (!response.ok) throw new Error(`Gemini HTTP ${response.status}: ${bodyText.slice(0, 400)}`);
    const payload = parseJsonText(bodyText);
    const generatedText = payload?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '';
    const decision = sanitizeDecision(parseJsonText(generatedText), candidates);
    if (!decision) throw new Error('Resposta JSON inválida do Gemini.');
    return { ...decision, candidates, model, projectId: String(process.env.GEMINI_PROJECT_ID || '').trim() };
  } catch (error) {
    logFallback(error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { reviewProductRequestWithGemini };
