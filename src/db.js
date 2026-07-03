const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { createDatabase } = require('./database');
const { JHOW_MENU_2026 } = require('./data/jhow-menu-2026');

const { db, DB_PATH, DB_TYPE } = createDatabase();

function nowIso() {
  return new Date().toISOString();
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent',
      sector TEXT NOT NULL DEFAULT 'Atendimento',
      status TEXT NOT NULL DEFAULT 'online',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS queues (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL DEFAULT '#1458EA',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      document TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_seen_at TEXT,
      last_auto_greeting_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      queue_id INTEGER NOT NULL,
      assigned_user_id INTEGER,
      status TEXT NOT NULL DEFAULT 'waiting',
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      unread_count INTEGER NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'normal',
      protocol TEXT NOT NULL UNIQUE,
      last_message TEXT DEFAULT '',
      last_message_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      closed_at TEXT,
      close_reason_id INTEGER,
      close_reason_text TEXT DEFAULT '',
      closed_by_user_id INTEGER,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (queue_id) REFERENCES queues(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id),
      FOREIGN KEY (close_reason_id) REFERENCES closure_reasons(id),
      FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_type TEXT NOT NULL,
      user_id INTEGER,
      content TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      delivery_status TEXT NOT NULL DEFAULT 'sent',
      delivered_at TEXT,
      read_at TEXT,
      is_internal INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      aliases TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      stock INTEGER,
      image_url TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Geral',
      content TEXT NOT NULL,
      keywords TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quick_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shortcut TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Geral',
      content TEXT NOT NULL,
      favorite INTEGER NOT NULL DEFAULT 0,
      usage_count INTEGER NOT NULL DEFAULT 0,
      allowed_roles_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER NOT NULL,
      conversation_id INTEGER,
      status TEXT NOT NULL DEFAULT 'new',
      subtotal REAL NOT NULL DEFAULT 0,
      delivery_fee REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      address TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      needs_change INTEGER NOT NULL DEFAULT 0,
      change_for REAL,
      fulfillment_method TEXT NOT NULL DEFAULT 'delivery',
      notes TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT 'panel',
      tracking_token TEXT,
      whatsapp_opt_in INTEGER NOT NULL DEFAULT 0,
      whatsapp_receipt_status TEXT NOT NULL DEFAULT 'pending',
      whatsapp_notified_at TEXT,
      whatsapp_error TEXT DEFAULT '',
      edited_at TEXT,
      edited_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_instances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'mock',
      status TEXT NOT NULL DEFAULT 'disconnected',
      phone TEXT DEFAULT '',
      config_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      entity_type TEXT DEFAULT '',
      entity_id INTEGER,
      target_role TEXT DEFAULT '',
      read_at TEXT,
      created_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS closure_reasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stickers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );


    CREATE TABLE IF NOT EXISTS ai_order_sessions (
      conversation_id INTEGER PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT 'awaiting_fulfillment',
      cart_json TEXT NOT NULL DEFAULT '[]',
      fulfillment_method TEXT DEFAULT '',
      address TEXT DEFAULT '',
      payment_method TEXT DEFAULT '',
      needs_change INTEGER NOT NULL DEFAULT 0,
      change_for REAL,
      delivery_fee REAL NOT NULL DEFAULT 0,
      customer_notes TEXT DEFAULT '',
      resume_stage TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lunch_order_sessions (
      conversation_id INTEGER PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT 'offered',
      product_id INTEGER,
      size TEXT DEFAULT '',
      with_barbecue INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1,
      meat TEXT DEFAULT '',
      rice TEXT DEFAULT '',
      beans TEXT DEFAULT '',
      garnishes_json TEXT NOT NULL DEFAULT '[]',
      salad TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS website_checkout_sessions (
      token TEXT PRIMARY KEY,
      contact_id INTEGER NOT NULL,
      conversation_id INTEGER,
      cart_json TEXT NOT NULL DEFAULT '[]',
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      order_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_website_checkout_contact ON website_checkout_sessions(contact_id,created_at);
    CREATE INDEX IF NOT EXISTS idx_website_checkout_conversation ON website_checkout_sessions(conversation_id,created_at);

    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      qr_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'free',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS table_tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      opened_at TEXT NOT NULL,
      account_requested_at TEXT,
      closed_at TEXT,
      closed_by_user_id INTEGER,
      notes TEXT DEFAULT '',
      FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE CASCADE,
      FOREIGN KEY (closed_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS table_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id INTEGER NOT NULL,
      device_token TEXT NOT NULL,
      contact_id INTEGER,
      conversation_id INTEGER,
      display_name TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      joined_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      left_at TEXT,
      FOREIGN KEY (tab_id) REFERENCES table_tabs(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      UNIQUE(tab_id, device_token)
    );

    CREATE TABLE IF NOT EXISTS table_service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL,
      tab_id INTEGER NOT NULL,
      member_id INTEGER,
      request_type TEXT NOT NULL,
      message TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by_user_id INTEGER,
      FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE CASCADE,
      FOREIGN KEY (tab_id) REFERENCES table_tabs(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES table_members(id) ON DELETE SET NULL,
      FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS table_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tab_id INTEGER NOT NULL,
      member_id INTEGER,
      payment_scope TEXT NOT NULL DEFAULT 'partial',
      payment_method TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (tab_id) REFERENCES table_tabs(id) ON DELETE CASCADE,
      FOREIGN KEY (member_id) REFERENCES table_members(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_table_payments_tab ON table_payments(tab_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON restaurant_tables(status,active);
    CREATE INDEX IF NOT EXISTS idx_table_tabs_table ON table_tabs(table_id,status,opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_table_members_device ON table_members(device_token,active);
    CREATE INDEX IF NOT EXISTS idx_table_requests_status ON table_service_requests(status,created_at DESC);

    CREATE TABLE IF NOT EXISTS conversation_transfers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      from_user_id INTEGER,
      to_user_id INTEGER,
      from_queue_id INTEGER,
      to_queue_id INTEGER,
      transfer_type TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id),
      FOREIGN KEY (from_queue_id) REFERENCES queues(id),
      FOREIGN KEY (to_queue_id) REFERENCES queues(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );



    CREATE TABLE IF NOT EXISTS user_preferences (
      user_id INTEGER PRIMARY KEY,
      theme TEXT NOT NULL DEFAULT 'light',
      compact_mode INTEGER NOT NULL DEFAULT 0,
      sounds_enabled INTEGER NOT NULL DEFAULT 1,
      desktop_notifications INTEGER NOT NULL DEFAULT 1,
      density TEXT NOT NULL DEFAULT 'comfortable',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS queue_memberships (
      user_id INTEGER NOT NULL,
      queue_id INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      joined INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, queue_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Geral',
      language TEXT NOT NULL DEFAULT 'pt_BR',
      body TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'none',
      media_url TEXT DEFAULT '',
      variables_json TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS internal_channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS internal_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      reply_to_id INTEGER,
      attachment_url TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      edited_at TEXT,
      deleted_at TEXT,
      FOREIGN KEY (channel_id) REFERENCES internal_channels(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (reply_to_id) REFERENCES internal_messages(id)
    );

    CREATE TABLE IF NOT EXISTS crm_funnels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS crm_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      funnel_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#1458EA',
      FOREIGN KEY (funnel_id) REFERENCES crm_funnels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS crm_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      contact_id INTEGER,
      conversation_id INTEGER,
      funnel_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      assigned_user_id INTEGER,
      value REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open',
      source TEXT DEFAULT 'Atendimento',
      notes TEXT DEFAULT '',
      due_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (funnel_id) REFERENCES crm_funnels(id),
      FOREIGN KEY (stage_id) REFERENCES crm_stages(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      protocol TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      contact_id INTEGER,
      conversation_id INTEGER,
      assigned_user_id INTEGER,
      queue_id INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'open',
      category TEXT DEFAULT 'Geral',
      sla_due_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id),
      FOREIGN KEY (queue_id) REFERENCES queues(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      assigned_user_id INTEGER,
      contact_id INTEGER,
      conversation_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      priority TEXT NOT NULL DEFAULT 'normal',
      due_at TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      FOREIGN KEY (assigned_user_id) REFERENCES users(id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );


    CREATE TABLE IF NOT EXISTS pause_reasons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS satisfaction_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER,
      contact_id INTEGER,
      score INTEGER,
      comment TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(message_id,user_id,emoji),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY(notification_id,user_id),
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      template_id INTEGER,
      audience_filter_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (template_id) REFERENCES message_templates(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL DEFAULT 'keyword',
      trigger_value TEXT DEFAULT '',
      action_type TEXT NOT NULL DEFAULT 'reply',
      action_payload_json TEXT NOT NULL DEFAULT '{}',
      queue_id INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (queue_id) REFERENCES queues(id),
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      external_id TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(provider, external_id)
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_closed_at ON conversations(closed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_closure_reasons_active ON closure_reasons(active, name);
    CREATE INDEX IF NOT EXISTS idx_stickers_active ON stickers(active, name);
    CREATE INDEX IF NOT EXISTS idx_transfers_conversation ON conversation_transfers(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_templates_active ON message_templates(active, category, name);
    CREATE INDEX IF NOT EXISTS idx_internal_messages_channel ON internal_messages(channel_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_crm_stage ON crm_opportunities(stage_id, status);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, priority, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(assigned_user_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_pause_reasons_active ON pause_reasons(active, name);
    CREATE INDEX IF NOT EXISTS idx_satisfaction_created ON satisfaction_responses(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_automations_active ON automations(active, trigger_type);
  `);
}

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((item) => item.name === column);
}

function migrateSchema() {
  if (!hasColumn('users', 'active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  if (!hasColumn('products', 'aliases')) db.exec("ALTER TABLE products ADD COLUMN aliases TEXT DEFAULT ''");
  if (!hasColumn('products', 'fiscal_ncm')) db.exec("ALTER TABLE products ADD COLUMN fiscal_ncm TEXT DEFAULT ''");
  if (!hasColumn('products', 'fiscal_cest')) db.exec("ALTER TABLE products ADD COLUMN fiscal_cest TEXT DEFAULT ''");
  if (!hasColumn('products', 'fiscal_cfop')) db.exec("ALTER TABLE products ADD COLUMN fiscal_cfop TEXT DEFAULT ''");
  if (!hasColumn('products', 'fiscal_cst_csosn')) db.exec("ALTER TABLE products ADD COLUMN fiscal_cst_csosn TEXT DEFAULT ''");
  if (!hasColumn('products', 'fiscal_origin')) db.exec("ALTER TABLE products ADD COLUMN fiscal_origin TEXT DEFAULT '0'");
  if (!hasColumn('products', 'fiscal_unit')) db.exec("ALTER TABLE products ADD COLUMN fiscal_unit TEXT DEFAULT 'UN'");
  if (!hasColumn('products', 'fiscal_ibs_cbs')) db.exec("ALTER TABLE products ADD COLUMN fiscal_ibs_cbs TEXT DEFAULT ''");
  if (!hasColumn('products', 'fiscal_notes')) db.exec("ALTER TABLE products ADD COLUMN fiscal_notes TEXT DEFAULT ''");
  if (!hasColumn('contacts', 'last_auto_greeting_at')) db.exec('ALTER TABLE contacts ADD COLUMN last_auto_greeting_at TEXT');
  if (!hasColumn('messages', 'provider_message_id')) db.exec('ALTER TABLE messages ADD COLUMN provider_message_id TEXT');
  if (!hasColumn('messages', 'media_url')) db.exec("ALTER TABLE messages ADD COLUMN media_url TEXT DEFAULT ''");
  if (!hasColumn('messages', 'mime_type')) db.exec("ALTER TABLE messages ADD COLUMN mime_type TEXT DEFAULT ''");
  if (!hasColumn('messages', 'file_name')) db.exec("ALTER TABLE messages ADD COLUMN file_name TEXT DEFAULT ''");
  if (!hasColumn('messages', 'delivered_at')) db.exec('ALTER TABLE messages ADD COLUMN delivered_at TEXT');
  if (!hasColumn('messages', 'read_at')) db.exec('ALTER TABLE messages ADD COLUMN read_at TEXT');
  if (!hasColumn('orders', 'confirmed_at')) db.exec('ALTER TABLE orders ADD COLUMN confirmed_at TEXT');
  if (!hasColumn('orders', 'kitchen_seen_at')) db.exec('ALTER TABLE orders ADD COLUMN kitchen_seen_at TEXT');
  if (!hasColumn('orders', 'fulfillment_method')) db.exec("ALTER TABLE orders ADD COLUMN fulfillment_method TEXT NOT NULL DEFAULT 'delivery'");
  if (!hasColumn('orders', 'edited_at')) db.exec('ALTER TABLE orders ADD COLUMN edited_at TEXT');
  if (!hasColumn('orders', 'edited_by_user_id')) db.exec('ALTER TABLE orders ADD COLUMN edited_by_user_id INTEGER');
  if (!hasColumn('orders', 'source')) db.exec("ALTER TABLE orders ADD COLUMN source TEXT NOT NULL DEFAULT 'panel'");
  if (!hasColumn('orders', 'tracking_token')) db.exec('ALTER TABLE orders ADD COLUMN tracking_token TEXT');
  if (!hasColumn('orders', 'whatsapp_opt_in')) db.exec('ALTER TABLE orders ADD COLUMN whatsapp_opt_in INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('orders', 'whatsapp_receipt_status')) db.exec("ALTER TABLE orders ADD COLUMN whatsapp_receipt_status TEXT NOT NULL DEFAULT 'pending'");
  if (!hasColumn('orders', 'whatsapp_notified_at')) db.exec('ALTER TABLE orders ADD COLUMN whatsapp_notified_at TEXT');
  if (!hasColumn('orders', 'whatsapp_error')) db.exec("ALTER TABLE orders ADD COLUMN whatsapp_error TEXT DEFAULT ''");
  if (!hasColumn('orders', 'table_id')) db.exec('ALTER TABLE orders ADD COLUMN table_id INTEGER');
  if (!hasColumn('orders', 'table_tab_id')) db.exec('ALTER TABLE orders ADD COLUMN table_tab_id INTEGER');
  if (!hasColumn('orders', 'table_member_id')) db.exec('ALTER TABLE orders ADD COLUMN table_member_id INTEGER');
  if (!hasColumn('orders', 'customer_name')) db.exec("ALTER TABLE orders ADD COLUMN customer_name TEXT DEFAULT ''");
  if (!hasColumn('orders', 'needs_change')) db.exec('ALTER TABLE orders ADD COLUMN needs_change INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('orders', 'change_for')) db.exec('ALTER TABLE orders ADD COLUMN change_for REAL');
  if (!hasColumn('ai_order_sessions', 'needs_change')) db.exec('ALTER TABLE ai_order_sessions ADD COLUMN needs_change INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('ai_order_sessions', 'change_for')) db.exec('ALTER TABLE ai_order_sessions ADD COLUMN change_for REAL');
  if (!hasColumn('ai_order_sessions', 'resume_stage')) db.exec("ALTER TABLE ai_order_sessions ADD COLUMN resume_stage TEXT DEFAULT ''");
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token) WHERE tracking_token IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_orders_table_tab ON orders(table_tab_id,created_at)');
  // Corrige pedidos antigos de retirada que foram indevidamente enviados ao fluxo de entrega.
  db.prepare("UPDATE orders SET status='ready',updated_at=? WHERE fulfillment_method='pickup' AND status='out_for_delivery'").run(nowIso());
  db.prepare("UPDATE orders SET status='picked_up',updated_at=? WHERE fulfillment_method='pickup' AND status='delivered'").run(nowIso());
  // Garante que pedidos vinculados a uma mesa nunca sejam tratados como entrega por versões anteriores.
  db.prepare("UPDATE orders SET fulfillment_method='table',delivery_fee=0,address='' WHERE table_id IS NOT NULL AND fulfillment_method!='table'").run();
  db.prepare("UPDATE orders SET status='ready',updated_at=? WHERE table_id IS NOT NULL AND status='out_for_delivery'").run(nowIso());
  if (!hasColumn('conversations', 'origin')) db.exec("ALTER TABLE conversations ADD COLUMN origin TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE conversations SET origin='website' WHERE COALESCE(origin,'')='' AND id IN (SELECT DISTINCT conversation_id FROM orders WHERE source='website' AND conversation_id IS NOT NULL)").run();
  // Remove as mensagens artificiais antigas do site; o resumo passa a ficar fixo no atendimento.
  db.prepare("DELETE FROM messages WHERE sender_type='customer' AND content LIKE '🛒 Pedido #% realizado pelo site%'").run();
  if (!hasColumn('conversations', 'close_reason_id')) db.exec('ALTER TABLE conversations ADD COLUMN close_reason_id INTEGER');
  if (!hasColumn('conversations', 'close_reason_text')) db.exec("ALTER TABLE conversations ADD COLUMN close_reason_text TEXT DEFAULT ''");
  if (!hasColumn('conversations', 'closed_by_user_id')) db.exec('ALTER TABLE conversations ADD COLUMN closed_by_user_id INTEGER');
  if (!hasColumn('users', 'avatar_url')) db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''");
  if (!hasColumn('users', 'last_seen_at')) db.exec('ALTER TABLE users ADD COLUMN last_seen_at TEXT');
  if (!hasColumn('messages', 'reply_to_message_id')) db.exec('ALTER TABLE messages ADD COLUMN reply_to_message_id INTEGER');
  if (!hasColumn('messages', 'forwarded_from_message_id')) db.exec('ALTER TABLE messages ADD COLUMN forwarded_from_message_id INTEGER');
  if (!hasColumn('messages', 'edited_at')) db.exec('ALTER TABLE messages ADD COLUMN edited_at TEXT');
  if (!hasColumn('messages', 'deleted_at')) db.exec('ALTER TABLE messages ADD COLUMN deleted_at TEXT');
  if (!hasColumn('messages', 'deleted_by_user_id')) db.exec('ALTER TABLE messages ADD COLUMN deleted_by_user_id INTEGER');
  if (!hasColumn('messages', 'deleted_scope')) db.exec("ALTER TABLE messages ADD COLUMN deleted_scope TEXT DEFAULT ''");
  if (!hasColumn('quick_replies', 'category')) db.exec("ALTER TABLE quick_replies ADD COLUMN category TEXT NOT NULL DEFAULT 'Geral'");
  if (!hasColumn('quick_replies', 'active')) db.exec('ALTER TABLE quick_replies ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  if (!hasColumn('users', 'receive_assignments')) db.exec("ALTER TABLE users ADD COLUMN receive_assignments INTEGER NOT NULL DEFAULT 1");
  if (!hasColumn('users', 'pause_reason')) db.exec("ALTER TABLE users ADD COLUMN pause_reason TEXT DEFAULT ''");
  if (!hasColumn('users', 'last_activity_at')) db.exec('ALTER TABLE users ADD COLUMN last_activity_at TEXT');
  if (!hasColumn('conversations', 'hidden')) db.exec('ALTER TABLE conversations ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('conversations', 'first_response_at')) db.exec('ALTER TABLE conversations ADD COLUMN first_response_at TEXT');
  if (!hasColumn('conversations', 'satisfaction_requested_at')) db.exec('ALTER TABLE conversations ADD COLUMN satisfaction_requested_at TEXT');
  if (!hasColumn('conversations', 'satisfaction_score')) db.exec('ALTER TABLE conversations ADD COLUMN satisfaction_score INTEGER');
  if (!hasColumn('messages', 'pinned')) db.exec('ALTER TABLE messages ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  if (!hasColumn('messages', 'failed_reason')) db.exec("ALTER TABLE messages ADD COLUMN failed_reason TEXT DEFAULT ''");
  if (!hasColumn('notifications', 'target_user_id')) db.exec('ALTER TABLE notifications ADD COLUMN target_user_id INTEGER');
  if (!hasColumn('queue_memberships', 'joined')) db.exec("ALTER TABLE queue_memberships ADD COLUMN joined INTEGER NOT NULL DEFAULT 1");
  if (!hasColumn('quick_replies', 'category')) db.exec("ALTER TABLE quick_replies ADD COLUMN category TEXT NOT NULL DEFAULT 'Geral'");
  if (!hasColumn('quick_replies', 'favorite')) db.exec("ALTER TABLE quick_replies ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
  if (!hasColumn('quick_replies', 'usage_count')) db.exec("ALTER TABLE quick_replies ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0");
  if (!hasColumn('quick_replies', 'allowed_roles_json')) db.exec("ALTER TABLE quick_replies ADD COLUMN allowed_roles_json TEXT NOT NULL DEFAULT '[]'");
  if (!hasColumn('quick_replies', 'updated_at')) db.exec("ALTER TABLE quick_replies ADD COLUMN updated_at TEXT");
  if (!hasColumn('message_templates', 'template_type')) db.exec("ALTER TABLE message_templates ADD COLUMN template_type TEXT NOT NULL DEFAULT 'internal'");
  if (!hasColumn('message_templates', 'official_name')) db.exec("ALTER TABLE message_templates ADD COLUMN official_name TEXT DEFAULT ''");
  if (!hasColumn('message_templates', 'official_status')) db.exec("ALTER TABLE message_templates ADD COLUMN official_status TEXT NOT NULL DEFAULT 'draft'");
  if (!hasColumn('message_templates', 'header_text')) db.exec("ALTER TABLE message_templates ADD COLUMN header_text TEXT DEFAULT ''");
  if (!hasColumn('message_templates', 'footer_text')) db.exec("ALTER TABLE message_templates ADD COLUMN footer_text TEXT DEFAULT ''");
  if (!hasColumn('message_templates', 'buttons_json')) db.exec("ALTER TABLE message_templates ADD COLUMN buttons_json TEXT NOT NULL DEFAULT '[]'");
  if (!hasColumn('internal_messages', 'recipient_user_id')) db.exec('ALTER TABLE internal_messages ADD COLUMN recipient_user_id INTEGER');
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_hidden_users (
      message_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      hidden_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id),
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_message_hidden_user ON message_hidden_users(user_id, message_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_provider_id ON messages(provider_message_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_closed_at ON conversations(closed_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_internal_direct ON internal_messages(recipient_user_id, user_id, created_at)');

  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_phone_aliases (
      phone_key TEXT PRIMARY KEY,
      contact_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_contact_phone_alias_contact ON contact_phone_aliases(contact_id);

    CREATE TABLE IF NOT EXISTS bot_order_mode_sessions (
      conversation_id INTEGER PRIMARY KEY,
      expires_at TEXT NOT NULL,
      cart_json TEXT NOT NULL DEFAULT '[]',
      choice_mode TEXT NOT NULL DEFAULT 'hybrid_ai',
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_bot_order_mode_expires ON bot_order_mode_sessions(expires_at);

    CREATE TABLE IF NOT EXISTS bot_catalog_sessions (
      conversation_id INTEGER PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT 'categories',
      category TEXT DEFAULT '',
      page INTEGER NOT NULL DEFAULT 0,
      product_id INTEGER,
      resume_order_stage TEXT DEFAULT '',
      updated_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bot_catalog_updated ON bot_catalog_sessions(updated_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      device_name TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT,
      revoke_reason TEXT DEFAULT '',
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_wait_alerts (
      conversation_id INTEGER NOT NULL,
      customer_message_id INTEGER NOT NULL,
      threshold_minutes INTEGER NOT NULL,
      notified_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, customer_message_id, threshold_minutes),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      conversation_id INTEGER NOT NULL,
      contact_id INTEGER NOT NULL,
      request_text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      resolved_by_user_id INTEGER,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
      FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, revoked_at, last_seen_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_single_active ON user_sessions(user_id) WHERE revoked_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_wait_alerts_conversation ON conversation_wait_alerts(conversation_id, customer_message_id);
    CREATE INDEX IF NOT EXISTS idx_order_change_requests_conversation ON order_change_requests(conversation_id, status, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS fiscal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      document_type TEXT NOT NULL DEFAULT 'unconfigured',
      environment TEXT NOT NULL DEFAULT 'homologation',
      provider TEXT NOT NULL DEFAULT 'preparation',
      status TEXT NOT NULL DEFAULT 'draft',
      customer_document TEXT DEFAULT '',
      access_key TEXT DEFAULT '',
      document_number TEXT DEFAULT '',
      series TEXT DEFAULT '',
      missing_fields_json TEXT NOT NULL DEFAULT '[]',
      payload_json TEXT NOT NULL DEFAULT '{}',
      response_json TEXT NOT NULL DEFAULT '{}',
      created_by_user_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_fiscal_documents_status ON fiscal_documents(status,updated_at DESC);
  `);
  if (!hasColumn('bot_order_mode_sessions', 'cart_json')) db.exec("ALTER TABLE bot_order_mode_sessions ADD COLUMN cart_json TEXT NOT NULL DEFAULT '[]'");
  if (!hasColumn('bot_order_mode_sessions', 'choice_mode')) db.exec("ALTER TABLE bot_order_mode_sessions ADD COLUMN choice_mode TEXT NOT NULL DEFAULT 'hybrid_ai'");
  if (!hasColumn('order_change_requests', 'updated_at')) db.exec("ALTER TABLE order_change_requests ADD COLUMN updated_at TEXT");

  if (!hasColumn('orders', 'cancel_reason')) db.exec("ALTER TABLE orders ADD COLUMN cancel_reason TEXT DEFAULT ''");
  if (!hasColumn('orders', 'cancelled_at')) db.exec('ALTER TABLE orders ADD COLUMN cancelled_at TEXT');
  if (!hasColumn('orders', 'cancelled_by_user_id')) db.exec('ALTER TABLE orders ADD COLUMN cancelled_by_user_id INTEGER');

  // Corrige mensagens antigas que ficaram presas em "Aguardando envio".
  // Uma resposta posterior do cliente comprova que as mensagens anteriores
  // foram recebidas; uma mensagem com ID do provedor foi ao menos aceita.
  const deliveryStamp = nowIso();
  db.prepare(`
    UPDATE messages SET delivery_status='read',
      delivered_at=COALESCE(delivered_at,?), read_at=COALESCE(read_at,?)
    WHERE id IN (
      SELECT outbound.id FROM messages outbound
      WHERE outbound.is_internal=0 AND outbound.sender_type IN ('agent','ai')
        AND outbound.delivery_status IN ('pending','sent','delivered')
        AND EXISTS (
          SELECT 1 FROM messages incoming
          WHERE incoming.conversation_id=outbound.conversation_id
            AND incoming.sender_type='customer'
            AND (incoming.created_at>outbound.created_at OR (incoming.created_at=outbound.created_at AND incoming.id>outbound.id))
        )
    )
  `).run(deliveryStamp, deliveryStamp);
  db.prepare(`
    UPDATE messages SET delivery_status='sent'
    WHERE is_internal=0 AND sender_type IN ('agent','ai') AND delivery_status='pending'
      AND provider_message_id IS NOT NULL AND trim(provider_message_id)!=''
  `).run();
}

function insertMessage({ conversationId, senderType, userId = null, content, isInternal = 0, createdAt = nowIso(), providerMessageId = null, messageType = 'text', mediaUrl = '', mimeType = '', fileName = '', deliveryStatus = 'sent', replyToMessageId = null, forwardedFromMessageId = null }) {
  const result = db.prepare(`
    INSERT INTO messages (conversation_id, sender_type, user_id, content, message_type, delivery_status, is_internal, created_at, provider_message_id, media_url, mime_type, file_name, reply_to_message_id, forwarded_from_message_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(conversationId, senderType, userId, content, messageType, deliveryStatus, isInternal ? 1 : 0, createdAt, providerMessageId, mediaUrl, mimeType, fileName, replyToMessageId, forwardedFromMessageId);

  if (!isInternal) {
    db.prepare(`
      UPDATE conversations
      SET last_message = ?, last_message_at = ?
      WHERE id = ?
    `).run(content, createdAt, conversationId);
  }

  return Number(result.lastInsertRowid);
}

function seedDatabase() {
  const existingUsers = db.prepare('SELECT COUNT(*) AS total FROM users').get().total;
  if (existingUsers > 0) return;

  const createdAt = nowIso();
  db.exec('BEGIN');
  try {
    const adminId = Number(db.prepare(`
      INSERT INTO users (name, email, password_hash, role, sector, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Administrador',
      'admin@teste.local',
      bcrypt.hashSync('admin123', 10),
      'admin',
      'Administração',
      'online',
      createdAt
    ).lastInsertRowid);

    const agentId = Number(db.prepare(`
      INSERT INTO users (name, email, password_hash, role, sector, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'Ana Atendimento',
      'ana@teste.local',
      bcrypt.hashSync('123456', 10),
      'agent',
      'Atendimento',
      'online',
      createdAt
    ).lastInsertRowid);

    const queueInsert = db.prepare('INSERT INTO queues (name, color, active, created_at) VALUES (?, ?, 1, ?)');
    const atendimentoQueueId = Number(queueInsert.run('Atendimento', '#1458EA', createdAt).lastInsertRowid);
    const pedidosQueueId = Number(queueInsert.run('Pedidos', '#06A77D', createdAt).lastInsertRowid);
    queueInsert.run('Financeiro', '#7C4DFF', createdAt);
    queueInsert.run('Reclamações', '#E85D75', createdAt);

    db.prepare('INSERT OR IGNORE INTO user_preferences (user_id, theme, compact_mode, sounds_enabled, desktop_notifications, density, updated_at) VALUES (?,?,?,?,?,?,?)').run(adminId, 'light', 0, 1, 1, 'comfortable', createdAt);
    db.prepare('INSERT OR IGNORE INTO user_preferences (user_id, theme, compact_mode, sounds_enabled, desktop_notifications, density, updated_at) VALUES (?,?,?,?,?,?,?)').run(agentId, 'light', 0, 1, 1, 'comfortable', createdAt);
    db.prepare('INSERT OR IGNORE INTO queue_memberships (user_id, queue_id, active, joined, created_at) VALUES (?,?,1,1,?)').run(agentId, atendimentoQueueId, createdAt);
    db.prepare('INSERT OR IGNORE INTO queue_memberships (user_id, queue_id, active, joined, created_at) VALUES (?,?,1,1,?)').run(agentId, pedidosQueueId, createdAt);

    const contactInsert = db.prepare(`
      INSERT INTO contacts (name, phone, email, document, notes, tags, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, '', ?, ?, ?, ?, ?)
    `);
    const contact1 = Number(contactInsert.run(
      'Mariana Souza', '5538999990001', 'mariana@example.com',
      'Prefere entrega no período da noite.', JSON.stringify(['Cliente frequente', 'Entrega']),
      createdAt, createdAt, createdAt
    ).lastInsertRowid);
    const contact2 = Number(contactInsert.run(
      'Carlos Henrique', '5538999990002', 'carlos@example.com',
      '', JSON.stringify(['Cliente novo']), createdAt, createdAt, createdAt
    ).lastInsertRowid);
    const contact3 = Number(contactInsert.run(
      'Juliana Martins', '5538999990003', '',
      'Solicitou atendimento humano.', JSON.stringify(['Aguardando']), createdAt, createdAt, createdAt
    ).lastInsertRowid);

    const convInsert = db.prepare(`
      INSERT INTO conversations
      (contact_id, queue_id, assigned_user_id, status, channel, ai_enabled, unread_count, priority, protocol, last_message, last_message_at, created_at)
      VALUES (?, ?, ?, ?, 'whatsapp', ?, ?, ?, ?, ?, ?, ?)
    `);
    const conv1 = Number(convInsert.run(
      contact1, pedidosQueueId, agentId, 'open', 0, 0, 'normal', 'ATD-2026-0001',
      'Certo, pode ser entrega.', new Date(Date.now() - 5 * 60_000).toISOString(), createdAt
    ).lastInsertRowid);
    const conv2 = Number(convInsert.run(
      contact2, atendimentoQueueId, null, 'waiting', 1, 2, 'normal', 'ATD-2026-0002',
      'Qual é o horário de funcionamento?', new Date(Date.now() - 11 * 60_000).toISOString(), createdAt
    ).lastInsertRowid);
    const conv3 = Number(convInsert.run(
      contact3, atendimentoQueueId, null, 'waiting_human', 0, 1, 'high', 'ATD-2026-0003',
      'Quero falar com uma pessoa.', new Date(Date.now() - 18 * 60_000).toISOString(), createdAt
    ).lastInsertRowid);

    insertMessage({ conversationId: conv1, senderType: 'customer', content: 'Boa noite, quero dois X-Burguers.' });
    insertMessage({ conversationId: conv1, senderType: 'agent', userId: agentId, content: 'Boa noite! Um deles terá alguma observação?' });
    insertMessage({ conversationId: conv1, senderType: 'customer', content: 'Um sem cebola. Também quero uma Coca-Cola de 2 litros.' });
    insertMessage({ conversationId: conv1, senderType: 'agent', userId: agentId, content: 'Perfeito. Será retirada ou entrega?' });
    insertMessage({ conversationId: conv1, senderType: 'customer', content: 'Certo, pode ser entrega.' });

    insertMessage({ conversationId: conv2, senderType: 'customer', content: 'Olá!' });
    insertMessage({ conversationId: conv2, senderType: 'ai', content: 'Olá! Sou a assistente virtual da Lanchonete Exemplo. Como posso ajudar?' });
    insertMessage({ conversationId: conv2, senderType: 'customer', content: 'Qual é o horário de funcionamento?' });

    insertMessage({ conversationId: conv3, senderType: 'customer', content: 'Tive um problema no meu último pedido.' });
    insertMessage({ conversationId: conv3, senderType: 'ai', content: 'Entendi. Para cuidar disso da melhor forma, vou encaminhar você para um atendente humano.' });
    insertMessage({ conversationId: conv3, senderType: 'customer', content: 'Quero falar com uma pessoa.' });

    const productInsert = db.prepare(`
      INSERT INTO products (category, name, description, price, active, stock, image_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, '', ?, ?)
    `);
    const xBurgerId = Number(productInsert.run('Lanches', 'X-Burguer', 'Pão, hambúrguer, queijo, alface, tomate e molho da casa.', 18.90, 50, createdAt, createdAt).lastInsertRowid);
    const xBaconId = Number(productInsert.run('Lanches', 'X-Bacon', 'Pão, hambúrguer, queijo, bacon, alface, tomate e molho da casa.', 23.90, 35, createdAt, createdAt).lastInsertRowid);
    productInsert.run('Porções', 'Batata frita média', 'Porção de batata frita crocante.', 16.00, 40, createdAt, createdAt);
    const cocaId = Number(productInsert.run('Bebidas', 'Coca-Cola 2L', 'Refrigerante Coca-Cola de 2 litros.', 14.00, 25, createdAt, createdAt).lastInsertRowid);
    productInsert.run('Combos', 'Combo Casal', '2 X-Burguers, 1 batata média e 1 Coca-Cola 2L.', 59.90, 20, createdAt, createdAt);

    const knowledgeInsert = db.prepare(`
      INSERT INTO knowledge (title, category, content, keywords, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `);
    knowledgeInsert.run('Nome da empresa', 'Empresa', 'Nosso nome é Lanchonete Exemplo.', 'nome,empresa,lanchonete', createdAt, createdAt);
    knowledgeInsert.run('Horário de funcionamento', 'Atendimento', 'Funcionamos de terça a domingo, das 18h às 23h. Às segundas-feiras não abrimos.', 'horário,horario,abre,aberto,funcionamento,dias', createdAt, createdAt);
    knowledgeInsert.run('Endereço', 'Empresa', 'Estamos na Avenida Principal, 500, Centro, Montes Claros - MG.', 'endereço,endereco,localização,localizacao,onde fica', createdAt, createdAt);
    knowledgeInsert.run('Formas de pagamento', 'Financeiro', 'Aceitamos Pix, dinheiro e cartões de débito ou crédito. Para dinheiro, informe se precisa de troco.', 'pagamento,pagar,pix,cartão,cartao,dinheiro,troco', createdAt, createdAt);
    knowledgeInsert.run('Entrega', 'Pedidos', 'O tempo médio de entrega é de 35 a 55 minutos. A taxa depende do bairro e deve ser confirmada antes de fechar o pedido.', 'entrega,tempo,taxa,demora,bairro', createdAt, createdAt);
    knowledgeInsert.run('Política da IA', 'Sistema', 'A assistente deve usar somente informações cadastradas. Quando não houver informação suficiente, deve transferir para um atendente humano.', 'ia,regra,transferir', createdAt, createdAt);

    const quickInsert = db.prepare("INSERT INTO quick_replies (shortcut, title, category, content, favorite, usage_count, allowed_roles_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, '[]', ?, ?)");
    quickInsert.run('/ola', 'Saudação', 'Atendimento', '👋 Olá, {Cliente}! Tudo bem? Como posso ajudar você hoje?', 1, createdAt, createdAt);
    quickInsert.run('/entrega', 'Prazo de entrega', 'Pedidos', '🛵 Nosso prazo médio de entrega é de 35 a 55 minutos. Posso confirmar a taxa informando seu bairro.', 0, createdAt, createdAt);
    quickInsert.run('/pix', 'Pagamento por Pix', 'Pagamento', '💳 Aceitamos Pix. Após a confirmação do pedido, enviamos os dados para pagamento.', 0, createdAt, createdAt);

    const orderId = Number(db.prepare(`
      INSERT INTO orders (contact_id, conversation_id, status, subtotal, delivery_fee, total, address, payment_method, notes, created_at, updated_at)
      VALUES (?, ?, 'preparing', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(contact1, conv1, 51.80, 6.00, 57.80, 'Rua das Flores, 120, Centro', 'Pix', 'Um X-Burguer sem cebola.', createdAt, createdAt).lastInsertRowid);
    const orderItemInsert = db.prepare(`
      INSERT INTO order_items (order_id, product_id, name, quantity, unit_price, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    orderItemInsert.run(orderId, xBurgerId, 'X-Burguer', 2, 18.90, '1 unidade sem cebola');
    orderItemInsert.run(orderId, cocaId, 'Coca-Cola 2L', 1, 14.00, '');

    db.prepare(`
      INSERT INTO whatsapp_instances (name, provider, status, phone, config_json, created_at, updated_at)
      VALUES (?, 'evolution', 'disconnected', '', ?, ?, ?)
    `).run('WhatsApp principal', JSON.stringify({
      baseUrl: 'http://localhost:8080', apiKey: 'atenderbem-local-test-key',
      instanceName: 'atenderbem', publicBaseUrl: 'http://host.docker.internal:3000',
      webhookSecret: 'atenderbem-webhook-local'
    }), createdAt, createdAt);

    const settingInsert = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)');
    settingInsert.run('company_name', 'Lanchonete Exemplo', createdAt);
    settingInsert.run('primary_color', '#1458EA', createdAt);
    settingInsert.run('ai_name', 'Lia', createdAt);
    settingInsert.run('ai_fallback', 'Não encontrei essa informação no sistema. Vou encaminhar você para um atendente humano.', createdAt);
    settingInsert.run('whatsapp_mode', 'mock', createdAt);
    settingInsert.run('welcome_enabled', 'true', createdAt);
    settingInsert.run('first_contact_message', 'Olá, tudo bem? 🤝 Seja muito bem-vinda(o) à {empresa}!\n\n🏁 As mensagens serão respondidas conforme a ordem de chegada;\n📵 Não recebemos ligações pelo WhatsApp;\n✍️ Para agilizar, prefira mensagens de texto;\n⏱️ Atendimentos conforme o horário informado pela empresa.', createdAt);
    settingInsert.run('returning_welcome_enabled', 'true', createdAt);
    settingInsert.run('returning_welcome_message', '👋 {saudacao}, {nome}! Que bom ter você de volta. 💚', createdAt);
    settingInsert.run('greeting_enabled', 'true', createdAt);
    settingInsert.run('greeting_message', '😊 {saudacao}, {nome}! Como podemos ajudar?', createdAt);
    settingInsert.run('greeting_cooldown_hours', '12', createdAt);
    settingInsert.run('welcome_menu_enabled', 'true', createdAt);
    settingInsert.run('welcome_menu_title', 'Para maior agilidade no seu atendimento, digite a numeração desejada: ☺️', createdAt);
    settingInsert.run('welcome_menu_options', JSON.stringify([
      { number: '1', label: 'Fazer um pedido', action: 'order' },
      { number: '2', label: 'Ver o cardápio', action: 'catalog' },
      { number: '3', label: 'Acompanhar um pedido', action: 'order_status' },
      { number: '4', label: 'Falar com um atendente', action: 'human' },
      { number: '5', label: 'Endereço e horário', action: 'hours_address' }
    ]), createdAt);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity, entity_id, details, created_at)
      VALUES (?, 'seed', 'database', NULL, ?, ?)
    `).run(adminId, JSON.stringify({ version: '2.0.0' }), createdAt);

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}


function normalizeCatalogProductName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/,/g, '.')
    .replace(/(\d+(?:\.\d+)?)\s*(ml|l|g|kg)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureJhowMenu2026(stamp) {
  const importedVersion = db.prepare("SELECT value FROM settings WHERE key='jhow_menu_2026_import_version'").get()?.value || '';
  if (importedVersion === '4') return;

  const existingRows = db.prepare('SELECT id,name,category FROM products ORDER BY id').all();
  const byName = new Map();
  const duplicateIds = [];
  for (const row of existingRows) {
    const key = normalizeCatalogProductName(row.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, row);
    else duplicateIds.push(Number(row.id));
  }

  const insert = db.prepare(`
    INSERT INTO products
      (category,name,description,aliases,price,active,stock,image_url,created_at,updated_at)
    VALUES (?,?,?,?,?,1,NULL,'',?,?)
  `);
  const update = db.prepare(`
    UPDATE products SET
      category=?,name=?,description=?,aliases=?,price=?,active=1,updated_at=?
    WHERE id=?
  `);

  let inserted = 0;
  let updated = 0;
  for (const item of JHOW_MENU_2026) {
    const key = normalizeCatalogProductName(item.name);
    const existing = byName.get(key);
    if (existing) {
      update.run(item.category, item.name, item.description || '', item.aliases || '', Number(item.price || 0), stamp, existing.id);
      updated += 1;
      continue;
    }
    const result = insert.run(item.category, item.name, item.description || '', item.aliases || '', Number(item.price || 0), stamp, stamp);
    const id = Number(result.lastInsertRowid || 0);
    if (id) byName.set(key, { id, name: item.name, category: item.category });
    inserted += 1;
  }

  if (duplicateIds.length) {
    const disableDuplicate = db.prepare('UPDATE products SET active=0,updated_at=? WHERE id=?');
    for (const id of duplicateIds) disableDuplicate.run(stamp, id);
  }

  db.prepare(`
    INSERT INTO settings(key,value,updated_at) VALUES('jhow_menu_2026_import_version','4',?)
    ON CONFLICT(key) DO UPDATE SET value='4',updated_at=excluded.updated_at
  `).run(stamp);
  console.info(`[Cardápio] Novo cardápio Jhow Burguer importado: ${inserted} produto(s) novo(s), ${updated} atualizado(s) e ${duplicateIds.length} duplicado(s) desativado(s).`);
}

function ensureV2Data() {
  const stamp = nowIso();
  const kitchen = db.prepare('SELECT id FROM users WHERE lower(email)=?').get('cozinha@teste.local');
  if (!kitchen) {
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role, sector, status, created_at)
      VALUES (?, ?, ?, 'kitchen', 'Cozinha', 'online', ?)
    `).run('Tela da Cozinha', 'cozinha@teste.local', bcrypt.hashSync('123456', 10), stamp);
  }

  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO NOTHING
  `);
  upsert.run('public_base_url', 'http://host.docker.internal:3000', stamp);
  db.prepare("UPDATE settings SET value='http://host.docker.internal:3000', updated_at=? WHERE key='public_base_url' AND value IN ('http://localhost:3000','http://127.0.0.1:3000')").run(stamp);
  upsert.run('notify_order_status', 'true', stamp);
  upsert.run('kitchen_sound', 'true', stamp);
  upsert.run('emoji_set', '😀,😂,😍,👍,🙏,🎉,❤️,✅,🚚,🍔,🍟,🥤', stamp);
  upsert.run('delivery_fee', '6.00', stamp);
  upsert.run('store_pickup_address', 'Avenida Principal, 500, Centro, Montes Claros - MG', stamp);
  upsert.run('welcome_enabled', 'true', stamp);
  upsert.run('first_contact_message', 'Olá, tudo bem? 🤝 Seja muito bem-vinda(o) à {empresa}!\n\n🏁 As mensagens serão respondidas conforme a ordem de chegada;\n📵 Não recebemos ligações pelo WhatsApp;\n✍️ Para agilizar, prefira mensagens de texto;\n⏱️ Atendimentos conforme o horário informado pela empresa.', stamp);
  upsert.run('returning_welcome_enabled', 'true', stamp);
  upsert.run('returning_welcome_message', '👋 {saudacao}, {nome}! Que bom ter você de volta. 💚', stamp);
  upsert.run('greeting_enabled', 'true', stamp);
  upsert.run('greeting_message', '😊 {saudacao}, {nome}! Como podemos ajudar?', stamp);
  upsert.run('greeting_cooldown_hours', '12', stamp);
  upsert.run('welcome_menu_enabled', 'true', stamp);
  upsert.run('welcome_menu_title', 'Para maior agilidade no seu atendimento, digite a numeração desejada: ☺️', stamp);
  upsert.run('welcome_menu_options', JSON.stringify([
    { number: '1', label: 'Fazer um pedido', action: 'order' },
    { number: '2', label: 'Ver o cardápio', action: 'catalog' },
    { number: '3', label: 'Acompanhar um pedido', action: 'order_status' },
    { number: '4', label: 'Falar com um atendente', action: 'human' },
    { number: '5', label: 'Endereço e horário', action: 'hours_address' }
  ]), stamp);

  const primaryInstance = db.prepare('SELECT * FROM whatsapp_instances ORDER BY id LIMIT 1').get();
  if (primaryInstance) {
    if (primaryInstance.provider === 'mock') {
      db.prepare("UPDATE whatsapp_instances SET name='WhatsApp principal',provider='evolution',status='disconnected',phone='',config_json=?,updated_at=? WHERE id=?")
        .run(JSON.stringify({ baseUrl:'http://localhost:8080',apiKey:'atenderbem-local-test-key',instanceName:'atenderbem',publicBaseUrl:'http://host.docker.internal:3000',webhookSecret:'atenderbem-webhook-local' }),stamp,primaryInstance.id);
    } else if (/testes/i.test(primaryInstance.name || '')) {
      db.prepare("UPDATE whatsapp_instances SET name='WhatsApp principal',updated_at=? WHERE id=?").run(stamp,primaryInstance.id);
    }
  }

  const reasonInsert = db.prepare(`
    INSERT INTO closure_reasons (name, active, created_at, updated_at) VALUES (?, 1, ?, ?)
    ON CONFLICT(name) DO NOTHING
  `);
  for (const reason of ['Atendimento concluído', 'Pedido finalizado', 'Mesa liberada', 'Cliente não respondeu', 'Dúvida esclarecida', 'Atendimento duplicado', 'Outro']) {
    reasonInsert.run(reason, stamp, stamp);
  }

  // Padroniza a grafia da marca sem apagar produtos, pedidos ou históricos existentes.
  db.prepare("UPDATE products SET name=REPLACE(name,'X-Burger','X-Burguer'),description=REPLACE(description,'X-Burgers','X-Burguers') WHERE name LIKE '%X-Burger%' OR description LIKE '%X-Burgers%'").run();
  db.prepare("UPDATE order_items SET name=REPLACE(name,'X-Burger','X-Burguer') WHERE name LIKE '%X-Burger%'").run();

  const stickerInsert = db.prepare(`
    INSERT INTO stickers (name, source, active, created_at, updated_at)
    SELECT ?, ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM stickers WHERE name=?)
  `);
  stickerInsert.run('Obrigado', '/stickers/obrigado.png', stamp, stamp, 'Obrigado');
  stickerInsert.run('Pedido pronto', '/stickers/pedido-pronto.png', stamp, stamp, 'Pedido pronto');
  stickerInsert.run('Saiu para entrega', '/stickers/saiu-entrega.png', stamp, stamp, 'Saiu para entrega');


  upsert.run('agent_signature_enabled', 'true', stamp);
  upsert.run('ai_signature_enabled', 'false', stamp);
  upsert.run('closing_message_enabled', 'true', stamp);
  upsert.run('closing_message', '🍔💚 A {empresa} agradece o seu contato!\n\nSempre que precisar, estaremos por aqui para atender você.\n\nAcompanhe nossas novidades e promoções no Instagram {instagram}.\n\nSerá um prazer receber seu pedido novamente! 💚', stamp);
  upsert.run('table_closing_message', 'Obrigado pela visita, {Cliente}! A sua comanda foi encerrada. Volte sempre! 🍔💚', stamp);
  upsert.run('instagram', '@sualanchonete', stamp);
  upsert.run('default_live_filter', 'today', stamp);
  upsert.run('assignment_mode', 'random_online', stamp);
  upsert.run('allow_agents_view_all', 'false', stamp);
  upsert.run('internal_chat_enabled', 'true', stamp);

  const usersForPrefs = db.prepare("SELECT id FROM users WHERE active=1").all();
  const prefInsert = db.prepare('INSERT OR IGNORE INTO user_preferences (user_id, theme, compact_mode, sounds_enabled, desktop_notifications, density, updated_at) VALUES (?,\'light\',0,1,1,\'comfortable\',?)');
  for (const user of usersForPrefs) prefInsert.run(user.id, stamp);

  db.prepare("INSERT OR IGNORE INTO internal_channels (name, description, active, created_at) VALUES ('Equipe', 'Canal geral da equipe', 1, ?)").run(stamp);
  const funnel = db.prepare("SELECT id FROM crm_funnels WHERE name='Vendas'").get();
  let funnelId = funnel?.id;
  if (!funnelId) funnelId = Number(db.prepare("INSERT INTO crm_funnels (name, active, created_at) VALUES ('Vendas',1,?)").run(stamp).lastInsertRowid);
  const stageCount = db.prepare('SELECT COUNT(*) total FROM crm_stages WHERE funnel_id=?').get(funnelId).total;
  if (!stageCount) {
    const stageInsert = db.prepare('INSERT INTO crm_stages (funnel_id,name,position,color) VALUES (?,?,?,?)');
    stageInsert.run(funnelId,'Novo contato',1,'#1458EA');
    stageInsert.run(funnelId,'Em negociação',2,'#F59E0B');
    stageInsert.run(funnelId,'Pedido confirmado',3,'#06A77D');
    stageInsert.run(funnelId,'Concluído',4,'#7C4DFF');
  }
  const templateCount = db.prepare('SELECT COUNT(*) total FROM message_templates').get().total;
  if (!templateCount) {
    const tpl = db.prepare('INSERT INTO message_templates (name,category,language,body,media_type,media_url,variables_json,active,created_at,updated_at) VALUES (?,?,?,?,\'none\',\'\',?,1,?,?)');
    tpl.run('Boas-vindas','Atendimento','pt_BR','Olá, {Cliente}! Eu sou {Atendente}, da {Empresa}. Como posso ajudar?',JSON.stringify(['Cliente','Atendente','Empresa']),stamp,stamp);
    tpl.run('Pedido pronto','Pedidos','pt_BR','Olá, {Cliente}! Seu pedido #{Pedido} está pronto. Total: {Total}.',JSON.stringify(['Cliente','Pedido','Total']),stamp,stamp);
    tpl.run('Finalização','Atendimento','pt_BR','A {Empresa} agradece seu contato, {Cliente}! Sempre que precisar, estaremos por aqui.',JSON.stringify(['Empresa','Cliente']),stamp,stamp);
  }


  // Administradores e supervisores começam como supervisores puros; podem optar por receber atendimentos.
  db.prepare("UPDATE users SET receive_assignments=CASE WHEN role='agent' THEN 1 ELSE 0 END WHERE receive_assignments IS NULL OR (role IN ('admin','supervisor') AND receive_assignments=1 AND id=(SELECT MIN(id) FROM users WHERE role='admin'))").run();
  db.prepare("UPDATE users SET receive_assignments=0 WHERE role='kitchen'").run();
  const pauseInsert = db.prepare('INSERT OR IGNORE INTO pause_reasons (name,active,created_at,updated_at) VALUES (?,1,?,?)');
  for (const reason of ['Intervalo','Almoço','Reunião','Treinamento','Atividade interna']) pauseInsert.run(reason,stamp,stamp);
  upsert.run('business_hours_enabled','false',stamp);
  upsert.run('business_hours_json',JSON.stringify({mon:['08:00','22:00'],tue:['08:00','22:00'],wed:['08:00','22:00'],thu:['08:00','22:00'],fri:['08:00','23:00'],sat:['08:00','23:00'],sun:['10:00','22:00']}),stamp);
  upsert.run('after_hours_message','🌙 Olá, {Cliente}! No momento estamos fora do horário de atendimento. Assim que retornarmos, nossa equipe responderá você. 💚',stamp);
  upsert.run('agent_message_prefix','*{Atendente}:*\n',stamp);
  upsert.run('ai_message_prefix','',stamp);
  upsert.run('order_confirmed_message','✅ Pedido #{Pedido} confirmado!\n\n👨‍🍳 Já enviamos tudo para a cozinha.\n💰 Total: {Total}',stamp);
  upsert.run('order_preparing_message','👨‍🍳 Seu pedido #{Pedido} está em preparo!\n\nEstamos preparando tudo com carinho. 💚',stamp);
  upsert.run('order_ready_message','✅ Seu pedido #{Pedido} está pronto!\n\n{RetiradaEntrega}',stamp);
  upsert.run('order_pickup_ready_message','✅ Seu pedido #{Pedido} está pronto para retirada!\n\n{RetiradaEntrega}',stamp);
  upsert.run('order_out_delivery_message','🛵 Seu pedido #{Pedido} saiu para entrega!\n\n📍 Destino: {Endereco}\nJá já ele chega até você. 💚',stamp);
  upsert.run('order_delivered_message','🎉 Pedido #{Pedido} entregue!\n\nAgradecemos pela preferência. Bom apetite! 🍔💚',stamp);
  upsert.run('order_picked_up_message','✅ Pedido #{Pedido} retirado com sucesso!\n\nAgradecemos pela preferência. Bom apetite! 🍔💚',stamp);
  upsert.run('order_table_ready_message','🍽️ Seu pedido #{Pedido} está pronto para ser servido na {RetiradaEntrega}!',stamp);
  upsert.run('order_table_delivered_message','✅ Pedido #{Pedido} entregue na {RetiradaEntrega}. Bom apetite! 💚',stamp);
  upsert.run('satisfaction_enabled','false',stamp);
  upsert.run('satisfaction_message','⭐ Como foi seu atendimento? Responda com uma nota de 1 a 5.',stamp);
  upsert.run('emojis_enabled','true',stamp);
  upsert.run('default_conversation_filter','assigned',stamp);
  upsert.run('ai_auto_create_orders','false',stamp);
  upsert.run('automatic_backups_enabled','true',stamp);
  upsert.run('backup_retention_days','14',stamp);
  upsert.run('waiting_alert_minutes','2,5,10',stamp);
  upsert.run('bot_order_mode','whatsapp_ai',stamp);
  upsert.run('bot_order_whatsapp_ai_message','🍔 *FAZER PEDIDO*\n\nEnvie o nome do produto e a quantidade.\n\n*Exemplo:*\n1 X-Burguer\n2 Coca-Cola\n\nDigite *CARDÁPIO* para ver o cardápio.\nAo finalizar seu pedido digite *FINALIZAR*',stamp);
  upsert.run('bot_order_whatsapp_message','👤 *ATENDIMENTO HUMANO*\n\nVamos encaminhar sua conversa para um atendente. Continue enviando as informações por aqui enquanto aguarda.',stamp);
  upsert.run('bot_order_site_message','🛒 *PEDIDO PELO SITE*\n\nAcesse o link abaixo para escolher os produtos e finalizar seu pedido:\n\n{Link}',stamp);
  upsert.run('bot_order_hybrid_message','🍔 *COMO DESEJA FAZER O PEDIDO?*\n\n1. Fazer pelo WhatsApp\n2. Fazer pelo site\n\nResponda com *1* ou *2*.',stamp);
  upsert.run('bot_order_hybrid_human_message','🍔 *COMO DESEJA FAZER O PEDIDO?*\n\n1. Fazer pelo site\n2. Falar com um atendente pelo WhatsApp\n\nResponda com *1* ou *2*.',stamp);
  upsert.run('bot_order_link_hours','24',stamp);
  upsert.run('bot_order_trigger_phrases','quero fazer um pedido,fazer um pedido,quero pedir,iniciar pedido,novo pedido,quero comprar',stamp);
  upsert.run('bot_catalog_navigation_enabled','true',stamp);
  upsert.run('lunch_menu_enabled','true',stamp);
  upsert.run('lunch_menu_start','09:00',stamp);
  upsert.run('lunch_menu_end','14:00',stamp);
  upsert.run('lunch_offer_first_message','true',stamp);
  upsert.run('bot_catalog_items_per_page','8',stamp);
  upsert.run('bot_catalog_show_prices','true',stamp);
  upsert.run('website_orders_enabled','true',stamp);
  upsert.run('website_accept_outside_hours','false',stamp);
  upsert.run('website_public_url','',stamp);
  upsert.run('website_hero_title','Seu pedido, do seu jeito.',stamp);
  upsert.run('website_hero_text','Peça pelo site com rapidez e acompanhe cada etapa pelo WhatsApp.',stamp);
  upsert.run('website_subtitle','Cardápio digital',stamp);
  upsert.run('website_logo_url','/assets/jhow-burguer-logo.jpg',stamp);
  upsert.run('website_delivery_enabled','true',stamp);
  upsert.run('website_pickup_enabled','true',stamp);
  upsert.run('website_payment_pix','true',stamp);
  upsert.run('website_payment_card','true',stamp);
  upsert.run('website_payment_cash','true',stamp);
  upsert.run('website_checkout_notice','O pedido será enviado ao painel e ficará aguardando confirmação da equipe.',stamp);
  upsert.run('website_whatsapp_receipt_message','✅ Recebemos seu pedido #{Pedido} pelo site!\n\n{Itens}\n\n{RetiradaEntrega}\n💳 Pagamento: {Pagamento}\n💰 Total: {Total}\n\nSeu pedido está aguardando a confirmação da equipe.\n🔎 Acompanhe: {LinkAcompanhamento}',stamp);
  upsert.run('restaurant_tables_enabled','false',stamp);
  upsert.run('restaurant_table_session_hours','4',stamp);
  upsert.run('restaurant_table_allow_multiple_devices','true',stamp);
  upsert.run('restaurant_table_customer_edit_enabled','true',stamp);
  upsert.run('restaurant_table_customer_cancel_enabled','true',stamp);
  upsert.run('restaurant_table_edit_minutes','10',stamp);
  upsert.run('order_status_colors_enabled','true',stamp);
  upsert.run('order_status_color_confirmed','#2f6fed',stamp);
  upsert.run('order_status_color_preparing','#f59e0b',stamp);
  upsert.run('order_status_color_ready','#7c3aed',stamp);
  upsert.run('order_status_color_out_for_delivery','#1e40af',stamp);
  upsert.run('order_status_color_delivered','#16a34a',stamp);
  upsert.run('order_status_color_cancelled','#dc2626',stamp);
  upsert.run('fiscal_module_enabled','false',stamp);
  upsert.run('fiscal_environment','homologation',stamp);
  upsert.run('fiscal_provider','preparation',stamp);
  upsert.run('fiscal_auto_prepare','false',stamp);
  upsert.run('fiscal_legal_name','',stamp);
  upsert.run('fiscal_trade_name','',stamp);
  upsert.run('fiscal_cnpj','',stamp);
  upsert.run('fiscal_state_registration','',stamp);
  upsert.run('fiscal_crt','',stamp);
  upsert.run('fiscal_address','',stamp);
  upsert.run('fiscal_city','',stamp);
  upsert.run('fiscal_state','MG',stamp);
  upsert.run('fiscal_zip_code','',stamp);
  upsert.run('fiscal_default_table_document','unconfigured',stamp);
  upsert.run('fiscal_default_pickup_document','unconfigured',stamp);
  upsert.run('fiscal_default_delivery_document','unconfigured',stamp);
  upsert.run('fiscal_default_website_document','unconfigured',stamp);
  upsert.run('fiscal_accountant_notes','',stamp);

  // Restaura a opção de cardápio no menu de boas-vindas sem apagar
  // opções personalizadas já configuradas pelo usuário.
  try {
    const menuRow = db.prepare("SELECT value FROM settings WHERE key='welcome_menu_options'").get();
    const currentOptions = JSON.parse(menuRow?.value || '[]');
    if (Array.isArray(currentOptions) && !currentOptions.some((option) => option?.action === 'catalog')) {
      const normalized = currentOptions.filter(Boolean).map((option) => ({ ...option }));
      const orderIndex = normalized.findIndex((option) => option.action === 'order');
      normalized.splice(orderIndex >= 0 ? orderIndex + 1 : 1, 0, {
        number: '', label: 'Ver o cardápio', action: 'catalog'
      });
      const nextOptions = normalized.slice(0, 9).map((option, index) => ({ ...option, number: String(index + 1) }));
      db.prepare("UPDATE settings SET value=?,updated_at=? WHERE key='welcome_menu_options'")
        .run(JSON.stringify(nextOptions), stamp);
    }
  } catch { /* mantém a configuração atual se o JSON estiver inválido */ }

  // Converte os nomes usados nas versões 3.9.0–3.9.2 para os cinco modos
  // atuais. O modo antigo "WhatsApp" volta a significar pedido feito pela IA.
  db.prepare("UPDATE settings SET value='whatsapp_ai',updated_at=? WHERE key='bot_order_mode' AND value='whatsapp'").run(stamp);
  db.prepare("UPDATE settings SET value='hybrid_ai',updated_at=? WHERE key='bot_order_mode' AND value='hybrid'").run(stamp);

  // A logo enviada da Jhow Burguer passa a ser o padrão do site público.
  // URLs personalizadas já configuradas continuam intactas.
  db.prepare("UPDATE settings SET value='/assets/jhow-burguer-logo.jpg',updated_at=? WHERE key='website_logo_url' AND (value='' OR value='/assets/gm-logo.png')")
    .run(stamp);

  // Atualiza somente textos padrão antigos; personalizações do usuário são preservadas.
  db.prepare(`UPDATE settings SET value=?,updated_at=? WHERE key='first_contact_message' AND value IN (?,?,?)`).run(
    'Olá, tudo bem? 🤝 Seja muito bem-vinda(o) à {empresa}!\n\n🏁 As mensagens serão respondidas conforme a ordem de chegada;\n📵 Não recebemos ligações pelo WhatsApp;\n✍️ Para agilizar, prefira mensagens de texto;\n⏱️ Atendimentos conforme o horário informado pela empresa.', stamp,
    'Olá, tudo bem? 🤝 Seja muito bem-vinda(o) à {empresa}!\n\nPara maior agilidade no seu atendimento, digite a numeração desejada: ☺️\n\n🏁 As mensagens serão respondidas conforme a ordem de chegada;\n📵 Não recebemos ligações via WhatsApp;\n⏱️ Atendimentos conforme o horário informado pela empresa.',
    '👋 {saudacao}, {nome}! Seja muito bem-vindo à {empresa}.\n\nComo podemos ajudar você hoje? 😊',
    '👋 {saudacao}, {nome}! Seja muito bem-vindo à {empresa}.\n\nComo podemos ajudar hoje? 😊'
  );
  db.prepare("UPDATE settings SET value='Para maior agilidade no seu atendimento, digite a numeração desejada: ☺️',updated_at=? WHERE key='welcome_menu_title' AND value IN ('Escolha uma opção para continuar:','Digite a numeração desejada:')").run(stamp);
  db.prepare("UPDATE settings SET value='false',updated_at=? WHERE key='ai_signature_enabled' AND value='true'").run(stamp);
  db.prepare("UPDATE settings SET value='',updated_at=? WHERE key='ai_message_prefix' AND value LIKE '%Assistente virtual%'").run(stamp);

  // Remove os contatos e atendimentos fictícios das versões de demonstração.
  const demoContacts = db.prepare("SELECT id FROM contacts WHERE phone IN ('5538999990001','5538999990002','5538999990003') OR lower(email) IN ('mariana@example.com','carlos@example.com')").all();
  for (const row of demoContacts) {
    const orderIds = db.prepare('SELECT id FROM orders WHERE contact_id=?').all(row.id);
    for (const order of orderIds) db.prepare('DELETE FROM order_items WHERE order_id=?').run(order.id);
    db.prepare('DELETE FROM orders WHERE contact_id=?').run(row.id);
    db.prepare('DELETE FROM conversations WHERE contact_id=?').run(row.id);
    db.prepare('DELETE FROM contacts WHERE id=?').run(row.id);
  }
  db.prepare("DELETE FROM conversations WHERE protocol IN ('ATD-2026-0001','ATD-2026-0002','ATD-2026-0003')").run();

  // Atualiza somente as mensagens padrão antigas de início de pedido.
  // Mensagens personalizadas pelo estabelecimento permanecem intactas.
  db.prepare(`UPDATE settings SET value=?,updated_at=?
    WHERE key='bot_order_whatsapp_ai_message' AND value IN (?,?,?)`).run(
    '🍔 *FAZER PEDIDO*\n\nEnvie o nome do produto e a quantidade.\n\n*Exemplo:*\n1 X-Burguer\n2 Coca-Cola\n\nDigite *CARDÁPIO* para ver o cardápio.\nAo finalizar seu pedido digite *FINALIZAR*', stamp,
    '🍔 *FAZER PEDIDO PELO WHATSAPP*\n\nPerfeito! Envie o primeiro produto com a quantidade. Você pode adicionar outros itens em mensagens separadas.\n\nQuando terminar, responda *FINALIZAR.*',
    '🍔 *FAZER PEDIDO*\n\nPerfeito! Envie o primeiro produto com a quantidade. Você pode adicionar outros itens em mensagens separadas.\n\nQuando terminar, responda *FINALIZAR.*',
    '🍔 *FAZER PEDIDO*\n\nEnvie o nome do produto e a quantidade.\n\n*Exemplo:*\n1 X-Burguer\n2 Coca-Cola\n\n📋 Você também pode pedir o *CARDÁPIO*.'
  );

  ensureJhowMenu2026(stamp);

  upsert.run('version', '3.11.0', stamp);
  db.prepare("UPDATE settings SET value='3.11.0', updated_at=? WHERE key='version'").run(stamp);
}

function applyProductionBootstrap() {
  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') return;
  const completed = db.prepare("SELECT value FROM settings WHERE key='production_bootstrap_completed'").get()?.value === 'true';
  if (completed) return;

  const adminName = String(process.env.INITIAL_ADMIN_NAME || 'Administrador').trim().slice(0, 120) || 'Administrador';
  const adminEmail = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = String(process.env.INITIAL_ADMIN_PASSWORD || '');
  const companyName = String(process.env.INITIAL_COMPANY_NAME || 'Jhow Burguer').trim().slice(0, 160) || 'Jhow Burguer';
  if (!adminEmail.includes('@')) throw new Error('INITIAL_ADMIN_EMAIL inválido.');
  if (adminPassword.length < 12) throw new Error('INITIAL_ADMIN_PASSWORD deve ter pelo menos 12 caracteres.');

  const admin = db.prepare("SELECT id,email FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  if (!admin) throw new Error('Usuário administrador inicial não encontrado.');
  const conflictingUser = db.prepare('SELECT id FROM users WHERE lower(email)=? AND id<>?').get(adminEmail, admin.id);
  if (conflictingUser) throw new Error('INITIAL_ADMIN_EMAIL já está sendo usado por outro usuário.');

  const stamp = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET name=?,email=?,password_hash=?,active=1,status=? WHERE id=?')
      .run(adminName, adminEmail, bcrypt.hashSync(adminPassword, 12), 'offline', admin.id);

    const disabledPassword = bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10);
    db.prepare("UPDATE users SET active=0,status='offline',password_hash=? WHERE lower(email) IN ('ana@teste.local','cozinha@teste.local')")
      .run(disabledPassword);

    db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('company_name',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
      .run(companyName, stamp);
    db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('production_bootstrap_completed','true',?) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=excluded.updated_at")
      .run(stamp);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function resetDatabase() {
  db.close();
  if (DB_TYPE !== 'sqlite') {
    throw new Error('A exclusão completa do PostgreSQL foi bloqueada por segurança. Use o script reset-db com RESET_DATABASE_CONFIRM=SIM.');
  }
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${DB_PATH}${suffix}`;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }
}

initSchema();
migrateSchema();
seedDatabase();
ensureV2Data();
applyProductionBootstrap();

module.exports = {
  db,
  DB_PATH,
  DB_TYPE,
  nowIso,
  insertMessage,
  resetDatabase,
};
