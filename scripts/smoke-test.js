const assert = require('node:assert/strict');
const { db, DB_PATH } = require('../src/db');
const { generateGroundedReply, parseOrderItems } = require('../src/services/ai');

(async () => {

const users = db.prepare('SELECT COUNT(*) total FROM users').get().total;
const conversations = db.prepare('SELECT COUNT(*) total FROM conversations').get().total;
const demoConversations = db.prepare("SELECT COUNT(*) total FROM conversations c JOIN contacts ct ON ct.id=c.contact_id WHERE c.protocol IN ('ATD-2026-0001','ATD-2026-0002','ATD-2026-0003') OR ct.phone IN ('5538999990001','5538999990002','5538999990003')").get().total;
const products = db.prepare('SELECT COUNT(*) total FROM products').get().total;
const closureReasons = db.prepare('SELECT COUNT(*) total FROM closure_reasons WHERE active=1').get().total;
const stickers = db.prepare('SELECT COUNT(*) total FROM stickers WHERE active=1').get().total;
const version = db.prepare("SELECT value FROM settings WHERE key='version'").get()?.value;
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
const conversationColumns = db.prepare('PRAGMA table_info(conversations)').all().map((column) => column.name);
const messageColumns = db.prepare('PRAGMA table_info(messages)').all().map((column) => column.name);
const contactColumns = db.prepare('PRAGMA table_info(contacts)').all().map((column) => column.name);
const orderColumns = db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name);
const productColumns = db.prepare('PRAGMA table_info(products)').all().map((column) => column.name);
const templateColumns = db.prepare('PRAGMA table_info(message_templates)').all().map((column) => column.name);
const tableNames = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row)=>row.name));
const membershipColumns = db.prepare('PRAGMA table_info(queue_memberships)').all().map((column)=>column.name);
const quickReplyColumns = db.prepare('PRAGMA table_info(quick_replies)').all().map((column)=>column.name);
const aiOrderSessionColumns = db.prepare('PRAGMA table_info(ai_order_sessions)').all().map((column)=>column.name);
const answer = await generateGroundedReply('Qual é o horário de funcionamento?');

const autoCreateOrders = db.prepare("SELECT value FROM settings WHERE key='ai_auto_create_orders'").get()?.value;
const aiSignatureEnabled = db.prepare("SELECT value FROM settings WHERE key='ai_signature_enabled'").get()?.value;
const pickedUpMessage = db.prepare("SELECT value FROM settings WHERE key='order_picked_up_message'").get()?.value;
const pickupReadyMessage = db.prepare("SELECT value FROM settings WHERE key='order_pickup_ready_message'").get()?.value;


