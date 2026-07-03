const express = require('express');
const crypto = require('node:crypto');
const { db, nowIso, insertMessage } = require('../db');
const realtime = require('../services/realtime');
const whatsapp = require('../services/whatsapp');
const assignment = require('../services/assignment');
const { normalizePhone } = require('../services/incoming');
const { stampProviderResult } = require('../services/message-status');
const { getCheckoutSession, consumeCheckoutSession } = require('../services/website-checkout');
const tables = require('../services/tables');
const { createOrUpdateContact, findContactByPhone, activeConversationForContact, ensureActiveConversation, canonicalPhone } = require('../services/contact-identity');
const { getBusinessStatus } = require('../services/business-hours');
const { getLunchStatus, isLunchProduct, validateLunchNotes } = require('../services/lunch-menu');
const { getOrderingStatus, canOrderProduct: canOrderProductNow, unavailableMessage } = require('../services/order-availability');

const router = express.Router();
const requestBuckets = new Map();

const PAYMENT_LABELS = {
  pix: 'Pix',
  cash: 'Dinheiro',
  card: 'Cartão na entrega/retirada',
};

const STATUS_LABELS = {
  new: 'Aguardando confirmação',
  confirmed: 'Pedido confirmado',
  preparing: 'Em preparação',
  ready: 'Pronto',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  picked_up: 'Retirado',
  cancelled: 'Cancelado',
};

const STATUS_PROGRESS = {
  new: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  delivered: 5,
  picked_up: 5,
  cancelled: -1,
};

function setting(key, fallback = '') {
  return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value ?? fallback;
}

function safeJson(value, fallback = {}) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function cleanText(value, maxLength = 300) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseMoneyInput(value) {
  const raw = String(value || '').replace(/[^0-9,.-]/g, '').trim();
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',') && raw.includes('.')) normalized = raw.replace(/\./g, '').replace(',', '.');
  else if (raw.includes(',')) normalized = raw.replace(',', '.');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function requestIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function allowRequest(req, limit = 20, intervalMs = 60_000) {
  const key = `${requestIp(req)}:${req.path}`;
  const now = Date.now();
  const bucket = requestBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start >= intervalMs) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  if (requestBuckets.size > 2000) {
    for (const [bucketKey, value] of requestBuckets) {
      if (now - value.start > intervalMs * 2) requestBuckets.delete(bucketKey);
    }
  }
  return bucket.count <= limit;
}

function businessStatus() {
  const status = getBusinessStatus();
  return {
    open: status.open,
    enabled: status.enabled,
    ended: status.ended,
    alertActive: status.alertActive,
    message: status.message,
    today: status.today,
    activeWindow: status.activeWindow,
    lastClosedWindow: status.lastClosedWindow,
    nextWindow: status.nextWindow,
    extension: status.extension,
    alertExpiresAt: status.alertExpiresAt,
  };
}


function publicOrigin(req) {
  const configured = cleanText(process.env.PUBLIC_SITE_URL || setting('website_public_url', ''), 500).replace(/\/$/, '');
  if (configured) return configured;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'http';
  return `${protocol}://${req.get('host')}`.replace(/\/$/, '');
}

function newTrackingToken() {
  return crypto.randomBytes(24).toString('hex');
}

function newProtocol() {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = `ATD-${year}-${Math.floor(100000 + Math.random() * 900000)}`;
    if (!db.prepare('SELECT 1 FROM conversations WHERE protocol=?').get(value)) return value;
  }
  return `ATD-${year}-${Date.now()}`;
}

function orderWithItems(id) {
  const order = db.prepare(`
    SELECT o.*,ct.name contact_name,ct.phone,ct.email,rt.name table_name
    FROM orders o JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
    WHERE o.id=?
  `).get(Number(id));
  if (!order) return null;
  order.items = db.prepare('SELECT id,product_id,name,quantity,unit_price,notes FROM order_items WHERE order_id=? ORDER BY id').all(order.id);
  return order;
}

function createWebsiteNotifications(order, summary, conversationId, targetUserId = null) {
  const title = order.fulfillment_method === 'table'
    ? `Novo pedido da ${order.table_name || 'mesa'} #${String(order.id).padStart(4, '0')}`
    : `Novo pedido do site #${String(order.id).padStart(4, '0')}`;
  const message = `${order.contact_name}: ${summary}. Aguardando confirmação.`;
  const targets = targetUserId
    ? [{ userId: Number(targetUserId), role: '' }]
    : ['admin', 'supervisor', 'agent'].map((role) => ({ userId: null, role }));
  const insert = db.prepare(`
    INSERT INTO notifications(type,title,message,entity_type,entity_id,target_user_id,target_role,created_at)
    VALUES('new_order',?,?, 'conversation',?,?,?,?)
  `);
  return targets.map((target) => {
    const result = insert.run(title, message, conversationId, target.userId, target.role, nowIso());
    return db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
  });
}

