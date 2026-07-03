const { db, nowIso } = require('../db');

function digitsOnly(value) {
  let digits = String(value || '').split('@')[0].replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits;
}

function canonicalPhone(value) {
  let digits = digitsOnly(value);
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

function preferredPhone(...values) {
  const phones = [...new Set(values.map(canonicalPhone).filter(Boolean))];
  return phones.sort((a,b) => {
    const aBrazilMobile = a.startsWith('55') && a.length === 13 && a[4] === '9' ? 1 : 0;
    const bBrazilMobile = b.startsWith('55') && b.length === 13 && b[4] === '9' ? 1 : 0;
    return bBrazilMobile - aBrazilMobile || b.length - a.length;
  })[0] || '';
}

function phoneKeys(value) {
  const exact = canonicalPhone(value);
  if (!exact) return [];
  const keys = new Set([exact]);
  if (exact.startsWith('55') && (exact.length === 12 || exact.length === 13)) {
    const local = exact.slice(2);
    keys.add(local);
    // Alguns provedores retornam celulares brasileiros com ou sem o nono dígito.
    // Mantemos ambos como aliases do mesmo contato sem reduzir a comparação a
    // poucos dígitos, o que poderia juntar pessoas diferentes.
    if (local.length === 10 && /^[6-9]/.test(local.slice(2, 3))) {
      keys.add(`55${local.slice(0, 2)}9${local.slice(2)}`);
      keys.add(`${local.slice(0, 2)}9${local.slice(2)}`);
    }
    if (local.length === 11 && local[2] === '9') {
      keys.add(`55${local.slice(0, 2)}${local.slice(3)}`);
      keys.add(`${local.slice(0, 2)}${local.slice(3)}`);
    }
  }
  return [...keys].filter((item) => item.length >= 10);
}

function isPlaceholderName(value) {
  const name = String(value || '').trim();
  return !name || /^(cliente|cliente whatsapp|whatsapp user|unknown|desconhecido|cliente \d{4})$/i.test(name);
}

function chooseName(current, incoming) {
  const existing = String(current || '').trim();
  const received = String(incoming || '').trim();
  if (!received || isPlaceholderName(received)) return existing || received;
  if (!existing || isPlaceholderName(existing)) return received;
  return existing;
}

function ensureAliasTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contact_phone_aliases (
      phone_key TEXT PRIMARY KEY,
      contact_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_contact_phone_alias_contact ON contact_phone_aliases(contact_id);
  `);
}

function registerAliases(contactId, phone) {
  ensureAliasTable();
  const insert = db.prepare('INSERT OR IGNORE INTO contact_phone_aliases(phone_key,contact_id,created_at) VALUES(?,?,?)');
  for (const key of phoneKeys(phone)) insert.run(key, Number(contactId), nowIso());
}

function findContactByPhone(value) {
  ensureAliasTable();
  const keys = phoneKeys(value);
  if (!keys.length) return null;
  for (const key of keys) {
    const aliased = db.prepare(`
      SELECT c.* FROM contact_phone_aliases a JOIN contacts c ON c.id=a.contact_id
      WHERE a.phone_key=? LIMIT 1
    `).get(key);
    if (aliased) {
      registerAliases(aliased.id, value);
      return aliased;
    }
  }
  for (const key of keys) {
    const direct = db.prepare('SELECT * FROM contacts WHERE phone=? LIMIT 1').get(key);
    if (direct) {
      registerAliases(direct.id, direct.phone);
      registerAliases(direct.id, value);
      return direct;
    }
  }
  return null;
}

function createOrUpdateContact({ phone, name = '', source = 'unknown' }) {
  const normalized = canonicalPhone(phone);
  if (normalized.length < 10) throw new Error('Telefone inválido.');
  let contact = findContactByPhone(normalized);
  const stamp = nowIso();
  if (!contact) {
    const safeName = String(name || '').trim() || `Cliente ${normalized.slice(-4)}`;
    const result = db.prepare(`
      INSERT INTO contacts(name,phone,tags,created_at,updated_at,last_seen_at)
      VALUES(?,?,'[]',?,?,?)
    `).run(safeName, normalized, stamp, stamp, stamp);
    contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(result.lastInsertRowid));
  } else {
    const nextName = source === 'website' && !isPlaceholderName(contact.name)
      ? contact.name
      : chooseName(contact.name, name);
    const nextPhone = preferredPhone(contact.phone, normalized) || contact.phone;
    db.prepare('UPDATE contacts SET name=?,phone=?,last_seen_at=?,updated_at=? WHERE id=?')
      .run(nextName || contact.name, nextPhone, stamp, stamp, contact.id);
    contact = db.prepare('SELECT * FROM contacts WHERE id=?').get(contact.id);
  }
  registerAliases(contact.id, normalized);
  return contact;
}

function activeConversationForContact(contactId) {
  return db.prepare(`
    SELECT * FROM conversations
    WHERE contact_id=? AND status!='closed'
    ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'waiting_human' THEN 1 ELSE 2 END,
             last_message_at DESC,id DESC LIMIT 1
  `).get(Number(contactId)) || null;
}

function ensureActiveConversation(contactId, createConversation) {
  const existing = activeConversationForContact(contactId);
  if (existing) return { conversation: existing, created: false };
  try {
    const created = createConversation();
    const conversationId = Number(created?.id || created?.lastInsertRowid || created);
    const conversation = conversationId
      ? db.prepare('SELECT * FROM conversations WHERE id=?').get(conversationId)
      : activeConversationForContact(contactId);
    if (!conversation) throw new Error('Não foi possível abrir o atendimento.');
    return { conversation, created: true };
  } catch (error) {
    // A restrição do banco impede duas origens (bot, site, mesa ou botão +)
    // de criarem atendimentos simultâneos para o mesmo contato. Quando isso
    // acontece, reaproveitamos o atendimento que venceu a corrida.
    if (/unique|idx_one_active_conversation_per_contact/i.test(String(error?.message || error))) {
      const winner = activeConversationForContact(contactId);
      if (winner) return { conversation: winner, created: false };
    }
    throw error;
  }
}

function closeDuplicateActiveConversations(contactId) {
  const rows = db.prepare(`
    SELECT * FROM conversations WHERE contact_id=? AND status!='closed'
    ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'waiting_human' THEN 1 ELSE 2 END,
             last_message_at DESC,id DESC
  `).all(Number(contactId));
  if (rows.length <= 1) return rows[0] || null;
  const keep = rows[0];
  const stamp = nowIso();
  for (const duplicate of rows.slice(1)) {
    db.prepare(`UPDATE orders SET conversation_id=? WHERE conversation_id=? AND status IN ('new','confirmed','preparing','ready','out_for_delivery')`)
      .run(keep.id, duplicate.id);
    db.prepare('UPDATE website_checkout_sessions SET conversation_id=? WHERE conversation_id=? AND consumed_at IS NULL')
      .run(keep.id, duplicate.id);
    db.prepare('UPDATE table_members SET conversation_id=? WHERE conversation_id=? AND active=1')
      .run(keep.id, duplicate.id);
    db.prepare("UPDATE order_change_requests SET conversation_id=? WHERE conversation_id=? AND status='pending'")
      .run(keep.id, duplicate.id);
    const sourceSession = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(duplicate.id);
    const keepSession = db.prepare('SELECT * FROM ai_order_sessions WHERE conversation_id=?').get(keep.id);
    if (sourceSession && !keepSession) {
      db.prepare('UPDATE ai_order_sessions SET conversation_id=? WHERE conversation_id=?').run(keep.id, duplicate.id);
    } else if (sourceSession) {
      db.prepare('DELETE FROM ai_order_sessions WHERE conversation_id=?').run(duplicate.id);
    }
    db.prepare(`
      UPDATE conversations SET status='closed',hidden=1,closed_at=COALESCE(closed_at,?),
        close_reason_text=CASE WHEN trim(COALESCE(close_reason_text,''))='' THEN 'Conversa duplicada consolidada automaticamente' ELSE close_reason_text END
      WHERE id=?
    `).run(stamp, duplicate.id);
  }
  return keep;
}

function mergeContactInto(targetId, sourceId) {
  if (Number(targetId) === Number(sourceId)) return;
  const target = db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(targetId));
  const source = db.prepare('SELECT * FROM contacts WHERE id=?').get(Number(sourceId));
  if (!target || !source) return;
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  db.exec('PRAGMA defer_foreign_keys = ON');
  for (const { name } of tables) {
    if (['contacts','contact_phone_aliases'].includes(name)) continue;
    const columns = db.prepare(`PRAGMA table_info(${JSON.stringify(name)})`).all();
    if (!columns.some((column) => column.name === 'contact_id')) continue;
    db.prepare(`UPDATE ${JSON.stringify(name)} SET contact_id=? WHERE contact_id=?`).run(target.id, source.id);
  }
  const bestName = chooseName(target.name, source.name) || target.name;
  const mergedTags = [...new Set([
    ...safeTags(target.tags),
    ...safeTags(source.tags),
  ])];
  const nextPhone = preferredPhone(target.phone, source.phone) || target.phone;
  db.prepare('DELETE FROM contact_phone_aliases WHERE contact_id=?').run(source.id);
  db.prepare('DELETE FROM contacts WHERE id=?').run(source.id);
  db.prepare('UPDATE contacts SET name=?,phone=?,tags=?,updated_at=?,last_seen_at=COALESCE(last_seen_at,?) WHERE id=?')
    .run(bestName, nextPhone, JSON.stringify(mergedTags), nowIso(), source.last_seen_at || target.last_seen_at || nowIso(), target.id);
  registerAliases(target.id, target.phone);
  registerAliases(target.id, source.phone);
  closeDuplicateActiveConversations(target.id);
}

function safeTags(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch { return []; }
}

function reconcileContacts() {
  ensureAliasTable();
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY id').all();
  const ownerByKey = new Map();
  for (const contact of contacts) {
    const current = db.prepare('SELECT * FROM contacts WHERE id=?').get(contact.id);
    if (!current) continue;
    let targetId = null;
    for (const key of phoneKeys(current.phone)) {
      if (ownerByKey.has(key)) { targetId = ownerByKey.get(key); break; }
    }
    if (targetId && Number(targetId) !== Number(current.id)) {
      mergeContactInto(targetId, current.id);
      continue;
    }
    registerAliases(current.id, current.phone);
    for (const key of phoneKeys(current.phone)) ownerByKey.set(key, current.id);
    closeDuplicateActiveConversations(current.id);
  }
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_conversation_per_contact ON conversations(contact_id) WHERE status!='closed'");
  } catch {
    for (const contact of db.prepare('SELECT id FROM contacts').all()) closeDuplicateActiveConversations(contact.id);
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_conversation_per_contact ON conversations(contact_id) WHERE status!='closed'");
  }
}

module.exports = {
  canonicalPhone,
  preferredPhone,
  phoneKeys,
  isPlaceholderName,
  chooseName,
  registerAliases,
  findContactByPhone,
  createOrUpdateContact,
  activeConversationForContact,
  ensureActiveConversation,
  closeDuplicateActiveConversations,
  reconcileContacts,
};