assert.ok(users >= 3, 'Usuários de teste não foram criados.');
assert.equal(demoConversations, 0, 'Contatos e conversas fictícias não foram removidos do pacote limpo.');
assert.ok(products >= 5, 'Cardápio de demonstração não foi criado.');
assert.ok(closureReasons >= 6, 'Motivos de encerramento não foram criados.');
assert.ok(stickers >= 3, 'Figurinhas rápidas não foram criadas.');
assert.equal(version, '3.11.0', 'A versão do banco não foi atualizada.');
assert.ok(userColumns.includes('active'), 'Migração de usuários não aplicada.');
assert.ok(conversationColumns.includes('close_reason_id'), 'Migração de encerramento não aplicada.');
assert.ok(conversationColumns.includes('origin'), 'Origem do atendimento não foi migrada.');
assert.ok(conversationColumns.includes('closed_by_user_id'), 'Registro de responsável pelo encerramento não aplicado.');
assert.ok(messageColumns.includes('mime_type') && messageColumns.includes('file_name'), 'Migração de mídias não aplicada.');
assert.ok(messageColumns.includes('delivered_at') && messageColumns.includes('read_at'), 'Migração de recibos de leitura não aplicada.');
assert.ok(contactColumns.includes('last_auto_greeting_at'), 'Migração de saudação automática não aplicada.');
assert.ok(['source','tracking_token','whatsapp_opt_in','whatsapp_receipt_status','whatsapp_notified_at','whatsapp_error','table_id','table_tab_id','table_member_id'].every((column)=>orderColumns.includes(column)), 'Migração do site público e das mesas não aplicada.');
assert.ok(['needs_change','change_for'].every((column)=>orderColumns.includes(column)), 'Campos de troco não foram criados nos pedidos.');
assert.ok(['needs_change','change_for','resume_stage'].every((column)=>aiOrderSessionColumns.includes(column)), 'Campos de troco e retomada após cancelamento não foram criados na sessão da IA.');
assert.ok(['fiscal_ncm','fiscal_cest','fiscal_cfop','fiscal_cst_csosn','fiscal_origin','fiscal_unit','fiscal_ibs_cbs','fiscal_notes'].every((column)=>productColumns.includes(column)), 'Campos fiscais dos produtos não foram criados.');
assert.ok(userColumns.includes('receive_assignments') && userColumns.includes('pause_reason'), 'Distribuição e pausas não foram migradas.');
assert.ok(conversationColumns.includes('first_response_at') && conversationColumns.includes('satisfaction_score'), 'Indicadores e satisfação não foram migrados.');
assert.ok(messageColumns.includes('pinned') && messageColumns.includes('failed_reason'), 'Recursos avançados de mensagens não foram migrados.');
assert.ok(templateColumns.includes('template_type') && templateColumns.includes('official_status'), 'Templates internos/oficiais não foram migrados.');
assert.ok(membershipColumns.includes('joined'), 'Entrada e saída individual de filas não foi migrada.');
assert.ok(['category','favorite','usage_count','allowed_roles_json','active','updated_at'].every((column)=>quickReplyColumns.includes(column)), 'Respostas rápidas avançadas não foram migradas.');
for (const table of ['website_checkout_sessions','user_preferences','queue_memberships','message_templates','internal_channels','internal_messages','crm_funnels','crm_stages','crm_opportunities','tickets','tasks','pause_reasons','satisfaction_responses','message_reactions','notification_reads','campaigns','automations','user_sessions','conversation_wait_alerts','order_change_requests','bot_catalog_sessions','lunch_order_sessions','restaurant_tables','table_tabs','table_members','table_service_requests','table_payments','fiscal_documents']) {
  assert.ok(tableNames.has(table), `Tabela ${table} não foi criada.`);
}
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversation_transfers'").get(), 'Histórico de transferências não foi criado.');
assert.ok(db.prepare("SELECT value FROM settings WHERE key='welcome_menu_options'").get(), 'Menu inicial não foi configurado.');
assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='ai_order_sessions'").get(), 'Sessões do pedido da IA não foram criadas.');
assert.ok(Number(db.prepare("SELECT value FROM settings WHERE key='delivery_fee'").get()?.value) >= 0, 'Taxa de entrega não foi configurada.');
assert.equal(autoCreateOrders, 'false', 'A IA não deve enviar pedidos direto para a cozinha por padrão.');
assert.equal(aiSignatureEnabled, 'false', 'A assinatura da IA deve vir desativada por padrão.');
assert.match(String(pickedUpMessage || ''), /retirad/i, 'A mensagem de pedido retirado não foi configurada.');
assert.match(String(pickupReadyMessage || ''), /pronto para retirada/i, 'A mensagem de pedido pronto para retirada não foi configurada.');
for (const key of ['bot_catalog_navigation_enabled','bot_catalog_items_per_page','bot_catalog_show_prices','website_hero_title','website_logo_url','website_delivery_enabled','website_pickup_enabled','website_payment_pix','website_payment_card','website_payment_cash','restaurant_tables_enabled','restaurant_table_session_hours','restaurant_table_customer_edit_enabled','restaurant_table_customer_cancel_enabled','restaurant_table_edit_minutes','order_status_colors_enabled','order_status_color_confirmed','order_table_ready_message']) assert.ok(db.prepare('SELECT value FROM settings WHERE key=?').get(key), `Configuração ${key} do site não foi criada.`);
for (const key of ['fiscal_module_enabled','fiscal_environment','fiscal_provider','fiscal_default_table_document','fiscal_default_delivery_document']) assert.ok(db.prepare('SELECT value FROM settings WHERE key=?').get(key), `Configuração fiscal ${key} não foi criada.`);
assert.match(answer.text, /terça a domingo/i, 'A IA não consultou o conhecimento cadastrado.');
assert.equal(answer.transfer, false, 'A resposta conhecida não deveria transferir o atendimento.');
assert.equal(parseOrderItems('1 Coca-Cola 600 ml')[0]?.name, 'Coca-Cola 600 ml', 'O tamanho exato de 600 ml deve ser reconhecido sem virar 2L.');
assert.equal(parseOrderItems('1 Coca-Cola 2L')[0]?.name, 'Coca-Cola 2L', 'O produto exato deve continuar sendo reconhecido.');

console.log('Teste concluído com sucesso.');
console.log(`Banco: ${DB_PATH}`);
console.log(`Versão: ${version}`);
console.log(`Usuários: ${users} | Conversas: ${conversations} | Produtos: ${products}`);
console.log(`Motivos: ${closureReasons} | Figurinhas: ${stickers}`);
db.close();
})().catch((error) => {
  console.error(error);
  try { db.close(); } catch {}
  process.exitCode = 1;
});