function paymentLabel(value) {
  return PAYMENT_LABELS[value] || cleanText(value, 60) || 'Não informado';
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function statusLabelForOrder(order) {
  if (order.fulfillment_method === 'pickup') {
    if (order.status === 'ready' || order.status === 'out_for_delivery') return 'Pronto para retirada';
    if (order.status === 'picked_up' || order.status === 'delivered') return 'Retirado';
  }
  if (order.fulfillment_method === 'table') {
    if (order.status === 'ready') return 'Pronto para servir';
    if (order.status === 'delivered') return 'Entregue na mesa';
  }
  return STATUS_LABELS[order.status] || order.status;
}

function receiptText(order, trackingLink) {
  const items = order.items.map((item) => `• ${item.quantity}x ${item.name}${item.notes ? ` — ${item.notes}` : ''}`).join('\n');
  const fulfillment = order.fulfillment_method === 'pickup'
    ? `📍 Retirada em: ${setting('store_pickup_address', 'endereço da loja')}`
    : order.fulfillment_method === 'table'
      ? `🍽️ Consumo no local: ${order.table_name || 'mesa vinculada'}`
      : `🛵 Entrega em: ${order.address}`;
  const template = setting(
    'website_whatsapp_receipt_message',
    '✅ Recebemos seu pedido #{Pedido} pelo site!\n\n{Itens}\n\n{RetiradaEntrega}\n💳 Pagamento: {Pagamento}\n💰 Total: {Total}\n\nSeu pedido está aguardando a confirmação da equipe.\n🔎 Acompanhe: {LinkAcompanhamento}',
  );
  const variables = {
    Pedido: String(order.id).padStart(4, '0'),
    Itens: items,
    RetiradaEntrega: fulfillment,
    Pagamento: `${paymentLabel(order.payment_method)}${order.payment_method === 'cash' ? (order.needs_change && order.change_for ? ` — troco para ${formatMoney(order.change_for)}` : ' — sem troco') : ''}`,
    Total: formatMoney(order.total),
    LinkAcompanhamento: trackingLink,
    Cliente: order.contact_name,
    Empresa: setting('company_name', 'G&M Automação'),
  };
  let output = String(template || '');
  if (order.fulfillment_method === 'table') {
    output = output.split('\n').filter((line) => !/\{pagamento\}/i.test(line)).join('\n');
  }
  for (const [key, value] of Object.entries(variables)) {
    output = output.replaceAll(`{${key}}`, String(value)).replaceAll(`{${key.toLowerCase()}}`, String(value));
  }
  return output.trim();
}

async function sendWebsiteReceipt(orderId, trackingLink) {
  const order = orderWithItems(orderId);
  if (!order || !order.whatsapp_opt_in) return;
  const text = receiptText(order, trackingLink);
  const messageId = insertMessage({
    conversationId: order.conversation_id,
    senderType: 'agent',
    content: text,
    deliveryStatus: 'pending',
  });
  let message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
  realtime.emit('message:new', { conversationId: order.conversation_id, message });
  try {
    const result = await whatsapp.sendText({ phone: order.phone, text, delay: 1800 });
    const stamp = nowIso();
    if (result?.mock) {
      db.prepare("UPDATE orders SET whatsapp_receipt_status='mock',whatsapp_error='',updated_at=? WHERE id=?").run(stamp, order.id);
      db.prepare("UPDATE messages SET delivery_status='sent',failed_reason='' WHERE id=?").run(messageId);
      message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
    } else {
      message = stampProviderResult(messageId, result, 'sent');
      db.prepare("UPDATE orders SET whatsapp_receipt_status='sent',whatsapp_notified_at=?,whatsapp_error='',updated_at=? WHERE id=?")
        .run(stamp, stamp, order.id);
    }
    realtime.emit('message:status', { conversationId: order.conversation_id, message });
    realtime.emit('order:updated', orderWithItems(order.id));
  } catch (error) {
    const reason = String(error?.message || error || 'Falha ao enviar pelo WhatsApp').slice(0, 500);
    const stamp = nowIso();
    db.prepare("UPDATE messages SET delivery_status='failed',failed_reason=? WHERE id=?").run(reason, messageId);
    db.prepare("UPDATE orders SET whatsapp_receipt_status='failed',whatsapp_error=?,updated_at=? WHERE id=?")
      .run(reason, stamp, order.id);
    message = db.prepare('SELECT * FROM messages WHERE id=?').get(messageId);
    realtime.emit('message:status', { conversationId: order.conversation_id, message });
    realtime.emit('order:updated', orderWithItems(order.id));
    const notificationResult = db.prepare(`
      INSERT INTO notifications(type,title,message,entity_type,entity_id,target_role,created_at)
      VALUES('whatsapp_failure',?,?, 'order',?,'admin',?)
    `).run(
      `WhatsApp não confirmou o pedido #${String(order.id).padStart(4, '0')}`,
      'O pedido está salvo, mas a mensagem automática não foi enviada. Verifique a conexão.',
      order.id,
      stamp,
    );
    const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(notificationResult.lastInsertRowid));
    realtime.emit('notification:new', notification);
  }
}

router.get('/store', (req, res) => {
  if (!allowRequest(req, 120)) return res.status(429).json({ error: 'Muitas consultas. Tente novamente em instantes.' });
  const currentSettings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((row) => [row.key,row.value]));
  const orderingStatus = getOrderingStatus(currentSettings);
  const lunch = orderingStatus.lunch;
  const products = db.prepare(`
    SELECT id,category,name,description,price,stock,image_url
    FROM products
    WHERE active=1 AND (stock IS NULL OR stock>0)
    ORDER BY category,name
  `).all().filter((product) => lunch.enabled || !isLunchProduct(product)).map((product) => ({
    ...product,
    price: Number(product.price || 0),
    stock: product.stock == null ? null : Number(product.stock),
    timeRestricted: true,
    productPeriod: isLunchProduct(product) ? 'lunch' : 'regular',
    availableNow: isLunchProduct(product) ? orderingStatus.canOrderLunch : orderingStatus.canOrderRegular,
  }));
  const state = whatsapp.publicInstance(whatsapp.getPrimaryInstance());
  const business = businessStatus();
  const acceptOutside = false;
  const fulfillment = {
    delivery: setting('website_delivery_enabled', 'true') !== 'false',
    pickup: setting('website_pickup_enabled', 'true') !== 'false',
  };
  const payments = {
    pix: setting('website_payment_pix', 'true') !== 'false',
    card: setting('website_payment_card', 'true') !== 'false',
    cash: setting('website_payment_cash', 'true') !== 'false',
  };
  const hasFulfillment = Object.values(fulfillment).some(Boolean);
  const hasPayment = Object.values(payments).some(Boolean);
  return res.json({
    branding: {
      companyName: setting('company_name', 'G&M Automação'),
      primaryColor: setting('primary_color', '#1458EA'),
      instagram: setting('instagram', ''),
      subtitle: setting('website_subtitle', 'Cardápio digital'),
      logoUrl: setting('website_logo_url', '/assets/jhow-burguer-logo.jpg'),
      heroTitle: setting('website_hero_title', 'Seu pedido, do seu jeito.'),
      heroText: setting('website_hero_text', 'Peça pelo site com rapidez e acompanhe cada etapa pelo WhatsApp.'),
    },
    ordering: {
      enabled: setting('website_orders_enabled', 'true') === 'true',
      canOrderNow: setting('website_orders_enabled', 'true') === 'true' && orderingStatus.open && hasFulfillment && hasPayment,
      business,
      deliveryFee: Math.max(0, Number(setting('delivery_fee', '0') || 0)),
      pickupAddress: setting('store_pickup_address', ''),
      checkoutNotice: setting('website_checkout_notice', 'O pedido será enviado ao painel e ficará aguardando confirmação da equipe.'),
      fulfillment,
      payments,
      whatsappConnected: state?.status === 'connected',
      tablesEnabled: setting('restaurant_tables_enabled', 'false') === 'true',
      acceptOutsideHours: false,
      orderingPhase: orderingStatus.phase,
      orderingMessage: orderingStatus.message,
      canOrderRegular: orderingStatus.canOrderRegular,
      canOrderLunch: orderingStatus.canOrderLunch,
      lunch,
    },
    products,
  });
});


