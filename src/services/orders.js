const { db, nowIso, insertMessage } = require('../db');
const realtime = require('./realtime');

function orderWithItems(id) {
  const order = db.prepare(`
    SELECT o.*, ct.name contact_name, ct.phone
    FROM orders o JOIN contacts ct ON ct.id=o.contact_id WHERE o.id=?
  `).get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id=? ORDER BY id').all(id);
  return order;
}

function createNotification({ type, title, message, entityType = '', entityId = null, targetRole = '' }) {
  const result = db.prepare(`
    INSERT INTO notifications (type,title,message,entity_type,entity_id,target_role,created_at)
    VALUES (?,?,?,?,?,?,?)
  `).run(type, title, message, entityType, entityId, targetRole, nowIso());
  return db.prepare('SELECT * FROM notifications WHERE id=?').get(Number(result.lastInsertRowid));
}

function createConfirmedOrder({
  conversation,
  requestedItems,
  deliveryFee = 0,
  address = '',
  paymentMethod = '',
  needsChange = false,
  changeFor = null,
  notes = '',
  fulfillmentMethod = 'delivery',
  userId = null,
  source = 'agent',
}) {
  if (!conversation) throw new Error('Atendimento não encontrado para criar o pedido.');
  if (!Array.isArray(requestedItems) || !requestedItems.length) throw new Error('Adicione pelo menos um produto ao pedido.');

  const items = [];
  let subtotal = 0;
  for (const item of requestedItems) {
    const product = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(Number(item.productId));
    const quantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
    if (!product || quantity < 1) continue;
    if (product.stock != null && quantity > product.stock) throw new Error(`Estoque insuficiente para ${product.name}.`);
    subtotal += Number(product.price) * quantity;
    items.push({ product, quantity, notes: String(item.notes || '').trim() });
  }
  if (!items.length) throw new Error('Nenhum item válido foi informado.');

  const method = fulfillmentMethod === 'pickup' ? 'pickup' : 'delivery';
  const fee = method === 'pickup' ? 0 : Math.max(0, Number(deliveryFee || 0));
  const total = subtotal + fee;
  const normalizedPayment = String(paymentMethod || '').trim();
  const normalizedNeedsChange = normalizedPayment === 'Dinheiro' && Boolean(needsChange);
  const normalizedChangeFor = normalizedNeedsChange && changeFor != null ? Number(changeFor) : null;
  if (normalizedNeedsChange && (!Number.isFinite(normalizedChangeFor) || normalizedChangeFor < total)) {
    throw new Error(`O valor para troco deve ser igual ou maior que R$ ${total.toFixed(2).replace('.', ',')}.`);
  }
  const stamp = nowIso();
  let orderId;

  db.exec('BEGIN');
  try {
    const result = db.prepare(`
      INSERT INTO orders
      (contact_id,conversation_id,status,subtotal,delivery_fee,total,address,payment_method,needs_change,change_for,fulfillment_method,notes,created_at,updated_at,confirmed_at)
      VALUES (?,?,'confirmed',?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      conversation.contact_id,
      conversation.id,
      subtotal,
      fee,
      total,
      method === 'pickup' ? '' : String(address || '').trim(),
      normalizedPayment,
      normalizedNeedsChange ? 1 : 0,
      normalizedChangeFor,
      method,
      String(notes || '').trim(),
      stamp,
      stamp,
      stamp,
    );
    orderId = Number(result.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id,product_id,name,quantity,unit_price,notes) VALUES (?,?,?,?,?,?)
    `);
    for (const item of items) {
      insertItem.run(orderId, item.product.id, item.product.name, item.quantity, item.product.price, item.notes);
      if (item.product.stock != null) db.prepare('UPDATE products SET stock=stock-?, updated_at=? WHERE id=?').run(item.quantity, stamp, item.product.id);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  const summary = items.map((item) => `${item.quantity}x ${item.product.name}`).join(', ');
  const deliveryLabel = method === 'pickup' ? 'Retirada na loja' : `Entrega: ${String(address || '').trim() || 'endereço não informado'}`;
  const notification = createNotification({
    type: 'new_order',
    title: `Novo pedido #${String(orderId).padStart(4, '0')}`,
    message: `${conversation.contact_name}: ${summary} · ${deliveryLabel}`,
    entityType: 'order',
    entityId: orderId,
    targetRole: 'kitchen',
  });
  const internalMessageId = insertMessage({
    conversationId: conversation.id,
    senderType: 'internal',
    userId,
    content: `**Pedido #${String(orderId).padStart(4, '0')}** confirmado e enviado para a cozinha. ${deliveryLabel}. Total: R$ ${total.toFixed(2).replace('.', ',')}.`,
    isInternal: 1,
  });
  const order = orderWithItems(orderId);
  realtime.emit('order:new', { order, notification });
  realtime.emit('notification:new', notification);
  realtime.emit('message:new', { conversationId: conversation.id, message: db.prepare('SELECT * FROM messages WHERE id=?').get(internalMessageId) });
  return { order, items, summary, subtotal, deliveryFee: fee, total, internalMessageId };
}

module.exports = { createConfirmedOrder, orderWithItems, createNotification };