function publicTablePayload(session) {
  const summary = tables.tabSummary(session.tab.id);
  const contact = session.member.contact_id
    ? db.prepare('SELECT name,phone FROM contacts WHERE id=?').get(Number(session.member.contact_id))
    : null;
  const allOrders = db.prepare(`
    SELECT o.*,ct.name contact_name,tm.display_name table_member_name
    FROM orders o
    JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN table_members tm ON tm.id=o.table_member_id
    WHERE o.table_tab_id=?
    ORDER BY o.id DESC
  `).all(Number(session.tab.id)).map((order) => ({
    id: order.id,
    number: String(order.id).padStart(4, '0'),
    status: order.status,
    statusLabel: statusLabelForOrder({ ...order, fulfillment_method: 'table' }),
    total: Number(order.total || 0),
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    memberId: order.table_member_id,
    memberName: order.table_member_name || order.contact_name || 'Cliente',
    items: db.prepare('SELECT product_id,name,quantity,unit_price,notes FROM order_items WHERE order_id=? ORDER BY id').all(order.id),
  }));
  return {
    table: {
      id: session.table.id,
      name: session.table.name,
      status: summary?.tab?.status === 'account_requested' ? 'account_requested' : 'occupied',
    },
    tab: { id: session.tab.id, status: summary?.tab?.status || session.tab.status, openedAt: session.tab.opened_at },
    member: {
      id: session.member.id,
      displayName: session.member.display_name || contact?.name || '',
      name: contact?.name || session.member.display_name || '',
      phone: contact?.phone || '',
      linked: Boolean(session.member.contact_id),
    },
    deviceToken: session.deviceToken,
    total: Number(summary?.total || 0),
    memberTotal: allOrders.filter((order) => Number(order.memberId) === Number(session.member.id) && order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total || 0), 0),
    orders: allOrders,
    memberOrders: allOrders.filter((order) => Number(order.memberId) === Number(session.member.id)),
    pendingOrder: allOrders.find((order) => Number(order.memberId) === Number(session.member.id) && order.status === 'new') || null,
    pendingRequests: summary?.requests || [],
    customerActions: {
      editEnabled: setting('restaurant_table_customer_edit_enabled','true') !== 'false',
      cancelEnabled: setting('restaurant_table_customer_cancel_enabled','true') !== 'false',
      editMinutes: Math.max(1,Math.min(120,Number(setting('restaurant_table_edit_minutes','10')||10))),
    },
  };
}

function emitTableNotifications({ table, tab, type, title, message }) {
  const notifications = [];
  const insert = db.prepare(`
    INSERT INTO notifications(type,title,message,entity_type,entity_id,target_role,created_at)
    VALUES(?,?,?, 'table',?,?,?)
  `);
  for (const role of ['admin','supervisor','agent']) {
    const result = insert.run(type, title, message, table.id, role, nowIso());
    const notification = db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
    notifications.push(notification);
    realtime.emit('notification:new', notification);
  }
  realtime.emit('table:updated', { tableId: table.id, tabId: tab.id });
  return notifications;
}

function createTableNotification({ table, tab, type, message }) {
  const config = {
    bill: [`${table.name} solicitou a conta`, 'table_bill'],
    waiter: [`${table.name} chamou o garçom`, 'table_waiter'],
    napkins: [`${table.name} pediu guardanapos`, 'table_napkins'],
    cutlery: [`${table.name} pediu talheres`, 'table_cutlery'],
    problem: [`${table.name} informou um problema`, 'table_problem'],
    change: [`${table.name} solicitou uma alteração`, 'table_change'],
  }[type] || [`Nova solicitação da ${table.name}`, 'table_waiter'];
  return emitTableNotifications({ table, tab, type: config[1], title: config[0], message });
}

function createTableOpenedNotification({ table, tab }) {
  return emitTableNotifications({
    table,
    tab,
    type: 'table_opened',
    title: `${table.name} foi ocupada`,
    message: `Uma nova comanda #${String(tab.id).padStart(4, '0')} foi aberta pelo QR Code.`,
  });
}

router.get('/table/:token', (req, res) => {
  if (!allowRequest(req, 120)) return res.status(429).json({ error: 'Muitas consultas. Tente novamente em instantes.' });
  if (setting('restaurant_tables_enabled', 'false') !== 'true') return res.status(403).json({ error: 'O atendimento por mesas está desativado.' });
  const table = tables.getTableByToken(req.params.token);
  if (!table) return res.status(404).json({ error: 'Mesa não encontrada ou QR Code desativado.' });
  if (table.status === 'blocked') return res.status(403).json({ error: 'Esta mesa está indisponível no momento.' });
  return res.json({ table: { id: table.id, name: table.name, status: table.status }, requiresConfirmation: true });
});

router.post('/table/:token/join', (req, res) => {
  if (!allowRequest(req, 30)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde um instante.' });
  try {
    const tableBefore = tables.getTableByToken(req.params.token);
    const hadActiveTab = tableBefore ? Boolean(tables.activeTab(tableBefore.id)) : false;
    const session = tables.joinTable(req.params.token, req.body.deviceToken);
    if (!hadActiveTab) createTableOpenedNotification({ table: session.table, tab: session.tab });
    return res.json(publicTablePayload(session));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.get('/table/:token/session/:deviceToken', (req, res) => {
  if (setting('restaurant_tables_enabled', 'false') !== 'true') return res.status(403).json({ error: 'O atendimento por mesas está desativado.' });
  if (!allowRequest(req, 120)) return res.status(429).json({ error: 'Muitas consultas. Tente novamente em instantes.' });
  const session = tables.getMemberSession(req.params.token, req.params.deviceToken);
  if (!session) return res.status(404).json({ error: 'O vínculo com a mesa expirou ou foi encerrado.' });
  return res.json(publicTablePayload(session));
});

router.post('/table/:token/request', (req, res) => {
  if (setting('restaurant_tables_enabled', 'false') !== 'true') return res.status(403).json({ error: 'O atendimento por mesas está desativado.' });
  if (!allowRequest(req, 12, 10 * 60_000)) return res.status(429).json({ error: 'Aguarde antes de enviar outro chamado.' });
  const session = tables.getMemberSession(req.params.token, req.body.deviceToken);
  if (!session) return res.status(404).json({ error: 'O vínculo com a mesa expirou.' });
  const allowedRequests = new Set(['bill','waiter','napkins','cutlery','problem','change']);
  const requestType = allowedRequests.has(String(req.body.requestType || '')) ? String(req.body.requestType) : 'waiter';
  const duplicate = db.prepare("SELECT id FROM table_service_requests WHERE tab_id=? AND request_type=? AND status='pending' ORDER BY id DESC LIMIT 1").get(session.tab.id, requestType);
  const labels = { bill:'A conta desta mesa já foi solicitada.',waiter:'O garçom já foi chamado e a equipe foi avisada.',napkins:'O pedido de guardanapos já foi enviado.',cutlery:'O pedido de talheres já foi enviado.',problem:'Já existe um problema aguardando atendimento.',change:'Já existe uma solicitação de alteração pendente.' };
  if (duplicate) return res.status(409).json({ error: labels[requestType] });
  const defaults = { bill:'Cliente solicitou o fechamento da conta.',waiter:'Cliente solicitou atendimento na mesa.',napkins:'Cliente pediu guardanapos.',cutlery:'Cliente pediu talheres.',problem:'Cliente informou um problema e precisa de ajuda.',change:'Cliente deseja alterar ou conversar sobre um pedido.' };
  const message = cleanText(req.body.message, 180) || defaults[requestType];
  const stamp = nowIso();
  const result = db.prepare("INSERT INTO table_service_requests(table_id,tab_id,member_id,request_type,message,status,created_at) VALUES(?,?,?,?,?,'pending',?)")
    .run(session.table.id, session.tab.id, session.member.id, requestType, message, stamp);
  if (requestType === 'bill') {
    db.prepare("UPDATE table_tabs SET status='account_requested',account_requested_at=? WHERE id=?").run(stamp, session.tab.id);
    db.prepare("UPDATE restaurant_tables SET status='account_requested',updated_at=? WHERE id=?").run(stamp, session.table.id);
    session.tab.status = 'account_requested';
  }
  const requestRow = db.prepare('SELECT * FROM table_service_requests WHERE id=?').get(Number(result.lastInsertRowid));
  createTableNotification({ table: session.table, tab: session.tab, type: requestType, message });
  return res.status(201).json({ success: true, request: requestRow, session: publicTablePayload(session) });
});

router.post('/table/:token/leave', (req, res) => {
  const left = tables.leaveTable(req.params.token, req.body.deviceToken);
  return res.json({ success: left });
});


function selectedTableItems(requestedItems) {
  const currentSettings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((row) => [row.key,row.value]));
  const orderingStatus = getOrderingStatus(currentSettings);
  if (!orderingStatus.open) throw new Error('A loja está fora do horário de pedidos.');
  const selected = [];
  let subtotal = 0;
  for (const requested of (Array.isArray(requestedItems) ? requestedItems.slice(0, 50) : [])) {
    const productId = Number(requested.productId || requested.product_id || 0);
    const quantity = Math.max(0, Math.min(20, Math.floor(Number(requested.quantity || 0))));
    if (!productId || quantity < 1) continue;
    const product = db.prepare('SELECT id,category,name,price,stock,active FROM products WHERE id=?').get(productId);
    if (!product || !product.active) throw new Error('Um produto do carrinho não está mais disponível.');
    if (!canOrderProductNow(product, currentSettings)) {
      throw new Error(isLunchProduct(product)
        ? `A marmitex está disponível somente das ${orderingStatus.lunch.start} às ${orderingStatus.lunch.end}.`
        : (orderingStatus.phase === 'lunch' ? 'Neste horário estão disponíveis apenas as marmitex.' : 'Os pedidos normais estão fora do horário de atendimento.'));
    }
    if (product.stock != null && quantity > Number(product.stock)) throw new Error(`Estoque insuficiente para ${product.name}.`);
    const notes = cleanText(requested.notes, 180);
    const lunchValidation = validateLunchNotes(product, notes);
    if (!lunchValidation.valid) throw new Error(lunchValidation.error);
    selected.push({ product, quantity, notes });
    subtotal += Number(product.price || 0) * quantity;
  }
  if (!selected.length) throw new Error('Não encontramos itens válidos no carrinho.');
  return { selected, subtotal };
}

router.put('/table/:token/orders/:orderId', (req, res) => {
  if (setting('restaurant_tables_enabled', 'false') !== 'true') return res.status(403).json({ error: 'O atendimento por mesas está desativado.' });
  if (!allowRequest(req, 30, 10 * 60_000)) return res.status(429).json({ error: 'Muitas alterações. Aguarde um instante.' });
  const session = tables.getMemberSession(req.params.token, req.body.deviceToken);
  if (!session) return res.status(404).json({ error: 'O vínculo com a mesa expirou ou foi encerrado.' });
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND table_tab_id=? AND table_member_id=?').get(Number(req.params.orderId), session.tab.id, session.member.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado nesta comanda.' });
  if (setting('restaurant_table_customer_edit_enabled','true') === 'false') return res.status(403).json({ error: 'A edição pelo site está desativada. Chame um atendente.' });
  if (order.status !== 'new') return res.status(409).json({ error: 'Este pedido já foi confirmado e não pode mais ser editado diretamente. Chame um atendente.' });
  const editMinutes = Math.max(1,Math.min(120,Number(setting('restaurant_table_edit_minutes','10')||10)));
  if (Date.now() - new Date(order.created_at).getTime() > editMinutes * 60_000) return res.status(409).json({ error: `O prazo de ${editMinutes} minutos para editar terminou. Chame um atendente.` });
  const stamp = nowIso();
  try {
    db.exec('BEGIN');
    const oldItems = db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(order.id);
    for (const item of oldItems) {
      if (!item.product_id) continue;
      db.prepare('UPDATE products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+? END,updated_at=? WHERE id=?').run(Number(item.quantity || 0), stamp, item.product_id);
    }
    const { selected, subtotal } = selectedTableItems(req.body.items);
    db.prepare('DELETE FROM order_items WHERE order_id=?').run(order.id);
    const insertItem = db.prepare('INSERT INTO order_items(order_id,product_id,name,quantity,unit_price,notes) VALUES(?,?,?,?,?,?)');
    for (const item of selected) {
      insertItem.run(order.id, item.product.id, item.product.name, item.quantity, item.product.price, item.notes);
      if (item.product.stock != null) {
        const changed = db.prepare('UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND stock>=?').run(item.quantity, stamp, item.product.id, item.quantity);
        if (!changed.changes) throw new Error(`O estoque de ${item.product.name} mudou durante a edição.`);
      }
    }
    db.prepare("UPDATE orders SET subtotal=?,delivery_fee=0,total=?,notes=?,edited_at=?,updated_at=? WHERE id=?")
      .run(subtotal, subtotal, cleanText(req.body.notes, 500), stamp, stamp, order.id);
    db.prepare('UPDATE conversations SET last_message=?,last_message_at=? WHERE id=?')
      .run(`Pedido #${String(order.id).padStart(4, '0')} da ${session.table.name} foi editado pelo cliente.`, stamp, order.conversation_id);
    db.exec('COMMIT');
    const updated = orderWithItems(order.id);
    realtime.emit('order:updated', updated);
    realtime.emit('conversation:updated', { id: order.conversation_id });
    realtime.emit('table:updated', { tableId: session.table.id, tabId: session.tab.id });
    return res.json({ success: true, order: updated, session: publicTablePayload(tables.getMemberSession(req.params.token, req.body.deviceToken)) });
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    return res.status(409).json({ error: error.message });
  }
});

router.post('/table/:token/orders/:orderId/cancel', (req, res) => {
  if (setting('restaurant_tables_enabled', 'false') !== 'true') return res.status(403).json({ error: 'O atendimento por mesas está desativado.' });
  const session = tables.getMemberSession(req.params.token, req.body.deviceToken);
  if (!session) return res.status(404).json({ error: 'O vínculo com a mesa expirou ou foi encerrado.' });
  const order = db.prepare('SELECT * FROM orders WHERE id=? AND table_tab_id=? AND table_member_id=?').get(Number(req.params.orderId), session.tab.id, session.member.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado nesta comanda.' });
  if (setting('restaurant_table_customer_cancel_enabled','true') === 'false') return res.status(403).json({ error: 'O cancelamento pelo site está desativado. Chame um atendente.' });
  if (order.status !== 'new') return res.status(409).json({ error: 'Este pedido já foi confirmado. Solicite o cancelamento a um atendente.' });
  const editMinutes = Math.max(1,Math.min(120,Number(setting('restaurant_table_edit_minutes','10')||10)));
  if (Date.now() - new Date(order.created_at).getTime() > editMinutes * 60_000) return res.status(409).json({ error: `O prazo de ${editMinutes} minutos para cancelar terminou. Chame um atendente.` });
  const stamp = nowIso();
  db.exec('BEGIN');
  try {
    const items = db.prepare('SELECT product_id,quantity FROM order_items WHERE order_id=?').all(order.id);
    for (const item of items) {
      if (!item.product_id) continue;
      db.prepare('UPDATE products SET stock=CASE WHEN stock IS NULL THEN NULL ELSE stock+? END,updated_at=? WHERE id=?').run(Number(item.quantity || 0), stamp, item.product_id);
    }
    db.prepare("UPDATE orders SET status='cancelled',cancel_reason='Cancelado pelo cliente antes da confirmação',cancelled_at=?,updated_at=? WHERE id=?").run(stamp, stamp, order.id);
    db.prepare('UPDATE conversations SET last_message=?,last_message_at=? WHERE id=?').run(`Pedido #${String(order.id).padStart(4, '0')} cancelado pelo cliente.`, stamp, order.conversation_id);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch {}
    return res.status(409).json({ error: error.message });
  }
  const updated = orderWithItems(order.id);
  realtime.emit('order:updated', updated);
  realtime.emit('conversation:updated', { id: order.conversation_id });
  realtime.emit('table:updated', { tableId: session.table.id, tabId: session.tab.id });
  return res.json({ success: true, order: updated, session: publicTablePayload(tables.getMemberSession(req.params.token, req.body.deviceToken)) });
});

router.get('/checkout/:token', (req, res) => {
  if (!allowRequest(req, 120)) return res.status(429).json({ error: 'Muitas consultas. Tente novamente em instantes.' });
  const session = getCheckoutSession(req.params.token);
  if (!session) return res.status(404).json({ error: 'Este link de pedido expirou ou já foi utilizado. Solicite um novo link pelo WhatsApp.' });
  return res.json({
    checkout: {
      token: session.token,
      contact: { name: session.contact_name, phone: canonicalPhone(session.phone) },
      conversationId: session.conversation_id,
      cart: session.cart.map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes || '' })),
      expiresAt: session.expires_at,
    },
  });
});

router.post('/orders', (req, res) => {
  if (!allowRequest(req, 8, 10 * 60_000)) return res.status(429).json({ error: 'Muitos pedidos enviados deste dispositivo. Aguarde alguns minutos.' });
  const tableToken = cleanText(req.body.tableToken, 48).toLowerCase();
  let tableDeviceToken = cleanText(req.body.tableDeviceToken, 48).toLowerCase();
  const tablesEnabled = setting('restaurant_tables_enabled', 'false') === 'true';
  if ((tableToken || tableDeviceToken) && !tablesEnabled) return res.status(403).json({ error: 'O atendimento por mesas está desativado.' });
  const table = tableToken ? tables.getTableByToken(tableToken) : null;
  if (tableToken && !table) return res.status(400).json({ error: 'Este QR Code de mesa é inválido ou foi desativado.' });
  let tableSession = tableToken && tableDeviceToken ? tables.getMemberSession(tableToken, tableDeviceToken) : null;
  const isTableOrder = Boolean(table);
  if (!isTableOrder && setting('website_orders_enabled', 'true') !== 'true') return res.status(403).json({ error: 'Os pedidos pelo site estão temporariamente desativados.' });
  const currentSettings = Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map((row) => [row.key,row.value]));
  const orderingStatus = getOrderingStatus(currentSettings);
  if (!orderingStatus.open) {
    return res.status(403).json({
      error: unavailableMessage(orderingStatus).replace(/[🍽️🕒🍱🌙*]/g, '').replace(/\n+/g, ' ').trim(),
      code: 'OUTSIDE_ORDERING_HOURS',
      ordering: orderingStatus,
    });
  }

  const checkoutToken = cleanText(req.body.checkoutToken, 48).toLowerCase();
  const linkedCheckout = checkoutToken ? getCheckoutSession(checkoutToken) : null;
  if (checkoutToken && !linkedCheckout) return res.status(400).json({ error: 'O link do WhatsApp expirou ou já foi utilizado. Solicite um novo link.' });
  const name = cleanText(req.body.name || linkedCheckout?.contact_name, 120);
  const phone = canonicalPhone(linkedCheckout?.phone || req.body.phone);
  const fulfillmentMethod = isTableOrder ? 'table' : (req.body.fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery');
  const fulfillmentEnabled = isTableOrder ? true : (fulfillmentMethod === 'pickup'
    ? setting('website_pickup_enabled', 'true') !== 'false'
    : setting('website_delivery_enabled', 'true') !== 'false');
  const address = fulfillmentMethod === 'delivery' ? cleanText(req.body.address, 500) : '';
  const paymentMethod = isTableOrder ? '' : String(req.body.paymentMethod || '').trim();
  const paymentEnabled = isTableOrder || setting(`website_payment_${paymentMethod}`, 'true') !== 'false';
  const needsChange = !isTableOrder && paymentMethod === 'cash' && (req.body.needsChange === true || req.body.needsChange === 'true');
  const changeFor = needsChange ? parseMoneyInput(req.body.changeFor) : null;
  const notes = cleanText(req.body.notes, 500);
  const whatsappOptIn = req.body.whatsappOptIn === true || req.body.whatsappOptIn === 'true';
  const requestedItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const lunch = orderingStatus.lunch;
  if (isTableOrder && tableSession) {
    const pendingOrder = db.prepare("SELECT id,status,total,created_at FROM orders WHERE table_tab_id=? AND table_member_id=? AND status='new' ORDER BY id DESC LIMIT 1")
      .get(tableSession.tab.id, tableSession.member.id);
    if (pendingOrder) return res.status(409).json({
      error: `Você já possui o pedido #${String(pendingOrder.id).padStart(4, '0')} aguardando confirmação. Edite ou cancele esse pedido antes de criar outro.`,
      code: 'PENDING_ORDER_EXISTS',
      order: { ...pendingOrder, number: String(pendingOrder.id).padStart(4, '0') },
    });
  }

  if (name.length < 2) return res.status(400).json({ error: 'Informe seu nome.' });
  if (phone.length < 12 || phone.length > 13) return res.status(400).json({ error: 'Informe um WhatsApp válido com DDD.' });
  if (!fulfillmentEnabled) return res.status(400).json({ error: fulfillmentMethod === 'pickup' ? 'A retirada está indisponível no momento.' : 'A entrega está indisponível no momento.' });
  const existingTableTab = isTableOrder ? tables.activeTab(table.id) : null;
  if (isTableOrder && existingTableTab?.status === 'account_requested') return res.status(400).json({ error: 'A conta desta mesa já foi solicitada. Fale com a equipe para fazer outro pedido.' });
  if (fulfillmentMethod === 'delivery' && address.length < 8) return res.status(400).json({ error: 'Informe o endereço completo para entrega.' });
  if (!isTableOrder && (!Object.hasOwn(PAYMENT_LABELS, paymentMethod) || !paymentEnabled)) return res.status(400).json({ error: 'Escolha uma forma de pagamento disponível.' });
  if (!isTableOrder && paymentMethod === 'cash' && req.body.needsChange == null) return res.status(400).json({ error: 'Informe se precisa de troco.' });
  if (needsChange && changeFor == null) return res.status(400).json({ error: 'Informe um valor válido para o troco.' });
  if (!whatsappOptIn) return res.status(400).json({ error: 'Autorize o envio da confirmação e das atualizações pelo WhatsApp.' });
  if (!requestedItems.length) return res.status(400).json({ error: 'Seu carrinho está vazio.' });

  const selected = [];
  let subtotal = 0;
  for (const requested of requestedItems) {
    const productId = Number(requested.productId || 0);
    const quantity = Math.max(0, Math.min(20, Math.floor(Number(requested.quantity || 0))));
    if (!productId || quantity < 1) continue;
    const product = db.prepare('SELECT id,name,price,stock,active FROM products WHERE id=?').get(productId);
    if (!product || !product.active) return res.status(400).json({ error: 'Um produto do carrinho não está mais disponível.' });
    if (!canOrderProductNow(product, currentSettings)) {
      const error = isLunchProduct(product)
        ? `A marmitex está disponível somente das ${lunch.start} às ${lunch.end}.`
        : (orderingStatus.phase === 'lunch'
          ? `Neste horário estão disponíveis apenas as marmitex. Os pedidos normais voltam no período noturno configurado.`
          : 'Os pedidos normais estão fora do horário de atendimento.');
      return res.status(403).json({ error, code: 'PRODUCT_OUTSIDE_PERIOD', ordering: orderingStatus });
    }
    if (product.stock != null && quantity > Number(product.stock)) return res.status(409).json({ error: `Estoque insuficiente para ${product.name}.` });
    const itemNotes = cleanText(requested.notes, 180);
    const lunchValidation = validateLunchNotes(product, itemNotes);
    if (!lunchValidation.valid) return res.status(400).json({ error: lunchValidation.error });
    selected.push({ product, quantity, notes: itemNotes });
    subtotal += Number(product.price || 0) * quantity;
  }
  if (!selected.length) return res.status(400).json({ error: 'Não encontramos itens válidos no carrinho.' });

  const deliveryFee = fulfillmentMethod === 'delivery' ? Math.max(0, Number(setting('delivery_fee', '0') || 0)) : 0;
  const total = subtotal + deliveryFee;
  if (needsChange && Number(changeFor) < total) return res.status(400).json({ error: `O valor para troco não pode ser menor que ${formatMoney(total)}.` });
  const stamp = nowIso();
  const trackingToken = newTrackingToken();
  let contactId;
  let conversationId;
  let orderId;

  db.exec('BEGIN');
  try {
    if (isTableOrder && !tableSession) {
      tableSession = tables.joinTable(tableToken, tableDeviceToken);
      tableDeviceToken = tableSession.deviceToken;
    }

    const linkedContact = linkedCheckout
      ? db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(linkedCheckout.contact_id))
      : (isTableOrder && tableSession.member.contact_id
        ? db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(tableSession.member.contact_id))
        : null);
    const contact = linkedContact || findContactByPhone(phone)
      || createOrUpdateContact({ phone, name, source: 'website' });
    const updatedContact = createOrUpdateContact({ phone: contact.phone || phone, name, source: 'website' });
    contactId = Number(updatedContact.id);

    const linkedConversation = linkedCheckout?.conversation_id
      ? db.prepare("SELECT * FROM conversations WHERE id=? AND contact_id=? AND status!='closed'").get(Number(linkedCheckout.conversation_id), contactId)
      : null;
    const activeConversation = linkedConversation || activeConversationForContact(contactId);

    if (activeConversation) {
      conversationId = Number(activeConversation.id);
      const nextStatus = activeConversation.assigned_user_id ? 'open' : 'waiting_human';
      db.prepare(`
        UPDATE conversations
        SET status=?,channel=CASE WHEN channel='whatsapp' THEN 'whatsapp' ELSE 'website' END,origin='website',ai_enabled=0,hidden=0,last_message=?,last_message_at=?,unread_count=unread_count+1
        WHERE id=?
      `).run(nextStatus, isTableOrder ? `Novo pedido da ${tableSession.table.name} aguardando confirmação.` : 'Novo pedido pelo site aguardando confirmação.', stamp, conversationId);
    } else {
      const queue = db.prepare('SELECT id FROM queues WHERE active=1 ORDER BY id LIMIT 1').get();
      if (!queue) throw new Error('Nenhuma fila de atendimento está configurada.');
      const opened = ensureActiveConversation(contactId, () => db.prepare(`
        INSERT INTO conversations
        (contact_id,queue_id,assigned_user_id,status,channel,origin,ai_enabled,unread_count,priority,protocol,last_message,last_message_at,created_at,hidden)
        VALUES(?,?,NULL,'waiting_human','website','website',0,1,'normal',?,?,?, ?,0)
      `).run(contactId, queue.id, newProtocol(), isTableOrder ? `Novo pedido da ${tableSession.table.name} aguardando confirmação.` : 'Novo pedido pelo site aguardando confirmação.', stamp, stamp));
      conversationId = Number(opened.conversation.id);
      if (!opened.created) {
        const nextStatus = opened.conversation.assigned_user_id ? 'open' : 'waiting_human';
        db.prepare(`UPDATE conversations SET status=?,origin='website',ai_enabled=0,hidden=0,last_message=?,last_message_at=?,unread_count=unread_count+1 WHERE id=?`)
          .run(nextStatus, isTableOrder ? `Novo pedido da ${tableSession.table.name} aguardando confirmação.` : 'Novo pedido pelo site aguardando confirmação.', stamp, conversationId);
      }
    }

    const orderResult = db.prepare(`
      INSERT INTO orders
      (contact_id,conversation_id,status,subtotal,delivery_fee,total,address,payment_method,needs_change,change_for,fulfillment_method,notes,source,tracking_token,whatsapp_opt_in,whatsapp_receipt_status,table_id,table_tab_id,table_member_id,customer_name,created_at,updated_at)
      VALUES (?,?,'new',?,?,?,?,?,?,?,?,?,?,?,1,'queued',?,?,?,?,?,?)
    `).run(
      contactId,
      conversationId,
      subtotal,
      deliveryFee,
      total,
      address,
      paymentMethod,
      needsChange ? 1 : 0,
      needsChange ? Number(changeFor) : null,
      fulfillmentMethod,
      notes,
      'website',
      trackingToken,
      tableSession?.table?.id || null,
      tableSession?.tab?.id || null,
      tableSession?.member?.id || null,
      name,
      stamp,
      stamp,
    );
    orderId = Number(orderResult.lastInsertRowid);

    const insertItem = db.prepare('INSERT INTO order_items(order_id,product_id,name,quantity,unit_price,notes) VALUES(?,?,?,?,?,?)');
    for (const item of selected) {
      insertItem.run(orderId, item.product.id, item.product.name, item.quantity, item.product.price, item.notes);
      if (item.product.stock != null) {
        const changed = db.prepare('UPDATE products SET stock=stock-?,updated_at=? WHERE id=? AND stock>=?')
          .run(item.quantity, stamp, item.product.id, item.quantity);
        if (!changed.changes) throw new Error(`O estoque de ${item.product.name} mudou durante a finalização.`);
      }
    }

    db.prepare(`
      UPDATE conversations SET origin='website',last_message=?,last_message_at=? WHERE id=?
    `).run(isTableOrder ? `Pedido #${String(orderId).padStart(4, '0')} da ${tableSession.table.name} aguardando confirmação.` : `Pedido #${String(orderId).padStart(4, '0')} pelo site aguardando confirmação.`, stamp, conversationId);
    if (isTableOrder) tables.linkMember(tableSession.member.id, { contactId, conversationId, displayName: name });

    db.prepare(`
      INSERT INTO audit_logs(user_id,action,entity,entity_id,details,created_at)
      VALUES(NULL,'website_create','order',?,?,?)
    `).run(orderId, JSON.stringify({ source: 'website', ip: requestIp(req), fulfillmentMethod, total, linkedFromWhatsapp: Boolean(linkedCheckout), tableId: tableSession?.table?.id || null, tableTabId: tableSession?.tab?.id || null }), stamp);
    if (linkedCheckout) consumeCheckoutSession(checkoutToken, orderId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return res.status(409).json({ error: `Não foi possível finalizar o pedido: ${error.message}` });
  }

  let conversation = db.prepare(`
    SELECT c.*,ct.name contact_name FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.id=?
  `).get(conversationId);
  if (!conversation.assigned_user_id) {
    const target = assignment.chooseOnlineAgent(conversation.queue_id);
    if (target) {
      db.prepare("UPDATE conversations SET assigned_user_id=?,status='open',origin='website' WHERE id=?").run(target.id, conversationId);
      conversation = { ...conversation, assigned_user_id: target.id, status: 'open', origin: 'website' };
    }
  }

  const order = orderWithItems(orderId);
  const summary = selected.map((item) => `${item.quantity}x ${item.product.name}`).join(', ');
  const notifications = createWebsiteNotifications(order, summary, conversationId, conversation.assigned_user_id || null);
  realtime.emit('conversation:updated', { id: conversationId });
  realtime.emit('order:new', { order });
  if (isTableOrder) realtime.emit('table:updated', { tableId: tableSession.table.id, tabId: tableSession.tab.id });
  for (const notification of notifications) realtime.emit('notification:new', notification);

  const trackingUrl = `${publicOrigin(req)}/pedido/acompanhar/${trackingToken}`;
  setImmediate(() => {
    sendWebsiteReceipt(orderId, trackingUrl).catch((error) => console.error('Falha no comprovante do site:', error));
  });

  return res.status(201).json({
    success: true,
    order: {
      id: orderId,
      number: String(orderId).padStart(4, '0'),
      status: 'new',
      statusLabel: STATUS_LABELS.new,
      total,
      trackingToken,
      trackingUrl,
      tableName: tableSession?.table?.name || '',
    },
    tableSession: tableSession ? publicTablePayload(tables.getMemberSession(tableToken, tableDeviceToken)) : null,
    tableDeviceToken: tableSession?.deviceToken || tableDeviceToken || '',
    whatsapp: { status: 'queued' },
  });
});

router.get('/orders/:token', (req, res) => {
  if (!allowRequest(req, 120)) return res.status(429).json({ error: 'Muitas consultas. Tente novamente em instantes.' });
  const token = String(req.params.token || '').trim().toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const order = db.prepare(`
    SELECT o.*,ct.name contact_name,rt.name table_name
    FROM orders o JOIN contacts ct ON ct.id=o.contact_id
    LEFT JOIN restaurant_tables rt ON rt.id=o.table_id
    WHERE o.tracking_token=?
  `).get(token);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const items = db.prepare('SELECT name,quantity,unit_price,notes FROM order_items WHERE order_id=? ORDER BY id').all(order.id);
  return res.json({
    order: {
      id: order.id,
      number: String(order.id).padStart(4, '0'),
      customerName: String(order.contact_name || '').split(/\s+/)[0] || 'Cliente',
      status: order.status,
      statusLabel: statusLabelForOrder(order),
      progress: STATUS_PROGRESS[order.status] ?? 0,
      subtotal: Number(order.subtotal || 0),
      deliveryFee: Number(order.delivery_fee || 0),
      total: Number(order.total || 0),
      fulfillmentMethod: order.fulfillment_method,
      address: order.address || '',
      tableName: order.table_name || '',
      paymentMethod: order.payment_method,
      paymentLabel: paymentLabel(order.payment_method),
      needsChange: Boolean(order.needs_change),
      changeFor: order.change_for == null ? null : Number(order.change_for),
      notes: order.notes || '',
      cancelReason: order.status === 'cancelled' ? order.cancel_reason || '' : '',
      whatsappReceiptStatus: order.whatsapp_receipt_status || '',
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      confirmedAt: order.confirmed_at || null,
      items,
    },
    branding: {
      companyName: setting('company_name', 'G&M Automação'),
      primaryColor: setting('primary_color', '#1458EA'),
      pickupAddress: setting('store_pickup_address', ''),
    },
  });
});

module.exports = router;
