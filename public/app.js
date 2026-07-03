(() => {
  'use strict';

  const state = {
    token: localStorage.getItem('atenderbem_token') || '',
    user: null,
    branding: { companyName: 'G&M Automação', assistantName: 'Assistente virtual', instagram: '', tablesEnabled: true, fiscalEnabled: true },
    page: 'dashboard',
    conversationStatus: 'all',
    conversationSearch: '',
    conversationQueue: 'all',
    conversationSort: 'recent',
    queues: [],
    transferOptions: null,
    selectedConversationId: null,
    conversations: [],
    quickReplies: [],
    stickers: [],
    closureReasons: [],
    mediaRecorder: null,
    audioChunks: [],
    audioPreviewBlob: null,
    audioPreviewUrl: '',
    audioStream: null,
    audioCancelled: false,
    audioContext: null,
    notificationAudio: null,
    globalEventsBound: false,
    notificationPanelRequest: 0,
    socket: null,
    templates: [],
    selectedMessageIds: new Set(),
    replyToMessage: null,
    lastComposerBeforeAi: '',
    currentConversation: null,
    liveFilter: 'today',
    internalChannelId: null,
    internalTargetUserId: null,
    internalMode: 'channel',
    tooltipTimer: null,
    orderFilters: { period: 'today', status: '', from: '', to: '' },
    ordersFilters: { period: 'all', status: '', from: '', to: '' },
    historyFilters: { search: '', queueId: '', userId: '', reasonId: '', from: '', to: '', includeHidden: false },
    dashboardFilters: { period: 'realtime', from: '', to: '' },
    reportFilters: { period: '7days', from: '', to: '' },
    dashboardTimer: null,
    reportTimer: null,
    inventoryFilter: 'all',
    liveNotificationKeys: new Set(),
    uiObserver: null,
    currentSessionId: localStorage.getItem('gm_session_id') || '',
    sessionHeartbeatTimer: null,
    expandedTableGroups: new Set((() => { try { return JSON.parse(localStorage.getItem('gm_expanded_table_groups') || '[]'); } catch { return []; } })()),
    settingsSection: localStorage.getItem('gm_settings_section') || 'menu',
    conversationLoadSequence: 0,
    settingsScrollTop: 0,
    businessHoursStatus: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const icons = {
    dashboard: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
    chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    order: '<path d="M6 2h12l2 5-2 15H6L4 7zM4 7h16M9 11v6M15 11v6"/>',
    product: '<path d="M20.59 13.41 11 3.83V3H4v7h.83l9.58 9.59a2 2 0 0 0 2.82 0l3.36-3.36a2 2 0 0 0 0-2.82zM7.5 7.5h.01"/>',
    brain: '<path d="M9.5 4A3.5 3.5 0 0 0 6 7.5c0 .3.04.6.11.88A3.5 3.5 0 0 0 5 15.1 3.5 3.5 0 0 0 9.5 20M14.5 4A3.5 3.5 0 0 1 18 7.5c0 .3-.04.6-.11.88A3.5 3.5 0 0 1 19 15.1a3.5 3.5 0 0 1-4.5 4.9M12 3v18M8 9h4M12 15h4"/>',
    settings: '<path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5zM19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.97 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1H3v-4h.08A1.7 1.7 0 0 0 4.6 8.97a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.03 4.2l.06.06A1.7 1.7 0 0 0 8.97 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08a1.7 1.7 0 0 0 1.03 1.52 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.88A1.7 1.7 0 0 0 20.92 10H21v4h-.08A1.7 1.7 0 0 0 19.4 15z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/>',
    refresh: '<path d="M21 12a9 9 0 0 1-15.2 6.5L3 16M3 12A9 9 0 0 1 18.2 5.5L21 8M3 16v5h5M21 8V3h-5"/>',
    check: '<path d="m20 6-11 11-5-5"/>',
    robot: '<rect x="4" y="7" width="16" height="13" rx="2"/><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.7 4 3 9 3s9-1.3 9-3V5M3 11v6c0 1.7 4 3 9 3s9-1.3 9-3v-6"/>',
    whatsapp: '<path d="M21 11.5a9 9 0 0 1-13.3 7.9L3 21l1.6-4.6A9 9 0 1 1 21 11.5z"/><path d="M8.5 7.5c.6 3 2.5 5 5.7 6.2l1.3-1.3 2 .9-.5 2.2c-4.8.7-9.6-3.3-10-8.2z"/>',
    kitchen: '<path d="M6 3v8M10 3v8M6 7h4M8 11v10M16 3c-2 3-2 7 1 9v9M18 3v9"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
    dollar: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>',
    truck: '<path d="M3 6h11v10H3zM14 10h4l3 3v3h-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4"/>',
    team: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>',
    sticker: '<path d="M4 3h11a5 5 0 0 1 5 5v6l-7 7H4zM13 21v-7h7M8 9h.01M14 9h.01M8 13s1.5 2 4 2"/>',
    transfer: '<path d="M7 7h11l-3-3M18 7l-3 3M17 17H6l3 3M6 17l3-3"/>',
    flag: '<path d="M5 21V4M5 5h11l-2 4 2 4H5"/>',
    queue: '<path d="M4 6h16M4 12h10M4 18h7"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8M12 16v5"/>',
    internal: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8 8 0 1 1 21 12z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    crm: '<path d="M4 4h16v16H4zM4 9h16M9 4v16"/>',
    ticket: '<path d="M4 5h16v4a2 2 0 0 0 0 4v6H4v-6a2 2 0 0 0 0-4z"/>',
    task: '<path d="M9 11l2 2 4-4M5 4h14v16H5z"/>',
    report: '<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>',
    template: '<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
    filter: '<path d="M4 5h16l-6 7v5l-4 2v-7z"/>',
    reply: '<path d="m9 17-5-5 5-5M4 12h9a6 6 0 0 1 6 6"/>',
    forward: '<path d="m15 7 5 5-5 5M20 12H11a6 6 0 0 0-6 6"/>',
    pin: '<path d="M12 17v5M5 3l14 14M8 4l8 8M6 10l-3 3 8 2 2-2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    fiscal: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  };

  function icon(name, size = 20) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.dashboard}</svg>`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }


  function renderWhatsAppText(value) {
    let html = esc(value);
    html = html.replace(/```([\s\S]+?)```/g, '<code class="message-code">$1</code>');
    html = html.replace(/`([^`\n]+)`/g, '<code class="message-code-inline">$1</code>');
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(^|[\s>])\*([^*\n]+)\*(?=$|[\s<.,!?;:])/g, '$1<strong>$2</strong>');
    html = html.replace(/(^|[\s>])_([^_\n]+)_(?=$|[\s<.,!?;:])/g, '$1<em>$2</em>');
    html = html.replace(/(^|[\s>])~([^~\n]+)~(?=$|[\s<.,!?;:])/g, '$1<del>$2</del>');
    return html.replace(/\n/g, '<br>');
  }

  function initials(name = '') {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || 'CL';
  }

  function renderAvatarTarget(target, user) {
    if (!target || !user) return;
    target.classList.remove('has-image');
    target.textContent = initials(user.name);
    const avatarUrl = String(user.avatar_url || '').trim();
    if (!avatarUrl) return;
    const image = document.createElement('img');
    image.src = avatarUrl;
    image.alt = user.name || 'Foto do perfil';
    image.addEventListener('load', () => target.classList.add('has-image'), { once: true });
    image.addEventListener('error', () => {
      target.classList.remove('has-image');
      target.textContent = initials(user.name);
    }, { once: true });
    target.replaceChildren(image);
  }

  function renderHeaderAvatar(user = state.user) {
    if (!user) return;
    renderAvatarTarget($('#user-initials'), user);
    renderAvatarTarget($('#user-menu-avatar'), user);
    if ($('#user-name')) $('#user-name').textContent = user.name || 'Usuário';
    if ($('#user-email')) $('#user-email').textContent = user.email || 'Acesso interno';
    if ($('#user-role')) $('#user-role').textContent = roleLabel(user.role);
    if ($('#user-menu-sector')) $('#user-menu-sector').textContent = user.sector || 'Atendimento';
    const statusLabel = $('#user-menu-status-label');
    if (statusLabel) { statusLabel.textContent = presenceStatusLabel(user.status, user.pause_reason); statusLabel.className = `status-${esc(user.status || 'offline')}`; }
    const statusDot = $('#user-menu-status-dot');
    if (statusDot) statusDot.className = `user-menu-status-dot status-${esc(user.status || 'offline')}`;
  }

  function timeAgo(date) {
    const diff = Date.now() - new Date(date).getTime();
    const min = Math.max(0, Math.floor(diff / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h`;
    return new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function dateTime(date) {
    return new Date(date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function openDuration(date) {
    const start = new Date(date).getTime();
    if (!Number.isFinite(start)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - start) / 60000));
    if (minutes < 1) return 'menos de 1 min';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours < 24) return rest ? `${hours}h ${rest}min` : `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  function money(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function roleLabel(role) {
    return ({ admin: 'Administrador', supervisor: 'Supervisor', agent: 'Atendente', kitchen: 'Cozinha' })[role] || role;
  }

  const statusLabels = {
    waiting: 'Aguardando', waiting_human: 'Aguardando humano', open: 'Em atendimento', closed: 'Finalizado',
    new: 'Novo', confirmed: 'Confirmado', preparing: 'Em preparo', ready: 'Pronto',
    out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', picked_up: 'Retirado', cancelled: 'Cancelado',
    connected: 'Conectado', disconnected: 'Desconectado', connecting: 'Conectando', waiting_qr: 'Aguardando QR Code',
  };

  function statusBadge(status) {
    return `<span class="status-badge status-${esc(status)}">${esc(statusLabels[status] || status)}</span>`;
  }


  function orderFulfillmentLabel(order) {
    if (order?.fulfillment_method === 'table') return order.table_name || 'Mesa';
    if (order?.fulfillment_method === 'pickup') return 'Retirada na loja';
    return 'Entrega';
  }

  function orderPaymentLabel(order) {
    if (order?.fulfillment_method === 'table') return 'Acerto na comanda';
    return ({ pix: 'Pix', card: 'Cartão', cash: 'Dinheiro' })[String(order?.payment_method || '').toLowerCase()] || order?.payment_method || 'Não informado';
  }

  function orderSourceLabel(source) {
    return ({ website: 'Site', whatsapp: 'WhatsApp', panel: 'Painel', ai: 'IA', repeat: 'Pedido repetido' })[String(source || '').toLowerCase()] || source || 'Painel';
  }

  function orderFulfillmentBadge(order) {
    const type = order?.fulfillment_method === 'table' ? 'table' : order?.fulfillment_method === 'pickup' ? 'pickup' : 'delivery';
    return `<span class="fulfillment-badge fulfillment-${type}">${esc(orderFulfillmentLabel(order))}</span>`;
  }

  function auditActionLabel(entry) {
    const status = entry?.details?.status;
    if (entry.action === 'website_create' || entry.action === 'create') return 'Pedido criado';
    if (entry.action === 'status') return `Status alterado${status ? ` para ${statusLabels[status] || status}` : ''}`;
    if (entry.action === 'cancel') return 'Pedido cancelado';
    if (entry.action === 'edit') return 'Pedido editado';
    if (entry.action === 'repeat') return 'Pedido repetido';
    return String(entry.action || 'Atualização').replaceAll('_', ' ');
  }

  async function openOrderDetailsModal(orderId) {
    const order = await api(`/orders/${orderId}`);
    const modalityExtra = order.fulfillment_method === 'table'
      ? `<div class="order-detail-pair"><span>Mesa</span><strong>${esc(order.table_name || 'Não identificada')}</strong></div><div class="order-detail-pair"><span>Comanda</span><strong>${order.table_tab_id ? `#${String(order.table_tab_id).padStart(4,'0')}` : 'Não identificada'}</strong></div><div class="order-detail-pair"><span>Identificação na mesa</span><strong>${esc(order.table_member_name || order.contact_name || 'Não informada')}</strong></div>`
      : order.fulfillment_method === 'delivery'
        ? `<div class="order-detail-pair full"><span>Endereço de entrega</span><strong>${esc(order.address || 'Não informado')}</strong></div>`
        : '';
    const history = Array.isArray(order.history) ? order.history : [];
    const items = Array.isArray(order.items) ? order.items : [];
    openModal(`Detalhes do pedido #${String(order.id).padStart(4,'0')}`, `
      <div class="order-details-layout">
        <section class="order-detail-section">
          <div class="order-detail-heading"><h4>Pedido</h4>${statusBadge(order.status)}</div>
          <div class="order-detail-grid">
            <div class="order-detail-pair"><span>Número</span><strong>#${String(order.id).padStart(4,'0')}</strong></div>
            <div class="order-detail-pair"><span>Origem</span><strong>${esc(orderSourceLabel(order.source))}</strong></div>
            <div class="order-detail-pair"><span>Modalidade</span><strong>${esc(orderFulfillmentLabel(order))}</strong></div>
            <div class="order-detail-pair"><span>Pagamento</span><strong>${esc(orderPaymentLabel(order))}</strong></div>
            ${modalityExtra}
            <div class="order-detail-pair"><span>Criado em</span><strong>${dateTime(order.created_at)}</strong></div>
            <div class="order-detail-pair"><span>Atualizado em</span><strong>${dateTime(order.updated_at)}</strong></div>
            ${order.confirmed_at ? `<div class="order-detail-pair"><span>Confirmado em</span><strong>${dateTime(order.confirmed_at)}</strong></div>` : ''}
            ${order.edited_at ? `<div class="order-detail-pair"><span>Editado em</span><strong>${dateTime(order.edited_at)}${order.edited_by_user_name ? ` · ${esc(order.edited_by_user_name)}` : ''}</strong></div>` : ''}
            ${order.cancelled_at ? `<div class="order-detail-pair"><span>Cancelado em</span><strong>${dateTime(order.cancelled_at)}${order.cancelled_by_user_name ? ` · ${esc(order.cancelled_by_user_name)}` : ''}</strong></div>` : ''}
          </div>
        </section>
        <section class="order-detail-section">
          <h4>Cliente e atendimento</h4>
          <div class="order-detail-grid">
            <div class="order-detail-pair"><span>Cliente</span><strong>${esc(order.contact_name)}</strong></div>
            <div class="order-detail-pair"><span>WhatsApp</span><strong>+${esc(order.phone)}</strong></div>
            <div class="order-detail-pair"><span>Protocolo</span><strong>${esc(order.conversation_protocol || 'Não vinculado')}</strong></div>
            <div class="order-detail-pair"><span>Comprovante WhatsApp</span><strong>${esc(order.whatsapp_receipt_status || 'Não informado')}</strong></div>
            ${order.whatsapp_error ? `<div class="order-detail-pair full warning"><span>Erro do WhatsApp</span><strong>${esc(order.whatsapp_error)}</strong></div>` : ''}
          </div>
        </section>
        <section class="order-detail-section">
          <h4>Itens</h4>
          <div class="order-detail-items">${items.map((item) => `<div class="order-detail-item"><div><strong>${Number(item.quantity)}x ${esc(item.name)}</strong>${item.notes ? `<small>${esc(item.notes)}</small>` : ''}</div><div><small>${money(item.unit_price)} cada</small><strong>${money(Number(item.unit_price || 0) * Number(item.quantity || 0))}</strong></div></div>`).join('') || emptySmall('Nenhum item encontrado')}</div>
        </section>
        <section class="order-detail-section">
          <h4>Valores</h4>
          <div class="order-values-detail"><div><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div><div><span>Taxa de entrega</span><strong>${money(order.delivery_fee)}</strong></div><div class="total"><span>Total</span><strong>${money(order.total)}</strong></div></div>
        </section>
        ${(order.notes || order.cancel_reason) ? `<section class="order-detail-section"><h4>Observações</h4>${order.notes ? `<div class="order-note-box"><span>Do pedido</span><p>${esc(order.notes)}</p></div>` : ''}${order.cancel_reason ? `<div class="order-note-box danger"><span>Motivo do cancelamento</span><p>${esc(order.cancel_reason)}</p></div>` : ''}</section>` : ''}
        ${history.length ? `<section class="order-detail-section"><h4>Histórico</h4><div class="order-history-list">${history.map((entry) => `<div><span class="history-dot"></span><p><strong>${esc(auditActionLabel(entry))}</strong><small>${dateTime(entry.created_at)}${entry.user_name ? ` · ${esc(entry.user_name)}` : ' · Sistema'}</small></p></div>`).join('')}</div></section>` : ''}
      </div>`, `<button class="btn btn-outline close-modal-action">Fechar</button>`, 'wide');
    $('.close-modal-action').addEventListener('click', closeModal);
  }

  function orderStatusClass(status) {
    const value = String(status || '').toLowerCase();
    if (!state.branding?.orderStatusColorsEnabled || !['confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled'].includes(value)) return '';
    return `order-status-${value}`;
  }

  function applyOrderStatusTheme() {
    const root = document.documentElement;
    const colors = state.branding?.orderStatusColors || {};
    root.classList.toggle('order-status-colors-enabled', state.branding?.orderStatusColorsEnabled !== false);
    for (const [key, value] of Object.entries(colors)) {
      if (value) root.style.setProperty(`--order-${key.replaceAll('_','-')}`, value);
    }
  }

  function presenceStatusLabel(status, pauseReason = '') {
    if (status === 'online') return 'Online';
    if (status === 'busy') return 'Ocupado';
    if (status === 'paused') return `Pausado${pauseReason ? ` · ${pauseReason}` : ''}`;
    return 'Offline';
  }

  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(`/api${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && path !== '/auth/login') logout({ notifyServer: false });
      const error = new Error(data.error || 'Não foi possível concluir a operação.');
      error.code = data.code || '';
      error.status = response.status;
      error.data = data;
      throw error;
    }
    return data;
  }

  function closeCustomSelects(except = null) {
    $$('.site-select.open').forEach((box) => {
      if (box !== except) {
        box.classList.remove('open');
        const list = $('.site-select-options', box);
        if (list) list.removeAttribute('style');
      }
    });
  }

  function positionCustomSelect(box) {
    const button = $('.site-select-button', box);
    const list = $('.site-select-options', box);
    if (!button || !list || !box.classList.contains('open')) return;
    const rect = button.getBoundingClientRect();
    const viewportPadding = 10;
    const maxHeight = Math.min(260, window.innerHeight - viewportPadding * 2);
    let top = rect.bottom + 6;
    const desiredHeight = Math.min(maxHeight, Math.max(90, list.scrollHeight || 180));
    if (top + desiredHeight > window.innerHeight - viewportPadding) top = Math.max(viewportPadding, rect.top - desiredHeight - 6);
    list.style.position = 'fixed';
    list.style.left = `${Math.max(viewportPadding, rect.left)}px`;
    list.style.top = `${top}px`;
    list.style.width = `${Math.max(rect.width, 170)}px`;
    list.style.maxHeight = `${maxHeight}px`;
    list.style.zIndex = '2200';
  }

  function enhanceSelects(root = document) {
    $$('select:not([data-native-select]):not([data-enhanced])', root).forEach((select) => {
      select.dataset.enhanced = 'true';
      const box = document.createElement('div');
      box.className = 'site-select';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-select-button';
      const list = document.createElement('div');
      list.className = 'site-select-options';
      const refresh = () => {
        const selected = select.options[select.selectedIndex];
        button.innerHTML = `<span>${esc(selected?.textContent || 'Selecione')}</span>${icon('chevronDown',14)}`;
        list.innerHTML = [...select.options].map((option) => `<button type="button" data-value="${esc(option.value)}" class="${option.selected?'selected':''}" ${option.disabled?'disabled':''}>${esc(option.textContent)}</button>`).join('');
        $$('button[data-value]', list).forEach((item) => item.addEventListener('click', (event) => {
          event.stopPropagation();
          select.value = item.dataset.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          refresh();
          box.classList.remove('open');
          list.removeAttribute('style');
        }));
      };
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        const opening = !box.classList.contains('open');
        closeCustomSelects(box);
        box.classList.toggle('open', opening);
        if (opening) requestAnimationFrame(() => positionCustomSelect(box));
        else list.removeAttribute('style');
      });
      select.addEventListener('change', refresh);
      select.parentNode.insertBefore(box, select);
      box.append(select, button, list);
      refresh();
    });
  }


  function observeDynamicUi() {
    if (state.uiObserver) return;
    state.uiObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          if (node.matches('select:not([data-native-select]):not([data-enhanced])')) enhanceSelects(node.parentElement || document);
          else if (node.querySelector('select:not([data-native-select]):not([data-enhanced])')) enhanceSelects(node);
          enhanceResponsiveUi(node);
          bindSmartTooltips(node);
        }
      }
    });
    state.uiObserver.observe(document.body, { childList: true, subtree: true });
    enhanceSelects(document);
  }

  function enhanceResponsiveTables(root = document) {
    $$('table.data-table:not([data-mobile-ready])', root).forEach((table) => {
      table.dataset.mobileReady = 'true';
      const headings = $$('thead th', table).map((cell) => cell.textContent.trim());
      $$('tbody tr', table).forEach((row) => {
        const cells = $$('td', row);
        if (cells.length === 1 && Number(cells[0].colSpan || 1) > 1) {
          row.classList.add('mobile-empty-row');
          return;
        }
        cells.forEach((cell, index) => {
          const label = headings[index] || '';
          if (label) cell.dataset.label = label;
        });
      });
    });
  }

  function enhanceResponsiveUi(root = document) {
    enhanceResponsiveTables(root);
    $$('.icon-button[data-tooltip]:not([aria-label])', root).forEach((button) => button.setAttribute('aria-label', button.dataset.tooltip));
    $$('button:not([type])', root).forEach((button) => button.type = 'button');
    $$('.table-scroll:not([data-mobile-scroll-ready])', root).forEach((wrap) => {
      wrap.dataset.mobileScrollReady = 'true';
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'Tabela com rolagem');
    });
    $$('input[type="number"]:not([inputmode])', root).forEach((input) => input.setAttribute('inputmode', 'decimal'));
    $$('input[type="time"],input[type="date"],input[type="datetime-local"]', root).forEach((input) => input.classList.add('mobile-native-control'));
  }

  function updateAppViewportMetrics() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const top = viewport?.offsetTop || 0;
    const keyboard = Math.max(0, window.innerHeight - height - top);
    document.documentElement.style.setProperty('--gm-app-height', `${Math.round(height)}px`);
    document.documentElement.style.setProperty('--gm-viewport-top', `${Math.round(top)}px`);
    document.documentElement.style.setProperty('--gm-keyboard-height', `${Math.round(keyboard)}px`);
    document.body.classList.toggle('mobile-keyboard-open', keyboard > 110);
  }

  function setupMobileExperience() {
    if (document.documentElement.dataset.mobileExperienceReady === 'true') return;
    document.documentElement.dataset.mobileExperienceReady = 'true';
    updateAppViewportMetrics();
    window.visualViewport?.addEventListener('resize', updateAppViewportMetrics, { passive: true });
    window.visualViewport?.addEventListener('scroll', updateAppViewportMetrics, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(updateAppViewportMetrics, 120), { passive: true });

    let swipeStart = null;
    document.addEventListener('pointerdown', (event) => {
      if (!window.matchMedia('(max-width: 700px)').matches) return;
      if (!document.body.classList.contains('mobile-chat-active')) return;
      if (event.clientX > 34 || event.target.closest('input,textarea,button,a,video,audio')) return;
      swipeStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }, { passive: true });
    document.addEventListener('pointerup', (event) => {
      if (!swipeStart || event.pointerId !== swipeStart.id) return;
      const dx = event.clientX - swipeStart.x;
      const dy = Math.abs(event.clientY - swipeStart.y);
      swipeStart = null;
      if (dx > 76 && dy < 70) {
        $('#chat-layout')?.classList.remove('chat-open');
        document.body.classList.remove('mobile-chat-active');
      }
    }, { passive: true });

    document.addEventListener('focusin', (event) => {
      if (!window.matchMedia('(max-width: 700px)').matches) return;
      const field = event.target.closest('input,textarea,select');
      if (!field || field.id === 'message-input') return;
      setTimeout(() => field.scrollIntoView({ block: 'center', behavior: 'smooth' }), 220);
    });

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
    enhanceResponsiveUi(document);
  }

  function ensureTooltipLayer() {
    let tooltip = $('#smart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'smart-tooltip';
      tooltip.className = 'smart-tooltip hidden';
      document.body.appendChild(tooltip);
    }
    return tooltip;
  }

  function showSmartTooltip(target) {
    const text = target?.dataset?.tooltip;
    if (!text || target.closest('.nav-button.has-label')) return;
    const tooltip = ensureTooltipLayer();
    const rect = target.getBoundingClientRect();
    tooltip.textContent = text;
    tooltip.classList.remove('hidden');
    tooltip.style.left = '0px';
    tooltip.style.top = '0px';
    const tipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left));
    let top = rect.bottom + 9;
    if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 9;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hideSmartTooltip() {
    const tooltip = $('#smart-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
  }

  function bindSmartTooltips(root = document) {
    $$('[data-tooltip]:not([data-tooltip-bound])', root).forEach((target) => {
      target.dataset.tooltipBound = 'true';
      target.addEventListener('mouseenter', () => showSmartTooltip(target));
      target.addEventListener('mouseleave', hideSmartTooltip);
      target.addEventListener('focus', () => showSmartTooltip(target));
      target.addEventListener('blur', hideSmartTooltip);
    });
  }

  function toast(title, message = '', type = 'success') {
    const root = $('#toast-root');
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.innerHTML = `<div>${type === 'success' ? icon('check', 17) : icon('close', 17)}</div><div><strong>${esc(title)}</strong>${message ? `<p>${esc(message)}</p>` : ''}</div>`;
    root.appendChild(item);
    setTimeout(() => item.remove(), 3800);
  }

  function loading() {
    return '<div class="loading"><span class="spinner"></span><p>Carregando informações...</p></div>';
  }

  const navItems = [
    { id: 'dashboard', label: 'Visão geral', icon: 'dashboard', showLabel: true },
    { id: 'chats', label: 'Atendimentos', icon: 'chat', badge: true, showLabel: true },
    { id: 'kitchen', label: 'Cozinha', icon: 'kitchen', kitchen: true, showLabel: true },
    { id: 'deliveries', label: 'Entregas', icon: 'truck', showLabel: true },
    { id: 'orders', label: 'Pedidos', icon: 'order', showLabel: true },
    { id: 'tables', label: 'Mesas', icon: 'order', showLabel: true },
    { id: 'presence', label: 'Filas', icon: 'queue', showLabel: false },
    { id: 'monitoring', label: 'Supervisão', icon: 'monitor', admin: true },
    { id: 'internal', label: 'Chat interno', icon: 'internal' },
    { id: 'contacts', label: 'Clientes', icon: 'users' },
    { id: 'products', label: 'Estoque', icon: 'product', admin: true },
    { id: 'tickets', label: 'Tickets', icon: 'ticket' },
    { id: 'tasks', label: 'Tarefas', icon: 'task' },
    { id: 'history', label: 'Histórico', icon: 'history' },
    { id: 'reports', label: 'Relatórios', icon: 'report', admin: true },
    { id: 'fiscal', label: 'Fiscal', icon: 'fiscal', admin: true },
    { id: 'settings', label: 'Configurações', icon: 'settings', admin: true },
  ];

  const pages = {
    dashboard:{title:'Visão geral'}, chats:{title:'Atendimentos'}, history:{title:'Histórico'}, orders:{title:'Pedidos'},
    deliveries:{title:'Entregas'}, kitchen:{title:'Cozinha'}, presence:{title:'Filas e presença'}, monitoring:{title:'Supervisão'}, internal:{title:'Chat interno'},
    contacts:{title:'Clientes'}, crm:{title:'CRM'}, tickets:{title:'Tickets'}, tasks:{title:'Tarefas'}, reports:{title:'Relatórios'},
    team:{title:'Equipe'}, products:{title:'Estoque e cardápio'}, knowledge:{title:'Base de conhecimento'}, settings:{title:'Configurações'},
    structure:{title:'Filas e pausas'}, campaigns:{title:'Campanhas'}, automations:{title:'Automações'}, audit:{title:'Auditoria'}, security:{title:'Segurança e backups'}, tables:{title:'Mesas e comandas'}, fiscal:{title:'Fiscal'},
  };

  function visibleNavItems() {
    const role = state.user?.role;
    const moduleVisible = (item) => {
      if (item.id === 'tables' && state.branding?.tablesEnabled === false) return false;
      if (item.id === 'fiscal' && state.branding?.fiscalEnabled === false) return false;
      return true;
    };
    return role === 'kitchen'
      ? [navItems.find((item)=>item.id==='kitchen'), navItems.find((item)=>item.id==='deliveries')].filter(Boolean).filter(moduleVisible)
      : navItems.filter((item)=>moduleVisible(item) && (!item.admin || ['admin','supervisor'].includes(role)) && (!item.kitchen || ['admin','supervisor'].includes(role)));
  }

  function mobilePrimaryNavItems(items) {
    const byId = (id) => items.find((item) => item.id === id);
    const preferred = state.user?.role === 'kitchen'
      ? ['kitchen', 'deliveries']
      : ['dashboard', 'chats', 'orders', 'kitchen'];
    const result = preferred.map(byId).filter(Boolean);
    if (result.length < 4) {
      for (const item of items) {
        if (result.some((entry) => entry.id === item.id)) continue;
        result.push(item);
        if (result.length >= 4) break;
      }
    }
    return result.slice(0, 4);
  }

  function closeMobileNavigation() {
    document.body.classList.remove('mobile-nav-open');
    $('.sidebar')?.classList.remove('open');
    $('#mobile-nav-backdrop')?.classList.add('hidden');
    $('#mobile-menu')?.setAttribute('aria-expanded', 'false');
  }

  function openMobileNavigation() {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    document.body.classList.add('mobile-nav-open');
    $('.sidebar')?.classList.add('open');
    $('#mobile-nav-backdrop')?.classList.remove('hidden');
    $('#mobile-menu')?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => $('#main-nav .nav-button.active')?.scrollIntoView({ block: 'center' }));
  }

  function renderMobileBottomNav(items, waitingCount = 0) {
    const root = $('#mobile-bottom-nav');
    if (!root) return;
    const primary = mobilePrimaryNavItems(items);
    root.innerHTML = `${primary.map((item) => `
      <button class="mobile-bottom-button ${state.page===item.id?'active':''}" type="button" data-mobile-page="${item.id}" aria-label="${esc(item.label)}">
        <span class="mobile-bottom-icon">${icon(item.icon,21)}${item.badge && waitingCount ? `<i>${Math.min(99, waitingCount)}</i>` : ''}</span>
        <span>${esc(item.label)}</span>
      </button>`).join('')}
      <button class="mobile-bottom-button mobile-more-button" type="button" data-mobile-more aria-label="Abrir todos os módulos">
        <span class="mobile-bottom-icon">${icon('more',21)}</span><span>Mais</span>
      </button>`;
    $$('[data-mobile-page]', root).forEach((button) => button.addEventListener('click', () => navigate(button.dataset.mobilePage)));
    $('[data-mobile-more]', root)?.addEventListener('click', openMobileNavigation);
  }

  function renderNav(waitingCount = 0) {
    const visibleItems = visibleNavItems();
    $('#main-nav').innerHTML = `<div class="mobile-drawer-head"><span class="brand-mark"><img src="/assets/gm-logo.png" alt=""></span><div><strong>G&amp;M Automação</strong><small>Escolha um módulo</small></div><button type="button" id="close-mobile-nav" class="icon-button" aria-label="Fechar menu">${icon('close',18)}</button></div><div class="mobile-drawer-label">MÓDULOS</div>` + visibleItems.map((item)=>`
      <button class="nav-button ${item.showLabel?'has-label':''} ${state.page===item.id?'active':''}" data-page="${item.id}" aria-label="${esc(item.label)}" data-tooltip="${esc(item.label)}">
        ${icon(item.icon,19)}<span class="nav-label">${esc(item.label)}</span>${item.badge && waitingCount ? `<span class="nav-badge">${waitingCount}</span>`:''}
      </button>`).join('');
    $$('.nav-button[data-page]').forEach((btn)=>btn.addEventListener('click',()=>{
      if(btn.dataset.page==='settings'&&state.page!=='settings'){state.settingsSection='menu';localStorage.setItem('gm_settings_section','menu');}
      closeMobileNavigation();
      navigate(btn.dataset.page);
    }));
    $('#close-mobile-nav')?.addEventListener('click', closeMobileNavigation);
    renderMobileBottomNav(visibleItems, waitingCount);
    requestAnimationFrame(()=>$('#main-nav .nav-button.active')?.scrollIntoView({inline:'nearest',block:'nearest'}));
    bindSmartTooltips($('#main-nav'));
  }

  function setTopbar() {
    const info=pages[state.page]||pages.dashboard;
    document.title=`${info.title} · G&M Automação`;
    if ($('#page-title')) $('#page-title').textContent=info.title;
    document.body.dataset.page = state.page;
  }

  async function navigate(page) {
    if (state.dashboardTimer) { clearInterval(state.dashboardTimer); state.dashboardTimer = null; }
    if (state.reportTimer) { clearInterval(state.reportTimer); state.reportTimer = null; }
    state.page = page;
    document.body.classList.remove('mobile-chat-active');
    closeMobileNavigation();
    setTopbar();
    renderNav(await getWaitingCount());
    $('.sidebar').classList.remove('open');
    const content = $('#page-content');
    content.className = `page-content page-${page}`;
    content.scrollTop = 0;
    content.innerHTML = loading();
    try {
      if (page === 'dashboard') await renderDashboard();
      if (page === 'chats') await renderChats();
      if (page === 'history') await renderHistory();
      if (page === 'orders') await renderOrders();
      if (page === 'deliveries') await renderDeliveries();
      if (page === 'kitchen') await renderKitchen();
      if (page === 'contacts') await renderContacts();
      if (page === 'team') await renderTeam();
      if (page === 'products') await renderProducts();
      if (page === 'knowledge') await renderKnowledge();
      if (page === 'settings') await renderSettings();
      if (page === 'presence') await renderPresenceBoard();
      if (page === 'monitoring') await renderMonitoring();
      if (page === 'internal') await renderInternalChat();
      if (page === 'crm') await renderCrm();
      if (page === 'tickets') await renderTickets();
      if (page === 'tasks') await renderTasks();
      if (page === 'reports') await renderReports();
      if (page === 'fiscal') await renderFiscal();
      if (page === 'structure') await renderStructure();
      if (page === 'campaigns') await renderCampaigns();
      if (page === 'automations') await renderAutomations();
      if (page === 'audit') await renderAudit();
      if (page === 'security') await renderSecurity();
      if (page === 'tables') await renderTables();
      enhanceSelects(content);
      enhanceResponsiveUi(content);
      bindSmartTooltips(content);
    } catch (error) {
      content.innerHTML = `<div class="empty-state">${icon('close', 36)}<h3>Não foi possível carregar</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  async function getWaitingCount() {
    try {
      const rows = await api('/conversations?status=waiting');
      return rows.length;
    } catch { return 0; }
  }

  function closeHeaderMenus(except = '') {
    const profileMenu = $('#user-menu-dropdown');
    const notificationPanel = $('#notification-panel');
    if (except !== 'profile' && profileMenu) profileMenu.classList.add('hidden');
    if (except !== 'notifications' && notificationPanel) {
      notificationPanel.classList.add('hidden');
      state.notificationPanelRequest += 1;
    }
    $('#user-menu-button')?.setAttribute('aria-expanded', except === 'profile' && profileMenu && !profileMenu.classList.contains('hidden') ? 'true' : 'false');
    $('#notifications-button')?.setAttribute('aria-expanded', except === 'notifications' && notificationPanel && !notificationPanel.classList.contains('hidden') ? 'true' : 'false');
  }

  function bindGlobal() {
    $('#mobile-menu').innerHTML=icon('menu');
    updateConnectionCard();
    bindSmartTooltips(document);
    observeDynamicUi();
    setupMobileExperience();
    if (state.globalEventsBound) return;
    state.globalEventsBound = true;

    $('#logout-button').addEventListener('click',logout);
    $('#mobile-menu').setAttribute('aria-expanded','false');
    $('#mobile-menu').addEventListener('click',(event)=>{ event.stopPropagation(); document.body.classList.contains('mobile-nav-open') ? closeMobileNavigation() : openMobileNavigation(); });
    $('#mobile-nav-backdrop')?.addEventListener('click', closeMobileNavigation);
    const userMenuButton = $('#user-menu-button');
    let lastProfilePointerToggle = 0;
    const toggleUserMenu = (event) => {
      event?.preventDefault();
      event?.stopPropagation();
      const menu = $('#user-menu-dropdown');
      if (!menu) return;
      const opening = menu.classList.contains('hidden');
      closeHeaderMenus(opening ? 'profile' : '');
      menu.classList.toggle('hidden', !opening);
      userMenuButton.setAttribute('aria-expanded', opening ? 'true' : 'false');
      if (opening) renderHeaderAvatar(state.user);
    };
    userMenuButton.addEventListener('pointerup', (event) => {
      lastProfilePointerToggle = Date.now();
      toggleUserMenu(event);
    });
    userMenuButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.detail === 0 || Date.now() - lastProfilePointerToggle > 600) toggleUserMenu(event);
    });
    const openOwnProfile = () => { closeHeaderMenus(); openProfileModal(); };
    $('#profile-button').addEventListener('click',openOwnProfile);
    $('#profile-card-button')?.addEventListener('click',openOwnProfile);
    $('#presence-button').addEventListener('click',()=>{ closeHeaderMenus(); navigate('presence'); });
    $('#brand-status').addEventListener('click',()=>navigate('presence'));
    $('#theme-button').addEventListener('click',()=>toggleTheme());
    $('#notifications-button').addEventListener('click',async(event)=>{
      event.preventDefault();
      event.stopPropagation();
      closeHeaderMenus('notifications');
      requestBrowserNotifications();
      await openNotifications();
    });
    $('#notification-panel')?.addEventListener('click',(event)=>event.stopPropagation());
    $('#extend-business-hours')?.addEventListener('click',()=>openBusinessHoursExtensionModal().catch((error)=>toast('Não foi possível abrir',error.message,'error')));
    $('#dismiss-business-hours')?.addEventListener('click',dismissBusinessHoursBanner);
    $('#close-business-hours-banner')?.addEventListener('click',dismissBusinessHoursBanner);
    $('#user-menu-dropdown').addEventListener('click',(event)=>event.stopPropagation());
    document.addEventListener('click',()=>{closeHeaderMenus();closeContextMenu();closeCustomSelects();});
    window.addEventListener('resize',()=>{closeHeaderMenus();closeContextMenu();if(!window.matchMedia('(max-width: 900px)').matches)closeMobileNavigation();updateAppViewportMetrics();});
    window.addEventListener('scroll',()=>{hideSmartTooltip();closeCustomSelects();},true);
    document.addEventListener('pointerdown', unlockUiAudio, { once: true });
    // Uma seleção de texto acidental não pode deixar botões e controles sem clique.
    document.addEventListener('pointerdown', (event) => {
      const interactive = event.target.closest?.('button,a,[role="button"],input,select,textarea,label,summary,.conversation-item,.settings-card');
      if (!interactive) return;
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
    }, true);
  }

  async function initializeApp() {
    if (!state.token) return showLogin();
    try {
      state.user = await api('/auth/me');
      state.currentSessionId = state.user.sessionId || state.currentSessionId;
      if (state.currentSessionId) localStorage.setItem('gm_session_id', state.currentSessionId);
      state.branding = await api('/branding').catch(() => state.branding);
      $('#login-view').classList.add('hidden');
      $('#app').classList.remove('hidden');
      $('#user-name').textContent = state.user.name;
      $('#user-role').textContent = roleLabel(state.user.role);
      renderHeaderAvatar(state.user);
      applyUserPreferences(state.user.preferences || {});
      if (state.branding?.primaryColor) document.documentElement.style.setProperty('--primary', state.branding.primaryColor);
      applyOrderStatusTheme();
      renderNav(await getWaitingCount());
      bindGlobal();
      setupSocket();
      startSessionHeartbeat();
      await refreshNotifications().catch(()=>{});
      await api('/business-hours/status').then((status)=>renderBusinessHoursBanner(status)).catch(()=>{});
      const initialPage = state.user.role === 'kitchen' ? 'kitchen' : 'dashboard';
      await navigate(initialPage);
    } catch {
      logout();
    }
  }

  function showLogin() {
    $('#login-view').classList.remove('hidden');
    $('#app').classList.add('hidden');
  }

  function logout({ notifyServer = true } = {}) {
    const token = state.token;
    if (notifyServer && token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(()=>{});
    if (state.sessionHeartbeatTimer) { clearInterval(state.sessionHeartbeatTimer); state.sessionHeartbeatTimer = null; }
    state.token = '';
    state.user = null;
    state.currentSessionId = '';
    localStorage.removeItem('atenderbem_token');
    localStorage.removeItem('gm_session_id');
    if (state.socket) state.socket.disconnect();
    closeHeaderMenus();
    closeModal();
    showLogin();
  }

  function startSessionHeartbeat() {
    if (state.sessionHeartbeatTimer) clearInterval(state.sessionHeartbeatTimer);
    const ping = () => api('/auth/heartbeat', { method: 'POST' }).catch(()=>{});
    ping();
    state.sessionHeartbeatTimer = setInterval(ping, 60000);
  }

  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    // Solicita a permissão enquanto o clique de entrada ainda é uma ação do usuário.
    requestBrowserNotifications();
    const button = event.currentTarget.querySelector('button[type=submit]');
    button.disabled = true;
    $('#login-error').textContent = '';
    try {
      let result;
      const credentials = { email: $('#login-email').value, password: $('#login-password').value };
      try {
        result = await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      } catch (loginError) {
        if (loginError.code !== 'SESSION_ACTIVE') throw loginError;
        const replaceSession = window.confirm('Esta conta já está conectada em outro dispositivo ou navegador. Deseja encerrar a sessão anterior e entrar aqui?');
        if (!replaceSession) throw new Error('A entrada foi cancelada porque esta conta já está conectada.');
        result = await api('/auth/login', { method: 'POST', body: JSON.stringify({ ...credentials, force: true }) });
      }
      state.token = result.token;
      state.currentSessionId = result.sessionId || '';
      localStorage.setItem('atenderbem_token', state.token);
      if (state.currentSessionId) localStorage.setItem('gm_session_id', state.currentSessionId);
      requestBrowserNotifications();
      await initializeApp();
    } catch (error) {
      $('#login-error').textContent = error.message;
    } finally { button.disabled = false; }
  });

  function setupSocket() {
    if (state.socket) state.socket.disconnect();
    state.socket = io({ auth: { token: state.token } });
    state.socket.on('connect_error', (error) => {
      const message = String(error?.message || 'Não foi possível conectar ao tempo real.');
      if (/não autenticado|sessão inválida|usuário inativo/i.test(message)) logout();
    });
    state.socket.on('session:revoked', ({ sessionId, reason } = {}) => {
      if (sessionId && state.currentSessionId && String(sessionId) !== String(state.currentSessionId)) return;
      toast('Sessão encerrada', reason || 'Sua conta foi conectada em outro dispositivo.', 'error');
      logout({ notifyServer: false });
    });
    state.socket.on('sessions:refresh', () => { if (state.page === 'security') renderSecurity().catch(()=>{}); });
    state.socket.on('message:new', async ({ conversationId, message, notifyUserId = null, suppressNotification = false, contactName = '' }) => {
      if (state.page === 'chats') {
        await refreshConversationList();
        if (Number(conversationId) === Number(state.selectedConversationId)) {
          const appended = appendRealtimeMessage(conversationId, message);
          if (!appended) await selectConversation(conversationId, false);
        }
      }
      const customerMessage = message?.sender_type === 'customer';
      const intendedForCurrentUser = Number(notifyUserId || 0) === Number(state.user?.id || 0);
      if (customerMessage && !suppressNotification && intendedForCurrentUser) {
        const row = state.conversations.find((item)=>Number(item.id)===Number(conversationId));
        const name = contactName || row?.contact_name || (Number(state.currentConversation?.id) === Number(conversationId) ? state.currentConversation?.contact_name : 'Cliente');
        const preview = String(message.content || (message.message_type === 'audio' ? 'Enviou um áudio.' : 'Enviou uma nova mensagem.')).slice(0,120);
        playUiSound('message');
        showLiveNotification({
          key: `message-${message.id || conversationId}-${message.created_at || ''}`,
          type: 'message',
          title: `Nova mensagem de ${name || 'Cliente'}`,
          message: preview,
          entity_type: 'conversation',
          entity_id: conversationId,
        });
        showDesktopNotification(`Nova mensagem de ${name || 'Cliente'}`, preview, `conversation-${conversationId}`);
      }
    });
    state.socket.on('message:status', ({ conversationId, message }) => {
      if (state.page !== 'chats' || Number(conversationId) !== Number(state.selectedConversationId)) return;
      const target = document.querySelector(`.message[data-message-id="${message.id}"] .message-status`);
      if (target) target.outerHTML = deliveryStatusMarkup(message);
    });
    state.socket.on('conversation:updated', async () => {
      renderNav(await getWaitingCount());
      if (state.page === 'chats') await refreshConversationList();
      if (state.page === 'history') await renderHistory();
    });
    state.socket.on('order:new', async ({ order }) => {
      if (state.page === 'kitchen') await renderKitchen();
      if (state.page === 'orders') await renderOrders();
      if (state.page === 'deliveries') await renderDeliveries();
      if (state.page === 'chats') {
        await refreshConversationList();
        if (Number(order?.conversation_id) === Number(state.selectedConversationId)) await selectConversation(state.selectedConversationId, false);
      }
    });
    state.socket.on('order:updated', async (order) => {
      if (state.page === 'kitchen') await renderKitchen();
      if (state.page === 'orders') await renderOrders();
      if (state.page === 'deliveries') await renderDeliveries();
      if (state.page === 'chats' && Number(order?.conversation_id) === Number(state.selectedConversationId)) {
        await selectConversation(state.selectedConversationId, false);
      }
    });
    state.socket.on('internal:new', async (event) => {
      const payload=event?.message || event || {};
      const fromSelf = Number(payload.user_id || event?.from_user_id) === Number(state.user?.id);
      const intended = !event?.direct || !Array.isArray(event.userIds) || event.userIds.map(Number).includes(Number(state.user?.id));
      if (state.page === 'internal' && intended) await renderInternalChat();
      if (!fromSelf && intended) { playUiSound('internal'); showDesktopNotification('Nova mensagem interna', `${payload.user_name || 'Equipe'}: ${String(payload.content || '').slice(0,120)}`, `internal-${payload.id || Date.now()}`); showInternalMessageNotification({ ...event, ...payload, from_user_id: payload.user_id || event?.from_user_id, channel_id: event?.channelId || payload.channel_id }); }
    });
    state.socket.on('presence:updated', async () => {
      if (state.page === 'monitoring') await renderMonitoring();
      if (state.page === 'presence') await renderPresenceBoard();
    });
    state.socket.on('notification:new', async (notification) => {
      if (!notification || (notification.target_user_id && Number(notification.target_user_id)!==Number(state.user?.id))) return;
      if (notification.target_role && notification.target_role !== state.user?.role) return;
      if (state.user?.role === 'kitchen' && notification.type === 'new_order' && notification.entity_type === 'conversation') return;
      refreshNotifications().catch(()=>{});
      if (notification.type === 'internal_message') return;
      if (notification.type === 'assignment' || notification.type === 'transfer') {
        renderNav(await getWaitingCount());
        if (state.page === 'chats') await refreshConversationList();
      }
      const tableAlert = String(notification.type || '').startsWith('table_');
      const orderAlert = ['new_order','order','order_edited'].includes(notification.type);
      const soundKind = notification.type === 'assignment' || notification.type === 'transfer'
        ? 'assignment'
        : tableAlert ? notification.type : (orderAlert ? 'order' : 'notification');
      playUiSound(soundKind);
      showLiveNotification({ ...notification, key: `notification-${notification.id || Date.now()}` });
      showDesktopNotification(notification.title || 'Nova notificação', notification.message || '', `notification-${notification.id || Date.now()}`);
    });
    state.socket.on('message:updated', async ({ conversationId }) => {
      if (state.page === 'chats' && Number(conversationId) === Number(state.selectedConversationId)) await selectConversation(conversationId, false);
    });
    state.socket.on('table:updated', async () => {
      if (state.page === 'tables') await renderTables();
      if (state.page === 'chats') {
        await refreshConversationList();
        if (state.selectedConversationId) await selectConversation(state.selectedConversationId, false);
      }
    });
    state.socket.on('business-hours:ended', (status) => {
      localStorage.removeItem('gm_business_hours_banner_dismissed');
      renderBusinessHoursBanner(status, { force: true });
      playUiSound('notification');
    });
    state.socket.on('business-hours:updated', (status) => renderBusinessHoursBanner(status));
    state.socket.on('whatsapp:status', updateConnectionCard);
    state.socket.on('system:warning', ({ message }) => toast('Atenção', message, 'error'));
  }

  async function updateConnectionCard(summary = null) {
    try {
      const info = summary || await api('/whatsapp-summary');
      const dot = $('#connection-dot');
      const title = $('#connection-title');
      const subtitle = $('#connection-subtitle');
      if (!dot || !title || !subtitle) return;
      dot.className = `status-dot ${info.status === 'connected' ? 'online' : info.status === 'connecting' || info.status === 'waiting_qr' ? 'pending' : 'offline'}`;
      title.textContent = info.name || 'WhatsApp';
      subtitle.textContent = statusLabels[info.status] || info.status || 'Desconectado';
    } catch { /* cartão informativo; não bloqueia o painel */ }
  }

  function unlockUiAudio() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        if (!state.audioContext) state.audioContext = new AudioContextClass();
        if (state.audioContext.state === 'suspended') state.audioContext.resume();
      }
      if (!state.notificationAudio) {
        state.notificationAudio = new Audio('/sounds/notificacao.mp3');
        state.notificationAudio.preload = 'auto';
        state.notificationAudio.volume = .78;
      }
    } catch { /* sem áudio neste navegador */ }
  }

  function playToneFallback(kind = 'notification') {
    const context = state.audioContext;
    if (!context) return;
    const patterns = {
      message: [[720,0,.10],[920,.12,.11]],
      internal: [[520,0,.11],[660,.13,.11]],
      assignment: [[620,0,.12],[820,.14,.12],[1020,.28,.14]],
      order: [[660,0,.13],[880,.15,.13],[1100,.30,.20]],
      table_opened: [[440,0,.12],[660,.14,.14],[880,.31,.22]],
      table_waiter: [[820,0,.10],[820,.18,.10],[1040,.36,.18]],
      table_bill: [[520,0,.13],[780,.16,.13],[1040,.32,.16],[1280,.49,.20]],
      table_napkins: [[760,0,.10],[960,.13,.16]],
      table_cutlery: [[620,0,.10],[920,.12,.10],[1220,.24,.16]],
      table_problem: [[360,0,.20],[300,.23,.24]],
      table_change: [[700,0,.12],[560,.15,.12],[700,.30,.16]],
      notification: [[780,0,.12]],
    };
    const base = context.currentTime + .01;
    for (const [frequency, offset, duration] of (patterns[kind] || patterns.notification)) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(.0001, base + offset);
      gain.gain.exponentialRampToValueAtTime(.16, base + offset + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, base + offset + duration);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(base + offset); oscillator.stop(base + offset + duration + .02);
    }
  }

  function playUiSound(kind = 'notification') {
    if (state.user?.preferences?.sounds_enabled === false) return;
    try {
      unlockUiAudio();
      if (kind !== 'order' && !String(kind).startsWith('table_') && state.notificationAudio) {
        state.notificationAudio.pause();
        state.notificationAudio.currentTime = 0;
        state.notificationAudio.play().catch(()=>playToneFallback(kind));
        return;
      }
      playToneFallback(kind);
    } catch { playToneFallback(kind); }
  }


  function notificationVisual(type = '') {
    if (type === 'assignment' || type === 'transfer') return { icon: '👤', className: 'assignment' };
    if (type === 'message') return { icon: '💬', className: 'message' };
    if (type === 'order' || type === 'new_order' || type === 'order_edited') return { icon: '🛍️', className: 'order' };
    if (type === 'internal_message') return { icon: '👥', className: 'internal' };
    if (String(type).startsWith('table_')) {
      const icons={table_opened:'🍽️',table_bill:'🧾',table_waiter:'🛎️',table_napkins:'🧻',table_cutlery:'🍴',table_problem:'⚠️',table_change:'✏️'};
      return { icon: icons[type] || '🛎️', className: type === 'table_problem' ? 'default' : 'order' };
    }
    return { icon: '🔔', className: 'default' };
  }


  function businessHoursBannerKey(status = state.businessHoursStatus) {
    return String(status?.lastClosedWindow?.endedAt || status?.alertExpiresAt || '');
  }

  function renderBusinessHoursBanner(status, { force = false } = {}) {
    if (status) state.businessHoursStatus = status;
    const current = state.businessHoursStatus;
    const banner = $('#business-hours-banner');
    if (!banner) return;
    const shouldShow = Boolean(current?.enabled && current?.alertActive && !current?.open && current?.lastClosedWindow?.endedAt);
    const key = businessHoursBannerKey(current);
    const dismissed = key && localStorage.getItem('gm_business_hours_banner_dismissed') === key;
    if (!shouldShow || (dismissed && !force)) {
      banner.classList.add('hidden');
      return;
    }
    const endedAt = current.lastClosedWindow?.end || String(current.lastClosedWindow?.endedAt || '').slice(-5);
    const expiresAt = String(current.alertExpiresAt || '').slice(-5);
    $('#business-hours-banner-title').textContent = `O horário de atendimento terminou às ${endedAt}.`;
    $('#business-hours-banner-text').textContent = `Deseja prolongar somente hoje? Este aviso ficará disponível até ${expiresAt || '2 horas após o encerramento'} e não altera a grade semanal.`;
    banner.classList.remove('hidden');
  }

  function dismissBusinessHoursBanner() {
    const key = businessHoursBannerKey();
    if (key) localStorage.setItem('gm_business_hours_banner_dismissed', key);
    $('#business-hours-banner')?.classList.add('hidden');
  }

  function clockPlusMinutes(clock, amount = 60) {
    const match = String(clock || '').match(/^(\d{2}):(\d{2})$/);
    const current = match ? Number(match[1]) * 60 + Number(match[2]) : 18 * 60;
    const total = ((current + amount) % (24 * 60) + (24 * 60)) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  async function openBusinessHoursExtensionModal() {
    let status = state.businessHoursStatus;
    if (!status) status = await api('/business-hours/status');
    const suggested = clockPlusMinutes(status.currentTime, 60);
    openModal('Prolongar atendimento de hoje', `
      <form id="business-hours-extension-form" class="form-grid">
        <div class="field full"><div class="info-box"><strong>🕒 Alteração temporária</strong><p>O horário semanal continuará igual. Este prolongamento vale somente para este encerramento e não altera nenhum dia da grade semanal.</p></div></div>
        <div class="field full"><label>Manter o atendimento aberto até</label><input name="until" type="time" value="${esc(suggested)}" required><small>Ao chegar nesse horário, o aviso aparecerá novamente caso seja necessário prolongar mais.</small></div>
      </form>
    `, `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button><button class="btn btn-primary" id="confirm-business-hours-extension" type="button">Prolongar somente hoje</button>`);
    $('#confirm-business-hours-extension')?.addEventListener('click', async () => {
      const form = $('#business-hours-extension-form');
      const button = $('#confirm-business-hours-extension');
      const until = form?.elements.until?.value;
      button.disabled = true;
      try {
        const updated = await api('/business-hours/extend', { method: 'POST', body: JSON.stringify({ until }) });
        state.businessHoursStatus = updated;
        localStorage.removeItem('gm_business_hours_banner_dismissed');
        renderBusinessHoursBanner(updated);
        closeModal();
        toast('Atendimento prolongado', `Hoje o atendimento ficará aberto até ${updated.extension?.until || until}.`);
      } catch (error) {
        toast('Não foi possível prolongar', error.message, 'error');
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
    });
  }

  async function openNotificationEntity(entityType, entityId) {
    $('#notification-panel')?.classList.add('hidden');
    if (entityType === 'conversation' && Number(entityId)) {
      state.selectedConversationId = Number(entityId);
      await navigate('chats');
      if (state.selectedConversationId) await selectConversation(state.selectedConversationId, false).catch(()=>{});
      return;
    }
    if (entityType === 'order' && Number(entityId)) await navigate('orders');
    if (entityType === 'table' && Number(entityId)) { state.focusTableId = Number(entityId); await navigate('tables'); }
  }

  function showLiveNotification(notification = {}) {
    if (state.user?.preferences?.desktop_notifications === false) return;
    const key = String(notification.key || notification.id || `${notification.type || 'notice'}-${notification.entity_id || ''}-${notification.created_at || Date.now()}`);
    if (state.liveNotificationKeys.has(key)) return;
    state.liveNotificationKeys.add(key);
    setTimeout(()=>state.liveNotificationKeys.delete(key), 15000);

    const root = $('#toast-root');
    if (!root) return;
    const visual = notificationVisual(notification.type);
    const card = document.createElement('article');
    card.className = `live-notification-card ${visual.className}`;
    card.innerHTML = `<div class="live-notification-icon">${visual.icon}</div><div class="live-notification-copy"><strong>${esc(notification.title || 'Nova notificação')}</strong><p>${esc(notification.message || '')}</p><div class="live-notification-actions">${notification.entity_type && notification.entity_id ? '<button type="button" data-live-open>Ver agora</button>' : ''}<button type="button" data-live-close>Fechar</button></div></div><button type="button" class="live-notification-x" data-live-close aria-label="Fechar">×</button>`;
    root.prepend(card);
    const remove = () => { card.classList.add('leaving'); setTimeout(()=>card.remove(), 180); };
    card.querySelectorAll('[data-live-close]').forEach((button)=>button.addEventListener('click',remove));
    card.querySelector('[data-live-open]')?.addEventListener('click',async()=>{ remove(); await openNotificationEntity(notification.entity_type, notification.entity_id); });
    setTimeout(()=>{ if (card.isConnected) remove(); }, 9000);
  }

  function requestBrowserNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    if (state.user?.preferences?.desktop_notifications === false) return;
    Notification.requestPermission().catch(()=>{});
  }

  function showDesktopNotification(title, body, tag = '') {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (state.user?.preferences?.desktop_notifications === false) return;
    if (document.visibilityState === 'visible' && document.hasFocus()) return;
    try { new Notification(title, { body, tag, renotify: true }); } catch { /* opcional */ }
  }

  function playKitchenSound() { playUiSound('order'); }


  function periodOptions(selected) {
    return [
      ['realtime','Tempo real'],['today','Hoje'],['yesterday','Ontem'],['7days','Últimos 7 dias'],['30days','Últimos 30 dias'],['custom','Personalizado'],
    ].map(([value,label])=>`<option value="${value}" ${selected===value?'selected':''}>${label}</option>`).join('');
  }

  function dateFilterQuery(filters) {
    const params=new URLSearchParams({period:filters.period||'today'});
    if(filters.from)params.set('from',filters.from);
    if(filters.to)params.set('to',filters.to);
    return params.toString();
  }

  async function renderDashboard() {
    if (state.dashboardTimer) { clearInterval(state.dashboardTimer); state.dashboardTimer = null; }
    const filters=state.dashboardFilters;
    const data = await api(`/dashboard?${dateFilterQuery(filters)}`);
    $('#page-content').innerHTML = `
      <div class="compact-page-toolbar dashboard-toolbar">
        <div><h2>Visão geral</h2><small>${filters.period==='realtime'?'<span class="live-dot"></span> Atualização automática em tempo real':`Período de ${data.from} até ${data.to}`}</small></div>
        <div class="toolbar-filter-group">
          <select id="dashboard-period" class="custom-select compact-filter-select">${periodOptions(filters.period)}</select>
          <div id="dashboard-custom-dates" class="compact-date-fields ${filters.period==='custom'?'':'hidden'}"><input id="dashboard-from" type="date" value="${esc(filters.from)}"><input id="dashboard-to" type="date" value="${esc(filters.to)}"></div>
          <button class="icon-button" id="refresh-dashboard" data-tooltip="Atualizar">${icon('refresh',17)}</button>
        </div>
      </div>
      <div class="stats-grid">
        ${statCard('chat',data.counts.waiting,'Aguardando',filters.period==='realtime'?'Na fila agora':'No período')}
        ${statCard('users',data.counts.open,'Em atendimento',filters.period==='realtime'?'Conversas ativas':'Abertos no período')}
        ${statCard('order',data.counts.ordersOpen,'Pedidos ativos',filters.period==='realtime'?'Em andamento':'Criados no período')}
        ${statCard('order',data.counts.occupiedTables,'Mesas ocupadas','Comanda aberta agora')}
        ${statCard('dollar',money(data.counts.revenue),'Vendas',`${data.counts.contacts} clientes`)}
      </div>
      <div class="dashboard-grid">
        <div class="card"><div class="card-head"><h3>Filas</h3></div><div class="card-body">${data.queues.map((q)=>`<button class="queue-row queue-open-chat" data-queue-id="${q.id}"><div class="queue-name"><span class="queue-color" style="background:${esc(q.color)}"></span>${esc(q.name)}</div><div class="queue-numbers"><span class="mini-pill"><b>${q.waiting||0}</b> aguardando</span><span class="mini-pill"><b>${q.open||0}</b> ativos</span></div></button>`).join('')||emptySmall('Nenhuma fila')}</div></div>
        <div class="card"><div class="card-head"><h3>Conversas recentes</h3><button class="icon-button" id="open-chats" data-tooltip="Abrir atendimentos">${icon('chat',17)}</button></div><div class="card-body activity-list">${data.recent.map((item)=>`<button class="activity-item dashboard-conversation" data-id="${item.id}"><span class="activity-avatar">${initials(item.contact_name)}</span><div class="activity-main"><strong>${esc(item.contact_name)}</strong><p>${esc(item.last_message)}</p></div><span class="activity-time">${timeAgo(item.last_message_at)}</span></button>`).join('')||emptySmall('Nenhuma conversa')}</div></div>
      </div>`;
    $('#refresh-dashboard').addEventListener('click',renderDashboard);
    $('#dashboard-period').addEventListener('change',async(event)=>{state.dashboardFilters.period=event.target.value;if(event.target.value!=='custom'){state.dashboardFilters.from='';state.dashboardFilters.to='';}await renderDashboard();});
    $('#dashboard-from')?.addEventListener('change',(event)=>{state.dashboardFilters.from=event.target.value;});
    $('#dashboard-to')?.addEventListener('change',async(event)=>{state.dashboardFilters.to=event.target.value;if(state.dashboardFilters.from&&state.dashboardFilters.to)await renderDashboard();});
    $('#open-chats').addEventListener('click',()=>navigate('chats'));
    $$('.dashboard-conversation').forEach((btn)=>btn.addEventListener('click',async()=>{state.selectedConversationId=Number(btn.dataset.id);await navigate('chats');}));
    $$('.queue-open-chat').forEach((btn)=>btn.addEventListener('click',async()=>{state.conversationQueue=btn.dataset.queueId;await navigate('chats');}));
    if(filters.period==='realtime') state.dashboardTimer=setInterval(()=>{if(state.page==='dashboard')renderDashboard().catch(()=>{});},12000);
  }

  function statCard(iconName, value, label, trend) {
    return `<div class="stat-card"><div class="stat-icon">${icon(iconName)}</div><div class="stat-value">${esc(value)}</div><div class="stat-label">${esc(label)}</div><div class="stat-trend">${esc(trend)}</div></div>`;
  }

  function emptySmall(text) { return `<div class="empty-state" style="padding:28px 10px"><p>${esc(text)}</p></div>`; }

  async function renderChats() {
    [state.quickReplies,state.stickers,state.closureReasons,state.queues,state.templates]=await Promise.all([
      api('/quick-replies'),api('/stickers'),api('/closure-reasons'),api('/queues'),api('/templates'),
    ]);
    $('#page-content').innerHTML=`
      <div class="chat-layout" id="chat-layout">
        <aside class="chat-list-panel">
          <div class="chat-list-head compact-chat-head">
            <div class="chat-primary-actions">
              <button class="icon-button primary-icon" id="open-conversation" data-tooltip="Abrir conversa">${icon('plus',18)}</button>
              <div class="compact-search">${icon('search',15)}<input id="conversation-search" placeholder="Buscar"></div>
              <button class="icon-button" id="chat-filter-button" data-tooltip="Filtros">${icon('filter',17)}</button>
              ${state.user?.role==='agent'?`<button class="icon-button" id="claim-oldest" data-tooltip="Puxar atendimento mais antigo">${icon('queue',17)}</button>`:''}
            </div>
            <div id="chat-filter-panel" class="filter-popover hidden">
              <label>Fila<select id="conversation-queue" class="custom-select"><option value="all">Todas</option>${state.queues.map((queue)=>`<option value="${queue.id}" ${String(state.conversationQueue)===String(queue.id)?'selected':''}>${esc(queue.name)}</option>`).join('')}</select></label>
              <label>Ordem<select id="conversation-sort" class="custom-select"><option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option><option value="name">Nome A–Z</option></select></label>
              <div class="segmented-filter">${[['all','Ativos'],['waiting','Aguardando'],['open','Em atendimento']].map(([id,label])=>`<button class="chat-tab ${state.conversationStatus===id?'active':''}" data-status="${id}">${esc(label)}</button>`).join('')}</div>
            </div>
          </div>
          <div id="conversation-list" class="conversation-list">${loading()}</div>
        </aside>
        <section id="chat-center" class="chat-center"><div class="chat-empty"><div><div class="empty-icon">${icon('chat')}</div><h3>Selecione uma conversa</h3></div></div></section>
        <aside id="chat-detail" class="chat-detail-panel"><div class="empty-state"><p>Selecione um atendimento.</p></div></aside>
      </div>`;
    $('#open-conversation').addEventListener('click',openNewConversationModal);
    $('#claim-oldest')?.addEventListener('click',claimOldestConversation);
    $('#chat-filter-button').addEventListener('click',(event)=>{event.stopPropagation();$('#chat-filter-panel').classList.toggle('hidden');});
    $('#chat-filter-panel').addEventListener('click',(event)=>event.stopPropagation());
    $('#conversation-search').value=state.conversationSearch;
    let searchTimer;
    $('#conversation-search').addEventListener('input',(event)=>{clearTimeout(searchTimer);state.conversationSearch=event.target.value;searchTimer=setTimeout(refreshConversationList,220);});
    $('#conversation-queue').addEventListener('change',async(event)=>{state.conversationQueue=event.target.value;state.selectedConversationId=null;await refreshConversationList();});
    $('#conversation-sort').value=state.conversationSort;
    $('#conversation-sort').addEventListener('change',async(event)=>{state.conversationSort=event.target.value;await refreshConversationList();});
    $$('.chat-tab').forEach((btn)=>btn.addEventListener('click',async()=>{state.conversationStatus=btn.dataset.status;$$('.chat-tab').forEach((b)=>b.classList.toggle('active',b===btn));state.selectedConversationId=null;await refreshConversationList();}));
    await refreshConversationList();
    if(state.selectedConversationId && state.conversations.some((c)=>Number(c.id)===Number(state.selectedConversationId))) await selectConversation(state.selectedConversationId);
  }

  function renderConversationCard(c, { child = false } = {}) {
    return `<div class="conversation-item ${child?'table-conversation-child':''} ${c.priority==='urgent'?'urgent':c.priority==='high'?'high-priority':''} ${orderStatusClass(c.active_order_status)} ${Number(c.id) === Number(state.selectedConversationId) ? 'active' : ''}" data-conversation-id="${c.id}" tabindex="0">
      <span class="conversation-avatar">${initials(c.contact_name)}<i class="channel-dot"></i></span>
      <div class="conversation-info">
        <div class="conversation-line"><strong>${esc(c.contact_name)}</strong>${c.priority === 'urgent' ? '<span class="priority-chip urgent">Urgente</span>' : c.priority === 'high' ? '<span class="priority-chip">Prioridade</span>' : ''}</div>
        <div class="conversation-badges">${c.status === 'waiting_human' ? '<span class="tag">Humano</span>' : ''}${c.origin === 'website' ? '<span class="tag site-tag">Site</span>' : ''}${!child&&c.table_name ? `<span class="tag table-tag">${esc(c.table_name)}</span>` : ''}${c.active_order_status && c.active_order_status !== 'new' ? statusBadge(c.active_order_status) : ''}${c.ai_enabled ? '<span class="ai-mini">IA</span>' : ''}</div>
        <p>${esc(c.last_message || 'Sem mensagens')}</p><div class="conversation-subline"><span>${esc(c.queue_name)}</span>${c.assigned_user_name ? `<span>• ${esc(c.assigned_user_name)}</span>` : ''}<span>• aberto há ${openDuration(c.created_at)}</span></div>
      </div>
      <div class="conversation-meta"><time>${timeAgo(c.last_message_at)}</time>${c.unread_count ? `<span class="unread">${c.unread_count}</span>` : ''}</div>
    </div>`;
  }

  function renderTableConversationGroup(tableName, conversations) {
    const tableId = String(conversations[0]?.table_id || tableName);
    const expanded = state.expandedTableGroups.has(tableId);
    const unread = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0);
    const latest = [...conversations].sort((a,b)=>new Date(b.last_message_at||0)-new Date(a.last_message_at||0))[0];
    const activeStatuses = [...new Set(conversations.map((item)=>item.active_order_status).filter(Boolean))];
    return `<section class="table-conversation-group ${expanded?'expanded':''}" data-table-group="${esc(tableId)}">
      <button class="table-group-header" type="button" data-toggle-table-group="${esc(tableId)}" aria-expanded="${expanded}">
        <span class="table-group-icon">🍽️</span>
        <span class="table-group-copy"><strong>${esc(tableName)}</strong><small>${conversations.length} ${conversations.length===1?'cliente':'clientes'} · ${esc(latest?.last_message||'Comanda aberta')}</small><span class="table-group-statuses">${activeStatuses.slice(0,2).map((status)=>status==='new'?'<span class="table-status-neutral">Novo</span>':statusBadge(status)).join('')}</span></span>
        <span class="table-group-meta"><time>${timeAgo(latest?.last_message_at)}</time>${unread?`<span class="unread table-unread">${unread}</span>`:''}<i>${icon('chevronDown',16)}</i></span>
      </button>
      <div class="table-group-children" ${expanded?'':'hidden'}>${conversations.map((conversation)=>renderConversationCard(conversation,{child:true})).join('')}</div>
    </section>`;
  }

  async function refreshConversationList() {
    const list = $('#conversation-list');
    if (!list) return;
    const queue = state.conversationQueue === 'all' ? '' : `&queueId=${encodeURIComponent(state.conversationQueue)}`;
    state.conversations = await api(`/conversations?status=${encodeURIComponent(state.conversationStatus)}&search=${encodeURIComponent(state.conversationSearch)}&order=${encodeURIComponent(state.conversationSort)}${queue}`);
    const tableGroups = new Map();
    const standalone = [];
    for (const conversation of state.conversations) {
      if (conversation.table_id && conversation.table_name) {
        const key = String(conversation.table_id);
        if (!tableGroups.has(key)) tableGroups.set(key, { name: conversation.table_name, rows: [] });
        tableGroups.get(key).rows.push(conversation);
      } else standalone.push(conversation);
    }
    const blocks = [];
    for (const group of tableGroups.values()) blocks.push(renderTableConversationGroup(group.name, group.rows));
    blocks.push(...standalone.map((conversation)=>renderConversationCard(conversation)));
    list.innerHTML = blocks.length ? blocks.join('') : `<div class="empty-state">${icon('chat')}<h3>Nenhuma conversa</h3><p>Não encontramos atendimentos nesse filtro.</p></div>`;
    $$('[data-toggle-table-group]', list).forEach((button)=>button.addEventListener('click',()=>{
      const key=String(button.dataset.toggleTableGroup);
      if(state.expandedTableGroups.has(key)) state.expandedTableGroups.delete(key); else state.expandedTableGroups.add(key);
      localStorage.setItem('gm_expanded_table_groups',JSON.stringify([...state.expandedTableGroups]));
      const group=button.closest('.table-conversation-group');
      const expanded=state.expandedTableGroups.has(key);
      group.classList.toggle('expanded',expanded);
      button.setAttribute('aria-expanded',String(expanded));
      $('.table-group-children',group).hidden=!expanded;
    }));
    $$('.table-group-header', list).forEach((header)=>header.addEventListener('contextmenu',(event)=>{
      const group=header.closest('.table-conversation-group');
      const tableId=String(group?.dataset.tableGroup||'');
      const conversations=state.conversations.filter((row)=>String(row.table_id)===tableId);
      openTableConversationGroupContext(event,tableId,conversations);
    }));
    $$('.conversation-item', list).forEach((item) => {
      const id = Number(item.dataset.conversationId);
      const conversation = state.conversations.find((row) => Number(row.id) === id);
      item.addEventListener('click', () => selectConversation(id));
      item.addEventListener('keydown', (event) => { if (event.key === 'Enter') selectConversation(id); });
      item.addEventListener('contextmenu', (event) => openConversationContext(event, conversation));
    });
  }


  async function selectConversation(id,markActive=true){
    const nextConversationId=Number(id);
    const previousConversationId=state.selectedConversationId;
    const isBackgroundRefresh=!markActive && Number(previousConversationId)===nextConversationId;
    const previousMessages=isBackgroundRefresh?$('#messages'):null;
    const scrollSnapshot=previousMessages?{
      top:previousMessages.scrollTop,
      height:previousMessages.scrollHeight,
      clientHeight:previousMessages.clientHeight,
      bottomDistance:Math.max(0,previousMessages.scrollHeight-previousMessages.scrollTop-previousMessages.clientHeight),
      nearBottom:previousMessages.scrollHeight-previousMessages.scrollTop-previousMessages.clientHeight<90,
    }:null;
    const previousComposer=isBackgroundRefresh?$('#message-input'):null;
    const composerSnapshot=previousComposer?{
      value:previousComposer.value,
      selectionStart:previousComposer.selectionStart,
      selectionEnd:previousComposer.selectionEnd,
      focused:document.activeElement===previousComposer,
      internal:$('#internal-message')?.checked||false,
    }:null;
    const loadSequence=++state.conversationLoadSequence;

    if(state.selectedConversationId && Number(state.selectedConversationId)!==nextConversationId) resetAudioRecorder(true);
    state.selectedConversationId=nextConversationId;
    if(!isBackgroundRefresh){state.selectedMessageIds.clear();state.replyToMessage=null;}

    let data;
    try {
      data=await api(`/conversations/${id}`);
      if(loadSequence!==state.conversationLoadSequence||Number(state.selectedConversationId)!==nextConversationId)return;
    } catch (error) {
      console.error('[Conversas] Falha ao abrir atendimento:', error);
      state.selectedConversationId=previousConversationId||null;
      toast('Não foi possível abrir a conversa',error.message,'error');
      const center=$('#chat-center');
      if(center){
        center.innerHTML=`<div class="chat-empty"><div><div class="empty-icon">${icon('close')}</div><h3>Não foi possível abrir</h3><p>${esc(error.message)}</p><button class="btn btn-primary" id="retry-open-conversation">Tentar novamente</button></div></div>`;
        $('#retry-open-conversation')?.addEventListener('click',()=>selectConversation(nextConversationId,markActive));
      }
      return;
    }

    const c=data.conversation; state.currentConversation=c;
    if(Array.isArray(data.partialWarnings)&&data.partialWarnings.length){
      console.warn('[Conversas] Atendimento aberto parcialmente:',data.partialWarnings);
    }
    if(markActive) $$('.conversation-item').forEach((item)=>item.classList.toggle('active',Number(item.dataset.conversationId)===Number(id)));
    $('#chat-layout')?.classList.add('chat-open');
    document.body.classList.add('mobile-chat-active');
    $('#chat-center').className = 'chat-center';
    $('#chat-detail').className = 'chat-detail-panel';
    $('#chat-center').innerHTML=`
      <header class="chat-header compact-chat-header">
        <div class="chat-header-user"><button class="icon-button mobile-chat-back" id="chat-back" data-tooltip="Voltar">${icon('back')}</button><span class="conversation-avatar">${initials(c.contact_name)}<i class="channel-dot"></i></span><div><strong>${esc(c.contact_name)}${c.origin === 'website' ? '<span class="tag site-tag header-site-tag">Site</span>' : ''}${c.table_name ? `<span class="tag table-tag header-site-tag">${esc(c.table_name)}</span>` : ''}</strong><p>${esc(c.queue_name)} · +${esc(c.phone)} · aberto há ${openDuration(c.created_at)}</p></div></div>
        <div class="chat-header-actions">
          ${c.status==='closed'?`<button class="icon-button" id="reopen-chat" data-tooltip="Reabrir">${icon('refresh',17)}</button>`:`
          <button class="icon-button status-toggle ${c.ai_enabled?'state-on':'state-off'}" id="toggle-ai" data-tooltip="${c.ai_enabled?'IA ativa · clique para desligar':'IA desativada · clique para ligar'}">${icon('robot',17)}</button>
          <div class="header-action-wrap"><button class="icon-button" id="header-ai-tools-button" data-tooltip="Ferramentas da IA">${icon('brain',17)}</button><div id="header-ai-tools" class="header-tools-menu hidden">
            <button type="button" data-ai-tool="suggest">✨ <span>Sugerir resposta</span></button><button type="button" data-ai-tool="summary">📌 <span>Resumir atendimento</span></button><button type="button" data-ai-tool="spelling">✍️ <span>Corrigir texto</span></button><button type="button" data-ai-tool="friendly">😊 <span>Deixar mais amigável</span></button><button type="button" data-ai-tool="formal">👔 <span>Deixar mais formal</span></button><button type="button" data-ai-tool="shorter">✂️ <span>Encurtar</span></button><button type="button" data-ai-tool="expand">📝 <span>Expandir</span></button><button type="button" id="undo-ai-tool">↩️ <span>Desfazer</span></button>
          </div></div>
          <button class="icon-button" id="assign-chat" data-tooltip="Assumir atendimento">${icon('users',17)}</button>
          <button class="icon-button" id="transfer-chat" data-tooltip="Transferir">${icon('transfer',17)}</button>
          <button class="icon-button danger-icon" id="close-chat" data-tooltip="Finalizar">${icon('close',17)}</button>`}
        </div>
      </header>
      <div id="message-selection-bar" class="message-selection-bar hidden"><strong><span id="selected-count">0</span> selecionadas</strong><div><button class="icon-button" id="bulk-copy" data-tooltip="Copiar textos">${icon('copy',16)}</button><button class="icon-button" id="bulk-pin" data-tooltip="Fixar mensagens">${icon('pin',16)}</button><button class="icon-button" id="bulk-forward" data-tooltip="Encaminhar">${icon('forward',16)}</button><button class="icon-button danger-icon" id="bulk-delete" data-tooltip="Excluir mensagens">${icon('trash',16)}</button><button class="icon-button" id="clear-selection" data-tooltip="Cancelar seleção">${icon('close',16)}</button></div></div>
      ${siteOrderBanner(data.conversationOrders || (data.siteOrder?[data.siteOrder]:[]), c.id)}
      <div id="messages" class="messages" aria-live="polite">${renderMessageTimeline(data.messages)}</div>
      ${c.status==='closed'?'<div class="chat-composer closed-composer">Atendimento finalizado</div>':renderComposer()}`;
    renderChatDetail(c,data.transfers||[],data.orderSession,data.conversationOrders || (data.siteOrder?[data.siteOrder]:[]),data.customerHistory||null,data.orderChangeRequests||[]);
    const messages=$('#messages');
    if(messages){
      const restoreScroll=()=>{
        if(isBackgroundRefresh&&scrollSnapshot){
          messages.scrollTop=scrollSnapshot.nearBottom
            ? messages.scrollHeight
            : Math.max(0,messages.scrollHeight-messages.clientHeight-scrollSnapshot.bottomDistance);
        }else messages.scrollTop=messages.scrollHeight;
      };
      restoreScroll();
      requestAnimationFrame(()=>restoreScroll());
      const keepBottom = !scrollSnapshot || scrollSnapshot.nearBottom;
      $$('img,video,audio', messages).forEach((media)=>media.addEventListener('load',()=>{
        if (keepBottom && messages.isConnected) messages.scrollTop = messages.scrollHeight;
      },{once:true}));
    }
    $('#chat-back')?.addEventListener('click',()=>{ $('#chat-layout').classList.remove('chat-open'); document.body.classList.remove('mobile-chat-active'); });
    $('#toggle-ai')?.addEventListener('click',()=>toggleAi(c));
    $('#assign-chat')?.addEventListener('click',()=>assignChat(c));
    $('#transfer-chat')?.addEventListener('click',()=>openTransferModal(c));
    $('#close-chat')?.addEventListener('click',()=>closeChat(c));
    $('#reopen-chat')?.addEventListener('click',()=>reopenChat(c));
    $('#clear-selection')?.addEventListener('click',clearMessageSelection);
    $('#bulk-forward')?.addEventListener('click',()=>openForwardModal(c));
    $('#bulk-copy')?.addEventListener('click',async()=>{const selected=messages.filter((m)=>state.selectedMessageIds.has(Number(m.id))).map((m)=>m.content).join('\n\n');try{await navigator.clipboard.writeText(selected);toast('Mensagens copiadas');}catch{toast('Não foi possível copiar','','error');}});
    $('#bulk-pin')?.addEventListener('click',async()=>{for(const id of state.selectedMessageIds) await api(`/messages/${id}/pin`,{method:'PUT',body:JSON.stringify({pinned:true})});clearMessageSelection();await selectConversation(c.id,false);toast('Mensagens fixadas');});
    $('#bulk-delete')?.addEventListener('click',()=>openDeleteMessagesModal(c,[...state.selectedMessageIds],data.messages));
    bindMessageActions(c,data.messages);
    bindSiteOrderActions(c,data.conversationOrders || (data.siteOrder?[data.siteOrder]:[]));
    bindSiteOrderBannerClose(c.id);
    bindComposer(c);
    if(composerSnapshot&&c.status!=='closed'){
      const input=$('#message-input');
      if(input){
        input.value=composerSnapshot.value;
        input.selectionStart=Math.min(composerSnapshot.selectionStart??input.value.length,input.value.length);
        input.selectionEnd=Math.min(composerSnapshot.selectionEnd??input.value.length,input.value.length);
        autoGrowComposer(input);
        if(composerSnapshot.internal){
          const checkbox=$('#internal-message');
          if(checkbox)checkbox.checked=true;
          $('#internal-toggle-button')?.classList.add('state-on');
          $('#internal-toggle-button')?.classList.remove('state-off');
          input.placeholder='Nota interna para a equipe...';
        }
        if(composerSnapshot.focused)requestAnimationFrame(()=>input.focus({preventScroll:true}));
      }
    }
    await refreshConversationList();
  }

  function orderBuilderProductCard(product, quantity = 0, notes = '', index = 0) {
    const price = Number(product.price ?? product.unitPrice ?? product.unit_price ?? 0);
    const stock = product.stock == null ? null : Number(product.stock);
    const max = Math.max(1, Math.min(99, stock == null ? 99 : stock + Number(quantity || 0)));
    const productId = Number(product.id || product.productId || product.product_id || 0);
    return `<article class="order-builder-product ${Number(quantity)>0?'selected':''}" data-product-id="${productId}" data-builder-index="${index}" data-product-price="${price}" data-product-max="${max}">
      <div class="order-builder-product-main"><div class="order-builder-product-copy"><strong>${esc(product.name)}</strong><small>${money(price)}${stock==null?'':` · disponível ${max}`}</small></div><button type="button" class="order-note-icon ${notes?'has-note':''}" data-toggle-item-note title="Observação do item">📝</button></div>
      <div class="order-builder-product-actions"><button type="button" class="qty-step" data-qty-step="-1" aria-label="Diminuir">−</button><output class="order-qty-display">${Number(quantity||0)}</output><input class="order-qty" type="hidden" value="${Number(quantity||0)}"><button type="button" class="qty-step plus" data-qty-step="1" aria-label="Aumentar">+</button></div>
      <div class="order-item-note-panel ${notes?'':'hidden'}"><label><span>Observação deste item</span><textarea class="order-item-note" rows="2" placeholder="Ex.: sem cebola, bem passado, adicionar molho…">${esc(notes)}</textarea></label></div>
    </article>`;
  }

  function collectOrderBuilderItems(root = $('#modal-root')) {
    return $$('.order-builder-product', root).map((row) => ({
      productId: Number(row.dataset.productId || 0) || null,
      name: $('.order-builder-product-copy strong', row)?.textContent?.trim() || '',
      quantity: Number($('.order-qty', row)?.value || 0),
      unitPrice: Number(row.dataset.productPrice || 0),
      notes: $('.order-item-note', row)?.value?.trim() || '',
    })).filter((item) => item.quantity > 0);
  }

  function updateOrderBuilderSummary(root = $('#modal-root')) {
    const items = collectOrderBuilderItems(root);
    const subtotal = items.reduce((sum,item)=>sum+Number(item.unitPrice||0)*Number(item.quantity||0),0);
    const feeInput = $('[data-builder-delivery-fee]', root);
    const fulfillment = $('input[name="fulfillmentMethod"]:checked', root)?.value || $('input[name="fulfillmentMethod"]', root)?.value || 'delivery';
    const fee = fulfillment === 'delivery' ? Number(feeInput?.value || 0) : 0;
    const count = items.reduce((sum,item)=>sum+Number(item.quantity||0),0);
    $('[data-builder-count]', root)?.replaceChildren(document.createTextNode(`${count} ${count===1?'item':'itens'}`));
    $('[data-builder-subtotal]', root)?.replaceChildren(document.createTextNode(money(subtotal)));
    $('[data-builder-total]', root)?.replaceChildren(document.createTextNode(money(subtotal+fee)));
    $$('.order-builder-product', root).forEach((row)=>row.classList.toggle('selected',Number($('.order-qty',row)?.value||0)>0));
  }

  function bindOrderBuilder(root = $('#modal-root'), { onFulfillmentChange = null } = {}) {
    root.addEventListener('click',(event)=>{
      const step=event.target.closest('[data-qty-step]');
      if(step){
        const row=step.closest('.order-builder-product');
        const input=$('.order-qty',row); const display=$('.order-qty-display',row);
        const max=Number(row.dataset.productMax||99); const next=Math.max(0,Math.min(max,Number(input.value||0)+Number(step.dataset.qtyStep||0)));
        input.value=String(next); display.textContent=String(next); updateOrderBuilderSummary(root); return;
      }
      const note=event.target.closest('[data-toggle-item-note]');
      if(note){
        event.preventDefault();
        event.stopPropagation();
        const row=note.closest('.order-builder-product');
        const panel=row ? $('.order-item-note-panel',row) : null;
        if(!panel)return;
        const opening=panel.classList.contains('hidden');
        panel.classList.toggle('hidden',!opening);
        note.setAttribute('aria-expanded',String(opening));
        if(opening) requestAnimationFrame(()=>$('textarea',panel)?.focus());
        return;
      }
      const general=event.target.closest('[data-toggle-general-note]');
      if(general){
        const panel=$('[data-general-note-panel]',root); panel.classList.toggle('hidden');
        general.classList.toggle('active',!panel.classList.contains('hidden')); if(!panel.classList.contains('hidden')) $('textarea',panel)?.focus();
      }
    });
    $$('input[name="fulfillmentMethod"]',root).forEach((input)=>input.addEventListener('change',()=>{onFulfillmentChange?.(input.value);updateOrderBuilderSummary(root);}));
    $('[data-builder-delivery-fee]',root)?.addEventListener('input',()=>updateOrderBuilderSummary(root));
    root.addEventListener('input',(event)=>{
      const textarea=event.target.closest('.order-item-note');
      if(!textarea)return;
      const row=textarea.closest('.order-builder-product');
      const button=row ? $('[data-toggle-item-note]',row) : null;
      const hasNote=Boolean(textarea.value.trim());
      row?.classList.toggle('has-note',hasNote);
      button?.classList.toggle('has-note',hasNote);
    });
    updateOrderBuilderSummary(root);
  }

  function orderBuilderSummary() {
    return `<aside class="order-builder-summary"><div><span>Selecionados</span><strong data-builder-count>0 itens</strong></div><div><span>Subtotal</span><strong data-builder-subtotal>R$ 0,00</strong></div><div class="order-builder-summary-total"><span>Total</span><strong data-builder-total>R$ 0,00</strong></div></aside>`;
  }

  function renderOrderReviewBanner(conversation, session) {
    if (!session || session.stage !== 'awaiting_agent_review') return '';
    const cart = Array.isArray(session.cart) ? session.cart : [];
    const total = cart.reduce((sum,item)=>sum + Number(item.price || item.unitPrice || item.unit_price || 0) * Number(item.quantity || 1), Number(session.delivery_fee || 0));
    return `<section class="order-review-banner"><div class="order-review-icon">${icon('order',20)}</div><div class="order-review-copy"><strong>Pedido aguardando conferência</strong><span>${cart.map((item)=>`${item.quantity}x ${esc(item.name)}`).join(' · ') || 'Revise os itens informados pelo cliente'} · ${money(total)}</span></div><div class="order-review-actions"><button class="btn btn-outline btn-small" id="discard-ai-order" type="button">Descartar</button><button class="btn btn-primary btn-small" id="review-ai-order" type="button">Revisar pedido</button></div></section>`;
  }

  function openOrderReviewModal(conversation, session) {
    const cart = Array.isArray(session?.cart) ? session.cart : [];
    const pickup = session?.fulfillment_method === 'pickup';
    const reviewPayment = ({pix:'Pix',cash:'Dinheiro',card:'Cartão'})[String(session?.payment_method||'').toLowerCase()] || session?.payment_method || 'Pix';
    openModal('Revisar pedido antes da cozinha', `<form id="order-review-form" class="order-builder-form">
      <div class="order-review-notice">O cliente confirmou os dados, mas a cozinha só receberá depois da sua revisão.</div>
      ${reviewPayment==='Dinheiro'?`<div class="order-review-notice">💵 ${session?.needs_change&&session?.change_for?`Cliente pediu troco para ${money(session.change_for)}.`:'Cliente informou que não precisa de troco.'}</div>`:''}
      <section class="order-builder-section"><div class="order-builder-section-head"><div><span>1</span><div><strong>Itens do pedido</strong><small>Use − e + para ajustar as quantidades.</small></div></div></div><div class="order-builder-products">${cart.map((item,index)=>orderBuilderProductCard({ ...item, id:item.productId||item.product_id, price:item.price||item.unitPrice||item.unit_price },Number(item.quantity||1),item.notes||'',index)).join('')||'<p class="muted">Nenhum item identificado.</p>'}</div></section>
      <section class="order-builder-section"><div class="order-builder-section-head"><div><span>2</span><div><strong>Modalidade</strong><small>Escolha como o cliente receberá.</small></div></div></div><div class="builder-choice-grid"><label class="builder-choice"><input type="radio" name="fulfillmentMethod" value="delivery" ${pickup?'':'checked'}><span>🛵</span><div><strong>Entrega</strong><small>Enviar ao endereço</small></div></label><label class="builder-choice"><input type="radio" name="fulfillmentMethod" value="pickup" ${pickup?'checked':''}><span>🏪</span><div><strong>Retirada</strong><small>Cliente busca na loja</small></div></label></div></section>
      <section class="order-builder-section"><div class="order-builder-section-head"><div><span>3</span><div><strong>Dados finais</strong><small>Confira endereço, pagamento e taxa.</small></div></div><button type="button" class="order-general-note-button ${session?.customer_notes?'active':''}" data-toggle-general-note>📝 Observação</button></div><div class="form-grid order-builder-fields"><div class="field full" data-review-address><label>Endereço</label><textarea name="address" placeholder="Rua, número, bairro e referência">${esc(session?.address||'')}</textarea></div><div class="field"><label>Pagamento</label><div class="builder-payment-grid"><label><input type="radio" name="paymentMethod" value="Pix" ${reviewPayment==='Pix'?'checked':''}><span>⚡ Pix</span></label><label><input type="radio" name="paymentMethod" value="Dinheiro" ${reviewPayment==='Dinheiro'?'checked':''}><span>💵 Dinheiro</span></label><label><input type="radio" name="paymentMethod" value="Cartão" ${reviewPayment==='Cartão'?'checked':''}><span>💳 Cartão</span></label></div></div><div class="field"><label>Taxa de entrega</label><input name="deliveryFee" data-builder-delivery-fee type="number" min="0" step="0.01" value="${Number(session?.delivery_fee||0)}"></div><div class="field full ${session?.customer_notes?'':'hidden'}" data-general-note-panel><label>Observações gerais</label><textarea name="notes" placeholder="Troco, ponto da carne, adicionais...">${esc(session?.customer_notes||'')}</textarea></div></div></section>
      ${orderBuilderSummary()}
    </form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="approve-ai-order">Confirmar e enviar à cozinha</button>`, 'wide');
    $('.close-modal-action').addEventListener('click',closeModal);
    const root=$('#order-review-form');
    const sync=(value)=>{const isPickup=value==='pickup';$('[data-review-address]',root).classList.toggle('hidden',isPickup);$('[name=deliveryFee]',root).disabled=isPickup;if(isPickup)$('[name=deliveryFee]',root).value='0';};
    bindOrderBuilder(root,{onFulfillmentChange:sync}); sync($('input[name="fulfillmentMethod"]:checked',root)?.value||'delivery');
    $('#approve-ai-order').addEventListener('click',async()=>{
      const form=root; const button=$('#approve-ai-order');
      const items=collectOrderBuilderItems(form).map((item)=>({productId:item.productId,name:item.name,quantity:item.quantity,unitPrice:item.unitPrice,notes:item.notes}));
      const reviewData=new FormData(form);
      const selectedPayment=String(reviewData.get('paymentMethod')||'');
      const payload={items,fulfillmentMethod:reviewData.get('fulfillmentMethod'),address:form.elements.address.value.trim(),paymentMethod:selectedPayment,needsChange:selectedPayment==='Dinheiro'?Boolean(session?.needs_change):false,changeFor:selectedPayment==='Dinheiro'?(session?.change_for??null):null,deliveryFee:Number(form.elements.deliveryFee.value||0),notes:form.elements.notes?.value.trim()||''};
      button.disabled=true;
      const ok=await approveOrderReview(conversation,session,payload);
      if(ok)closeModal();else button.disabled=false;
    });
  }


  async function approveOrderReview(conversation,session,payload=null) {
    const cart=Array.isArray(session?.cart)?session.cart:[];
    const body=payload||{items:cart.map((item)=>({productId:item.productId||item.product_id,name:item.name,quantity:Number(item.quantity||1),unitPrice:Number(item.price||item.unitPrice||item.unit_price||0),notes:item.notes||''})),fulfillmentMethod:session?.fulfillment_method||'delivery',address:session?.address||'',paymentMethod:session?.payment_method||'',needsChange:Boolean(session?.needs_change),changeFor:session?.change_for??null,deliveryFee:Number(session?.delivery_fee||0),notes:session?.customer_notes||''};
    try{await api(`/conversations/${conversation.id}/order-review/approve`,{method:'POST',body:JSON.stringify(body)});toast('Pedido confirmado','A cozinha recebeu o pedido e o cliente foi avisado.');await selectConversation(conversation.id,false);return true;}catch(error){toast('Não foi possível confirmar',error.message,'error');return false;}
  }

  async function discardOrderReview(conversation) {
    const confirmed=await confirmAction('Cancelar pedido gerado pela IA','O pedido será removido sem enviar nenhuma mensagem ao cliente. O atendimento continuará manualmente.','Cancelar pedido',true);
    if(!confirmed)return;
    try{await api(`/conversations/${conversation.id}/order-review`,{method:'DELETE'});toast('Pedido cancelado','Nenhuma mensagem automática foi enviada ao cliente.');await selectConversation(conversation.id,false);}catch(error){toast('Não foi possível cancelar',error.message,'error');}
  }

  function deliveryStatusMarkup(m) {
    if (m.deleted_at || m.is_internal || !['agent','ai'].includes(m.sender_type)) return '';
    const status = m.delivery_status || 'sent';
    const labels = { pending: 'Aguardando envio', sent: 'Enviada', delivered: 'Entregue ao cliente', read: 'Lida pelo cliente', failed: 'Falha no envio' };
    const marks = status === 'pending'
      ? '<span class="status-clock">◷</span>'
      : status === 'failed'
        ? '<span class="status-error">!</span>'
        : status === 'sent'
          ? '<span class="status-check">✓</span>'
          : '<span class="status-check">✓</span><span class="status-check second">✓</span>';
    const detail = status === 'failed' && m.failed_reason ? `${labels.failed}: ${m.failed_reason}` : (labels[status] || status);
    return `<span class="message-status status-${esc(status)}" title="${esc(detail)}" data-tooltip="${esc(detail)}" aria-label="${esc(detail)}">${marks}</span>`;
  }


  function messageActionsMarkup(m) {
    if (m.deleted_at) {
      const deletedButtons = [
        { action: 'select', emoji: '☑️', label: 'Selecionar' },
        { action: 'delete', emoji: '🙈', label: 'Remover da minha tela' },
      ];
      return `<div class="message-actions" aria-label="Ações da mensagem">${deletedButtons.map((item) => `<button class="message-action" type="button" data-message-action="${item.action}" data-message-id="${m.id}" data-tooltip="${item.label}" aria-label="${item.label}">${item.emoji}</button>`).join('')}</div>`;
    }
    const buttons = [
      { action: 'reply', emoji: '↩️', label: 'Responder' },
      { action: 'select', emoji: '☑️', label: 'Selecionar' },
      { action: 'forward', emoji: '↪️', label: 'Encaminhar' },
      { action: 'pin', emoji: m.pinned ? '📍' : '📌', label: m.pinned ? 'Desafixar' : 'Fixar' },
      { action: 'react', emoji: '😀', label: 'Reagir' },
    ];
    const manager = ['admin','supervisor'].includes(state.user?.role);
    const own = Number(m.user_id) === Number(state.user?.id);
    if (!m.deleted_at && !m.is_internal && ['agent','ai'].includes(m.sender_type) && (manager || own)) {
      buttons.push({ action: 'delete', emoji: '🗑️', label: 'Excluir mensagem' });
    }
    if (m.delivery_status === 'failed' && !m.deleted_at) buttons.push({ action: 'retry', emoji: '🔁', label: 'Reenviar' });
    if (m.is_internal && !m.deleted_at) {
      buttons.push({ action: 'edit', emoji: '✏️', label: 'Editar nota' });
      buttons.push({ action: 'delete-note', emoji: '🗑️', label: 'Excluir nota' });
    }
    return `<div class="message-actions" aria-label="Ações da mensagem">${buttons.map((item) => `<button class="message-action" type="button" data-message-action="${item.action}" data-message-id="${m.id}" data-tooltip="${item.label}" aria-label="${item.label}">${item.emoji}</button>`).join('')}</div>`;
  }

  async function handleMessageAction(action, message, conversation) {
    if (!message || !action) return;
    if (action === 'reply') { setReplyMessage(message); return; }
    if (action === 'select') { toggleMessageSelection(message.id); return; }
    if (action === 'forward') {
      state.selectedMessageIds = new Set([Number(message.id)]);
      updateMessageSelectionBar();
      openForwardModal(conversation);
      return;
    }
    if (action === 'pin') {
      await api(`/messages/${message.id}/pin`, { method: 'PUT', body: JSON.stringify({ pinned: !message.pinned }) });
      toast(message.pinned ? 'Mensagem desafixada' : 'Mensagem fixada');
      await selectConversation(conversation.id, false);
      return;
    }
    if (action === 'react') { openReactionMenu(message, conversation); return; }
    if (action === 'retry') {
      try {
        await api(`/messages/${message.id}/retry`, { method: 'POST' });
        toast('Mensagem reenviada');
        await selectConversation(conversation.id, false);
      } catch (error) {
        toast('Falha ao reenviar', error.message, 'error');
      }
      return;
    }
    if (action === 'edit') { openEditInternalMessage(message, conversation); return; }
    if (action === 'delete') { openDeleteMessagesModal(conversation,[Number(message.id)],[message]); return; }
    if (action === 'delete-note') {
      openConfirm('Excluir nota interna','Esta nota será removida do atendimento.',async()=>{
        try {
          await api(`/messages/${message.id}`, { method: 'DELETE' });
          toast('Nota excluída');
          await selectConversation(conversation.id, false);
        } catch (error) {
          toast('Não foi possível excluir', error.message, 'error');
        }
      });
    }
  }

  function formatAudioTime(value) {
    const seconds = Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2,'0')}`;
  }

  function audioPlayerMarkup(m) {
    if (!m.media_url) return `<div class="chat-audio-unavailable">🎧 <span>Áudio indisponível para reprodução.</span></div>`;
    const mime = esc(String(m.mime_type || 'audio/ogg').split(';')[0]);
    return `<div class="chat-audio-player" data-audio-player>
      <button class="chat-audio-play" type="button" data-audio-play aria-label="Reproduzir áudio" data-tooltip="Reproduzir">▶</button>
      <div class="chat-audio-main"><input class="chat-audio-progress" data-audio-progress type="range" min="0" max="1000" value="0" aria-label="Progresso do áudio"><span data-audio-time>0:00 / 0:00</span></div>
      <button class="chat-audio-speed" type="button" data-audio-speed data-tooltip="Velocidade">1×</button>
      <audio data-audio-element preload="metadata"><source src="${esc(m.media_url)}" type="${mime}"></audio>
    </div>`;
  }

  function timelineDateKey(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return String(value||'').slice(0,10);
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  }

  function timelineDateLabel(value){
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return String(value||'').slice(0,10);
    const today=new Date(); today.setHours(0,0,0,0);
    const target=new Date(date); target.setHours(0,0,0,0);
    const diff=Math.round((today-target)/86400000);
    if(diff===0) return 'Hoje';
    if(diff===1) return 'Ontem';
    return date.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function renderMessageTimeline(messages=[]){
    let lastDate=''; let lastSession=null; const output=[];
    for(const message of messages){
      const dateKey=timelineDateKey(message.created_at);
      if(dateKey!==lastDate){
        output.push(`<div class="chat-date-divider"><span>${esc(timelineDateLabel(message.created_at))}</span></div>`);
        lastDate=dateKey;
      }
      const sessionId=Number(message.session_conversation_id||message.conversation_id||0);
      if(sessionId && sessionId!==lastSession){
        const stateLabel=message.session_closed_at?'Atendimento anterior':'Atendimento atual';
        output.push(`<div class="chat-session-divider"><span>${esc(stateLabel)}${message.session_protocol?` · ${esc(message.session_protocol)}`:''}</span><small>Iniciado em ${esc(dateTime(message.session_created_at||message.created_at))}</small></div>`);
        lastSession=sessionId;
      }
      output.push(renderMessage(message));
    }
    return output.join('');
  }

  function mediaDownloadMarkup(m){
    if(!m?.media_url) return '';
    const fileName=String(m.file_name||`${m.message_type||'midia'}-${m.id||Date.now()}`);
    return `<a class="message-media-download" href="${esc(m.media_url)}" download="${esc(fileName)}" data-tooltip="Baixar arquivo" aria-label="Baixar ${esc(fileName)}">${icon('download',16)}</a>`;
  }

  function replyQuoteMarkup(m){
    if(m.deleted_at||!m.reply_to_message_id) return '';
    const sender=m.reply_sender_type==='customer'?'Cliente':m.reply_sender_type==='ai'?'IA':m.reply_user_name||'Mensagem';
    const type=String(m.reply_message_type||'text');
    let preview='';
    if(m.reply_media_url&&['image','sticker'].includes(type)) preview=`<img src="${esc(m.reply_media_url)}" alt="${type==='sticker'?'Figurinha':'Imagem'} respondida">`;
    else if(type==='video') preview=`<span class="message-quote-media-icon">▶</span>`;
    else if(type==='audio') preview=`<span class="message-quote-media-icon">🎤</span>`;
    else if(type==='document') preview=`<span class="message-quote-media-icon">📎</span>`;
    const fallback={image:'Imagem',sticker:'Figurinha',video:'Vídeo',audio:'Áudio',document:'Documento'}[type]||'Mensagem';
    const content=String(m.reply_content||'').replace(/^\[(Imagem|Vídeo|Áudio|Figurinha|Documento)[^\]]*\]$/i,'').trim();
    return `<button type="button" class="message-quote" data-quote-target="${Number(m.reply_to_message_id)}" aria-label="Ir para a mensagem respondida"><span class="message-quote-body"><strong>${esc(sender)}</strong><span>${content?renderWhatsAppText(content.slice(0,150)):esc(fallback)}</span></span>${preview}</button>`;
  }

  function unavailableMediaMarkup(m){
    const labels={image:'Imagem',video:'Vídeo',audio:'Áudio',sticker:'Figurinha',document:'Documento'};
    return `<div class="message-media-unavailable">${icon('paperclip',17)}<span><strong>${esc(labels[m.message_type]||'Mídia')} indisponível</strong><small>O WhatsApp registrou o arquivo, mas não foi possível carregá-lo.</small></span></div>`;
  }

  function renderMessage(m){
    const type=m.is_internal?'internal':m.sender_type;
    const author=m.sender_type==='customer'?'Cliente':m.sender_type==='ai'?'IA':m.sender_type==='system'?'Sistema':m.sender_type==='internal'?`Interna · ${m.user_name||'Equipe'}`:m.user_name||'Atendente';
    const manager = ['admin','supervisor'].includes(state.user?.role);
    let body='';
    if(m.deleted_at){
      const deletedBy=m.deleted_by_name?` por ${esc(m.deleted_by_name)}`:'';
      const original=manager&&m.content?`<div class="message-deleted-original"><span>Conteúdo anterior:</span>${renderWhatsAppText(m.content)}</div>`:'';
      const deletedLabel=m.is_internal?'Nota interna removida':`Mensagem apagada para todos${deletedBy}`;
      body=`<div class="message-deleted-notice">🗑️ ${deletedLabel}</div>${original}`;
    }else{
      body=`<div class="message-text">${renderWhatsAppText(m.content)}</div>`;
      if(m.message_type==='image') body=m.media_url?`<div class="message-media-shell"><button type="button" class="message-media-open" data-open-media="${esc(m.media_url)}" data-media-type="image" data-file-name="${esc(m.file_name||'imagem')}"><img class="message-media message-image" src="${esc(m.media_url)}" alt="${esc(m.file_name||'Imagem')}" loading="lazy"></button>${mediaDownloadMarkup(m)}</div>${m.content&&!m.content.startsWith('[Imagem')?`<div class="message-caption">${renderWhatsAppText(m.content)}</div>`:''}`:unavailableMediaMarkup(m);
      if(m.message_type==='video') body=m.media_url?`<div class="message-media-shell"><video class="message-media message-video" src="${esc(m.media_url)}" controls preload="metadata" playsinline></video>${mediaDownloadMarkup(m)}</div>${m.content&&!m.content.startsWith('[Vídeo')?`<div class="message-caption">${renderWhatsAppText(m.content)}</div>`:''}`:unavailableMediaMarkup(m);
      if(m.message_type==='audio') body=m.media_url?audioPlayerMarkup(m):unavailableMediaMarkup(m);
      if(m.message_type==='sticker') body=m.media_url?`<div class="message-media-shell sticker-shell"><button type="button" class="message-media-open" data-open-media="${esc(m.media_url)}" data-media-type="sticker" data-file-name="${esc(m.file_name||'figurinha.webp')}"><img class="message-sticker" src="${esc(m.media_url)}" alt="${esc(m.file_name||'Figurinha')}" loading="lazy"></button>${mediaDownloadMarkup(m)}</div>`:unavailableMediaMarkup(m);
      if(m.message_type==='document') body=m.media_url?`<a class="message-document" href="${esc(m.media_url)}" download="${esc(m.file_name||'arquivo')}">${icon('paperclip',18)}<span><strong>${esc(m.file_name||'Documento')}</strong><small>${esc(m.mime_type||'Arquivo')}</small></span>${icon('download',17)}</a>`:unavailableMediaMarkup(m);
    }
    const reply=replyQuoteMarkup(m);
    const forwarded=!m.deleted_at&&m.forwarded_from_message_id?'<div class="forwarded-label">↪️ Encaminhada</div>':'';
    const reactions=!m.deleted_at?(m.reactions||[]).map((r)=>`<span title="${esc(r.user_name||'Equipe')}">${esc(r.emoji)}</span>`).join(''):'';
    return `<div class="message ${esc(type)} ${m.message_type==='audio'?'media-audio':''} ${m.pinned?'is-pinned':''} ${m.deleted_at?'is-deleted':''}" data-message-id="${m.id}" data-date-key="${esc(timelineDateKey(m.created_at))}" tabindex="0">
      <button class="message-select" type="button" data-message-select="${m.id}" aria-label="Selecionar mensagem"><span></span></button>
      ${messageActionsMarkup(m)}
      <strong class="message-author">${esc(author)}${m.pinned?'<span class="message-pin-badge" data-tooltip="Mensagem fixada" aria-label="Mensagem fixada">📌</span>':''}</strong>${forwarded}${reply}${body}
      ${reactions?`<div class="message-reactions">${reactions}</div>`:''}
      <div class="message-footer"><small class="message-time">${dateTime(m.created_at)}${m.edited_at?' · editada':''}</small>${deliveryStatusMarkup(m)}</div>
    </div>`;
  }

  function messagesNearBottom(container, threshold = 110) {
    return Boolean(container) && container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }

  function appendRealtimeMessage(conversationId, message) {
    if (!message || Number(conversationId) !== Number(state.selectedConversationId)) return false;
    const container = $('#messages');
    if (!container || container.querySelector(`.message[data-message-id="${Number(message.id)}"]`)) return Boolean(container);
    const shouldStick = messagesNearBottom(container);
    const lastMessage = container.querySelector('.message:last-of-type');
    const lastDateKey = lastMessage?.dataset.dateKey || '';
    const nextDateKey = timelineDateKey(message.created_at);
    const fragment = document.createElement('div');
    fragment.className = 'realtime-message-fragment';
    fragment.innerHTML = `${lastDateKey !== nextDateKey ? `<div class="chat-date-divider"><span>${esc(timelineDateLabel(message.created_at))}</span></div>` : ''}${renderMessage(message)}`;
    const nodes = [...fragment.childNodes];
    nodes.forEach((node)=>container.appendChild(node));
    const messageNode = container.querySelector(`.message[data-message-id="${Number(message.id)}"]`);
    if (messageNode) bindMessageActions(state.currentConversation || { id: conversationId }, [message], messageNode);
    if (shouldStick) requestAnimationFrame(()=>{ container.scrollTop = container.scrollHeight; });
    return true;
  }

  function renderComposer(){
    const emojis=['😀','😂','😍','👍','🙏','🎉','❤️','✅','🚚','🍔','🍟','🥤'];
    const quickItems = state.quickReplies.map((q)=>`<button type="button" class="library-item" data-reply="${esc(q.content)}" data-reply-id="${q.id}"><strong>${q.favorite?'⭐ ':''}${esc(q.title)}</strong><small>${esc(q.category||'Geral')} · ${esc(q.shortcut)}${Number(q.usage_count||0)?` · ${Number(q.usage_count)} usos`:''}</small></button>`).join('');
    const templateItems = state.templates.map((t)=>`<button type="button" class="library-item template-choice" data-template-id="${t.id}" data-body="${esc(t.body)}"><strong>${esc(t.name)}</strong><small>Template · ${esc(t.category)}</small></button>`).join('');
    return `<div class="chat-composer">
      <div id="reply-preview" class="reply-preview hidden"></div>
      <div class="composer-row">
        <div class="composer-tools">
          <div class="composer-action-wrap"><button class="composer-icon" id="quick-reply-button" type="button" data-tooltip="Mensagens predefinidas">${icon('template')}</button><div id="quick-reply-picker" class="composer-popover message-library hidden"><div class="popover-head"><strong>Mensagens predefinidas</strong><button type="button" class="popover-close" data-close-composer-popover>${icon('close',14)}</button></div><div class="popover-search">${icon('search',14)}<input id="quick-reply-search" placeholder="Buscar mensagem ou template"></div><div id="quick-reply-list">${quickItems}${templateItems||''}${!quickItems&&!templateItems?'<p class="muted">Nenhuma mensagem cadastrada.</p>':''}</div></div></div>
          <div class="composer-action-wrap"><button class="composer-icon" id="emoji-button" type="button" data-tooltip="Emojis">${icon('smile')}</button><div id="emoji-picker" class="composer-popover emoji-picker hidden">${emojis.map((e)=>`<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div></div>
          <div class="composer-action-wrap"><button class="composer-icon" id="sticker-button" type="button" data-tooltip="Figurinhas">${icon('sticker')}</button><div id="sticker-picker" class="composer-popover sticker-picker hidden">${state.stickers.map((sticker)=>`<button type="button" class="sticker-choice" data-sticker-id="${sticker.id}" title="${esc(sticker.name)}"><img src="${esc(sticker.source)}" alt="${esc(sticker.name)}"></button>`).join('')||'<p class="muted">Nenhuma figurinha.</p>'}</div></div>
          <button class="composer-icon" id="attachment-button" type="button" data-tooltip="Anexar arquivo">${icon('paperclip')}</button><input id="attachment-input" class="hidden" type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt">
          <button class="composer-icon internal-note-toggle" id="internal-toggle-button" type="button" data-tooltip="Mensagem interna">${icon('internal')}</button><input id="internal-message" class="hidden" type="checkbox">
        </div>
        <textarea id="message-input" rows="1" placeholder="Digite uma mensagem..."></textarea>
        <div class="composer-send-actions"><button class="composer-icon mic-button" id="audio-button" type="button" data-tooltip="Gravar áudio">${icon('mic')}</button><button id="send-message" class="send-button" aria-label="Enviar" data-tooltip="Enviar">${icon('send')}</button></div>
      </div><div id="recording-status" class="recording-status hidden"></div>
    </div>`;
  }

  function bindComposer(c){
    const input=$('#message-input'); if(!input) return;
    $('#send-message').addEventListener('click',()=>sendMessage(c.id));
    input.addEventListener('input',()=>autoGrowComposer(input));
    input.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage(c.id);}});
    const popoverIds=['emoji-picker','sticker-picker','quick-reply-picker','header-ai-tools'];
    const closeAll=()=>popoverIds.forEach((id)=>$(`#${id}`)?.classList.add('hidden'));
    const togglePopover=(id,event)=>{event.stopPropagation();const target=$(`#${id}`);if(!target)return;const opening=target.classList.contains('hidden');closeAll();target.classList.toggle('hidden',!opening);hideSmartTooltip();};
    $('#quick-reply-button')?.addEventListener('click',(event)=>togglePopover('quick-reply-picker',event));
    $('#emoji-button')?.addEventListener('click',(event)=>togglePopover('emoji-picker',event));
    $('#sticker-button')?.addEventListener('click',(event)=>togglePopover('sticker-picker',event));
    $('#header-ai-tools-button')?.addEventListener('click',(event)=>togglePopover('header-ai-tools',event));
    $$('[data-close-composer-popover]').forEach((button)=>button.addEventListener('click',closeAll));
    $$('[data-ai-tool]').forEach((button)=>button.addEventListener('click',async(event)=>{event.stopPropagation();closeAll();await runAiTool(c,button.dataset.aiTool,input);}));
    $('#undo-ai-tool')?.addEventListener('click',(event)=>{event.stopPropagation();if(state.lastComposerBeforeAi){input.value=state.lastComposerBeforeAi;autoGrowComposer(input);input.focus();toast('Texto anterior restaurado');}closeAll();});
    $$('.library-item[data-reply]').forEach((btn)=>btn.addEventListener('click',()=>{input.value=applyClientVariables(btn.dataset.reply,c);input.focus();autoGrowComposer(input);closeAll();if(btn.dataset.replyId)api(`/quick-replies/${btn.dataset.replyId}/use`,{method:'POST'}).catch(()=>{});}));
    $$('.template-choice').forEach((btn)=>btn.addEventListener('click',()=>{input.value=applyClientVariables(btn.dataset.body,c);input.focus();autoGrowComposer(input);closeAll();}));
    $('#quick-reply-search')?.addEventListener('input',(event)=>{const term=event.target.value.toLowerCase();$$('#quick-reply-list .library-item').forEach((item)=>item.classList.toggle('hidden',!item.textContent.toLowerCase().includes(term)));});
    $$('#emoji-picker [data-emoji]').forEach((btn)=>btn.addEventListener('click',()=>{insertAtCursor(input,btn.dataset.emoji);closeAll();}));
    $$('.sticker-choice').forEach((btn)=>btn.addEventListener('click',()=>sendSticker(c.id,Number(btn.dataset.stickerId))));
    $('#attachment-button')?.addEventListener('click',()=>$('#attachment-input').click());
    $('#attachment-input')?.addEventListener('change',(event)=>{const file=event.target.files?.[0];if(file)prepareAttachment(c.id,file);event.target.value='';});
    $('#audio-button')?.addEventListener('click',()=>toggleAudioRecording(c.id));
    $('#internal-toggle-button')?.addEventListener('click',()=>{const checkbox=$('#internal-message');checkbox.checked=!checkbox.checked;$('#internal-toggle-button').classList.toggle('state-on',checkbox.checked);$('#internal-toggle-button').classList.toggle('state-off',!checkbox.checked);input.placeholder=checkbox.checked?'Nota interna para a equipe...':'Digite uma mensagem...';toast(checkbox.checked?'Mensagem interna ativada':'Mensagem ao cliente ativada');});
    $('#internal-toggle-button')?.classList.add('state-off');
    const outside=(event)=>{if(!event.target.closest('.composer-action-wrap')&&!event.target.closest('.header-action-wrap'))closeAll();};
    document.addEventListener('click',outside,{once:true});
    bindSmartTooltips($('#chat-center'));
  }

  function autoGrowComposer(input) {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus(); autoGrowComposer(input);
  }

  function closeComposerPopovers() { ['emoji-picker','sticker-picker','quick-reply-picker','header-ai-tools'].forEach((id)=>$(`#${id}`)?.classList.add('hidden')); }

  async function sendSticker(conversationId, stickerId) {
    $('#sticker-picker')?.classList.add('hidden');
    try { await api(`/conversations/${conversationId}/sticker`, { method: 'POST', body: JSON.stringify({ stickerId }) }); await selectConversation(conversationId, false); }
    catch (error) { toast('Não foi possível enviar a figurinha', error.message, 'error'); }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(file); });
  }

  async function prepareAttachment(conversationId, file) {
    if (file.size > 12 * 1024 * 1024) return toast('Arquivo muito grande', 'O limite desta versão é 12 MB.', 'error');
    const dataUrl = await readFileAsDataUrl(file);
    const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document';
    const preview = type === 'image' ? `<img class="attachment-preview" src="${esc(dataUrl)}" alt="Prévia">` : type === 'video' ? `<video class="attachment-preview" src="${esc(dataUrl)}" controls></video>` : `<div class="document-preview">${icon('paperclip',28)}<strong>${esc(file.name)}</strong><span>${esc(file.type || 'Documento')}</span></div>`;
    openModal('Enviar anexo', `${preview}<div class="field"><label>Legenda opcional</label><textarea id="attachment-caption" placeholder="Escreva uma legenda..."></textarea></div>`, `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="confirm-attachment">Enviar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    $('#confirm-attachment').addEventListener('click', async () => {
      const button = $('#confirm-attachment'); button.disabled = true;
      try {
        await api(`/conversations/${conversationId}/media`, { method: 'POST', body: JSON.stringify({ dataUrl, mimeType: file.type, fileName: file.name, messageType: type, caption: $('#attachment-caption').value }) });
        closeModal(); await selectConversation(conversationId, false);
      } catch (error) { button.disabled = false; toast('Não foi possível enviar o anexo', error.message, 'error'); }
    });
  }

  function resetAudioRecorder(cancelRecording = false) {
    if (cancelRecording && state.mediaRecorder?.state === 'recording') {
      state.audioCancelled = true;
      try { state.mediaRecorder.stop(); } catch {}
    }
    state.audioStream?.getTracks?.().forEach((track)=>track.stop());
    state.audioStream = null;
    if (state.audioPreviewUrl) URL.revokeObjectURL(state.audioPreviewUrl);
    state.audioPreviewUrl = '';
    state.audioPreviewBlob = null;
    state.audioChunks = [];
    if (!state.mediaRecorder || state.mediaRecorder.state !== 'recording') state.mediaRecorder = null;
    const button=$('#audio-button'); const status=$('#recording-status');
    button?.classList.remove('recording');
    if(status){status.classList.add('hidden');status.innerHTML='';}
  }

  function renderAudioPreview(conversationId) {
    const status=$('#recording-status');
    if(!status || !state.audioPreviewBlob || !state.audioPreviewUrl)return;
    status.classList.remove('hidden');
    status.innerHTML=`<div class="audio-preview-bar"><audio src="${esc(state.audioPreviewUrl)}" controls preload="metadata"></audio><div class="audio-preview-actions"><button type="button" class="btn btn-outline btn-small" id="cancel-audio-preview">Cancelar</button><button type="button" class="btn btn-primary btn-small" id="send-audio-preview">${icon('send',14)} Enviar áudio</button></div></div>`;
    $('#cancel-audio-preview')?.addEventListener('click',()=>resetAudioRecorder());
    $('#send-audio-preview')?.addEventListener('click',async()=>{
      const button=$('#send-audio-preview');button.disabled=true;
      try{
        const dataUrl=await readFileAsDataUrl(state.audioPreviewBlob);
        await api(`/conversations/${conversationId}/audio`,{method:'POST',body:JSON.stringify({dataUrl,mimeType:state.audioPreviewBlob.type||'audio/webm'})});
        resetAudioRecorder();
        await selectConversation(conversationId,false);
      }catch(error){button.disabled=false;toast('Não foi possível enviar o áudio',error.message,'error');}
    });
  }

  async function toggleAudioRecording(conversationId) {
    const button = $('#audio-button'); const status = $('#recording-status');
    if (state.mediaRecorder?.state === 'recording') { state.mediaRecorder.stop(); return; }
    if (state.audioPreviewBlob) resetAudioRecorder();
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Gravação indisponível', 'Este navegador não liberou a gravação de áudio.', 'error');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true } });
      const supported=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      const mimeType=supported.find((type)=>MediaRecorder.isTypeSupported?.(type))||'';
      const recorder = mimeType ? new MediaRecorder(stream,{mimeType}) : new MediaRecorder(stream);
      state.mediaRecorder = recorder; state.audioChunks = []; state.audioStream=stream; state.audioCancelled=false;
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) state.audioChunks.push(event.data); });
      recorder.addEventListener('stop', () => {
        stream.getTracks().forEach((track) => track.stop());
        state.audioStream=null;
        button?.classList.remove('recording');
        const cancelled=state.audioCancelled;
        state.audioCancelled=false;
        const blob = new Blob(state.audioChunks, { type: recorder.mimeType || 'audio/webm' });
        state.mediaRecorder=null;state.audioChunks=[];
        if(cancelled || !blob.size){resetAudioRecorder();return;}
        state.audioPreviewBlob=blob;
        state.audioPreviewUrl=URL.createObjectURL(blob);
        renderAudioPreview(conversationId);
      });
      recorder.start(250); button?.classList.add('recording'); status?.classList.remove('hidden');
      if(status){status.innerHTML=`<div class="recording-live"><span class="recording-dot"></span><strong>Gravando áudio</strong><span>Fale normalmente e revise antes de enviar.</span><div><button type="button" class="btn btn-outline btn-small" id="cancel-audio-recording">Cancelar</button><button type="button" class="btn btn-primary btn-small" id="stop-audio-recording">Parar e ouvir</button></div></div>`;}
      $('#cancel-audio-recording')?.addEventListener('click',()=>{state.audioCancelled=true;recorder.stop();});
      $('#stop-audio-recording')?.addEventListener('click',()=>recorder.stop());
    } catch (error) { resetAudioRecorder(); toast('Microfone não autorizado', 'Permita o acesso ao microfone no navegador e tente novamente.', 'error'); }
  }


  async function runAiTool(conversation, action, input) {
    const current = input.value.trim();
    if (!['suggest','summary'].includes(action) && !current) return toast('Digite uma mensagem primeiro','','error');
    state.lastComposerBeforeAi = input.value;
    try {
      const result = await api(`/conversations/${conversation.id}/ai-tools`,{method:'POST',body:JSON.stringify({action,text:current})});
      if (action === 'summary') {
        openModal('Resumo do atendimento',`<div class="ai-summary-result">${esc(result.text).replace(/\n/g,'<br>')}</div>`,`<button class="btn btn-outline close-modal-action">Fechar</button><button class="btn btn-primary" id="use-ai-summary">Usar no campo</button>`);
        $('.close-modal-action').addEventListener('click',closeModal);
        $('#use-ai-summary').addEventListener('click',()=>{input.value=result.text;autoGrowComposer(input);closeModal();input.focus();});
      } else {
        input.value = result.text || current; autoGrowComposer(input); input.focus();
      }
    } catch (error) { toast('Ferramenta indisponível',error.message,'error'); }
  }

  async function sendMessage(id){
    const input=$('#message-input'); const content=input.value.trim(); if(!content)return;
    const internal=$('#internal-message')?.checked||false;
    const replyToMessageId=state.replyToMessage?.id||null;
    input.value='';
    try{
      const message=await api(`/conversations/${id}/messages`,{method:'POST',body:JSON.stringify({content,internal,replyToMessageId})});
      appendRealtimeMessage(id,message);
      state.replyToMessage=null;
      $('#reply-preview')?.classList.add('hidden');
    }catch(error){input.value=content;toast('Erro ao enviar',error.message,'error');}
  }

  function sitePaymentLabel(value) {
    return ({ pix:'Pix', card:'Cartão', cash:'Dinheiro', Pix:'Pix', Cartão:'Cartão', Dinheiro:'Dinheiro' })[value] || value || 'Não informado';
  }

  function siteOrderItems(order) {
    return (order?.items || []).map((item) => `${Number(item.quantity || 1)}x ${esc(item.name)}`).join(' · ');
  }

  function sortConversationOrders(orders = []) {
    const terminal = new Set(['delivered','picked_up','cancelled']);
    return [...orders].sort((left,right)=>{
      const leftTerminal = terminal.has(String(left?.status || '')) ? 1 : 0;
      const rightTerminal = terminal.has(String(right?.status || '')) ? 1 : 0;
      return leftTerminal - rightTerminal || Number(right?.id || 0) - Number(left?.id || 0);
    });
  }

  function siteOrderBanner(orders, conversationId = 0) {
    const allOrders = sortConversationOrders(Array.isArray(orders) ? orders : (orders ? [orders] : []));
    const active = allOrders.filter((order)=>!['delivered','picked_up','cancelled'].includes(String(order.status || '')));
    if (!active.length) return '';
    const dismissKey = `gm_order_banner_${Number(conversationId || 0)}_${Number(active[0]?.id || 0)}`;
    if (sessionStorage.getItem(dismissKey) === '1') return '';
    const shown = active.slice(0,4);
    return `<section class="conversation-orders-banner">
      <div class="conversation-orders-banner-head"><div><span class="site-order-banner-icon">🛒</span><div><strong>Pedidos desta conversa</strong><small>${active.length} ${active.length===1?'pedido ativo':'pedidos ativos'}</small></div></div><div class="conversation-orders-banner-tools">${active.length>shown.length?`<span class="tag">+${active.length-shown.length} anteriores</span>`:''}<button type="button" class="icon-button order-banner-close" data-order-banner-close data-dismiss-key="${esc(dismissKey)}" aria-label="Fechar pedidos desta conversa" data-tooltip="Fechar">${icon('close',16)}</button></div></div>
      <div class="conversation-order-strip">${shown.map((order)=>{
        const awaiting=order.status==='new';
        return `<article class="conversation-order-chip ${awaiting?'awaiting':''}"><div><strong>#${String(order.id).padStart(4,'0')}</strong>${statusBadge(order.status)}</div><p>${siteOrderItems(order)||'Sem itens'} · ${money(order.total)}</p><footer>${order.fulfillment_method==='table'?`<span>🍽️ ${esc(order.table_name||'Mesa')}</span>`:`<span>${order.fulfillment_method==='pickup'?'🏪 Retirada':'🛵 Entrega'}</span>`}<div>${awaiting?`<button class="btn btn-primary btn-small" type="button" data-site-order-confirm="${order.id}">Confirmar</button>`:''}<button class="btn btn-soft btn-small" type="button" data-site-order-edit="${order.id}">${awaiting?'Revisar':'Abrir'}</button></div></footer></article>`;
      }).join('')}</div>
    </section>`;
  }

  function bindSiteOrderBannerClose(conversationId) {
    $$('[data-order-banner-close]').forEach((button)=>button.addEventListener('click',(event)=>{
      event.preventDefault();
      event.stopPropagation();
      sessionStorage.setItem(button.dataset.dismissKey || `gm_order_banner_${conversationId}`, '1');
      button.closest('.conversation-orders-banner')?.remove();
    }));
  }

  function siteOrderDetail(order) {
    const items = Array.isArray(order?.items) ? order.items : [];
    const fulfillment = order.fulfillment_method === 'table'
      ? `🍽️ ${esc(order.table_name || 'Mesa')}`
      : order.fulfillment_method === 'pickup' ? '🏪 Retirada na loja' : '🛵 Entrega';
    const canManage = ['new','confirmed'].includes(String(order.status || ''));
    return `<div class="site-order-detail ${order.status==='new'?'awaiting':''}">
      <div class="site-order-detail-items">${items.map((item)=>`<div><span><strong>${Number(item.quantity||1)}x</strong> ${esc(item.name)}${item.notes?`<small>📝 ${esc(item.notes)}</small>`:''}</span><strong>${money(Number(item.unit_price||0)*Number(item.quantity||1))}</strong></div>`).join('') || '<p class="muted">Nenhum item registrado.</p>'}</div>
      <div class="site-order-detail-grid">
        <div><span>Modalidade</span><strong>${fulfillment}</strong></div>
        ${order.fulfillment_method==='delivery'?`<div class="full"><span>Endereço</span><strong>${esc(order.address||'Não informado')}</strong></div>`:''}
        ${order.fulfillment_method==='table'?'':`<div><span>Pagamento</span><strong>${esc(sitePaymentLabel(order.payment_method))}${order.payment_method==='cash'?(order.needs_change&&order.change_for?` · Troco para ${money(order.change_for)}`:' · Sem troco'):''}</strong></div>`}
        <div><span>Total</span><strong>${money(order.total)}</strong></div>
        ${order.notes?`<div class="full"><span>Observações gerais</span><strong>${esc(order.notes)}</strong></div>`:''}
      </div>
      <div class="site-order-detail-actions">
        ${order.status==='new'?`<button class="btn btn-primary btn-small" type="button" data-site-order-confirm="${order.id}">Confirmar pedido</button>`:''}
        <button class="btn btn-soft btn-small" type="button" data-site-order-edit="${order.id}">${canManage?'Revisar pedido':'Abrir detalhes'}</button>
        ${canManage?`<button class="btn btn-danger btn-small" type="button" data-site-order-cancel="${order.id}">Cancelar</button>`:''}
      </div>
    </div>`;
  }

  function siteOrderAccordion(orders, { openFirst = false, history = false } = {}) {
    return orders.map((order,index)=>`<details class="conversation-order-detail ${history?'is-history':''}" ${openFirst&&index===0?'open':''}><summary><div><strong>#${String(order.id).padStart(4,'0')}</strong><small>${siteOrderItems(order)||'Sem itens'}</small></div><div>${statusBadge(order.status)}<span>${money(order.total)}</span>${icon('chevronDown',14)}</div></summary>${siteOrderDetail(order)}</details>`).join('');
  }

  function siteOrderDetailList(orders) {
    const list = sortConversationOrders(Array.isArray(orders) ? orders : (orders ? [orders] : []));
    if (!list.length) return '';
    const active = list.filter((order)=>!['delivered','picked_up','cancelled'].includes(String(order.status || '')));
    const history = list.filter((order)=>['delivered','picked_up','cancelled'].includes(String(order.status || '')));
    return `<div class="detail-section conversation-orders-detail">
      <div class="conversation-orders-detail-title"><div><span class="site-order-kicker">PEDIDOS DA CONVERSA</span><h4>${active.length ? `${active.length} ${active.length===1?'pedido atual':'pedidos atuais'}` : 'Histórico de pedidos'}</h4></div><span>${active.length?'Ativos primeiro':'Nenhum pedido ativo'}</span></div>
      ${active.length?`<div class="conversation-orders-accordion">${siteOrderAccordion(active,{openFirst:true})}</div>`:''}
      ${history.length?`<div class="conversation-order-history-title"><span>Histórico</span><small>${history.length} ${history.length===1?'pedido encerrado':'pedidos encerrados'}</small></div><div class="conversation-orders-accordion history">${siteOrderAccordion(history,{history:true})}</div>`:''}
    </div>`;
  }


  async function confirmSiteOrder(orderId, conversationId) {
    const buttons = $$(`[data-site-order-confirm="${orderId}"]`);
    const originals = buttons.map((button)=>button.innerHTML);
    buttons.forEach((button)=>{button.disabled=true;button.classList.add('is-loading');button.innerHTML='<span class="button-spinner"></span> Confirmando…';});
    try {
      await api(`/orders/${orderId}/status`, { method:'PUT', body:JSON.stringify({ status:'confirmed' }) });
      toast('Pedido confirmado', `Pedido #${String(orderId).padStart(4,'0')} enviado para a cozinha.`);
      await selectConversation(conversationId, false);
    } catch (error) {
      buttons.forEach((button,index)=>{button.disabled=false;button.classList.remove('is-loading');button.innerHTML=originals[index]||'Confirmar';});
      toast('Não foi possível confirmar', error.message, 'error');
    }
  }

  function bindSiteOrderActions(conversation, orders) {
    const list = Array.isArray(orders) ? orders : (orders ? [orders] : []);
    for (const order of list) {
      $$(`[data-site-order-confirm="${order.id}"]`).forEach((button)=>button.addEventListener('click',()=>confirmSiteOrder(order.id,conversation.id)));
      $$(`[data-site-order-edit="${order.id}"]`).forEach((button)=>button.addEventListener('click',()=>openOrderEditModal(order.id,()=>selectConversation(conversation.id,false))));
      $$(`[data-site-order-cancel="${order.id}"]`).forEach((button)=>button.addEventListener('click',()=>openCancelOrderModal(order.id,()=>selectConversation(conversation.id,false))));
    }
  }

  function pendingOrderDetail(session) {
    if (!session || session.stage !== 'awaiting_agent_review') return '';
    const cart=Array.isArray(session.cart)?session.cart:[];
    const subtotal=cart.reduce((sum,item)=>sum+Number(item.price||item.unitPrice||item.unit_price||0)*Number(item.quantity||1),0);
    const fee=session.fulfillment_method==='pickup'?0:Number(session.delivery_fee||0);
    return `<div class="detail-section pending-ai-order">
      <div class="pending-order-title"><span>🤖</span><div><h4>Pedido montado pela IA</h4><small>Aguardando sua conferência</small></div></div>
      <div class="pending-order-items">${cart.map((item)=>`<div><span>${Number(item.quantity||1)}x ${esc(item.name)}</span><strong>${money(Number(item.price||item.unitPrice||item.unit_price||0)*Number(item.quantity||1))}</strong>${item.notes?`<small>${esc(item.notes)}</small>`:''}</div>`).join('')||'<p class="muted">Nenhum item identificado.</p>'}</div>
      <div class="detail-row"><span>Modalidade</span><strong>${session.fulfillment_method==='pickup'?'Retirada':'Entrega'}</strong></div>
      ${session.fulfillment_method==='delivery'?`<div class="pending-order-info"><span>Endereço</span><p>${esc(session.address||'Não informado')}</p></div>`:''}
      <div class="detail-row"><span>Pagamento</span><strong>${esc(session.payment_method||'Não informado')}${session.payment_method==='Dinheiro'?(session.needs_change&&session.change_for?` · Troco para ${money(session.change_for)}`:' · Sem troco'):''}</strong></div>
      <div class="detail-row"><span>Total estimado</span><strong>${money(subtotal+fee)}</strong></div>
      <div class="pending-order-actions"><button class="btn btn-outline btn-small" id="detail-review-ai-order" type="button">Revisar</button><button class="btn btn-danger btn-small" id="detail-cancel-ai-order" type="button">Cancelar</button><button class="btn btn-primary btn-small" id="detail-approve-ai-order" type="button">Confirmar</button></div>
    </div>`;
  }

  function renderChatDetail(c,transfers=[],orderSession=null,conversationOrders=[],customerHistory=null,orderChangeRequests=[]){
    $('#chat-detail').innerHTML=`
      <div class="detail-section detail-profile"><span class="conversation-avatar">${initials(c.contact_name)}</span><h3>${esc(c.contact_name)}</h3><p>+${esc(c.phone)}</p><div class="detail-profile-tags">${statusBadge(c.status)}${c.table_name?`<span class="tag table-tag">${esc(c.table_name)}</span>`:''}</div></div>
      <div class="detail-action-icons">
        ${c.status!=='closed'?`<button class="icon-button primary-icon" id="detail-order" data-tooltip="Criar pedido">${icon('order',17)}</button><button class="icon-button" id="detail-transfer" data-tooltip="Transferir">${icon('transfer',17)}</button><button class="icon-button" id="detail-priority" data-tooltip="Prioridade">${icon('flag',17)}</button>`:''}
        <button class="icon-button" id="detail-contact" data-tooltip="Editar cliente">${icon('edit',17)}</button>
      </div>
      ${pendingOrderDetail(orderSession)}
      ${siteOrderDetailList(conversationOrders)}
      ${orderChangeRequests.some((item)=>item.status==='pending')?`<div class="detail-section change-request-panel"><h4 class="detail-title">✏️ Alteração solicitada</h4>${orderChangeRequests.filter((item)=>item.status==='pending').map((item)=>`<div class="change-request-item"><strong>Pedido #${String(item.order_id).padStart(4,'0')}</strong><p>${esc(item.request_text)}</p><small>${dateTime(item.created_at)}</small><button class="btn btn-soft btn-small resolve-change-request" data-id="${item.id}">Marcar como resolvida</button></div>`).join('')}</div>`:''}
      ${customerHistory?`<div class="detail-section customer-history-mini"><h4 class="detail-title">Histórico do cliente</h4>${customerHistory.frequentAddress?`<div class="detail-row"><span>Endereço frequente</span><strong>${esc(customerHistory.frequentAddress.address)}</strong></div>`:''}${customerHistory.topProducts?.length?`<div class="history-top-products">${customerHistory.topProducts.slice(0,3).map((item)=>`<span>${Number(item.quantity)}x ${esc(item.name)}</span>`).join('')}</div>`:''}<div class="recent-order-list">${(customerHistory.orders||[]).slice(0,3).map((order)=>`<div><span>#${String(order.id).padStart(4,'0')} · ${statusLabels[order.status]||order.status}</span><strong>${money(order.total)}</strong><button class="icon-button repeat-order" data-id="${order.id}" data-tooltip="Repetir pedido">${icon('refresh',14)}</button></div>`).join('')||'<small class="muted">Nenhum pedido anterior.</small>'}</div><button class="btn btn-soft btn-small" id="open-full-customer-history">Ver histórico completo</button></div>`:''}
      <div class="detail-section"><h4 class="detail-title">Atendimento</h4><div class="detail-row"><span>Protocolo</span><strong>${esc(c.protocol)}</strong></div><div class="detail-row"><span>Fila</span><strong>${esc(c.queue_name)}</strong></div><div class="detail-row"><span>Responsável</span><strong>${esc(c.assigned_user_name||'Não atribuído')}</strong></div><div class="detail-row"><span>Prioridade</span><strong>${c.priority==='urgent'?'Urgente':c.priority==='high'?'Alta':'Normal'}</strong></div><div class="detail-row"><span>IA</span><strong>${c.ai_enabled?'Ligada':'Desligada'}</strong></div></div>
      <div class="detail-section"><h4 class="detail-title">Etiquetas</h4><div class="tag-list">${[...(c.origin==='website'?['Site']:[]),...(c.table_name?[c.table_name]:[]),...(c.tags||[]).filter((tag)=>!['site',String(c.table_name||'').toLowerCase()].includes(String(tag).toLowerCase()))].map((tag)=>`<span class="tag ${String(tag).toLowerCase()==='site'?'site-tag':String(tag)===String(c.table_name||'')?'table-tag':''}">${esc(tag)}</span>`).join('')||'<span class="muted">Sem etiquetas</span>'}</div></div>
      <div class="detail-section"><h4 class="detail-title">Observações</h4><div class="detail-notes">${esc(c.notes||'Nenhuma observação.')}</div></div>
      ${transfers.length?`<div class="detail-section"><h4 class="detail-title">Transferências</h4><div class="transfer-history-mini">${transfers.slice(0,5).map((item)=>`<div><span>${icon('transfer',13)}</span><p><strong>${esc(item.created_by_name||'Sistema')}</strong><small>${esc(item.to_user_name?`Para ${item.to_user_name}`:`Para ${item.to_queue_name||'fila'}`)} · ${dateTime(item.created_at)}</small></p></div>`).join('')}</div></div>`:''}
      ${c.status==='closed'?`<div class="detail-section"><h4 class="detail-title">Encerramento</h4><div class="detail-notes"><strong>${esc(c.close_reason_text||'Motivo não informado')}</strong><br><span>${esc(c.closed_by_user_name||'Sistema')} · ${c.closed_at?dateTime(c.closed_at):''}</span></div></div>`:''}`;
    $('#detail-order')?.addEventListener('click',()=>openOrderModal(c));
    $('#detail-transfer')?.addEventListener('click',()=>openTransferModal(c));
    $('#detail-priority')?.addEventListener('click',()=>openPriorityMenu(c));
    $('#detail-contact')?.addEventListener('click',()=>openContactModal({id:c.contact_id,name:c.contact_name,phone:c.phone,email:c.email||'',notes:c.notes||'',tags:c.tags||[]}));
    $$('.repeat-order', $('#chat-detail')).forEach((button)=>button.addEventListener('click',()=>repeatCustomerOrder(Number(button.dataset.id),c.id)));
    $('#open-full-customer-history')?.addEventListener('click',()=>openCustomerHistoryModal(c.contact_id,c.id));
    $$('.resolve-change-request', $('#chat-detail')).forEach((button)=>button.addEventListener('click',async()=>{await api(`/order-change-requests/${button.dataset.id}/resolve`,{method:'PUT'});toast('Solicitação resolvida');await selectConversation(c.id,false);}));
    $('#detail-review-ai-order')?.addEventListener('click',()=>openOrderReviewModal(c,orderSession));
    $('#detail-approve-ai-order')?.addEventListener('click',()=>approveOrderReview(c,orderSession));
    $('#detail-cancel-ai-order')?.addEventListener('click',()=>discardOrderReview(c));
  }

  async function repeatCustomerOrder(orderId, conversationId) {
    const confirmed = await confirmAction('Repetir pedido', `Deseja copiar os itens do pedido #${String(orderId).padStart(4,'0')} para este atendimento?`, 'Repetir pedido');
    if (!confirmed) return;
    try {
      await api(`/orders/${orderId}/repeat`, { method:'POST', body:JSON.stringify({ conversationId }) });
      toast('Pedido repetido', 'Os itens foram enviados para a cozinha com os preços e estoque atuais.');
      if (state.selectedConversationId) await selectConversation(state.selectedConversationId,false);
    } catch (error) { toast('Não foi possível repetir', error.message, 'error'); }
  }

  async function openCustomerHistoryModal(contactId, conversationId = null) {
    const history = await api(`/contacts/${contactId}/history`);
    openModal(`Histórico · ${history.name}`, `<div class="customer-history-modal">
      <div class="history-summary-cards"><div><small>Pedidos recentes</small><strong>${history.orders.length}</strong></div><div><small>Atendimentos registrados</small><strong>${history.conversations.length}</strong></div><div><small>Endereço frequente</small><strong>${esc(history.frequentAddress?.address||'Não identificado')}</strong></div></div>
      <section><h4>Sessões de atendimento</h4><div class="contact-session-list">${history.conversations.map((item)=>`<article><div><strong>${esc(item.protocol||`Atendimento #${item.id}`)}</strong><span class="session-state ${item.status==='closed'?'closed':'active'}">${item.status==='closed'?'Finalizado':'Em andamento'}</span></div><p>${esc(item.last_message||'Sem mensagem registrada')}</p><small>${dateTime(item.created_at)}${item.closed_at?` até ${dateTime(item.closed_at)}`:''}</small></article>`).join('')||'<p>Nenhum atendimento registrado.</p>'}</div><small class="muted">Ao abrir a conversa, as mensagens de todas essas sessões aparecem juntas, separadas por data.</small></section>
      <section><h4>Produtos mais pedidos</h4><div class="history-top-products">${history.topProducts.map((item)=>`<span>${item.quantity}x ${esc(item.name)}</span>`).join('')||'<span>Nenhum produto ainda.</span>'}</div></section>
      <section><h4>Observações</h4><p>${esc(history.notes||'Nenhuma observação cadastrada.')}</p></section>
      <section><h4>Últimos pedidos</h4><div class="history-order-cards">${history.orders.map((order)=>`<article><div><strong>#${String(order.id).padStart(4,'0')}</strong>${statusBadge(order.status)}</div><p>${order.items.map((item)=>`${item.quantity}x ${esc(item.name)}`).join(', ')}</p>${order.cancel_reason?`<small>Cancelado: ${esc(order.cancel_reason)}</small>`:''}<footer><span>${dateTime(order.created_at)} · ${money(order.total)}</span>${conversationId&&!['cancelled'].includes(order.status)?`<button class="btn btn-soft btn-small modal-repeat-order" data-id="${order.id}">Repetir pedido</button>`:''}</footer></article>`).join('')||'<p>Nenhum pedido registrado.</p>'}</div></section>
    </div>`, `<button class="btn btn-outline close-modal-action">Fechar</button><button class="btn btn-primary" id="open-complete-contact-chat">Abrir conversa completa</button>`, 'wide');
    $('.close-modal-action').addEventListener('click',closeModal);
    $$('.modal-repeat-order').forEach((button)=>button.addEventListener('click',async()=>{closeModal();await repeatCustomerOrder(Number(button.dataset.id),conversationId);}));
    $('#open-complete-contact-chat').addEventListener('click',async()=>{
      const button=$('#open-complete-contact-chat');button.disabled=true;
      try{
        let targetId=Number(conversationId||0);
        if(!targetId){const opened=await api('/conversations/open',{method:'POST',body:JSON.stringify({contactId:Number(contactId)})});targetId=Number(opened.id);}
        closeModal();state.conversationStatus='all';state.selectedConversationId=targetId;await navigate('chats');await selectConversation(targetId,false);
      }catch(error){button.disabled=false;toast('Não foi possível abrir a conversa',error.message,'error');}
    });
  }

  async function openOrderModal(conversation) {
    const [products, orderConfig] = await Promise.all([api('/products'), api('/order-config')]);
    const activeProducts = products.filter((product) => product.active);
    openModal('Criar pedido', `
      <div class="order-customer order-builder-customer"><span class="conversation-avatar">${initials(conversation.contact_name)}</span><div><strong>${esc(conversation.contact_name)}</strong><small>+${esc(conversation.phone)}</small></div></div>
      <form id="order-form" class="order-builder-form">
        <section class="order-builder-section"><div class="order-builder-section-head"><div><span>1</span><div><strong>Escolha os produtos</strong><small>Use os botões − e +. Toque em 📝 para adicionar observação.</small></div></div></div><div class="order-builder-products">${activeProducts.map((product,index)=>orderBuilderProductCard(product,0,'',index)).join('') || '<p class="muted">Nenhum produto ativo.</p>'}</div></section>
        <section class="order-builder-section"><div class="order-builder-section-head"><div><span>2</span><div><strong>Modalidade</strong><small>Defina entrega ou retirada.</small></div></div></div><div class="builder-choice-grid"><label class="builder-choice"><input type="radio" name="fulfillmentMethod" value="delivery" checked><span>🛵</span><div><strong>Entrega</strong><small>Enviar ao endereço do cliente</small></div></label><label class="builder-choice"><input type="radio" name="fulfillmentMethod" value="pickup"><span>🏪</span><div><strong>Retirada</strong><small>Cliente busca na loja</small></div></label></div></section>
        <section class="order-builder-section"><div class="order-builder-section-head"><div><span>3</span><div><strong>Dados do pedido</strong><small>Preencha somente o necessário.</small></div></div><button type="button" class="order-general-note-button" data-toggle-general-note>📝 Observação geral</button></div><div class="form-grid order-builder-fields"><div class="field full" id="order-address-field"><label>Endereço de entrega</label><textarea name="address" rows="2" placeholder="Rua, número, bairro e referência"></textarea></div><div class="field full hidden" id="order-pickup-info"><div class="info-box"><strong>🏪 Retirada na loja</strong><p>${esc(orderConfig.pickupAddress || 'Endereço não configurado')}</p></div></div><div class="field"><label>Taxa de entrega</label><input name="deliveryFee" id="order-delivery-fee" data-builder-delivery-fee type="number" step="0.01" min="0" value="${Number(orderConfig.deliveryFee || 0).toFixed(2)}"></div><div class="field"><label>Forma de pagamento</label><div class="builder-payment-grid"><label><input type="radio" name="paymentMethod" value="Pix" checked><span>⚡ Pix</span></label><label><input type="radio" name="paymentMethod" value="Dinheiro"><span>💵 Dinheiro</span></label><label><input type="radio" name="paymentMethod" value="Cartão"><span>💳 Cartão</span></label></div></div><div class="field full hidden" data-general-note-panel><label>Observações gerais</label><textarea name="notes" rows="3" placeholder="Troco, referência ou observações para a cozinha"></textarea></div></div></section>
        ${orderBuilderSummary()}
      </form>`,
      `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="confirm-order">Confirmar e avisar cozinha</button>`, 'wide');
    $('.close-modal-action').addEventListener('click', closeModal);
    const formRoot=$('#order-form');
    const syncFulfillment = (value) => {
      const pickup = value === 'pickup';
      $('#order-address-field').classList.toggle('hidden', pickup);
      $('#order-pickup-info').classList.toggle('hidden', !pickup);
      $('#order-delivery-fee').disabled = pickup;
      if (pickup) $('#order-delivery-fee').value = '0.00';
      else if (!Number($('#order-delivery-fee').value)) $('#order-delivery-fee').value = Number(orderConfig.deliveryFee || 0).toFixed(2);
    };
    bindOrderBuilder(formRoot,{onFulfillmentChange:syncFulfillment});
    $('#confirm-order').addEventListener('click', async () => {
      const items = collectOrderBuilderItems(formRoot).map((item)=>({productId:item.productId,quantity:item.quantity,notes:item.notes}));
      if(!items.length) return toast('Escolha ao menos um produto','Use o botão + para adicionar itens.','error');
      const form = Object.fromEntries(new FormData(formRoot).entries());
      form.deliveryFee = form.fulfillmentMethod === 'pickup' ? 0 : Number($('#order-delivery-fee').value || 0);
      const button=$('#confirm-order'); button.disabled=true;
      try {
        const order = await api('/orders', { method: 'POST', body: JSON.stringify({ ...form, conversationId: conversation.id, items }) });
        closeModal();
        toast(`Pedido #${String(order.id).padStart(4, '0')} confirmado`, 'A cozinha recebeu a modalidade e os dados do pedido.');
        await selectConversation(conversation.id, false);
      } catch (error) { button.disabled=false; toast('Não foi possível criar o pedido', error.message, 'error'); }
    });
  }


  async function toggleAi(c) {
    try { await api(`/conversations/${c.id}/ai`, { method: 'POST', body: JSON.stringify({ enabled: !c.ai_enabled }) }); await selectConversation(c.id); toast('IA atualizada', !c.ai_enabled ? 'A IA voltou a responder esta conversa.' : 'O atendimento ficou sob controle humano.'); } catch (error) { toast('Não foi possível alterar', error.message, 'error'); }
  }
  async function assignChat(c) {
    try { await api(`/conversations/${c.id}/assign`, { method: 'POST', body: JSON.stringify({ userId: state.user.id }) }); await selectConversation(c.id); toast('Atendimento assumido'); } catch (error) { toast('Erro', error.message, 'error'); }
  }

  async function claimOldestConversation() {
    const button = $('#claim-oldest');
    if (button) button.disabled = true;
    try {
      const queueId = state.conversationQueue === 'all' ? null : Number(state.conversationQueue);
      const conversation = await api('/conversations/claim-oldest', { method: 'POST', body: JSON.stringify({ queueId }) });
      state.selectedConversationId = conversation.id;
      toast('Atendimento assumido', `${conversation.contact_name} foi retirado da fila.`);
      await refreshConversationList();
      await selectConversation(conversation.id);
    } catch (error) { toast('Não foi possível puxar', error.message, 'error'); }
    finally { if (button?.isConnected) button.disabled = false; }
  }

  async function getTransferOptions(force = false) {
    if (!state.transferOptions || force) state.transferOptions = await api('/transfer-options');
    return state.transferOptions;
  }

  async function openTransferModal(conversation) {
    const options = await getTransferOptions(true);
    const statusRank={online:0,busy:1,paused:2,offline:3};
    const users=[...options.users].filter((user)=>Number(user.id)!==Number(state.user?.id)).sort((a,b)=>(a.available?0:1)-(b.available?0:1)||(statusRank[a.status]??4)-(statusRank[b.status]??4)||String(a.name).localeCompare(String(b.name),'pt-BR'));
    const online = users.filter((user) => user.available);
    const statusLabel=(user)=>user.available?'Online':user.status==='paused'?'Pausado':user.status==='busy'?'Ocupado':'Offline';
    openModal(`Transferir atendimento de ${conversation.contact_name}`, `
      <form id="transfer-form" class="transfer-form">
        <div class="transfer-mode-grid">
          <label class="transfer-mode active"><input type="radio" name="type" value="user" checked><span>${icon('users',20)}</span><strong>Atendente</strong><small>Escolher uma pessoa específica</small></label>
          <label class="transfer-mode"><input type="radio" name="type" value="queue"><span>${icon('queue',20)}</span><strong>Fila</strong><small>Enviar para outro setor</small></label>
          <label class="transfer-mode"><input type="radio" name="type" value="auto"><span>${icon('transfer',20)}</span><strong>Automática</strong><small>Menor carga disponível</small></label>
        </div>
        <div class="field full" id="transfer-queue-field"><label>Fila de destino</label><select name="queueId">${options.queues.map((queue) => `<option value="${queue.id}" ${Number(queue.id) === Number(conversation.queue_id) ? 'selected' : ''}>${esc(queue.name)}</option>`).join('')}</select></div>
        <div class="field full" id="transfer-user-field"><label>Atendente de destino</label><div class="agent-transfer-list">${users.map((user) => `<label class="agent-transfer-option status-${esc(user.status)} ${user.available ? 'is-online' : 'is-unavailable'}"><input type="radio" name="userId" value="${user.id}" ${user.id === online[0]?.id ? 'checked' : ''}><span class="avatar">${initials(user.name)}</span><div><strong>${esc(user.name)}</strong><small>${esc(user.sector||'Atendimento')} · ${statusLabel(user)} · ${user.open_count || 0} atendimentos</small></div><i class="availability-dot ${user.available ? 'online' : user.status==='paused'?'paused':user.status==='busy'?'busy':'offline'}"></i></label>`).join('') || '<p class="muted">Nenhum atendente cadastrado.</p>'}</div></div>
        <div class="field full"><label>Observação da transferência</label><textarea name="note" placeholder="Explique brevemente o motivo ou o que o próximo atendente precisa saber"></textarea></div>
      </form>`,
      `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button><button class="btn btn-primary" id="confirm-transfer" type="button">${icon('transfer',15)} Transferir</button>`, 'wide');
    $('.close-modal-action').addEventListener('click', closeModal);
    const syncMode = () => {
      const type = $('#transfer-form input[name=type]:checked')?.value;
      $$('.transfer-mode').forEach((label) => label.classList.toggle('active', label.querySelector('input').checked));
      $('#transfer-user-field').classList.toggle('hidden', type !== 'user');
      $('#transfer-queue-field').classList.toggle('hidden', type === 'user');
    };
    $$('#transfer-form input[name=type]').forEach((input) => input.addEventListener('change', syncMode));
    syncMode();
    $('#confirm-transfer').addEventListener('click', async () => {
      const form = $('#transfer-form');
      const payload = Object.fromEntries(new FormData(form).entries());
      if (payload.type === 'user' && !payload.userId) return toast('Selecione um atendente', '', 'error');
      const button = $('#confirm-transfer'); button.disabled = true;
      try {
        const updated = await api(`/conversations/${conversation.id}/transfer`, { method: 'POST', body: JSON.stringify(payload) });
        closeModal();
        toast('Atendimento transferido', updated.assigned_user_name ? `Agora com ${updated.assigned_user_name}.` : `Enviado para ${updated.queue_name}.`);
        await refreshConversationList();
        if (state.selectedConversationId === conversation.id) await selectConversation(conversation.id, false);
      } catch (error) { button.disabled = false; toast('Falha na transferência', error.message, 'error'); }
    });
  }

  async function setConversationPriority(conversation, priority) {
    try {
      await api(`/conversations/${conversation.id}/priority`, { method: 'PUT', body: JSON.stringify({ priority }) });
      toast('Prioridade atualizada', priority === 'urgent' ? 'O atendimento foi marcado como urgente.' : priority === 'high' ? 'O atendimento foi marcado como prioridade alta.' : 'O atendimento voltou à prioridade normal.');
      await refreshConversationList();
      if (state.selectedConversationId === conversation.id) await selectConversation(conversation.id, false);
    } catch (error) { toast('Não foi possível alterar a prioridade', error.message, 'error'); }
  }
  function openPriorityMenu(conversation){
    openModal('Prioridade do atendimento',`<div class="priority-grid">
      <button type="button" class="priority-option" data-priority="normal"><span>⚪</span><strong>Normal</strong></button>
      <button type="button" class="priority-option" data-priority="high"><span>🟠</span><strong>Alta</strong></button>
      <button type="button" class="priority-option" data-priority="urgent"><span>🔴</span><strong>Urgente</strong></button>
    </div>`,`<button class="btn btn-outline close-modal-action">Cancelar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    $$('.priority-option',$('#modal-root')).forEach((btn)=>btn.addEventListener('click',async()=>{btn.disabled=true;await setConversationPriority(conversation,btn.dataset.priority);closeModal();}));
  }

  async function closeChat(c) {
    if (!state.closureReasons.length) state.closureReasons = await api('/closure-reasons');
    openModal(`Encerrar atendimento de ${c.contact_name}`, `<form id="close-chat-form" class="close-chat-form"><div class="field full"><label>Motivo do encerramento</label><div class="closure-choice-grid">${state.closureReasons.map((reason,index) => `<label class="closure-choice"><input type="radio" name="reasonId" value="${reason.id}" ${index===0?'checked':''}><span class="closure-choice-dot"></span><strong>${esc(reason.name)}</strong></label>`).join('')}</div></div><div class="field full"><label>Observação opcional</label><textarea name="note" placeholder="Detalhes adicionais sobre o encerramento"></textarea></div><div class="field full switch-row close-message-option"><div><strong>Enviar mensagem de finalização</strong><small>Desmarque para encerrar sem enviar a mensagem automática ao cliente.</small></div><label class="switch"><input id="send-closing-message" type="checkbox" checked><span></span></label></div></form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-danger" id="confirm-close-chat">Finalizar atendimento</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    $('#confirm-close-chat').addEventListener('click', async () => {
      const button = $('#confirm-close-chat');
      const payload = Object.fromEntries(new FormData($('#close-chat-form')).entries());
      payload.sendClosingMessage = Boolean($('#send-closing-message')?.checked);
      if (!payload.reasonId) return toast('Selecione um motivo', '', 'error');
      button.disabled = true;
      button.textContent = 'Finalizando...';
      try {
        const result = await api(`/conversations/${c.id}/close`, { method: 'POST', body: JSON.stringify(payload) });
        closeModal(); closeContextMenu(); state.selectedConversationId = null;
        if (state.page === 'chats') { await refreshConversationList(); resetChatSelection(); }
        else await navigate(state.page);
        const detail = result.alreadyClosed
          ? 'O atendimento já estava finalizado. Nenhuma mensagem foi repetida.'
          : !payload.sendClosingMessage
            ? 'A conversa foi movida para o histórico sem enviar mensagem de finalização.'
            : result.closingMessageSent
              ? 'A conversa foi movida para o histórico e a mensagem de finalização foi enviada.'
              : 'A conversa foi movida para o histórico, mas a mensagem automática não foi enviada.';
        toast('Atendimento finalizado', detail);
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Finalizar atendimento';
        toast('Erro ao finalizar', error.message, 'error');
      }
    });
  }

  function resetChatSelection() {
    const center = $('#chat-center'); const detail = $('#chat-detail');
    if (center) center.innerHTML = `<div class="chat-empty"><div><div class="empty-icon">${icon('chat')}</div><h3>Atendimento finalizado</h3><p>A conversa foi movida para o histórico.</p></div></div>`;
    if (detail) detail.innerHTML = '<div class="empty-state"><p>Selecione outro cliente para continuar.</p></div>';
  }

  function openConversationContext(event, conversation) {
    event.preventDefault(); closeContextMenu();
    const menu = document.createElement('div'); menu.id = 'conversation-context'; menu.className = 'context-menu context-menu-wide';
    menu.innerHTML = `
      <button data-action="open">${icon('chat',16)} Abrir conversa</button>
      <button data-action="assign">${icon('users',16)} ${conversation.assigned_user_id === state.user.id ? 'Já está com você' : 'Assumir para mim'}</button>
      <button data-action="transfer">${icon('transfer',16)} Transferir atendimento</button>
      <hr>
      <button data-action="order">${icon('order',16)} Criar pedido</button>
      <button data-action="priority">${icon('flag',16)} ${conversation.priority === 'normal' ? 'Definir prioridade' : 'Alterar prioridade'}</button>
      <button data-action="ai">${icon('robot',16)} ${conversation.ai_enabled ? 'Desligar IA' : 'Ligar IA'}</button>
      <hr>
      <button class="danger" data-action="close">${icon('close',16)} Finalizar atendimento</button>`;
    document.body.appendChild(menu);
    const left = Math.min(event.clientX, window.innerWidth - 245); const top = Math.min(event.clientY, window.innerHeight - 360);
    menu.style.left = `${Math.max(8,left)}px`; menu.style.top = `${Math.max(8,top)}px`;
    menu.addEventListener('click', async (click) => {
      const action = click.target.closest('button')?.dataset.action; if (!action) return;
      closeContextMenu();
      if (action === 'open') await selectConversation(conversation.id);
      if (action === 'assign' && conversation.assigned_user_id !== state.user.id) await assignChat(conversation);
      if (action === 'transfer') await openTransferModal(conversation);
      if (action === 'order') await openOrderModal(conversation);
      if (action === 'priority') openPriorityMenu(conversation);
      if (action === 'ai') await toggleAi(conversation);
      if (action === 'close') await closeChat(conversation);
    });
  }

  function positionContextMenu(menu,event,width=245,height=390){
    const left=Math.min(event.clientX,window.innerWidth-width);
    const top=Math.min(event.clientY,window.innerHeight-height);
    menu.style.left=`${Math.max(8,left)}px`;menu.style.top=`${Math.max(8,top)}px`;
  }

  function openTableConversationGroupContext(event,tableId,conversations){
    event.preventDefault();event.stopPropagation();closeContextMenu();
    const tableName=conversations[0]?.table_name||`Mesa ${tableId}`;
    const expanded=state.expandedTableGroups.has(String(tableId));
    const menu=document.createElement('div');menu.id='conversation-context';menu.className='context-menu context-menu-wide';
    menu.innerHTML=`<div class="context-menu-title">${esc(tableName)}</div>
      <button data-action="toggle">${icon('chevronDown',16)} ${expanded?'Recolher clientes':'Expandir clientes'}</button>
      <button data-action="open">${icon('chat',16)} Abrir cliente com mensagem nova</button>
      <button data-action="tables">${icon('order',16)} Ver mesa e comanda</button>`;
    document.body.appendChild(menu);positionContextMenu(menu,event,245,220);
    menu.addEventListener('click',async(click)=>{const action=click.target.closest('button')?.dataset.action;if(!action)return;closeContextMenu();
      if(action==='toggle'){const button=document.querySelector(`[data-toggle-table-group="${CSS.escape(String(tableId))}"]`);button?.click();}
      if(action==='open'){const target=[...conversations].sort((a,b)=>Number(b.unread_count||0)-Number(a.unread_count||0)||new Date(b.last_message_at)-new Date(a.last_message_at))[0];if(target)await selectConversation(target.id);}
      if(action==='tables'){state.focusTableId=Number(tableId);await navigate('tables');}
    });
  }

  function showRestaurantTableMembers(table){
    const members=table.members||[];
    openModal(`Clientes · ${table.name}`,members.length?`<div class="table-context-list">${members.map((member)=>`<div><span class="avatar">${initials(member.display_name||member.contact_name||'Cliente')}</span><section><strong>${esc(member.display_name||member.contact_name||'Cliente')}</strong><small>${member.phone?`+${esc(member.phone)}`:'Sem telefone identificado'}</small></section>${member.conversation_id?`<button class="btn btn-small btn-soft context-open-member" data-id="${member.conversation_id}">Abrir atendimento</button>`:''}</div>`).join('')}</div>`:'<div class="empty-state"><p>Nenhum cliente vinculado nesta mesa.</p></div>','<button class="btn btn-outline close-modal-action">Fechar</button>');
    $('.close-modal-action')?.addEventListener('click',closeModal);
    $$('.context-open-member').forEach((button)=>button.addEventListener('click',async()=>{const id=Number(button.dataset.id);closeModal();state.selectedConversationId=id;await navigate('chats');await selectConversation(id,false).catch(()=>{});}));
  }

  function showRestaurantTableOrders(table){
    const orders=table.orders||[];
    openModal(`Comanda · ${table.name}`,orders.length?`<div class="table-context-orders">${orders.slice().reverse().map((order)=>`<article><div><strong>Pedido #${String(order.id).padStart(4,'0')}</strong><span>${tableOrderStatusText(order.status)}</span></div><small>${esc(order.customer_name||order.contact_name||'Cliente')} · ${dateTime(order.created_at)}</small><b>${money(order.total)}</b></article>`).join('')}</div><div class="table-context-total"><span>Total da comanda</span><strong>${money(table.total||0)}</strong></div>`:'<div class="empty-state"><p>Nenhum pedido registrado nesta comanda.</p></div>','<button class="btn btn-outline close-modal-action">Fechar</button>');
    $('.close-modal-action')?.addEventListener('click',closeModal);
  }

  function tableHistoryDuration(seconds) {
    const total = Math.max(0,Number(seconds||0));
    const days = Math.floor(total/86400);
    const hours = Math.floor((total%86400)/3600);
    const minutes = Math.floor((total%3600)/60);
    if (days) return `${days}d ${hours}h`;
    if (hours) return `${hours}h ${minutes}min`;
    return `${Math.max(1,minutes)}min`;
  }

  function tableHistorySessionMarkup(session,index) {
    const tab=session.tab||{};
    const active=tab.status!=='closed';
    const statusText=tab.status==='account_requested'?'Conta solicitada':active?'Em andamento':'Finalizada';
    const people=(session.members||[]).map((member)=>member.display_name||member.contact_name||'Cliente');
    const orders=session.orders||[];
    const payments=session.payments||[];
    const orderMarkup=orders.length?orders.map((order)=>{
      const customer=order.member_name||order.customer_name||order.contact_name||'Cliente';
      const items=(order.items||[]).map((item)=>`<div><span><b>${Number(item.quantity||0)}x</b> ${esc(item.name)}${item.notes?`<small>${esc(item.notes)}</small>`:''}</span><strong>${money(Number(item.quantity||0)*Number(item.unit_price||0))}</strong></div>`).join('');
      return `<article class="table-history-order ${order.status==='cancelled'?'cancelled':''}"><header><div><strong>Pedido #${String(order.id).padStart(4,'0')}</strong><small>Pedido por <b>${esc(customer)}</b> · ${dateTime(order.created_at)}</small></div><span>${esc(tableOrderStatusText(order.status))}</span><b>${money(order.total)}</b></header><div class="table-history-items">${items||'<small>Itens não encontrados.</small>'}</div>${order.notes?`<p><strong>Observação:</strong> ${esc(order.notes)}</p>`:''}</article>`;
    }).join(''):'<div class="table-history-empty">Nenhum pedido foi registrado nesta comanda.</div>';
    const paymentMarkup=payments.length?`<div class="table-history-payments"><h4>Pagamentos registrados</h4>${payments.map((payment)=>`<div><span><strong>${esc(tablePaymentMethodLabel(payment.payment_method))}</strong><small>${payment.member_name?`Pago por ${esc(payment.member_name)} · `:''}${dateTime(payment.created_at)}${payment.created_by_user_name?` · lançado por ${esc(payment.created_by_user_name)}`:''}</small></span><b>${money(payment.amount)}</b></div>`).join('')}</div>`:'';
    return `<article class="table-history-session ${index===0?'expanded':''}">
      <button class="table-history-session-toggle" type="button" aria-expanded="${index===0?'true':'false'}"><span class="table-history-session-number">#${String(tab.id).padStart(4,'0')}</span><div><strong>${statusText}</strong><small>${dateTime(tab.opened_at)}${tab.closed_at?` até ${dateTime(tab.closed_at)}`:''} · ${tableHistoryDuration(session.durationSeconds)}</small></div><span class="table-history-session-people">${people.length?`${people.length} pessoa${people.length===1?'':'s'}`:'Sem identificação'}</span><b>${money(session.total||0)}</b>${icon('chevronDown',16)}</button>
      <div class="table-history-session-body"><div class="table-history-session-meta"><span><small>Quem esteve na mesa</small><strong>${people.length?esc(people.join(', ')):'Não identificado'}</strong></span><span><small>Pedidos</small><strong>${orders.length}</strong></span><span><small>Pago</small><strong>${money(session.paidTotal||0)}</strong></span><span><small>Restante</small><strong>${money(session.balance||0)}</strong></span></div>${tab.notes?`<div class="table-history-note"><strong>Observação do fechamento:</strong> ${esc(tab.notes)}</div>`:''}${tab.closed_by_user_name?`<div class="table-history-closed-by">Fechada por ${esc(tab.closed_by_user_name)}</div>`:''}<div class="table-history-order-list">${orderMarkup}</div>${paymentMarkup}</div>
    </article>`;
  }

  async function openRestaurantTableHistory(table) {
    try {
      const data=await api(`/tables/${table.id}/history?limit=40`);
      const sessions=data.sessions||[];
      const summary=data.summary||{};
      openModal(`Histórico · ${table.name}`,`<div class="table-history-modal"><div class="table-history-summary"><article><span>Comandas registradas</span><strong>${Number(summary.totalSessions||0)}</strong></article><article><span>Total vendido</span><strong>${money(summary.totalSales||0)}</strong></article><article><span>Total pago</span><strong>${money(summary.totalPaid||0)}</strong></article><article><span>Último uso</span><strong>${summary.lastOpenedAt?dateTime(summary.lastOpenedAt):'Nunca utilizada'}</strong></article></div><div class="table-history-heading"><div><strong>Comandas da mesa</strong><small>Mostrando até ${Number(summary.displayedSessions||sessions.length)} registros, do mais recente para o mais antigo.</small></div></div><div class="table-history-list">${sessions.map(tableHistorySessionMarkup).join('')||'<div class="empty-state"><p>Esta mesa ainda não possui histórico de comandas.</p></div>'}</div></div>`,`<button class="btn btn-outline close-modal-action" type="button">Fechar</button>`,'wide');
      $('.close-modal-action')?.addEventListener('click',closeModal);
      $$('.table-history-session-toggle',$('#modal-root')).forEach((button)=>button.addEventListener('click',()=>{
        const session=button.closest('.table-history-session');
        const expanded=session.classList.toggle('expanded');
        button.setAttribute('aria-expanded',expanded?'true':'false');
      }));
    } catch (error) { toast('Não foi possível abrir o histórico',error.message,'error'); }
  }

  function openRestaurantTableContext(event,table,canConfigure){
    event.preventDefault();event.stopPropagation();closeContextMenu();
    const menu=document.createElement('div');menu.id='conversation-context';menu.className='context-menu context-menu-wide';
    menu.innerHTML=`<div class="context-menu-title">${esc(table.name)}</div>
      <button data-action="members">${icon('users',16)} Ver clientes vinculados</button>
      <button data-action="orders">${icon('order',16)} Ver comanda e pedidos</button>
      <button data-action="history">${icon('history',16)} Histórico da mesa</button>
      ${table.tab?`<button data-action="payment">💳 Registrar pagamento</button>`:''}
      <button data-action="chats">${icon('chat',16)} Abrir atendimentos da mesa</button>
      ${canConfigure?`<hr><button data-action="qr">▦ Ver QR Code</button><button data-action="edit">${icon('edit',16)} Editar mesa</button>`:''}
      ${table.tab?`<hr><button class="danger" data-action="release">${icon('close',16)} Fechar e liberar mesa</button>`:''}`;
    document.body.appendChild(menu);positionContextMenu(menu,event,255,420);
    menu.addEventListener('click',async(click)=>{const action=click.target.closest('button')?.dataset.action;if(!action)return;closeContextMenu();
      if(action==='members')showRestaurantTableMembers(table);
      if(action==='orders')showRestaurantTableOrders(table);
      if(action==='history')openRestaurantTableHistory(table);
      if(action==='payment')openRestaurantTablePayment(table);
      if(action==='qr')openRestaurantTableQr(table);
      if(action==='edit')openRestaurantTableModal(table);
      if(action==='release')await releaseRestaurantTable(table);
      if(action==='chats'){const target=(table.members||[]).find((member)=>member.conversation_id);if(target){state.selectedConversationId=Number(target.conversation_id);await navigate('chats');await selectConversation(state.selectedConversationId,false).catch(()=>{});}else toast('Sem atendimento','Nenhum cliente da mesa possui atendimento aberto.');}
    });
  }

  function closeContextMenu() { $('#conversation-context')?.remove(); }
  async function reopenChat(c) {
    try { await api(`/conversations/${c.id}/reopen`, { method: 'POST' }); await selectConversation(c.id); toast('Atendimento reaberto'); } catch (error) { toast('Erro', error.message, 'error'); }
  }

  async function renderContacts() {
    const rows = await api('/contacts');
    $('#page-content').innerHTML = `
      <div class="page-head"><div><h2>Contatos do WhatsApp</h2><p>Cada número existe uma única vez e mantém todas as mensagens, pedidos e atendimentos anteriores.</p></div><button class="btn btn-primary" id="new-contact">${icon('plus',15)} Novo cliente</button></div>
      <div class="table-card"><div class="table-toolbar"><div class="search-wrap">${icon('search')}<input class="search-input" id="contact-search" placeholder="Buscar por nome, telefone ou e-mail"></div><span class="muted" style="font-size:11px">${rows.length} contatos</span></div>
      <table class="data-table"><thead><tr><th>Cliente</th><th>Telefone</th><th>Etiquetas</th><th>Atendimentos</th><th>Pedidos</th><th>Total gasto</th><th></th></tr></thead><tbody id="contacts-body">${contactRows(rows)}</tbody></table></div>`;
    bindContactRows(rows);
    $('#new-contact').addEventListener('click', () => openContactModal());
    let timer; $('#contact-search').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(async () => { const filtered = await api(`/contacts?search=${encodeURIComponent(e.target.value)}`); $('#contacts-body').innerHTML = contactRows(filtered); bindContactRows(filtered); }, 250); });
  }

  function contactRows(rows){
    return rows.length?rows.map((c)=>`<tr><td><div class="table-user"><span class="avatar">${initials(c.name)}</span><div><strong>${esc(c.name)}</strong><div class="muted contact-email">${esc(c.email||'Sem e-mail')}</div></div></div></td><td>+${esc(c.phone)}</td><td><div class="tag-list">${(c.tags||[]).slice(0,3).map((t)=>`<span class="tag">${esc(t)}</span>`).join('')||'—'}</div></td><td>${c.conversations_count}</td><td>${c.orders_count}</td><td><strong>${money(c.total_spent)}</strong></td><td><div class="row-icon-actions"><button class="icon-button start-contact-chat" data-id="${c.id}" data-tooltip="Iniciar atendimento">${icon('chat',15)}</button><button class="icon-button contact-history" data-id="${c.id}" data-tooltip="Histórico do cliente">${icon('history',15)}</button><button class="icon-button edit-contact" data-id="${c.id}" data-tooltip="Editar cliente">${icon('edit',15)}</button></div></td></tr>`).join(''):`<tr><td colspan="7">${emptySmall('Nenhum contato encontrado')}</td></tr>`;
  }
  function bindContactRows(rows){
    $$('.edit-contact').forEach((btn)=>btn.addEventListener('click',()=>openContactModal(rows.find((r)=>r.id===Number(btn.dataset.id)))));
    $$('.start-contact-chat').forEach((btn)=>btn.addEventListener('click',()=>{const c=rows.find((r)=>r.id===Number(btn.dataset.id));openNewConversationModal({phone:c.phone});}));
    $$('.contact-history').forEach((btn)=>btn.addEventListener('click',()=>openCustomerHistoryModal(Number(btn.dataset.id))));
  }


  function openContactModal(contact=null) {
    const editing=Boolean(contact?.id);
    const tags=Array.isArray(contact?.tags)?contact.tags.join(', '):String(contact?.tags||'');
    openModal(editing?'Editar cliente':'Novo cliente',`<form id="contact-form" class="form-grid">
      <div class="field"><label>Nome</label><input name="name" value="${esc(contact?.name||'')}" required></div>
      <div class="field"><label>Telefone com DDD</label><input name="phone" value="${esc(contact?.phone||'')}" inputmode="numeric" placeholder="5538999999999" required></div>
      <div class="field full"><label>E-mail</label><input name="email" type="email" value="${esc(contact?.email||'')}" placeholder="cliente@email.com"></div>
      <div class="field full"><label>Etiquetas</label><input name="tags" value="${esc(tags)}" placeholder="vip, entrega, cliente antigo"><small>Separe as etiquetas por vírgula.</small></div>
      <div class="field full"><label>Observações</label><textarea name="notes" rows="5" placeholder="Informações importantes sobre o cliente">${esc(contact?.notes||'')}</textarea></div>
    </form>`,`<button class="btn btn-outline close-modal-action" type="button">Cancelar</button><button class="btn btn-primary" id="save-contact" type="button">Salvar cliente</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    $('#save-contact').addEventListener('click',async()=>{
      const button=$('#save-contact');
      const values=Object.fromEntries(new FormData($('#contact-form')).entries());
      const payload={...values,phone:String(values.phone||'').replace(/\D/g,''),tags:String(values.tags||'').split(',').map((tag)=>tag.trim()).filter(Boolean)};
      if(!payload.name.trim()||payload.phone.length<10)return toast('Preencha nome e telefone','O telefone precisa conter DDD.','error');
      button.disabled=true;
      try{
        await api(editing?`/contacts/${contact.id}`:'/contacts',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});
        closeModal();toast(editing?'Cliente atualizado':'Cliente cadastrado');
        if(state.page==='chats'&&state.selectedConversationId)await selectConversation(state.selectedConversationId,false);else if(state.page==='contacts')await renderContacts();
      }catch(error){button.disabled=false;toast('Não foi possível salvar',error.message,'error');}
    });
  }

  async function renderProducts() {
    const rows = await api('/products');
    const counts={active:rows.filter((p)=>p.active).length,out:rows.filter((p)=>p.active&&Number(p.stock)===0).length,low:rows.filter((p)=>p.active&&p.stock!=null&&Number(p.stock)>0&&Number(p.stock)<=5).length,uncontrolled:rows.filter((p)=>p.active&&p.stock==null).length};
    const filter=state.inventoryFilter||'all';
    const visible=rows.filter((p)=>filter==='all'||(filter==='out'&&p.active&&Number(p.stock)===0)||(filter==='low'&&p.active&&p.stock!=null&&Number(p.stock)>0&&Number(p.stock)<=5)||(filter==='available'&&p.active&&(p.stock==null||Number(p.stock)>0))||(filter==='inactive'&&!p.active));
    $('#page-content').innerHTML = `<div class="compact-page-toolbar"><div><h2>Estoque e cardápio</h2><small>A IA consulta esta tela antes de oferecer ou montar pedidos.</small></div><button class="btn btn-primary" id="new-product">${icon('plus',15)} Novo produto</button></div>
      <div class="stats-grid inventory-stats">${statCard('product',counts.active,'Produtos ativos','No cardápio')}${statCard('close',counts.out,'Sem estoque','A IA avisa o cliente')}${statCard('flag',counts.low,'Estoque baixo','Até 5 unidades')}${statCard('database',counts.uncontrolled,'Sem controle','Disponibilidade livre')}</div>
      <div class="table-card inventory-card"><div class="table-toolbar inventory-toolbar"><div class="search-wrap">${icon('search')}<input class="search-input" id="inventory-search" placeholder="Buscar produto, categoria ou apelido"></div><div class="inventory-filter-tabs">${[['all','Todos'],['available','Disponíveis'],['low','Baixo'],['out','Sem estoque'],['inactive','Inativos']].map(([id,label])=>`<button class="chat-tab ${filter===id?'active':''}" data-stock-filter="${id}">${label}</button>`).join('')}</div></div>
      <div class="table-scroll"><table class="data-table inventory-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Palavras que a IA reconhece</th><th>Estoque de hoje</th><th>Fiscal</th><th>Status</th><th></th></tr></thead><tbody id="inventory-body">${inventoryRows(visible)}</tbody></table></div></div>`;
    const bindInventory=()=>{
      $$('.edit-product').forEach((btn)=>btn.addEventListener('click',()=>openProductModal(rows.find((p)=>p.id===Number(btn.dataset.id)))));
      $$('.stock-minus').forEach((btn)=>btn.addEventListener('click',()=>{const input=$(`.stock-input[data-id="${btn.dataset.id}"]`);input.value=Math.max(0,Number(input.value||0)-1);}));
      $$('.stock-plus').forEach((btn)=>btn.addEventListener('click',()=>{const input=$(`.stock-input[data-id="${btn.dataset.id}"]`);input.value=Math.max(0,Number(input.value||0)+1);}));
      $$('.save-stock').forEach((btn)=>btn.addEventListener('click',async()=>{const input=$(`.stock-input[data-id="${btn.dataset.id}"]`);btn.disabled=true;try{await api(`/products/${btn.dataset.id}/stock`,{method:'PATCH',body:JSON.stringify({stock:input.value})});toast('Estoque atualizado');await renderProducts();}catch(error){btn.disabled=false;toast('Não foi possível atualizar',error.message,'error');}}));
      $$('.uncontrolled-stock').forEach((btn)=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await api(`/products/${btn.dataset.id}/stock`,{method:'PATCH',body:JSON.stringify({stock:null})});toast('Controle de estoque removido');await renderProducts();}catch(error){btn.disabled=false;toast('Não foi possível atualizar',error.message,'error');}}));
    };
    bindInventory();
    $('#new-product').addEventListener('click',()=>openProductModal());
    $$('[data-stock-filter]').forEach((btn)=>btn.addEventListener('click',async()=>{state.inventoryFilter=btn.dataset.stockFilter;await renderProducts();}));
    $('#inventory-search').addEventListener('input',(event)=>{const term=event.target.value.trim().toLowerCase();$$('#inventory-body tr[data-search]').forEach((row)=>row.classList.toggle('hidden',!row.dataset.search.includes(term)));});
  }

  function inventoryRows(rows){
    return rows.length?rows.map((p)=>{
      const stock=p.stock==null?'':Number(p.stock);
      const stateLabel=!p.active?'Inativo':p.stock==null?'Sem controle':Number(p.stock)===0?'Sem estoque':Number(p.stock)<=5?'Estoque baixo':'Disponível';
      const stateClass=!p.active?'status-closed':p.stock==null?'status-waiting':Number(p.stock)===0?'status-cancelled':Number(p.stock)<=5?'status-waiting':'status-open';
      const fiscalComplete=Boolean(p.fiscal_ncm&&p.fiscal_cfop&&p.fiscal_cst_csosn&&p.fiscal_unit);
      const image=p.image_url?`<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="inventory-product-fallback" hidden>${esc((p.name||'?').slice(0,1).toUpperCase())}</span>`:`<span class="inventory-product-fallback">${esc((p.name||'?').slice(0,1).toUpperCase())}</span>`;
      return `<tr data-search="${esc(`${p.name} ${p.category} ${p.aliases||''} ${p.fiscal_ncm||''}`.toLowerCase())}"><td><div class="inventory-product-cell"><span class="inventory-product-image">${image}</span><span><strong>${esc(p.name)}</strong><small>${esc(p.description||'Sem descrição')}</small></span></div></td><td>${esc(p.category)}</td><td><strong>${money(p.price)}</strong></td><td><span class="inventory-aliases">${esc(p.aliases||p.name)}</span></td><td><div class="stock-editor"><button class="icon-button stock-minus" data-id="${p.id}" data-tooltip="Diminuir">−</button><input class="stock-input" data-id="${p.id}" type="number" min="0" value="${stock}" placeholder="Livre"><button class="icon-button stock-plus" data-id="${p.id}" data-tooltip="Aumentar">+</button><button class="icon-button primary-icon save-stock" data-id="${p.id}" data-tooltip="Salvar estoque">${icon('check',14)}</button><button class="icon-button uncontrolled-stock" data-id="${p.id}" data-tooltip="Não controlar estoque">∞</button></div></td><td><span class="status-badge ${fiscalComplete?'status-open':'status-waiting'}">${fiscalComplete?'Configurado':'Pendente'}</span></td><td><span class="status-badge ${stateClass}">${stateLabel}</span></td><td><button class="icon-button edit-product" data-id="${p.id}" data-tooltip="Editar produto">${icon('edit',15)}</button></td></tr>`;
    }).join(''):`<tr><td colspan="8">${emptySmall('Nenhum produto nesse filtro')}</td></tr>`;
  }

  function openProductModal(product = null) {
    const initialImage=product?.image_url||'';
    openModal(product ? 'Editar produto' : 'Novo produto', `<form id="product-form" class="form-grid">
      <div class="field"><label>Nome</label><input name="name" value="${esc(product?.name || '')}" required></div>
      <div class="field"><label>Categoria</label><input name="category" value="${esc(product?.category || 'Lanches')}"></div>
      <div class="field"><label>Preço</label><input name="price" type="number" step="0.01" min="0" value="${esc(product?.price ?? '')}" required></div>
      <div class="field"><label>Estoque de hoje</label><input name="stock" type="number" min="0" value="${esc(product?.stock ?? '')}" placeholder="Vazio = sem controle"></div>
      <div class="field full product-image-editor">
        <div class="product-image-preview"><img id="product-image-preview" src="${esc(initialImage || '/assets/jhow-burguer-logo.jpg')}" alt="Prévia do produto"></div>
        <div class="product-image-fields">
          <label>Imagem do produto <small>(opcional)</small></label>
          <input name="image_url" id="product-image-url" value="${esc(initialImage)}" placeholder="https://... ou /assets/products/imagem.jpg">
          <label class="file-picker">${icon('upload',16)} Escolher imagem do aparelho<input id="product-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label>
          <small>JPG, PNG, WEBP ou GIF, até 6 MB. A imagem aparecerá no cardápio público.</small>
        </div>
      </div>
      <div class="field full"><label>Apelidos e formas de pedir</label><input name="aliases" value="${esc(product?.aliases || '')}" placeholder="x-burguer, xburguer, cheeseburger"><small>Separe por vírgulas. Isso ajuda a IA a reconhecer nomes diferentes e erros comuns.</small></div>
      <div class="field full"><label>Descrição</label><textarea name="description">${esc(product?.description || '')}</textarea></div>
      <div class="field full fiscal-product-divider"><span class="eyebrow">DADOS FISCAIS</span><strong>Preenchimento orientado pelo contador</strong><small>Estes campos apenas preparam o produto. O sistema ainda não transmite documentos à SEFAZ.</small></div>
      <div class="field"><label>NCM</label><input name="fiscal_ncm" inputmode="numeric" value="${esc(product?.fiscal_ncm || '')}" placeholder="Ex.: 21069090"></div>
      <div class="field"><label>CEST <small>(quando aplicável)</small></label><input name="fiscal_cest" inputmode="numeric" value="${esc(product?.fiscal_cest || '')}"></div>
      <div class="field"><label>CFOP</label><input name="fiscal_cfop" inputmode="numeric" value="${esc(product?.fiscal_cfop || '')}" placeholder="Definido pelo contador"></div>
      <div class="field"><label>CST ou CSOSN</label><input name="fiscal_cst_csosn" value="${esc(product?.fiscal_cst_csosn || '')}" placeholder="Definido pelo contador"></div>
      <div class="field"><label>Origem</label><input name="fiscal_origin" value="${esc(product?.fiscal_origin || '0')}" maxlength="1"></div>
      <div class="field"><label>Unidade fiscal</label><input name="fiscal_unit" value="${esc(product?.fiscal_unit || 'UN')}" maxlength="6"></div>
      <div class="field full"><label>IBS/CBS</label><input name="fiscal_ibs_cbs" value="${esc(product?.fiscal_ibs_cbs || '')}" placeholder="Classificação ou orientação do contador"></div>
      <div class="field full"><label>Observações fiscais</label><textarea name="fiscal_notes" rows="3">${esc(product?.fiscal_notes || '')}</textarea></div>
      <div class="field full switch-row"><div><strong>Produto disponível</strong><div class="muted" style="font-size:10px;margin-top:3px">Produto ativo com estoque zero aparece como indisponível hoje.</div></div><label class="switch"><input name="active" type="checkbox" ${product?.active === false ? '' : 'checked'}><span></span></label></div>
    </form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button>${product?.active ? '<button class="btn btn-danger" id="disable-product">Desativar</button>' : ''}<button class="btn btn-primary" id="save-product">Salvar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    const imageUrlInput=$('#product-image-url');
    const imageFileInput=$('#product-image-file');
    const imagePreview=$('#product-image-preview');
    const setImagePreview=(source)=>{imagePreview.src=source||'/assets/jhow-burguer-logo.jpg';};
    imageUrlInput.addEventListener('input',()=>setImagePreview(imageUrlInput.value.trim()));
    imagePreview.addEventListener('error',()=>{if(!imagePreview.src.endsWith('/assets/jhow-burguer-logo.jpg'))imagePreview.src='/assets/jhow-burguer-logo.jpg';});
    imageFileInput.addEventListener('change',async()=>{
      const file=imageFileInput.files?.[0];if(!file)return;
      if(file.size>6*1024*1024){imageFileInput.value='';return toast('Imagem muito grande','O limite é 6 MB.','error');}
      setImagePreview(await readFileAsDataUrl(file));
    });
    $('#save-product').addEventListener('click', async () => {
      const button=$('#save-product');button.disabled=true;
      try {
        const form = new FormData($('#product-form'));
        const payload = Object.fromEntries(form.entries());
        const file=imageFileInput.files?.[0];
        if(file){
          const upload=await api('/products/image',{method:'POST',body:JSON.stringify({dataUrl:await readFileAsDataUrl(file)})});
          payload.image_url=upload.image_url;
        }
        payload.active = $('#product-form [name=active]').checked;
        payload.price = Number(payload.price);
        payload.stock = payload.stock === '' ? '' : Number(payload.stock);
        await api(product ? `/products/${product.id}` : '/products', { method: product ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        closeModal(); toast('Produto salvo'); await renderProducts();
      } catch (error) { button.disabled=false; toast('Erro ao salvar', error.message, 'error'); }
    });
    $('#disable-product')?.addEventListener('click', async () => { await api(`/products/${product.id}`, { method: 'DELETE' }); closeModal(); toast('Produto desativado'); await renderProducts(); });
  }

  async function renderKnowledge() {
    const rows = await api('/knowledge');
    $('#page-content').innerHTML = `<div class="page-head"><div><h2>Conhecimento da IA</h2><p>Cadastre somente informações verdadeiras. A IA local consulta esses blocos antes de responder.</p></div><button class="btn btn-primary" id="new-knowledge">${icon('plus',15)} Adicionar conhecimento</button></div><div class="knowledge-grid">${rows.map((k) => `<article class="knowledge-card ${k.active ? '' : 'inactive'}"><span class="category">${esc(k.category)}</span><h3>${esc(k.title)}</h3><p>${esc(k.content)}</p><footer><span class="muted" style="font-size:9px">${esc(k.keywords || 'Sem palavras-chave')}</span><button class="icon-button edit-knowledge" data-id="${k.id}">${icon('edit',16)}</button></footer></article>`).join('') || emptySmall('Nenhum conhecimento cadastrado')}</div>`;
    $('#new-knowledge').addEventListener('click', () => openKnowledgeModal());
    $$('.edit-knowledge').forEach((btn) => btn.addEventListener('click', () => openKnowledgeModal(rows.find((k) => k.id === Number(btn.dataset.id)))));
  }

  function openKnowledgeModal(item = null) {
    openModal(item ? 'Editar conhecimento' : 'Adicionar conhecimento', `<form id="knowledge-form" class="form-grid"><div class="field"><label>Título</label><input name="title" value="${esc(item?.title || '')}" required></div><div class="field"><label>Categoria</label><input name="category" value="${esc(item?.category || 'Geral')}"></div><div class="field full"><label>Informação que a IA pode usar</label><textarea name="content" required>${esc(item?.content || '')}</textarea></div><div class="field full"><label>Palavras-chave</label><input name="keywords" value="${esc(item?.keywords || '')}" placeholder="horário, aberto, funcionamento"></div><div class="field full switch-row"><div><strong>Conhecimento ativo</strong><div class="muted" style="font-size:10px;margin-top:3px">Itens inativos não entram nas respostas.</div></div><label class="switch"><input name="active" type="checkbox" ${item?.active === false ? '' : 'checked'}><span></span></label></div></form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button>${item?.active ? '<button class="btn btn-danger" id="disable-knowledge">Desativar</button>' : ''}<button class="btn btn-primary" id="save-knowledge">Salvar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    $('#save-knowledge').addEventListener('click', async () => { const form = new FormData($('#knowledge-form')); const payload = Object.fromEntries(form.entries()); payload.active = $('#knowledge-form [name=active]').checked; try { await api(item ? `/knowledge/${item.id}` : '/knowledge', { method: item ? 'PUT' : 'POST', body: JSON.stringify(payload) }); closeModal(); toast('Conhecimento salvo'); await renderKnowledge(); } catch (error) { toast('Erro ao salvar', error.message, 'error'); } });
    $('#disable-knowledge')?.addEventListener('click', async () => { await api(`/knowledge/${item.id}`, { method: 'DELETE' }); closeModal(); toast('Conhecimento desativado'); await renderKnowledge(); });
  }

  async function renderHistory() {
    const [queues, options, reasons] = await Promise.all([api('/queues'), api('/transfer-options'), api('/closure-reasons')]);
    const params = new URLSearchParams({ status:'history' });
    Object.entries(state.historyFilters).forEach(([key,value]) => { if (value) params.set(key,String(value)); });
    const rows = await api(`/conversations?${params.toString()}`);
    $('#page-content').innerHTML = `<div class="compact-page-toolbar"><div><h2>Histórico</h2><small>${rows.length} atendimentos encontrados</small></div><div class="toolbar-icons"><button class="icon-button" id="history-filter-button" data-tooltip="Filtros">${icon('filter',17)}</button><button class="icon-button" id="history-export" data-tooltip="Exportar CSV">${icon('report',17)}</button><button class="icon-button" id="refresh-history" data-tooltip="Atualizar">${icon('refresh',17)}</button></div></div>
      <div id="history-filter-popover" class="filter-popover history-filter-popover hidden"><div class="popover-title"><strong>Filtrar histórico</strong><button class="icon-button" id="close-history-filter">${icon('close',15)}</button></div><label>Busca<input id="history-filter-search" value="${esc(state.historyFilters.search)}" placeholder="Cliente, telefone ou protocolo"></label><label>Fila<select id="history-filter-queue" class="custom-select"><option value="">Todas</option>${queues.map((q)=>`<option value="${q.id}" ${String(state.historyFilters.queueId)===String(q.id)?'selected':''}>${esc(q.name)}</option>`).join('')}</select></label><label>Atendente<select id="history-filter-user" class="custom-select"><option value="">Todos</option>${options.users.map((u)=>`<option value="${u.id}" ${String(state.historyFilters.userId)===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></label><label>Motivo<select id="history-filter-reason" class="custom-select"><option value="">Todos</option>${reasons.map((r)=>`<option value="${r.id}" ${String(state.historyFilters.reasonId)===String(r.id)?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><div class="filter-date-grid"><label>De<input id="history-filter-from" type="date" value="${esc(state.historyFilters.from)}"></label><label>Até<input id="history-filter-to" type="date" value="${esc(state.historyFilters.to)}"></label></div>${['admin','supervisor'].includes(state.user.role)?`<label class="inline-check"><input id="history-filter-hidden" type="checkbox" ${state.historyFilters.includeHidden?'checked':''}> Mostrar ocultos</label>`:''}<div class="popover-actions"><button class="btn btn-outline" id="clear-history-filter">Limpar</button><button class="btn btn-primary" id="apply-history-filter">Aplicar</button></div></div>
      <div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th><input type="checkbox" id="history-select-all"></th><th>Cliente</th><th>Protocolo</th><th>Fila</th><th>Atendente</th><th>Motivo</th><th>Duração</th><th>Data</th><th></th></tr></thead><tbody id="history-body">${historyRows(rows)}</tbody></table></div></div>`;
    $('#refresh-history').addEventListener('click', renderHistory);
    $('#history-filter-button').addEventListener('click',(event)=>{event.stopPropagation();$('#history-filter-popover').classList.toggle('hidden');});
    $('#history-filter-popover').addEventListener('click',(event)=>event.stopPropagation());
    $('#close-history-filter').addEventListener('click',()=>$('#history-filter-popover').classList.add('hidden'));
    $('#apply-history-filter').addEventListener('click',async()=>{state.historyFilters={search:$('#history-filter-search').value.trim(),queueId:$('#history-filter-queue').value,userId:$('#history-filter-user').value,reasonId:$('#history-filter-reason').value,from:$('#history-filter-from').value,to:$('#history-filter-to').value,includeHidden:$('#history-filter-hidden')?.checked||false};await renderHistory();});
    $('#clear-history-filter').addEventListener('click',async()=>{state.historyFilters={search:'',queueId:'',userId:'',reasonId:'',from:'',to:'',includeHidden:false};await renderHistory();});
    $('#history-select-all').addEventListener('change',(event)=>$$('.history-select').forEach((box)=>{box.checked=event.target.checked;}));
    $('#history-export').addEventListener('click',()=>exportHistoryCsv(rows));
    bindHistoryRows(rows);
  }

  function historyRows(rows) {
    const duration = (seconds) => { if (seconds == null) return '—'; const h=Math.floor(seconds/3600),m=Math.floor((seconds%3600)/60); return h?`${h}h ${m}min`:`${m}min`; };
    return rows.length ? rows.map((c) => `<tr><td><input class="history-select" type="checkbox" value="${c.id}"></td><td><div class="table-user"><span class="avatar">${initials(c.contact_name)}</span><div><strong>${esc(c.contact_name)}</strong><div class="muted contact-email">+${esc(c.phone)}</div></div></div></td><td>${esc(c.protocol)}</td><td>${esc(c.queue_name||'—')}</td><td>${esc(c.assigned_user_name||c.closed_by_user_name||'Sistema')}</td><td>${esc(c.close_reason_text || c.close_reason_name || 'Não informado')}</td><td>${duration(c.duration_seconds)}</td><td>${c.closed_at ? dateTime(c.closed_at) : '—'}</td><td><div class="row-icon-actions"><button class="icon-button history-view" data-id="${c.id}" data-tooltip="Ver conversa">${icon('chat',15)}</button><button class="icon-button history-reopen" data-id="${c.id}" data-tooltip="Reabrir">${icon('refresh',15)}</button></div></td></tr>`).join('') : `<tr><td colspan="9">${emptySmall('Nenhum atendimento finalizado')}</td></tr>`;
  }

  function exportHistoryCsv(rows) {
    const selected = new Set($$('.history-select:checked').map((box)=>Number(box.value)));
    const data = selected.size ? rows.filter((row)=>selected.has(Number(row.id))) : rows;
    const csv = ['Cliente,Telefone,Protocolo,Fila,Atendente,Motivo,Duração segundos,Encerrado em',...data.map((row)=>[row.contact_name,row.phone,row.protocol,row.queue_name,row.assigned_user_name||row.closed_by_user_name,row.close_reason_text||row.close_reason_name,row.duration_seconds||0,row.closed_at].map((value)=>`"${String(value??'').replaceAll('"','""')}"`).join(','))].join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='historico-atendimentos.csv';link.click();URL.revokeObjectURL(link.href);
  }

  function bindHistoryRows(rows) {
    $$('.history-view').forEach((button) => button.addEventListener('click', () => openHistoryConversation(Number(button.dataset.id))));
    $$('.history-reopen').forEach((button) => button.addEventListener('click', async () => {
      const row = rows.find((item) => Number(item.id) === Number(button.dataset.id));
      try { await api(`/conversations/${button.dataset.id}/reopen`, { method: 'POST' }); toast('Atendimento reaberto', `${row?.contact_name || 'A conversa'} voltou para a fila.`); await renderHistory(); }
      catch (error) { toast('Não foi possível reabrir', error.message, 'error'); }
    }));
  }

  async function openHistoryConversation(id) {
    const data = await api(`/conversations/${id}`); const c = data.conversation;
    openModal(`Histórico · ${c.contact_name}`, `<div class="history-summary"><span>${esc(c.protocol)}</span><span>${esc(c.close_reason_text || 'Sem motivo informado')}</span><span>Finalizado por ${esc(c.closed_by_user_name || 'Sistema')}</span></div><div class="history-messages">${data.messages.map(renderMessage).join('')}</div>`, `<button class="btn btn-outline close-modal-action">Fechar</button><button class="btn btn-primary" id="history-modal-reopen">Reabrir atendimento</button>`);
    bindAudioPlayers($('#modal-root'));
    $('.close-modal-action').addEventListener('click', closeModal);
    $('#history-modal-reopen').addEventListener('click', async () => { await api(`/conversations/${id}/reopen`, { method: 'POST' }); closeModal(); state.selectedConversationId = id; state.conversationStatus = 'all'; await navigate('chats'); await selectConversation(id); });
    const box = $('.history-messages'); if (box) box.scrollTop = box.scrollHeight;
  }

  function orderFilterQuery(view = '', filters = state.orderFilters) {
    filters ||= { period: 'today', status: '', from: '', to: '' };
    const params = new URLSearchParams();
    if (view) params.set('view', view);
    if (filters.period) params.set('period', filters.period);
    if (filters.status) params.set('status', filters.status);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }

  function orderFilterLabel(filters = state.orderFilters) {
    filters ||= { period: 'today', status: '', from: '', to: '' };
    if (filters.period === 'today') return 'Hoje · atualização ao vivo';
    if (filters.period === 'all' && !filters.from && !filters.to) return 'Todos os pedidos';
    return [filters.from, filters.to].filter(Boolean).join(' até ') || 'Filtro personalizado';
  }

  function orderFilterPopover({ kitchen = false, filters = state.orderFilters } = {}) {
    filters ||= { period: 'today', status: '', from: '', to: '' };
    return `<div id="order-filter-popover" class="filter-popover hidden"><div class="popover-title"><strong>Filtros</strong><button class="icon-button" id="close-order-filter">${icon('close',15)}</button></div><label>Período<select id="filter-period" class="custom-select"><option value="today" ${filters.period==='today'?'selected':''}>Hoje / Ao vivo</option><option value="all" ${filters.period==='all'?'selected':''}>Todos</option><option value="custom" ${filters.period==='custom'?'selected':''}>Personalizado</option></select></label><div class="filter-date-grid"><label>De<input id="filter-from" type="date" value="${esc(filters.from)}"></label><label>Até<input id="filter-to" type="date" value="${esc(filters.to)}"></label></div>${kitchen ? '' : `<label>Status<select id="filter-status" class="custom-select"><option value="">Todos</option>${['new','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled'].map((key)=>`<option value="${key}" ${filters.status===key?'selected':''}>${statusLabels[key]}</option>`).join('')}</select></label>`}<div class="popover-actions"><button class="btn btn-outline" id="clear-order-filter">Limpar</button><button class="btn btn-primary" id="apply-order-filter">Aplicar</button></div></div>`;
  }

  function bindOrderFilter(rerender, kitchen = false, filters = state.orderFilters) {
    filters ||= { period: 'today', status: '', from: '', to: '' };
    const popover = $('#order-filter-popover');
    $('#order-filter-button')?.addEventListener('click', (event) => { event.stopPropagation(); popover.classList.toggle('hidden'); });
    $('#close-order-filter')?.addEventListener('click', () => popover.classList.add('hidden'));
    popover?.addEventListener('click', (event) => event.stopPropagation());
    $('#apply-order-filter')?.addEventListener('click', async () => {
      const period = $('#filter-period').value;
      filters.period = period === 'custom' ? 'custom' : period;
      filters.from = period === 'custom' ? $('#filter-from').value : '';
      filters.to = period === 'custom' ? $('#filter-to').value : '';
      filters.status = kitchen ? '' : ($('#filter-status')?.value || '');
      await rerender();
    });
    $('#clear-order-filter')?.addEventListener('click', async () => { Object.assign(filters, { period: filters === state.ordersFilters ? 'all' : 'today', status: '', from: '', to: '' }); await rerender(); });
  }

  async function renderDeliveries() {
    const query = orderFilterQuery('delivery');
    const rows = await api(`/orders?${query}`);
    const out = rows.filter((order) => order.status === 'out_for_delivery');
    const delivered = rows.filter((order) => order.status === 'delivered');
    $('#page-content').innerHTML = `<div class="compact-page-toolbar"><div><h2>Entregas</h2><small>${orderFilterLabel()}</small></div><div class="toolbar-icons"><button class="icon-button" id="order-filter-button" data-tooltip="Filtrar entregas">${icon('filter',17)}</button><button class="icon-button" id="refresh-deliveries" data-tooltip="Atualizar">${icon('refresh',17)}</button></div></div>${orderFilterPopover()}
      <div class="delivery-grid"><section class="delivery-column"><header><div><h3>🛵 Saíram para entrega</h3></div><b>${out.length}</b></header><div class="delivery-stack">${out.map((o) => deliveryCard(o, true)).join('') || emptySmall('Nenhum pedido em rota')}</div></section><section class="delivery-column"><header><div><h3>✅ Entregues</h3></div><b>${delivered.length}</b></header><div class="delivery-stack delivered-stack">${delivered.map((o) => deliveryCard(o, false)).join('') || emptySmall('Nenhum pedido entregue')}</div></section></div>`;
    bindOrderFilter(renderDeliveries);
    $('#refresh-deliveries').addEventListener('click', renderDeliveries);
    $$('.mark-delivered').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; try { await api(`/orders/${button.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'delivered' }) }); toast('✅ Pedido entregue'); await renderDeliveries(); } catch (error) { button.disabled = false; toast('Erro', error.message, 'error'); } }));
  }

  function deliveryCard(order, active) {
    return `<article class="delivery-card ${order.edited_at?'order-edited-surface':''}"><div class="delivery-card-head"><div><span>Pedido</span><strong>#${String(order.id).padStart(4,'0')}</strong>${order.edited_at?'<small class="order-edited-badge">Pedido editado</small>':''}</div>${statusBadge(order.status)}</div><h4>${esc(order.contact_name)}</h4><p>${esc(order.address || 'Endereço não informado')}</p><div class="delivery-info"><span>Telefone <b>+${esc(order.phone)}</b></span><span>Total <b>${money(order.total)}</b></span><span>Saída/atualização <b>${dateTime(order.updated_at)}</b></span></div>${active ? `<button class="btn btn-primary mark-delivered" data-id="${order.id}">${icon('check',15)} Marcar como entregue</button>` : '<div class="delivered-label">Entrega confirmada</div>'}</article>`;
  }

  async function renderTeam(){
    const rows=await api('/users');
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><h2>Equipe</h2><button class="icon-button primary-icon" id="new-user" data-tooltip="Novo usuário">${icon('plus',17)}</button></div>
      <div class="team-summary"><span><b>${rows.filter((u)=>u.active).length}</b> ativos</span><span><b>${rows.filter((u)=>u.status==='online').length}</b> online</span><span><b>${rows.filter((u)=>u.receive_assignments).length}</b> recebem atendimentos</span></div>
      <div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Usuário</th><th>Perfil</th><th>Status</th><th>Atendimentos</th><th>Recebe novos</th><th></th></tr></thead><tbody>${rows.map((u)=>`<tr class="${u.active?'':'inactive-row'}"><td><div class="table-user"><span class="avatar">${initials(u.name)}</span><div><strong>${esc(u.name)}</strong><div class="muted contact-email">${esc(u.email)}</div></div></div></td><td>${roleLabel(u.role)}</td><td><span class="presence-label presence-${esc(u.status)}">${esc(presenceStatusLabel(u.status,u.pause_reason))}</span></td><td>${u.open_count||0}</td><td>${u.receive_assignments?'✅':'—'}</td><td><button class="icon-button edit-user" data-id="${u.id}" data-tooltip="Editar">${icon('edit',15)}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#new-user').addEventListener('click',()=>openUserModal());$$('.edit-user').forEach((button)=>button.addEventListener('click',()=>openUserModal(rows.find((u)=>Number(u.id)===Number(button.dataset.id)))));
  }

  function openUserModal(user=null){
    const savedStatus=user?.configured_status||user?.status||'online';
    openModal(user?'Editar usuário':'Novo usuário',`<form id="user-form" class="form-grid"><div class="field"><label>Nome exibido</label><input name="name" value="${esc(user?.name||'')}" required></div><div class="field"><label>E-mail</label><input name="email" type="email" value="${esc(user?.email||'')}" required></div><div class="field"><label>Perfil</label><select name="role" class="custom-select"><option value="agent" ${user?.role==='agent'?'selected':''}>Atendente</option><option value="admin" ${user?.role==='admin'?'selected':''}>Administrador</option><option value="supervisor" ${user?.role==='supervisor'?'selected':''}>Supervisor</option><option value="kitchen" ${user?.role==='kitchen'?'selected':''}>Cozinha</option></select></div><div class="field"><label>Setor</label><input name="sector" value="${esc(user?.sector||'Atendimento')}"></div><div class="field"><label>Status configurado</label><select name="status" class="custom-select"><option value="online" ${savedStatus==='online'?'selected':''}>Online quando conectado</option><option value="busy" ${savedStatus==='busy'?'selected':''}>Ocupado quando conectado</option><option value="paused" ${savedStatus==='paused'?'selected':''}>Pausado quando conectado</option><option value="offline" ${savedStatus==='offline'?'selected':''}>Sempre offline</option></select></div><div class="field"><label>${user?'Nova senha (opcional)':'Senha inicial'}</label><input name="password" type="password" ${user?'':'required'} minlength="6"></div><div class="field full switch-row"><div><strong>Receber novos atendimentos</strong><small>Inclui este usuário na distribuição automática.</small></div><label class="switch"><input name="receive_assignments" type="checkbox" ${user?.receive_assignments||(!user)?'checked':''}><span></span></label></div>${user?`<div class="field full switch-row"><div><strong>Usuário ativo</strong></div><label class="switch"><input name="active" type="checkbox" ${user.active?'checked':''}><span></span></label></div>`:''}</form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-user">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-user').addEventListener('click',async()=>{const form=$('#user-form');const payload=Object.fromEntries(new FormData(form).entries());payload.receive_assignments=form.querySelector('[name=receive_assignments]').checked;if(user)payload.active=form.querySelector('[name=active]').checked;try{await api(user?`/users/${user.id}`:'/users',{method:user?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Usuário salvo');await renderTeam();}catch(error){toast('Não foi possível salvar',error.message,'error');}});
  }

  function openProfileModal(){
    if (!state.user) return;
    const pref = state.user.preferences || {};
    openModal('Meu perfil', `<form id="profile-form" class="form-grid profile-form-modern">
      <div class="profile-modal-hero">
        <span id="profile-avatar-preview" class="avatar profile-avatar-preview">${initials(state.user.name)}</span>
        <div class="profile-modal-identity"><span class="eyebrow">CONTA DO SISTEMA</span><h3 id="profile-preview-name">${esc(state.user.name)}</h3><p>${esc(state.user.email || '')}</p><div><span>${esc(roleLabel(state.user.role))}</span><span>${esc(state.user.sector || 'Atendimento')}</span><span class="profile-status-chip status-${esc(state.user.status || 'offline')}">${esc(presenceStatusLabel(state.user.status,state.user.pause_reason))}</span></div></div>
      </div>
      <div class="field full profile-photo-field"><label>Foto do perfil</label><div class="profile-photo-row"><input id="profile-avatar-url" name="avatar_url" value="${esc(state.user.avatar_url||'')}" placeholder="Cole a URL da imagem"><button class="btn btn-soft" id="clear-profile-avatar" type="button">Remover foto</button></div><small>A prévia aparece automaticamente. Sem imagem, o sistema usa suas iniciais.</small></div>
      <div class="field"><label>Nome exibido nas mensagens</label><input id="profile-name-input" name="name" value="${esc(state.user.name)}" required></div>
      <div class="field"><label>Nova senha</label><input name="password" type="password" minlength="6" placeholder="Deixe vazio para manter"></div>
      <div class="field"><label>Tema</label><select name="theme" class="custom-select"><option value="light" ${pref.theme==='light'?'selected':''}>Claro</option><option value="dark" ${pref.theme==='dark'?'selected':''}>Escuro</option><option value="system" ${pref.theme==='system'?'selected':''}>Usar o tema do sistema</option></select></div>
      <div class="field"><label>Densidade da tela</label><select name="density" class="custom-select"><option value="comfortable" ${pref.density!=='compact'?'selected':''}>Confortável</option><option value="compact" ${pref.density==='compact'?'selected':''}>Compacta</option></select></div>
      <div class="field full switch-row profile-preference-row"><div><strong>Sons do sistema</strong><small>Avisos de novas mensagens, chamados e pedidos.</small></div><label class="switch"><input name="sounds_enabled" type="checkbox" ${pref.sounds_enabled!==false?'checked':''}><span></span></label></div>
      ${state.user.role==='agent'?`<div class="field full switch-row profile-preference-row"><div><strong>Receber novos atendimentos</strong><small>Desative para sair temporariamente da distribuição automática.</small></div><label class="switch"><input name="receive_assignments" type="checkbox" ${state.user.receive_assignments?'checked':''}><span></span></label></div>`:''}
    </form>`,`<button class="btn btn-outline close-modal-action" type="button">Cancelar</button><button class="btn btn-primary" id="save-profile" type="button">Salvar alterações</button>`,'wide');

    const form = $('#profile-form');
    const avatarInput = $('#profile-avatar-url');
    const nameInput = $('#profile-name-input');
    const preview = $('#profile-avatar-preview');
    const refreshPreview = () => {
      const name = String(nameInput?.value || state.user.name).trim() || state.user.name;
      renderAvatarTarget(preview,{ ...state.user,name,avatar_url:String(avatarInput?.value || '').trim() });
      if ($('#profile-preview-name')) $('#profile-preview-name').textContent = name;
    };
    refreshPreview();
    avatarInput?.addEventListener('input',refreshPreview);
    nameInput?.addEventListener('input',refreshPreview);
    $('#clear-profile-avatar')?.addEventListener('click',()=>{ avatarInput.value=''; refreshPreview(); avatarInput.focus(); });
    $('.close-modal-action')?.addEventListener('click',closeModal);
    $('#save-profile')?.addEventListener('click',async(event)=>{
      const button=event.currentTarget;
      const raw=Object.fromEntries(new FormData(form).entries());
      const receiveToggle=form.querySelector('[name=receive_assignments]');
      const payload={
        name:String(raw.name||'').trim(),
        password:raw.password,
        avatar_url:String(raw.avatar_url||'').trim(),
        receive_assignments:receiveToggle?receiveToggle.checked:Boolean(state.user.receive_assignments),
        preferences:{
          theme:raw.theme,
          density:raw.density,
          sounds_enabled:form.querySelector('[name=sounds_enabled]').checked,
          desktop_notifications:pref.desktop_notifications!==false,
          compact_mode:raw.density==='compact',
        },
      };
      button.disabled=true;
      button.textContent='Salvando...';
      try{
        const updated=await api('/profile',{method:'PUT',body:JSON.stringify(payload)});
        state.user={...state.user,...updated,preferences:payload.preferences};
        renderHeaderAvatar(state.user);
        applyUserPreferences(payload.preferences);
        closeModal();
        toast('Perfil atualizado','Suas alterações já estão ativas.');
      }catch(error){
        button.disabled=false;
        button.textContent='Salvar alterações';
        toast('Não foi possível atualizar',error.message,'error');
      }
    });
  }

  const orderStatusKeys = ['new','confirmed','preparing','ready','out_for_delivery','delivered','picked_up','cancelled'];

  async function openOrderEditModal(orderId, rerender = renderOrders) {
    const [order, products, orderConfig] = await Promise.all([api(`/orders/${orderId}`), api('/products'), api('/order-config')]);
    const existingByProduct = new Map((order.items || []).map((item) => [Number(item.product_id), item]));
    const availableProducts = products.filter((product) => product.active || existingByProduct.has(Number(product.id)));
    const normalizedPayment = ({ pix:'Pix', card:'Cartão', cash:'Dinheiro' })[String(order.payment_method || '').toLowerCase()] || order.payment_method || 'Pix';
    const isTable=order.fulfillment_method==='table';
    const isPickup=order.fulfillment_method==='pickup';
    openModal(`Editar pedido #${String(order.id).padStart(4,'0')}`, `
      <div class="order-edit-warning"><strong>✏️ Edição de pedido</strong><span>A cozinha verá o pedido marcado como editado. Nenhuma mensagem automática será enviada ao cliente.</span></div>
      <div class="order-customer order-builder-customer"><span class="conversation-avatar">${initials(order.contact_name)}</span><div><strong>${esc(order.contact_name)}</strong><small>+${esc(order.phone)}</small></div></div>
      <form id="edit-order-form" class="order-builder-form">
        <section class="order-builder-section"><div class="order-builder-section-head"><div><span>1</span><div><strong>Itens do pedido</strong><small>Use − e + para alterar as quantidades.</small></div></div></div><div class="order-builder-products">${availableProducts.map((product,index)=>{const item=existingByProduct.get(Number(product.id));return orderBuilderProductCard({...product,stock:product.stock==null?null:Number(product.stock)+Number(item?.quantity||0)},Number(item?.quantity||0),item?.notes||'',index);}).join('')||'<p class="muted">Nenhum produto disponível.</p>'}</div></section>
        <section class="order-builder-section"><div class="order-builder-section-head"><div><span>2</span><div><strong>Modalidade</strong><small>${isTable?'Pedidos de mesa permanecem na comanda.':'Altere apenas quando necessário.'}</small></div></div></div>${isTable?`<div class="info-box table-order-edit-info"><strong>🍽️ ${esc(order.table_name||'Pedido de mesa')}</strong><p>A modalidade não pode ser alterada.</p></div><input type="hidden" name="fulfillmentMethod" value="table">`:`<div class="builder-choice-grid"><label class="builder-choice"><input type="radio" name="fulfillmentMethod" value="delivery" ${isPickup?'':'checked'}><span>🛵</span><div><strong>Entrega</strong><small>Enviar ao endereço</small></div></label><label class="builder-choice"><input type="radio" name="fulfillmentMethod" value="pickup" ${isPickup?'checked':''}><span>🏪</span><div><strong>Retirada</strong><small>Cliente busca na loja</small></div></label></div>`}</section>
        <section class="order-builder-section"><div class="order-builder-section-head"><div><span>3</span><div><strong>Dados finais</strong><small>Confira os detalhes antes de salvar.</small></div></div><button type="button" class="order-general-note-button ${order.notes?'active':''}" data-toggle-general-note>📝 Observação geral</button></div><div class="form-grid order-builder-fields"><div class="field full ${isPickup||isTable?'hidden':''}" id="edit-order-address-field"><label>Endereço de entrega</label><textarea name="address" rows="2" placeholder="Rua, número, bairro e referência">${esc(order.address||'')}</textarea></div><div class="field full ${isPickup?'':'hidden'}" id="edit-order-pickup-info"><div class="info-box"><strong>🏪 Retirada na loja</strong><p>${esc(orderConfig.pickupAddress || 'Endereço não configurado')}</p></div></div><div class="field"><label>Taxa de entrega</label><input name="deliveryFee" id="edit-order-delivery-fee" data-builder-delivery-fee type="number" step="0.01" min="0" value="${Number(order.delivery_fee||0).toFixed(2)}" ${isTable||isPickup?'disabled':''}></div>${isTable?'<input type="hidden" name="paymentMethod" value="">':`<div class="field"><label>Forma de pagamento</label><div class="builder-payment-grid"><label><input type="radio" name="paymentMethod" value="Pix" ${normalizedPayment==='Pix'?'checked':''}><span>⚡ Pix</span></label><label><input type="radio" name="paymentMethod" value="Dinheiro" ${normalizedPayment==='Dinheiro'?'checked':''}><span>💵 Dinheiro</span></label><label><input type="radio" name="paymentMethod" value="Cartão" ${normalizedPayment==='Cartão'?'checked':''}><span>💳 Cartão</span></label></div></div>`}<div class="field full ${order.notes?'':'hidden'}" data-general-note-panel><label>Observações gerais</label><textarea name="notes" rows="3" placeholder="Troco, referência ou observações para a cozinha">${esc(order.notes||'')}</textarea></div></div></section>
        ${orderBuilderSummary()}
      </form>`,
      `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-order-edit">Salvar alterações</button>`, 'wide');
    $('.close-modal-action').addEventListener('click', closeModal);
    const root=$('#edit-order-form');
    const syncFulfillment=(value)=>{const pickup=!isTable&&value==='pickup';$('#edit-order-address-field').classList.toggle('hidden',pickup||isTable);$('#edit-order-pickup-info').classList.toggle('hidden',!pickup);$('#edit-order-delivery-fee').disabled=pickup||isTable;if(pickup||isTable)$('#edit-order-delivery-fee').value='0.00';else if(!Number($('#edit-order-delivery-fee').value))$('#edit-order-delivery-fee').value=Number(orderConfig.deliveryFee||0).toFixed(2);};
    bindOrderBuilder(root,{onFulfillmentChange:syncFulfillment}); syncFulfillment(isTable?'table':(isPickup?'pickup':'delivery'));
    $('#save-order-edit').addEventListener('click', async () => {
      const button = $('#save-order-edit');
      const items = collectOrderBuilderItems(root).map((item)=>({productId:item.productId,quantity:item.quantity,notes:item.notes}));
      if(!items.length) return toast('O pedido precisa ter itens','Adicione pelo menos um produto.','error');
      const form = Object.fromEntries(new FormData(root).entries());
      form.deliveryFee = isTable || form.fulfillmentMethod === 'pickup' ? 0 : Number($('#edit-order-delivery-fee').value || 0);
      button.disabled = true;
      try {
        await api(`/orders/${order.id}`, { method: 'PUT', body: JSON.stringify({ ...form, items }) });
        closeModal();
        toast('Pedido editado', `Pedido #${String(order.id).padStart(4,'0')} atualizado para a cozinha.`);
        await rerender();
      } catch (error) {
        button.disabled = false;
        toast('Não foi possível editar', error.message, 'error');
      }
    });
  }


  async function openOrderStatusModal(order) {
    const availableStatusKeys = order.fulfillment_method === 'table'
      ? ['new','confirmed','preparing','ready','delivered','cancelled']
      : order.fulfillment_method === 'pickup'
        ? ['new','confirmed','preparing','ready','picked_up','cancelled']
        : ['new','confirmed','preparing','ready','out_for_delivery','delivered','cancelled'];
    const options = availableStatusKeys.map((key) => `<button type="button" class="order-status-choice ${order.status===key?'active':''}" data-order-status="${key}"><span>${statusBadge(key)}</span><small>${order.status===key?'Status atual':'Alterar para este status'}</small></button>`).join('');
    openModal(`Status do pedido #${String(order.id).padStart(4,'0')}`, `<div class="order-status-editor"><p>Escolha o novo status. A alteração será salva na hora e atualizada nas telas de Pedidos, Cozinha e Entregas.</p><div class="order-status-grid">${options}</div></div>`, `<button class="btn btn-outline close-modal-action">Fechar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    $$('[data-order-status]', $('#modal-root')).forEach((button) => button.addEventListener('click', async () => {
      const status = button.dataset.orderStatus;
      if (status === order.status) return closeModal();
      if (status === 'cancelled') { closeModal(); return openCancelOrderModal(order.id, renderOrders); }
      $$('[data-order-status]', $('#modal-root')).forEach((item) => { item.disabled = true; });
      try {
        await api(`/orders/${order.id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
        closeModal();
        toast('Status atualizado', `Pedido #${String(order.id).padStart(4,'0')} agora está como ${statusLabels[status]}.`);
        await renderOrders();
      } catch (error) {
        $$('[data-order-status]', $('#modal-root')).forEach((item) => { item.disabled = false; });
        toast('Não foi possível atualizar', error.message, 'error');
      }
    }));
  }

  async function openCancelOrderModal(orderId, rerender) {
    const order = await api(`/orders/${orderId}`);
    openModal(`Cancelar pedido #${String(order.id).padStart(4,'0')}`, `<div class="cancel-order-review">
      <div class="warning-box"><strong>Confira antes de cancelar</strong><p>O estoque dos itens será devolvido e o cancelamento ficará registrado na auditoria e nos relatórios.</p></div>
      <div class="cancel-order-items">${order.items.map((item)=>`<div><span>${item.quantity}x ${esc(item.name)}</span><strong>${money(item.quantity*item.unit_price)}</strong></div>`).join('')}</div>
      <div class="detail-row"><span>Cliente</span><strong>${esc(order.contact_name)}</strong></div><div class="detail-row"><span>Total</span><strong>${money(order.total)}</strong></div>
      <div class="field"><label>Motivo do cancelamento</label><textarea id="cancel-order-reason" rows="3" placeholder="Ex.: cliente desistiu, produto indisponível..." required></textarea></div>
      <label class="confirmation-check"><input type="checkbox" id="cancel-order-confirmation"><span>Confirmo que revisei o pedido e desejo cancelá-lo.</span></label>
    </div>`, `<button class="btn btn-outline close-modal-action">Voltar</button><button class="btn btn-danger" id="confirm-order-cancellation">Cancelar pedido</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    $('#confirm-order-cancellation').addEventListener('click',async()=>{
      const reason=$('#cancel-order-reason').value.trim();
      if(reason.length<3)return toast('Informe o motivo do cancelamento','','error');
      if(!$('#cancel-order-confirmation').checked)return toast('Confirme que revisou o pedido','','error');
      const button=$('#confirm-order-cancellation');button.disabled=true;
      try{await api(`/orders/${orderId}/status`,{method:'PUT',body:JSON.stringify({status:'cancelled',cancelReason:reason})});closeModal();toast('Pedido cancelado',reason);await rerender();}
      catch(error){button.disabled=false;toast('Não foi possível cancelar',error.message,'error');}
    });
  }

  async function renderOrders() {
    const filters = state.ordersFilters ||= { period: 'all', status: '', from: '', to: '' };
    const rows = await api(`/orders?${orderFilterQuery('', filters)}`);
    $('#page-content').innerHTML = `<div class="compact-page-toolbar"><div><h2>Pedidos</h2><small>${orderFilterLabel(filters)}</small></div><div class="toolbar-icons"><button class="icon-button" id="open-order-site" data-tooltip="Abrir site de pedidos">↗</button><button class="icon-button" id="order-filter-button" data-tooltip="Filtrar pedidos">${icon('filter',17)}</button><button class="icon-button" id="open-deliveries" data-tooltip="Entregas">${icon('truck',17)}</button><button class="icon-button" id="refresh-orders" data-tooltip="Atualizar">${icon('refresh',17)}</button></div></div>${orderFilterPopover({ filters })}
      <div class="table-card"><div class="table-scroll"><table class="data-table orders-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Modalidade</th><th>Itens</th><th>Pagamento</th><th>Total</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead><tbody>${rows.map((o) => `<tr class="${o.edited_at?'order-edited-row':''}"><td><strong>#${String(o.id).padStart(4,'0')}</strong>${o.source==='website'?'<span class="order-source-badge">Site</span>':''}${o.whatsapp_receipt_status==='failed'?'<span class="order-whatsapp-badge" title="O pedido está salvo, mas a mensagem inicial não foi confirmada pelo WhatsApp.">WhatsApp pendente</span>':''}${o.edited_at?`<span class="order-edited-badge" title="Editado em ${dateTime(o.edited_at)}${o.edited_by_user_name?` por ${esc(o.edited_by_user_name)}`:''}">Pedido editado</span>`:''}</td><td><div><strong>${esc(o.contact_name)}</strong><div class="muted contact-email">+${esc(o.phone)}</div></div></td><td>${orderFulfillmentBadge(o)}</td><td>${o.items_count}</td><td>${esc(orderPaymentLabel(o))}</td><td><strong>${money(o.total)}</strong></td><td><div class="order-status-cell">${statusBadge(o.status)}${o.cancel_reason?`<small class="cancel-reason-inline">${esc(o.cancel_reason)}</small>`:''}<button class="icon-button edit-order-status" type="button" data-id="${o.id}" data-tooltip="Editar status">${icon('refresh',15)}</button></div></td><td>${dateTime(o.created_at)}</td><td><div class="row-icon-actions"><button class="icon-button view-order" type="button" data-id="${o.id}" data-tooltip="Exibir todos os detalhes">${icon('eye',15)}</button><button class="icon-button edit-order" type="button" data-id="${o.id}" data-tooltip="Editar pedido" ${['delivered','picked_up','cancelled'].includes(o.status)?'disabled':''}>${icon('edit',15)}</button>${!['delivered','picked_up','cancelled'].includes(o.status)?`<button class="icon-button danger-icon cancel-order-row" type="button" data-id="${o.id}" data-tooltip="Cancelar pedido">${icon('close',15)}</button>`:''}</div></td></tr>`).join('') || `<tr><td colspan="9">${emptySmall('Nenhum pedido neste filtro')}</td></tr>`}</tbody></table></div></div>`;
    bindOrderFilter(renderOrders, false, filters);
    $('#refresh-orders').addEventListener('click', renderOrders);
    $('#open-order-site').addEventListener('click', () => window.open('/pedido', '_blank', 'noopener'));
    $('#open-deliveries').addEventListener('click', () => navigate('deliveries'));
    $$('.view-order').forEach((button) => button.addEventListener('click', () => openOrderDetailsModal(Number(button.dataset.id))));
    $$('.edit-order-status').forEach((button) => button.addEventListener('click', () => {
      const order = rows.find((item) => Number(item.id) === Number(button.dataset.id));
      if (order) openOrderStatusModal(order);
    }));
    $$('.edit-order').forEach((button) => button.addEventListener('click', () => openOrderEditModal(Number(button.dataset.id), renderOrders)));
    $$('.cancel-order-row').forEach((button)=>button.addEventListener('click',()=>openCancelOrderModal(Number(button.dataset.id),renderOrders)));
  }

  async function renderKitchen() {
    const kitchenParams = new URLSearchParams({ period: state.orderFilters.period || 'today' }); if (state.orderFilters.from) kitchenParams.set('from', state.orderFilters.from); if (state.orderFilters.to) kitchenParams.set('to', state.orderFilters.to);
    const rows = await api(`/kitchen/orders?${kitchenParams.toString()}`);
    const unseen = rows.filter((order) => !order.kitchen_seen_at).map((order) => order.id);
    if (unseen.length) {
      await api('/kitchen/orders/seen', { method: 'POST', body: JSON.stringify({ ids: unseen }) });
      const seenAt = new Date().toISOString();
      rows.forEach((order) => { if (unseen.includes(order.id)) order.kitchen_seen_at = seenAt; });
    }
    $('#page-content').innerHTML = `<div class="compact-page-toolbar kitchen-head"><div><h2>👨‍🍳 Cozinha</h2><small>${orderFilterLabel()}</small></div><div class="toolbar-icons"><button class="icon-button" id="order-filter-button" data-tooltip="Filtrar pedidos">${icon('filter',17)}</button><button class="icon-button" id="refresh-kitchen" data-tooltip="Atualizar">${icon('refresh',17)}</button></div></div>${orderFilterPopover({ kitchen: true })}
      <div class="kitchen-columns">${kitchenColumn('confirmed', 'Novos pedidos', rows.filter((order) => order.status === 'confirmed'))}${kitchenColumn('preparing', 'Em preparo', rows.filter((order) => order.status === 'preparing'))}${kitchenColumn('ready', 'Prontos', rows.filter((order) => order.status === 'ready'))}</div>`;
    bindOrderFilter(renderKitchen, true);
    $('#refresh-kitchen').addEventListener('click', renderKitchen);
    $$('.kitchen-action').forEach((button) => button.addEventListener('click', async () => { button.disabled = true; try { await api(`/orders/${button.dataset.id}/status`, { method: 'PUT', body: JSON.stringify({ status: button.dataset.status }) }); toast('✅ Pedido atualizado'); await renderKitchen(); } catch (error) { button.disabled = false; toast('Erro ao atualizar', error.message, 'error'); } }));
    $$('.edit-kitchen-order').forEach((button) => button.addEventListener('click', () => openOrderEditModal(Number(button.dataset.id), renderKitchen)));
    $$('.cancel-kitchen-order').forEach((button) => button.addEventListener('click', () => openCancelOrderModal(Number(button.dataset.id),renderKitchen)));
  }

  function kitchenStack(rows) {
    if (!rows.length) return `<div class="kitchen-empty">Nenhum pedido nesta etapa.</div>`;
    const tableGroups=new Map(); const standalone=[];
    for(const order of rows){
      if(order.fulfillment_method==='table'&&order.table_id){
        const key=String(order.table_id);
        if(!tableGroups.has(key))tableGroups.set(key,{name:order.table_name||'Mesa',orders:[]});
        tableGroups.get(key).orders.push(order);
      }else standalone.push(order);
    }
    const grouped=[...tableGroups.values()].map((group)=>`<section class="kitchen-table-group"><header><div><span>🍽️</span><strong>${esc(group.name)}</strong></div><small>${group.orders.length} ${group.orders.length===1?'pedido':'pedidos'}</small></header><div>${group.orders.map(kitchenCard).join('')}</div></section>`);
    return [...grouped,...standalone.map(kitchenCard)].join('');
  }

  function kitchenColumn(status, title, rows) {
    return `<section class="kitchen-column status-column-${status}"><header><div><h3>${esc(title)}</h3><span>${rows.length}</span></div></header><div class="kitchen-stack">${kitchenStack(rows)}</div></section>`;
  }

  function kitchenCard(order) {
    const isTable = order.fulfillment_method === 'table';
    const isPickup = order.fulfillment_method === 'pickup';
    const next = order.status === 'confirmed'
      ? ['preparing', 'Iniciar preparo']
      : order.status === 'preparing'
        ? ['ready', isTable ? 'Pronto para servir' : (isPickup ? 'Pronto para retirada' : 'Marcar como pronto')]
        : isTable
          ? ['delivered', 'Entregue na mesa']
          : isPickup
            ? ['picked_up', 'Marcar como retirado']
            : ['out_for_delivery', 'Liberar para entrega'];
    const fulfillmentLabel = isTable ? `Consumo no local · ${order.table_name || 'Mesa'}` : (isPickup ? 'Retirada na loja' : 'Entrega');
    return `<article class="kitchen-card ${!order.kitchen_seen_at ? 'new' : ''} ${order.edited_at?'order-edited-surface':''} ${isTable?'table-kitchen-card':''}">
      <div class="kitchen-card-head"><div><span>Pedido</span><strong>#${String(order.id).padStart(4, '0')}</strong>${isTable?`<small class="order-table-badge">${esc(order.table_name || 'Mesa')}</small>`:''}${order.edited_at?'<small class="order-edited-badge">Pedido editado</small>':''}</div><div class="kitchen-card-head-actions"><time>${dateTime(order.created_at)}</time><button class="icon-button edit-kitchen-order" type="button" data-id="${order.id}" data-tooltip="Editar pedido" aria-label="Editar pedido">${icon('edit',15)}</button></div></div>
      <h4>${esc(order.contact_name)}</h4>
      <div class="kitchen-items">${order.items.map((item) => `<div><b>${item.quantity}x</b><span>${esc(item.name)}${item.notes ? `<small>${esc(item.notes)}</small>` : ''}</span></div>`).join('')}</div>
      ${order.notes ? `<div class="kitchen-note"><strong>Observação:</strong> ${esc(order.notes)}</div>` : ''}
      <div class="kitchen-meta"><span><b>Modalidade:</b> ${esc(fulfillmentLabel)}</span>${order.fulfillment_method === 'delivery' ? `<span><b>Endereço:</b> ${esc(order.address || 'Não informado')}</span><span><b>Taxa:</b> ${money(order.delivery_fee)}</span>` : ''}<span><b>Pagamento:</b> ${esc(orderPaymentLabel(order))}</span><span><b>Total:</b> ${money(order.total)}</span></div>
      <div class="kitchen-card-actions"><button class="btn btn-danger cancel-kitchen-order" data-id="${order.id}">Cancelar pedido</button><button class="btn btn-primary kitchen-action" data-id="${order.id}" data-status="${next[0]}">${next[1]}</button></div>
    </article>`;
  }


  function restaurantTableStatusLabel(table) {
    if (!table.active) return 'Desativada';
    if (table.status === 'blocked') return 'Bloqueada';
    if (table.tab?.status === 'account_requested') return 'Conta solicitada';
    if (table.tab) return 'Ocupada';
    return 'Livre';
  }

  function restaurantTableStatusClass(table) {
    if (!table.active || table.status === 'blocked') return 'blocked';
    if (table.tab?.status === 'account_requested') return 'bill';
    if (table.tab) return 'occupied';
    return 'free';
  }

  function tableOrderStatusText(status) {
    if (status === 'ready') return 'Pronto para servir';
    if (status === 'delivered') return 'Entregue na mesa';
    return statusLabels[status] || status || 'Novo';
  }

  async function openRestaurantTableModal(table = null) {
    openModal(table ? 'Editar mesa' : 'Nova mesa', `<form id="restaurant-table-form" class="form-grid">
      <div class="field full"><label>Nome ou número da mesa</label><input name="name" maxlength="80" required value="${esc(table?.name || '')}" placeholder="Ex.: Mesa 01"></div>
      ${table ? `<div class="field full switch-row"><div><strong>Mesa ativa</strong><small>Mesas desativadas não aceitam novos vínculos pelo QR Code.</small></div><label class="switch"><input name="active" type="checkbox" ${table.active ? 'checked' : ''}><span></span></label></div><div class="field full switch-row"><div><strong>Bloquear temporariamente</strong><small>Disponível apenas quando não houver comanda aberta.</small></div><label class="switch"><input name="blocked" type="checkbox" ${table.status === 'blocked' ? 'checked' : ''}><span></span></label></div>` : ''}
    </form>`, `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button><button class="btn btn-primary" id="save-restaurant-table" type="button">Salvar mesa</button>`);
    $('.close-modal-action')?.addEventListener('click', closeModal);
    $('#save-restaurant-table')?.addEventListener('click', async () => {
      const form = $('#restaurant-table-form');
      const raw = Object.fromEntries(new FormData(form).entries());
      const payload = { name: String(raw.name || '').trim() };
      if (table) {
        payload.active = form.querySelector('[name=active]').checked;
        payload.blocked = form.querySelector('[name=blocked]').checked;
      }
      try {
        await api(table ? `/tables/${table.id}` : '/tables', { method: table ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        closeModal();
        toast(table ? 'Mesa atualizada' : 'Mesa criada');
        await renderTables();
      } catch (error) { toast('Não foi possível salvar', error.message, 'error'); }
    });
  }

  async function openRestaurantTableQr(table) {
    try {
      const qr = await api(`/tables/${table.id}/qr`);
      openModal(`QR Code · ${table.name}`, `<div class="table-qr-modal">
        <div class="table-qr-preview"><img src="${esc(qr.dataUrl)}" alt="QR Code de ${esc(table.name)}"></div>
        <p>Ao escanear, o cliente confirma que deseja vincular o aparelho à <strong>${esc(table.name)}</strong>.</p>
        <label>Link da mesa</label><div class="copy-link-row"><input id="table-qr-url" readonly value="${esc(qr.url)}"><button class="btn btn-soft" id="copy-table-url" type="button">Copiar</button></div>
        <div class="table-qr-warning">O token protege a mesa contra troca manual do número na URL. Gere outro QR Code se o código for exposto ou perdido.</div>
      </div>`, `<button class="btn btn-outline close-modal-action" type="button">Fechar</button><button class="btn btn-soft" id="regenerate-table-qr" type="button">Gerar novo código</button><button class="btn btn-primary" id="print-table-qr" type="button">Imprimir QR Code</button>`, 'wide');
      $('.close-modal-action')?.addEventListener('click', closeModal);
      $('#copy-table-url')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(qr.url); toast('Link copiado'); } catch { $('#table-qr-url').select(); document.execCommand('copy'); toast('Link copiado'); } });
      $('#print-table-qr')?.addEventListener('click', () => {
        const popup = window.open('', '_blank', 'width=620,height=760');
        if (!popup) return toast('Permita pop-ups para imprimir o QR Code', '', 'error');
        popup.document.write(`<!doctype html><html><head><title>${esc(table.name)}</title><style>body{font-family:Arial;text-align:center;padding:35px}img{width:420px;max-width:90%}h1{margin-bottom:4px}p{font-size:18px;color:#444}</style></head><body><h1>${esc(table.name)}</h1><p>Escaneie para acessar o cardápio e fazer seu pedido.</p><img src="${esc(qr.dataUrl)}"><script>window.onload=()=>window.print()<\/script></body></html>`);
        popup.document.close();
      });
      $('#regenerate-table-qr')?.addEventListener('click', async () => {
        const confirmed = await confirmAction('Gerar outro QR Code', `O QR Code atual da ${table.name} deixará de funcionar. Deseja continuar?`, 'Gerar novo código');
        if (!confirmed) return;
        await api(`/tables/${table.id}/regenerate-qr`, { method:'POST' });
        closeModal(); toast('Novo QR Code gerado'); await renderTables();
      });
    } catch (error) { toast('Não foi possível gerar o QR Code', error.message, 'error'); }
  }

  function tablePaymentMethodLabel(method) {
    return ({ pix:'Pix', card:'Cartão', cash:'Dinheiro', other:'Outro' })[method] || method || 'Não informado';
  }

  function tableRequestMeta(type) {
    const map = {
      bill: ['🧾','Conta solicitada'], waiter: ['🛎️','Garçom chamado'], napkins: ['🧻','Guardanapos'],
      cutlery: ['🍴','Talheres'], problem: ['⚠️','Problema informado'], change: ['✏️','Alteração solicitada'],
    };
    return map[type] || ['🛎️','Solicitação da mesa'];
  }

  function memberOpenConsumption(table, memberId) {
    const consumed = (table.orders || []).filter((order)=>Number(order.member_id)===Number(memberId) && order.status!=='cancelled').reduce((sum,order)=>sum+Number(order.total||0),0);
    const paid = (table.payments || []).filter((payment)=>Number(payment.member_id)===Number(memberId)).reduce((sum,payment)=>sum+Number(payment.amount||0),0);
    return Math.max(0,consumed-paid);
  }

  async function openRestaurantTablePayment(table) {
    const balance = Number(table.balance ?? Math.max(0,Number(table.total||0)-Number(table.paidTotal||0)));
    if (balance <= .001) return toast('Comanda quitada','Não existe valor pendente nesta mesa.');
    const members = table.members || [];
    openModal(`Registrar pagamento · ${table.name}`, `<form id="table-payment-form" class="table-payment-form">
      <div class="table-payment-summary"><div><span>Total da comanda</span><strong>${money(table.total||0)}</strong></div><div><span>Já pago</span><strong>${money(table.paidTotal||0)}</strong></div><div class="balance"><span>Saldo restante</span><strong data-payment-balance>${money(balance)}</strong></div></div>
      <section class="order-builder-section"><div class="order-builder-section-head"><div><span>1</span><div><strong>Como dividir</strong><small>Escolha como este pagamento será registrado.</small></div></div></div><div class="builder-choice-grid table-payment-scopes">
        <label class="builder-choice"><input type="radio" name="scope" value="full" checked><span>✅</span><div><strong>Quitar tudo</strong><small>${money(balance)}</small></div></label>
        <label class="builder-choice"><input type="radio" name="scope" value="equal"><span>➗</span><div><strong>Dividir igualmente</strong><small>${members.length?money(balance/members.length):'Sem pessoas'}</small></div></label>
        <label class="builder-choice"><input type="radio" name="scope" value="member"><span>👤</span><div><strong>Por pessoa</strong><small>Vincular a um cliente</small></div></label>
        <label class="builder-choice"><input type="radio" name="scope" value="partial"><span>💰</span><div><strong>Valor parcial</strong><small>Informar manualmente</small></div></label>
      </div></section>
      <section class="order-builder-section"><div class="order-builder-section-head"><div><span>2</span><div><strong>Forma de pagamento</strong><small>Registre como o valor foi recebido.</small></div></div></div><div class="builder-choice-grid table-payment-methods">
        <label class="builder-choice"><input type="radio" name="paymentMethod" value="pix" checked><span>◆</span><div><strong>Pix</strong><small>Pagamento instantâneo</small></div></label>
        <label class="builder-choice"><input type="radio" name="paymentMethod" value="card"><span>💳</span><div><strong>Cartão</strong><small>Crédito ou débito</small></div></label>
        <label class="builder-choice"><input type="radio" name="paymentMethod" value="cash"><span>💵</span><div><strong>Dinheiro</strong><small>Recebido no caixa</small></div></label>
        <label class="builder-choice"><input type="radio" name="paymentMethod" value="other"><span>•••</span><div><strong>Outro</strong><small>Outra forma</small></div></label>
      </div></section>
      <section class="order-builder-section"><div class="form-grid order-builder-fields">
        <div class="field full hidden" data-payment-member-field><label>Quem está pagando</label><select name="memberId"><option value="">Selecione</option>${members.map((member)=>`<option value="${member.id}">${esc(member.display_name||member.contact_name||'Cliente')} · saldo ${money(memberOpenConsumption(table,member.id))}</option>`).join('')}</select></div>
        <div class="field"><label>Valor recebido</label><input name="amount" type="number" min="0.01" step="0.01" value="${balance.toFixed(2)}"></div>
        <div class="field"><label>Observação</label><input name="note" maxlength="240" placeholder="Opcional"></div>
      </div></section>
    </form>`, `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button><button class="btn btn-primary" id="save-table-payment" type="button">Registrar pagamento</button>`, 'wide');
    $('.close-modal-action')?.addEventListener('click',closeModal);
    const form=$('#table-payment-form');
    const amount=form.elements.amount;
    const memberField=$('[data-payment-member-field]',form);
    const sync=()=>{
      const scope=new FormData(form).get('scope')||'full';
      memberField.classList.toggle('hidden',scope!=='member');
      amount.readOnly=scope==='full';
      if(scope==='full') amount.value=balance.toFixed(2);
      else if(scope==='equal') amount.value=(members.length?balance/members.length:balance).toFixed(2);
      else if(scope==='member') {
        const memberId=Number(form.elements.memberId.value||members[0]?.id||0);
        if(!form.elements.memberId.value&&memberId)form.elements.memberId.value=String(memberId);
        amount.value=Math.min(balance,memberOpenConsumption(table,memberId)||balance).toFixed(2);
      }
    };
    $$('input[name="scope"]',form).forEach((input)=>input.addEventListener('change',sync));
    form.elements.memberId?.addEventListener('change',sync); sync();
    $('#save-table-payment')?.addEventListener('click',async()=>{
      const button=$('#save-table-payment'); const data=new FormData(form);
      button.disabled=true;
      try {
        await api(`/tables/${table.id}/payments`,{method:'POST',body:JSON.stringify({scope:data.get('scope'),paymentMethod:data.get('paymentMethod'),memberId:data.get('memberId')||null,amount:Number(data.get('amount')||0),note:String(data.get('note')||'')})});
        closeModal(); toast('Pagamento registrado'); await renderTables();
      } catch(error){button.disabled=false;toast('Não foi possível registrar',error.message,'error');}
    });
  }

  async function releaseRestaurantTable(table) {
    const balance = Number(table.balance ?? Math.max(0,Number(table.total||0)-Number(table.paidTotal||0)));
    const warning = balance > .001 ? ` Ainda existe saldo de ${money(balance)}. A liberação continuará, mas ficará registrada sem quitação completa.` : ' A comanda está quitada.';
    const confirmed = await confirmAction('Fechar conta e liberar mesa', `Deseja encerrar a comanda da ${table.name} e desvincular todos os aparelhos?${warning}`, 'Liberar mesa');
    if (!confirmed) return;
    try { await api(`/tables/${table.id}/release`, { method:'POST', body:JSON.stringify({ note:'Conta encerrada pelo painel.' }) }); toast('Mesa liberada'); await renderTables(); }
    catch (error) { toast('Não foi possível liberar', error.message, 'error'); }
  }

  async function resolveRestaurantTableRequest(requestId) {
    try { await api(`/table-requests/${requestId}/resolve`, { method:'POST' }); toast('Chamado resolvido'); await renderTables(); }
    catch (error) { toast('Não foi possível resolver', error.message, 'error'); }
  }

  async function renderTables() {
    const data = await api('/tables');
    const rows = data.tables || [];
    const canConfigure = ['admin','supervisor'].includes(state.user?.role);
    const occupied = rows.filter((table)=>table.tab).length;
    const pending = rows.reduce((sum,table)=>sum+(table.pendingRequests?.length||0),0);
    $('#page-content').innerHTML = `<div class="page-head"><div><h2>Mesas e comandas</h2><p>Acompanhe ocupação, clientes, pedidos, chamados e fechamento das comandas.</p></div><div class="actions"><button class="btn btn-soft" id="refresh-restaurant-tables" type="button">${icon('refresh',16)} Atualizar</button>${canConfigure?`<button class="btn btn-primary" id="new-restaurant-table" type="button">${icon('plus',16)} Nova mesa</button>`:''}</div></div>
      ${!data.enabled ? `<div class="module-disabled-banner"><div>🪑</div><section><strong>O módulo de mesas está desativado</strong><p>${canConfigure?'Ative em Configurações → Site.':'Peça a um administrador para ativar o módulo.'} O atendimento normal pelo WhatsApp continua funcionando.</p></section>${canConfigure?'<button class="btn btn-soft" id="open-table-settings" type="button">Abrir configurações</button>':''}</div>` : ''}
      <div class="table-summary-grid"><article><span>Total de mesas</span><strong>${rows.length}</strong></article><article><span>Ocupadas</span><strong>${occupied}</strong></article><article><span>Chamados pendentes</span><strong>${pending}</strong></article><article><span>Consumo aberto</span><strong>${money(rows.reduce((sum,row)=>sum+Number(row.total||0),0))}</strong></article></div>
      <div class="restaurant-table-grid">${rows.map((table)=>{
        const statusClass=restaurantTableStatusClass(table); const requests=table.pendingRequests||[]; const orders=table.orders||[]; const members=table.members||[];
        return `<article class="restaurant-table-card ${statusClass} ${Number(state.focusTableId)===Number(table.id)?'focus-table':''}" data-table-id="${table.id}">
          <header><div class="restaurant-table-icon">${table.tab?'🍽️':'🪑'}</div><div><h3>${esc(table.name)}</h3><span class="table-state ${statusClass}">${restaurantTableStatusLabel(table)}</span></div><div class="restaurant-table-header-actions"><button class="icon-button show-table-history" data-id="${table.id}" data-tooltip="Histórico da mesa" aria-label="Histórico da mesa">${icon('history',16)}</button>${canConfigure?`<button class="icon-button edit-restaurant-table" data-id="${table.id}" data-tooltip="Editar mesa" aria-label="Editar mesa">${icon('edit',16)}</button>`:''}</div></header>
          <div class="restaurant-table-metrics"><div><span>Comanda</span><strong>${table.tab?`#${String(table.tab.id).padStart(4,'0')}`:'—'}</strong></div><div><span>Pessoas</span><strong>${members.length}</strong></div><div><span>Pedidos</span><strong>${orders.length}</strong></div><div><span>Total</span><strong>${money(table.total||0)}</strong></div>${table.tab?`<div><span>Pago</span><strong>${money(table.paidTotal||0)}</strong></div><div><span>Restante</span><strong>${money(table.balance||0)}</strong></div>`:''}</div>
          ${members.length?`<div class="table-member-section"><div class="table-section-title"><strong>Quem está na mesa</strong><span>${members.length}</span></div><div class="table-member-list">${members.map((member)=>`<div class="table-member-row"><span class="table-member-avatar">${initials(member.display_name||member.contact_name||'Cliente')}</span><div><strong>${esc(member.display_name||member.contact_name||'Cliente')}</strong><small>${member.phone?`+${esc(member.phone)}`:`Vinculado ${timeAgo(member.joined_at)}`}</small></div>${member.conversation_id?`<button class="btn btn-small btn-soft open-table-conversation" type="button" data-conversation-id="${member.conversation_id}">Atendimento</button>`:''}</div>`).join('')}</div></div>`:''}
          ${requests.length?`<div class="table-request-list">${requests.map((request)=>{const meta=tableRequestMeta(request.request_type);return `<div class="table-request ${request.request_type==='bill'?'bill':''}"><span>${meta[0]}</span><div><strong>${meta[1]}</strong><small>${esc(request.message||'')} · ${dateTime(request.created_at)}</small></div><button class="btn btn-small btn-soft resolve-table-request" data-id="${request.id}">Resolver</button></div>`;}).join('')}</div>`:''}
          ${orders.length?`<div class="table-order-mini-list">${orders.slice(-5).reverse().map((order)=>`<div><span>#${String(order.id).padStart(4,'0')} · ${esc(order.contact_name||'Cliente')}</span><strong>${tableOrderStatusText(order.status)} · ${money(order.total)}</strong></div>`).join('')}</div>`:`<div class="table-empty-copy">${table.tab?'Aguardando o primeiro pedido desta comanda.':'Leia o QR Code para abrir uma nova comanda.'}</div>`}
          <footer>${canConfigure?`<button class="btn btn-soft btn-small show-table-qr" data-id="${table.id}" type="button">QR Code</button>`:''}${table.tab?`<button class="btn btn-soft btn-small register-table-payment" data-id="${table.id}" type="button">💳 Pagamento</button><button class="btn btn-danger btn-small release-table" data-id="${table.id}" type="button">Fechar e liberar</button>`:''}</footer>
        </article>`;
      }).join('') || `<div class="empty-state restaurant-table-empty">🪑<h3>Nenhuma mesa cadastrada</h3><p>${canConfigure?'Crie a primeira mesa nas configurações para gerar o QR Code.':'Ainda não há mesas cadastradas.'}</p></div>`}</div>`;
    state.focusTableId = null;
    $('#refresh-restaurant-tables')?.addEventListener('click', renderTables);
    $('#new-restaurant-table')?.addEventListener('click',()=>openRestaurantTableModal());
    $('#open-table-settings')?.addEventListener('click',async()=>{state.settingsSection='site';localStorage.setItem('gm_settings_section','site');await navigate('settings');});
    $$('.restaurant-table-card').forEach((card)=>card.addEventListener('contextmenu',(event)=>openRestaurantTableContext(event,rows.find((item)=>Number(item.id)===Number(card.dataset.tableId)),canConfigure)));
    $$('.show-table-history').forEach((button)=>button.addEventListener('click',(event)=>{event.stopPropagation();openRestaurantTableHistory(rows.find((item)=>Number(item.id)===Number(button.dataset.id)));}));
    $$('.edit-restaurant-table').forEach((button)=>button.addEventListener('click',(event)=>{event.stopPropagation();openRestaurantTableModal(rows.find((item)=>Number(item.id)===Number(button.dataset.id)));}));
    $$('.show-table-qr').forEach((button)=>button.addEventListener('click',()=>openRestaurantTableQr(rows.find((item)=>Number(item.id)===Number(button.dataset.id)))));
    $$('.register-table-payment').forEach((button)=>button.addEventListener('click',()=>openRestaurantTablePayment(rows.find((item)=>Number(item.id)===Number(button.dataset.id)))));
    $$('.release-table').forEach((button)=>button.addEventListener('click',()=>releaseRestaurantTable(rows.find((item)=>Number(item.id)===Number(button.dataset.id)))));
    $$('.resolve-table-request').forEach((button)=>button.addEventListener('click',()=>resolveRestaurantTableRequest(Number(button.dataset.id))));
    $$('.open-table-conversation').forEach((button)=>button.addEventListener('click',async()=>{
      state.conversationStatus='all';
      state.selectedConversationId=Number(button.dataset.conversationId);
      await navigate('chats');
      if (state.selectedConversationId) await selectConversation(state.selectedConversationId,false).catch(()=>{});
    }));
    const focus = $('.focus-table'); if (focus) requestAnimationFrame(()=>focus.scrollIntoView({behavior:'smooth',block:'center'}));
  }

  async function refreshSettingsPreservingPosition() {
    const content = $('#page-content');
    const previousScroll = content?.scrollTop || state.settingsScrollTop || 0;
    const previousSection = state.settingsSection || 'menu';
    state.settingsScrollTop = previousScroll;
    await renderSettings();
    state.settingsSection = previousSection;
    requestAnimationFrame(() => {
      const refreshed = $('#page-content');
      if (!refreshed) return;
      refreshed.scrollTop = previousScroll;
      requestAnimationFrame(() => { if (refreshed.isConnected) refreshed.scrollTop = previousScroll; });
    });
  }

  async function renderSettings() {
    const [data, closureReasons, configuredStickers, configuredQuickReplies, configuredTemplates] = await Promise.all([
      api('/settings'), api('/closure-reasons?all=1'), api('/stickers?all=1'), api('/quick-replies?all=1'), api('/templates'),
    ]);
    const s = data.settings;
    const instance = data.instances[0];
    const config = instance?.config || {};
    let welcomeOptions;
    try { welcomeOptions = JSON.parse(s.welcome_menu_options || '[]'); } catch { welcomeOptions = []; }
    while (welcomeOptions.length < 6) welcomeOptions.push({ number: String(welcomeOptions.length + 1), label: '', action: 'order' });
    welcomeOptions = welcomeOptions.slice(0, 6);
    let businessHours;
    try { businessHours = JSON.parse(s.business_hours_json || '{}'); } catch { businessHours = {}; }
    const dayLabels = [['mon','Segunda'],['tue','Terça'],['wed','Quarta'],['thu','Quinta'],['fri','Sexta'],['sat','Sábado'],['sun','Domingo']];
    const menuActionOptions = [
      ['order','Iniciar pedido'], ['catalog','Enviar cardápio'], ['order_status','Consultar pedidos'],
      ['human','Transferir para atendente'], ['hours_address','Enviar endereço e horário'],
      ['promotion','Enviar promoção'], ['custom','Resposta personalizada'],
    ];
    $('#page-content').innerHTML = `
      <div class="page-head"><div><h2>Configurações do sistema</h2><p>Personalização, IA, banco local e conexão real do WhatsApp.</p></div></div>
      <div class="settings-sections">
        <section class="settings-panel settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">EMPRESA E IA</span><h3>Identidade do atendimento</h3></div></div>
          <form id="settings-form" class="form-grid">
            <div class="field"><label>Nome da empresa</label><input name="company_name" value="${esc(s.company_name || '')}"></div>
            <div class="field"><label>Nome da assistente</label><input name="ai_name" value="${esc(s.ai_name || '')}"></div>
            <div class="field"><label>Instagram</label><input name="instagram" value="${esc(s.instagram || '')}" placeholder="@sualanchonete"></div>
            <div class="field"><label>Prefixo da atendente</label><input name="agent_message_prefix" value="${esc(s.agent_message_prefix || '*{Atendente}:*\n')}"></div>
            <div class="field"><label>Prefixo da IA</label><input name="ai_message_prefix" value="${esc(s.ai_message_prefix || '🤖 *Assistente virtual:*\n')}"></div>
            <div class="field"><label>Taxa fixa de entrega</label><input name="delivery_fee" type="number" min="0" step="0.01" value="${esc(s.delivery_fee || '0')}"><small>A IA informa e soma esta taxa antes da confirmação.</small></div>
            <div class="field full"><label>Endereço para retirada na loja</label><input name="store_pickup_address" value="${esc(s.store_pickup_address || '')}" placeholder="Rua, número, bairro e cidade"></div>
            <div class="field"><label>Cor principal</label><input name="primary_color" type="color" value="${esc(s.primary_color || '#1458EA')}" style="height:47px;padding:7px"></div>
            <div class="field switch-row"><div><strong>Avisar status pelo WhatsApp</strong><small>Envia preparo, pronto e entrega.</small></div><label class="switch"><input name="notify_order_status" type="checkbox" ${s.notify_order_status !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field switch-row"><div><strong>Assinar mensagens humanas</strong><small>Mostra o nome real da atendente no WhatsApp.</small></div><label class="switch"><input name="agent_signature_enabled" type="checkbox" ${s.agent_signature_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field switch-row"><div><strong>IA envia pedido direto à cozinha</strong><small>Desligado: a IA coleta os dados e aguarda uma atendente revisar e confirmar.</small></div><label class="switch"><input name="ai_auto_create_orders" type="checkbox" ${s.ai_auto_create_orders === 'true' ? 'checked' : ''}><span></span></label></div>
            <div class="field switch-row"><div><strong>Emojis nas mensagens</strong><small>Permite mensagens automáticas mais acolhedoras.</small></div><label class="switch"><input name="emojis_enabled" type="checkbox" ${s.emojis_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Mensagem de encerramento</label><textarea name="closing_message" rows="6">${esc(s.closing_message || '')}</textarea><small>Variáveis: {Cliente}, {Atendente}, {Empresa}, {Instagram}, {Pedido}, {Total}.</small></div>
            <div class="field full"><label>Mensagem ao fechar e liberar uma mesa</label><textarea name="table_closing_message" rows="4">${esc(s.table_closing_message || 'Obrigado pela visita, {Cliente}! A sua comanda foi encerrada. Volte sempre! 🍔💚')}</textarea><small>É enviada aos clientes da mesa antes dos atendimentos serem finalizados. Variáveis: {Cliente}, {Atendente}, {Empresa} e {Mesa}.</small></div>
            <div class="field full"><label>Resposta quando a IA não souber</label><textarea name="ai_fallback">${esc(s.ai_fallback || '')}</textarea></div>
            <div class="field full"><button class="btn btn-primary" type="submit">Salvar configurações</button></div>
          </form>
        </section>

        <section class="settings-panel settings-card site-settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">SITE DE PEDIDOS</span><h3>Cardápio, checkout e formas de pedido</h3><p>Configure o site público sem editar arquivos.</p></div><button class="btn btn-soft btn-small" id="open-site-settings-preview" type="button">Abrir site ↗</button></div>
          <form id="site-settings-form" class="form-grid">
            <div class="field full switch-row"><div><strong>Receber pedidos pelo site</strong><small>Desative para pausar o checkout público.</small></div><label class="switch"><input name="website_orders_enabled" type="checkbox" ${s.website_orders_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full settings-module-divider"><span class="eyebrow">PEDIDOS PELO BOT</span><h4>Como o cliente fará o pedido</h4><p>O número do WhatsApp continua sendo o contato único, independentemente do modo escolhido.</p></div>
            <div class="field full"><label>Modo de realização do pedido</label><select name="bot_order_mode" class="custom-select"><option value="hybrid_ai" ${['hybrid_ai','hybrid'].includes(s.bot_order_mode)?'selected':''}>Perguntar: WhatsApp ou site — IA atende no WhatsApp</option><option value="site" ${s.bot_order_mode==='site'?'selected':''}>Sempre enviar o link do site</option><option value="human" ${s.bot_order_mode==='human'?'selected':''}>Encaminhar diretamente para atendente</option><option value="whatsapp_ai" ${['whatsapp_ai','whatsapp'].includes(s.bot_order_mode)||!s.bot_order_mode?'selected':''}>Somente pelo WhatsApp — IA faz o pedido</option><option value="hybrid_human" ${s.bot_order_mode==='hybrid_human'?'selected':''}>Site ou WhatsApp — no WhatsApp encaminha ao atendente</option></select><small>O modo escolhido é aplicado quando o cliente clica em “Fazer um pedido” ou escreve que quer pedir.</small></div>
            <div class="field"><label>Validade do link</label><div class="input-with-suffix"><input name="bot_order_link_hours" type="number" min="1" max="168" value="${esc(s.bot_order_link_hours || '24')}"><span>horas</span></div></div>
            <div class="field full"><label>Frases que iniciam um pedido</label><textarea name="bot_order_trigger_phrases" rows="2" placeholder="quero fazer um pedido, quero pedir, novo pedido">${esc(s.bot_order_trigger_phrases || '')}</textarea><small>Separe por vírgula ou linha. Mensagens que já contêm produtos também são reconhecidas automaticamente.</small></div>
            <div class="field full settings-module-divider"><span class="eyebrow">CARDÁPIO NO WHATSAPP</span><h4>Navegação por categorias</h4><p>Evita enviar centenas de produtos de uma vez. O cliente escolhe a categoria e navega pelas páginas usando números.</p></div>
            <div class="field full switch-row"><div><strong>Ativar cardápio por categorias e páginas</strong><small>Ao digitar CARDÁPIO, o cliente vê primeiro as categorias e escolhe o que deseja consultar.</small></div><label class="switch"><input name="bot_catalog_navigation_enabled" type="checkbox" ${s.bot_catalog_navigation_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field"><label>Produtos por página</label><select name="bot_catalog_items_per_page" class="custom-select"><option value="4" ${s.bot_catalog_items_per_page==='4'?'selected':''}>4 produtos</option><option value="6" ${s.bot_catalog_items_per_page==='6'?'selected':''}>6 produtos</option><option value="8" ${!s.bot_catalog_items_per_page||s.bot_catalog_items_per_page==='8'?'selected':''}>8 produtos</option><option value="10" ${s.bot_catalog_items_per_page==='10'?'selected':''}>10 produtos</option><option value="12" ${s.bot_catalog_items_per_page==='12'?'selected':''}>12 produtos</option></select></div>
            <div class="field switch-row"><div><strong>Mostrar preços no cardápio</strong><small>O preço continua aparecendo nos detalhes mesmo quando esta opção estiver desligada.</small></div><label class="switch"><input name="bot_catalog_show_prices" type="checkbox" ${s.bot_catalog_show_prices !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full settings-module-divider"><span class="eyebrow">CARDÁPIO DO ALMOÇO</span><h4>Marmitex por horário</h4><p>Controla a oferta automática no WhatsApp e a disponibilidade das marmitex no site.</p></div>
            <div class="field full switch-row"><div><strong>Ativar cardápio de marmitex</strong><small>Fora do horário, as opções continuam visíveis no site, mas não podem ser adicionadas.</small></div><label class="switch"><input name="lunch_menu_enabled" type="checkbox" ${s.lunch_menu_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field"><label>Disponível a partir de</label><input name="lunch_menu_start" type="time" value="${esc(s.lunch_menu_start || '09:00')}"></div>
            <div class="field"><label>Disponível até</label><input name="lunch_menu_end" type="time" value="${esc(s.lunch_menu_end || '14:00')}"></div>
            <div class="field full switch-row"><div><strong>Oferecer almoço na primeira mensagem</strong><small>Durante o período, o bot pergunta se o cliente deseja montar uma marmitex ou abrir o cardápio completo.</small></div><label class="switch"><input name="lunch_offer_first_message" type="checkbox" ${s.lunch_offer_first_message !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Mensagem ao iniciar pedido com a IA pelo WhatsApp</label><textarea name="bot_order_whatsapp_ai_message" rows="5">${esc(s.bot_order_whatsapp_ai_message || '')}</textarea><small>Usada no modo “Somente WhatsApp” e ao escolher WhatsApp no modo com IA.</small></div>
            <div class="field full"><label>Mensagem ao encaminhar para atendente</label><textarea name="bot_order_whatsapp_message" rows="4">${esc(s.bot_order_whatsapp_message || '')}</textarea><small>Variáveis: {Cliente}, {Empresa} e {Atendente}.</small></div>
            <div class="field full"><label>Mensagem do modo site</label><textarea name="bot_order_site_message" rows="5">${esc(s.bot_order_site_message || '')}</textarea><small>Use {Link}, {Cliente} e {Empresa}. O link fica clicável no WhatsApp.</small></div>
            <div class="field full"><label>Escolha entre WhatsApp com IA ou site</label><textarea name="bot_order_hybrid_message" rows="5">${esc(s.bot_order_hybrid_message || '')}</textarea><small>1 continua com a IA pelo WhatsApp; 2 abre o site.</small></div>
            <div class="field full"><label>Escolha entre site ou atendente pelo WhatsApp</label><textarea name="bot_order_hybrid_human_message" rows="5">${esc(s.bot_order_hybrid_human_message || '')}</textarea><small>1 abre o site; 2 encaminha para um atendente.</small></div>
            <div class="field full"><div class="bot-order-mode-preview"><div><strong>Prévia para o cliente</strong><small>Exemplo usando Maria e o link identificado do WhatsApp.</small></div><p id="bot-order-mode-preview-text"></p></div></div>
            <div class="field full"><input name="website_accept_outside_hours" type="hidden" value="false"><div class="info-box"><strong>🕒 Horário aplicado em tempo real</strong><p>O site e a IA bloqueiam novos itens e finalizações fora do período disponível. Alterações feitas nas configurações passam a valer na próxima ação do cliente.</p></div></div>
            <div class="field full settings-module-divider"><span class="eyebrow">MESAS E QR CODE</span><h4>Atendimento no salão</h4><p>Este módulo funciona de forma independente do site comum e não altera os pedidos feitos normalmente pelo WhatsApp.</p></div>
            <div class="field full switch-row"><div><strong>Ativar mesas com QR Code</strong><small>Permite vincular aparelhos, abrir comandas e fazer pedidos pela mesa.</small></div><label class="switch"><input name="restaurant_tables_enabled" type="checkbox" ${s.restaurant_tables_enabled === 'true' ? 'checked' : ''}><span></span></label></div>
            <div class="field switch-row"><div><strong>Vários aparelhos por mesa</strong><small>Todos os clientes entram na mesma comanda.</small></div><label class="switch"><input name="restaurant_table_allow_multiple_devices" type="checkbox" ${s.restaurant_table_allow_multiple_devices !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full module-info-box"><strong>Vínculo da comanda</strong><small>Depois da identificação, o cliente permanece vinculado à mesa até a equipe fechar e liberar a comanda. Fechar o navegador não remove o vínculo.</small></div>
            <div class="field switch-row"><div><strong>Cliente pode editar pedido pendente</strong><small>Disponível somente antes da confirmação.</small></div><label class="switch"><input name="restaurant_table_customer_edit_enabled" type="checkbox" ${s.restaurant_table_customer_edit_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field switch-row"><div><strong>Cliente pode cancelar pedido pendente</strong><small>Disponível somente antes da confirmação.</small></div><label class="switch"><input name="restaurant_table_customer_cancel_enabled" type="checkbox" ${s.restaurant_table_customer_cancel_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field"><label>Prazo para editar ou cancelar</label><div class="input-with-suffix"><input name="restaurant_table_edit_minutes" type="number" min="1" max="120" value="${esc(s.restaurant_table_edit_minutes || '10')}"><span>minutos</span></div></div>
            <input name="restaurant_table_session_hours" type="hidden" value="${esc(s.restaurant_table_session_hours || '4')}">
            <div class="field full"><label>Mensagem quando estiver pronto para servir</label><textarea name="order_table_ready_message" rows="3">${esc(s.order_table_ready_message || '')}</textarea></div>
            <div class="field full"><label>Mensagem quando for entregue na mesa</label><textarea name="order_table_delivered_message" rows="3">${esc(s.order_table_delivered_message || '')}</textarea></div>
            <div class="field full"><label>Endereço público do site</label><input name="website_public_url" value="${esc(s.website_public_url || '')}" placeholder="https://pedidos.seudominio.com.br"><small>Usado nos links enviados pelo WhatsApp. Em teste local, pode ficar vazio.</small></div>
            <div class="field"><label>Título principal</label><input name="website_hero_title" value="${esc(s.website_hero_title || 'Seu pedido, do seu jeito.')}"></div>
            <div class="field"><label>Subtítulo da marca</label><input name="website_subtitle" value="${esc(s.website_subtitle || 'Cardápio digital')}"></div>
            <div class="field full"><label>Texto de apresentação</label><textarea name="website_hero_text" rows="2">${esc(s.website_hero_text || '')}</textarea></div>
            <div class="field full site-logo-setting"><div class="site-logo-preview"><img id="site-logo-preview" src="${esc(s.website_logo_url || '/assets/jhow-burguer-logo.jpg')}" alt="Logo atual do site"></div><div><label>Logo do site</label><input name="website_logo_url" id="site-logo-url" value="${esc(s.website_logo_url || '/assets/jhow-burguer-logo.jpg')}" placeholder="/assets/minha-logo.png ou https://..."><label class="file-picker">${icon('upload',16)} Enviar uma nova logo<input id="site-logo-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label><small>Quando não houver outra logo, o site usa a logo padrão da Jhow Burguer.</small></div></div>
            <div class="field"><label>Taxa de entrega</label><input name="delivery_fee" type="number" min="0" step="0.01" value="${esc(s.delivery_fee || '0')}"></div>
            <div class="field"><label>Endereço para retirada</label><input name="store_pickup_address" value="${esc(s.store_pickup_address || '')}"></div>
            <div class="field full"><label>Modalidades disponíveis</label><div class="site-option-grid"><label><input name="website_delivery_enabled" type="checkbox" ${s.website_delivery_enabled !== 'false' ? 'checked' : ''}> Entrega</label><label><input name="website_pickup_enabled" type="checkbox" ${s.website_pickup_enabled !== 'false' ? 'checked' : ''}> Retirada na loja</label></div></div>
            <div class="field full"><label>Formas de pagamento</label><div class="site-option-grid"><label><input name="website_payment_pix" type="checkbox" ${s.website_payment_pix !== 'false' ? 'checked' : ''}> Pix</label><label><input name="website_payment_card" type="checkbox" ${s.website_payment_card !== 'false' ? 'checked' : ''}> Cartão</label><label><input name="website_payment_cash" type="checkbox" ${s.website_payment_cash !== 'false' ? 'checked' : ''}> Dinheiro</label></div></div>
            <div class="field full settings-module-divider"><span class="eyebrow">CORES DOS ATENDIMENTOS</span><h4>Status visual do pedido</h4><p>O atendimento novo continua branco. As cores aparecem somente depois da confirmação.</p></div>
            <div class="field full switch-row"><div><strong>Mudar a cor da conversa pelo status</strong><small>Atualiza a lista, a conversa aberta e o painel lateral em tempo real.</small></div><label class="switch"><input name="order_status_colors_enabled" type="checkbox" ${s.order_status_colors_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="status-color-grid">
              <label><span>Confirmado</span><input name="order_status_color_confirmed" type="color" value="${esc(s.order_status_color_confirmed || '#2f6fed')}"></label>
              <label><span>Em preparo</span><input name="order_status_color_preparing" type="color" value="${esc(s.order_status_color_preparing || '#f59e0b')}"></label>
              <label><span>Pronto</span><input name="order_status_color_ready" type="color" value="${esc(s.order_status_color_ready || '#7c3aed')}"></label>
              <label><span>Saiu para entrega</span><input name="order_status_color_out_for_delivery" type="color" value="${esc(s.order_status_color_out_for_delivery || '#1e40af')}"></label>
              <label><span>Entregue/retirado</span><input name="order_status_color_delivered" type="color" value="${esc(s.order_status_color_delivered || '#16a34a')}"></label>
              <label><span>Cancelado</span><input name="order_status_color_cancelled" type="color" value="${esc(s.order_status_color_cancelled || '#dc2626')}"></label>
            </div>
            <div class="field full"><label>Aviso exibido no checkout</label><input name="website_checkout_notice" value="${esc(s.website_checkout_notice || 'O pedido será enviado ao painel e ficará aguardando confirmação da equipe.')}"></div>
            <div class="field full"><label>Mensagem enviada ao WhatsApp após o pedido</label><textarea name="website_whatsapp_receipt_message" rows="7">${esc(s.website_whatsapp_receipt_message || '')}</textarea><small>Variáveis: {Pedido}, {Itens}, {RetiradaEntrega}, {Pagamento}, {Total}, {LinkAcompanhamento}.</small></div>
            <div class="field full"><button class="btn btn-primary" type="submit">Salvar configurações do site</button></div>
          </form>
        </section>

        <section class="settings-panel settings-card welcome-settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">BOAS-VINDAS E MENU</span><h3>Mensagens automáticas de entrada</h3><p>Configure primeiro contato, retorno, saudações e as opções numéricas que o cliente pode escolher.</p></div></div>
          <form id="welcome-settings-form" class="form-grid">
            <div class="field full switch-row"><div><strong>Mensagem para o primeiro contato da vida</strong><small>É enviada uma única vez quando um número novo fala com a empresa.</small></div><label class="switch"><input name="welcome_enabled" type="checkbox" ${s.welcome_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Texto do primeiro contato</label><textarea name="first_contact_message" rows="3">${esc(s.first_contact_message || '')}</textarea><small>Variáveis: {saudacao}, {nome}, {empresa}, {assistente}.</small></div>
            <div class="field full switch-row"><div><strong>Mensagem para cliente que voltou</strong><small>Usada quando uma nova conversa começa com uma saudação.</small></div><label class="switch"><input name="returning_welcome_enabled" type="checkbox" ${s.returning_welcome_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Texto de retorno</label><textarea name="returning_welcome_message" rows="2">${esc(s.returning_welcome_message || '')}</textarea></div>
            <div class="field full switch-row"><div><strong>Responder “oi”, “bom dia”, “boa tarde” e “boa noite”</strong><small>Não interfere no fluxo de pedido em andamento.</small></div><label class="switch"><input name="greeting_enabled" type="checkbox" ${s.greeting_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field"><label>Intervalo para repetir saudação</label><input name="greeting_cooldown_hours" type="number" min="1" max="168" value="${esc(s.greeting_cooldown_hours || '12')}"><small>Em horas.</small></div>
            <div class="field"><label>Texto da saudação</label><input name="greeting_message" value="${esc(s.greeting_message || '')}"></div>
            <div class="field full switch-row"><div><strong>Exibir menu numérico</strong><small>O menu aparece junto das mensagens automáticas.</small></div><label class="switch"><input name="welcome_menu_enabled" type="checkbox" ${s.welcome_menu_enabled !== 'false' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Título do menu</label><input name="welcome_menu_title" value="${esc(s.welcome_menu_title || 'Escolha uma opção:')}"></div>
            <div class="field full"><label>Opções do menu</label><div class="welcome-option-list">${welcomeOptions.map((option, index) => `<div class="welcome-option-row" data-menu-index="${index}"><input class="menu-number" value="${esc(option.number || String(index + 1))}" maxlength="2" aria-label="Número"><input class="menu-label" value="${esc(option.label || '')}" placeholder="Texto da opção"><select class="menu-action">${menuActionOptions.map(([value,label]) => `<option value="${value}" ${option.action === value ? 'selected' : ''}>${label}</option>`).join('')}</select><input class="menu-response ${option.action === 'custom' ? '' : 'hidden'}" value="${esc(option.response || '')}" placeholder="Resposta personalizada"></div>`).join('')}</div></div>
            <div class="field full"><div class="welcome-preview" id="welcome-preview"><strong>Prévia</strong><p>As opções configuradas aparecerão aqui.</p></div></div>
            <div class="field full"><button class="btn btn-primary" type="submit">Salvar boas-vindas e menu</button></div>
          </form>
        </section>

        <section class="settings-panel settings-card automation-settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">AUTOMAÇÕES</span><h3>Horários e mensagens de status</h3><p>Mensagens bonitas e automáticas para cada etapa do atendimento.</p></div></div>
          <form id="automation-settings-form" class="form-grid">
            <div class="field full switch-row"><div><strong>Usar horário de atendimento</strong><small>Fora do horário, o cliente recebe a mensagem configurada abaixo.</small></div><label class="switch"><input name="business_hours_enabled" type="checkbox" ${s.business_hours_enabled === 'true' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Horários da semana</label><div class="business-hours-grid">${dayLabels.map(([key,label])=>{const range=businessHours[key]||['08:00','22:00'];return `<div data-business-day="${key}"><strong>${label}</strong><input type="time" class="business-open" value="${esc(range[0]||'08:00')}"><span>até</span><input type="time" class="business-close" value="${esc(range[1]||'22:00')}"><label><input type="checkbox" class="business-closed" ${Array.isArray(range)&&range.length===0?'checked':''}> Fechado</label></div>`}).join('')}</div></div>
            <div class="field full"><label>Mensagem fora do horário</label><textarea name="after_hours_message" rows="3">${esc(s.after_hours_message || '')}</textarea></div>
            <div class="field full switch-row"><div><strong>Pesquisa de satisfação</strong><small>Envia uma pergunta de 1 a 5 depois do encerramento.</small></div><label class="switch"><input name="satisfaction_enabled" type="checkbox" ${s.satisfaction_enabled === 'true' ? 'checked' : ''}><span></span></label></div>
            <div class="field full"><label>Mensagem da pesquisa</label><textarea name="satisfaction_message" rows="2">${esc(s.satisfaction_message || '')}</textarea></div>
            <div class="field full"><label>Pedido confirmado</label><textarea name="order_confirmed_message" rows="3">${esc(s.order_confirmed_message || '')}</textarea></div>
            <div class="field full"><label>Pedido em preparo</label><textarea name="order_preparing_message" rows="3">${esc(s.order_preparing_message || '')}</textarea></div>
            <div class="field full"><label>Pedido pronto</label><textarea name="order_ready_message" rows="3">${esc(s.order_ready_message || '')}</textarea></div>
            <div class="field full"><label>Pronto para retirada</label><textarea name="order_pickup_ready_message" rows="3">${esc(s.order_pickup_ready_message || '')}</textarea></div>
            <div class="field full"><label>Saiu para entrega</label><textarea name="order_out_delivery_message" rows="3">${esc(s.order_out_delivery_message || '')}</textarea></div>
            <div class="field full"><label>Pedido entregue</label><textarea name="order_delivered_message" rows="3">${esc(s.order_delivered_message || '')}</textarea></div>
            <div class="field full"><label>Pedido retirado</label><textarea name="order_picked_up_message" rows="3">${esc(s.order_picked_up_message || '')}</textarea></div>
            <div class="field full"><button class="btn btn-primary" type="submit">Salvar automações</button></div>
          </form>
        </section>

        <section class="settings-panel settings-card whatsapp-settings">
          <div class="settings-card-head"><div><span class="eyebrow">WHATSAPP POR QR CODE</span><h3>Evolution API</h3><p>Use um número secundário para os primeiros testes.</p></div>${whatsappStatus(instance)}</div>
          <div class="warning-box"><strong>Integração não oficial</strong><p>Pode ocorrer desconexão ou restrição do número. Não use disparos em massa ou mensagens não solicitadas.</p></div>
          <form id="whatsapp-form" class="form-grid">
            <input type="hidden" name="provider" value="evolution">
            <div class="field"><label>Nome da conexão</label><input name="name" value="${esc(instance?.name || 'WhatsApp principal')}"></div>
            <div class="field"><label>Nome da instância</label><input name="instanceName" value="${esc(config.instanceName || 'atenderbem')}"></div>
            <div class="field full"><label>URL da Evolution API</label><input name="baseUrl" value="${esc(config.baseUrl || '')}" placeholder="https://sua-evolution.exemplo.com"><small>Na Discloud, informe a URL ou o hostname privado de uma aplicação Evolution API separada. Localhost só funciona no computador.</small></div>
            <div class="field full"><label>Chave global da Evolution API</label><input name="apiKey" type="password" placeholder="${config.apiKeyConfigured ? 'Chave já salva — deixe vazio para manter' : 'Informe a chave configurada na Evolution API'}"><small>A chave nunca é exibida novamente pelo painel.</small></div>
            <div class="field full"><label>URL de retorno para receber mensagens</label><input name="publicBaseUrl" value="${esc(config.publicBaseUrl || s.public_base_url || 'https://jhowburgueratender.discloud.app')}" placeholder="https://jhowburgueratender.discloud.app"><small>Na Discloud, use a URL HTTPS pública do painel para receber as mensagens.</small></div>
            <div class="field full connection-actions"><button class="btn btn-outline" id="save-whatsapp" type="submit">Salvar conexão</button><button class="btn btn-soft" id="apply-local-whatsapp" type="button">Configuração local (somente PC)</button><button class="btn btn-soft" id="diagnose-whatsapp" type="button">Diagnosticar</button><button class="btn btn-primary" id="connect-whatsapp" type="button">${icon('whatsapp',15)} Gerar QR Code</button><button class="btn btn-soft" id="check-whatsapp" type="button">Verificar status</button><button class="btn btn-soft" id="repair-webhook" type="button">Corrigir webhook</button>${instance?.status === 'connected' ? '<button class="btn btn-danger" id="disconnect-whatsapp" type="button">Desconectar</button><button class="btn btn-success" id="test-whatsapp" type="button">Enviar teste</button>' : ''}</div>
          </form>
          <div class="local-evolution-help"><h4>Atenção: painel e Evolution API são aplicações diferentes</h4><p>Na Discloud, o painel não gera o QR sozinho. Hospede a Evolution API separadamente e informe a URL dela acima. A opção local abaixo serve somente para testes no computador com Docker.</p><div class="credential-grid"><span>Retorno do painel <b>https://jhowburgueratender.discloud.app</b></span><span>Instância sugerida <b>jhowburguer</b></span></div></div>
        </section>

        <section class="settings-panel settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">ENCERRAMENTO</span><h3>Motivos de encerramento</h3><p>O atendente escolhe um motivo antes de mover a conversa para o histórico.</p></div><button class="btn btn-primary" id="new-closure-reason" type="button">${icon('plus',15)} Novo motivo</button></div>
          <div class="settings-list" id="closure-reasons-list">
            ${closureReasons.map((reason) => `<div class="settings-list-row ${reason.active ? '' : 'is-inactive'}"><div><strong>${esc(reason.name)}</strong><small>${reason.active ? 'Disponível para os atendentes' : 'Desativado'}</small></div><div class="row-actions"><span class="status-badge ${reason.active ? 'status-open' : 'status-closed'}">${reason.active ? 'Ativo' : 'Inativo'}</span><button class="icon-button edit-closure-reason" data-id="${reason.id}" type="button" title="Editar">${icon('edit',16)}</button></div></div>`).join('') || '<div class="settings-empty">Nenhum motivo configurado.</div>'}
          </div>
        </section>

        <section class="settings-panel settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">MENSAGENS</span><h3>Respostas rápidas</h3><p>Atalhos que aparecem acima da barra de digitação da atendente.</p></div><button class="btn btn-primary" id="new-quick-reply" type="button">${icon('plus',15)} Nova resposta</button></div>
          <div class="settings-list">${configuredQuickReplies.map((reply) => `<div class="settings-list-row ${reply.active===false?'is-inactive':''}"><div><strong>${reply.favorite?'⭐ ':''}${esc(reply.shortcut)} · ${esc(reply.title)}</strong><small>${esc(reply.category||'Geral')} · ${Number(reply.usage_count||0)} usos${Array.isArray(reply.allowed_roles)&&reply.allowed_roles.length?` · ${reply.allowed_roles.map(roleLabel).join(', ')}`:' · Todas as equipes'}</small><small>${esc(reply.content)}</small></div><div class="row-actions"><span class="status-badge ${reply.active===false?'status-closed':'status-open'}">${reply.active===false?'Inativa':'Ativa'}</span><button class="icon-button edit-quick-reply" data-id="${reply.id}" type="button" data-tooltip="Editar">${icon('edit',16)}</button></div></div>`).join('') || '<div class="settings-empty">Nenhuma resposta rápida configurada.</div>'}</div>
        </section>

        <section class="settings-panel settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">MENSAGENS</span><h3>Figurinhas rápidas</h3><p>Cadastre imagens fixas para a atendente enviar pelo botão de figurinhas.</p></div><button class="btn btn-primary" id="new-sticker" type="button">${icon('plus',15)} Nova figurinha</button></div>
          <div class="sticker-settings-grid">
            ${configuredStickers.map((sticker) => `<article class="sticker-settings-card ${sticker.active ? '' : 'is-inactive'}"><div class="sticker-preview"><img src="${esc(sticker.source)}" alt="${esc(sticker.name)}"></div><div class="sticker-settings-info"><strong>${esc(sticker.name)}</strong><small>${sticker.active ? 'Disponível no atendimento' : 'Desativada'}</small></div><button class="icon-button edit-sticker-setting" data-id="${sticker.id}" type="button" title="Editar">${icon('edit',16)}</button></article>`).join('') || '<div class="settings-empty">Nenhuma figurinha configurada.</div>'}
          </div>
        </section>

        <section class="settings-panel settings-card management-settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">GESTÃO</span><h3>Cadastros e estrutura</h3><p>Itens administrativos que não precisam ocupar a barra principal.</p></div></div>
          <div class="management-grid">
            <button type="button" data-management-page="team">${icon('team',22)}<strong>Usuários e perfis</strong><small>Atendentes, permissões e recebimento.</small></button>
            <button type="button" data-management-page="products">${icon('product',22)}<strong>Cardápio e estoque</strong><small>Produtos, preços, aliases e disponibilidade para a IA.</small></button>
            <button type="button" data-management-page="tables">${icon('order',22)}<strong>Mesas e QR Codes</strong><small>Comandas, chamados, contas e códigos das mesas.</small></button>
            <button type="button" data-management-page="knowledge">${icon('brain',22)}<strong>Base de conhecimento</strong><small>Informações usadas pela IA.</small></button>
            <button type="button" data-management-page="structure">${icon('queue',22)}<strong>Filas e pausas</strong><small>Distribuição, setores e motivos de pausa.</small></button>
            <button type="button" data-management-page="campaigns">${icon('send',22)}<strong>Campanhas</strong><small>Rascunhos e agendamentos de comunicação.</small></button>
            <button type="button" data-management-page="automations">${icon('robot',22)}<strong>Automações</strong><small>Palavras-chave, respostas e encaminhamentos.</small></button>
            <button type="button" data-management-page="audit">${icon('history',22)}<strong>Auditoria</strong><small>Registro das ações feitas no sistema.</small></button>
            <button type="button" data-management-page="security">${icon('settings',22)}<strong>Segurança e backups</strong><small>Sessões, proteção, alertas e cópias automáticas.</small></button>
          </div>
        </section>

        <section class="settings-panel settings-card template-settings-card">
          <div class="settings-card-head"><div><span class="eyebrow">TEMPLATES</span><h3>Modelos de mensagens</h3><p>Crie mensagens com variáveis, mídia e categorias para uso no atendimento.</p></div><button class="icon-button primary-icon" id="new-template" type="button" data-tooltip="Novo template">${icon('plus',16)}</button></div>
          <div class="settings-list">${configuredTemplates.map((template) => `<div class="settings-list-row"><div><strong>${esc(template.category)} · ${esc(template.name)}</strong><small>${esc(template.body)}</small></div><div class="row-actions"><span class="status-badge ${template.template_type==='official'?'status-waiting':'status-open'}">${template.template_type==='official'?'Oficial · '+esc(template.official_status||'draft'):'Interno'}</span><button class="icon-button edit-template" data-id="${template.id}" type="button" data-tooltip="Editar">${icon('edit',16)}</button></div></div>`).join('') || '<div class="settings-empty">Nenhum template configurado.</div>'}</div>
        </section>

        <section class="settings-panel settings-card"><div class="settings-card-head"><div><span class="eyebrow">ARMAZENAMENTO</span><h3>Banco de dados local</h3></div></div><p class="muted settings-card-copy">O banco SQLite fica dentro da pasta do projeto. Faça cópias do arquivo antes de atualizações importantes.</p><div class="db-path">${esc(data.databasePath)}</div></section>
      </div>`;


    const settingsCategories = [
      ['general','settings','Geral e identidade','Empresa, IA, aparência, entrega e funcionamento principal.'],
      ['site','order','Pedidos, site e mesas','Escolha como o cliente pede, configure o link do site e o salão.'],
      ['messages','chat','Mensagens e automações','Boas-vindas, horários, status, respostas rápidas, figurinhas e templates.'],
      ['whatsapp','whatsapp','WhatsApp','Conexão com a Evolution API, diagnóstico, QR Code e webhook.'],
      ['closing','check','Encerramento','Motivos usados ao finalizar atendimentos e regras de saída das mesas.'],
      ['management','team','Gestão','Usuários, cardápio, estoque, filas, campanhas, auditoria e segurança.'],
      ['storage','database','Armazenamento','Informações sobre o banco de dados utilizado pelo sistema.'],
    ];
    const settingsPanels = $$('.settings-panel');
    const panelCategories = ['general','site','messages','messages','whatsapp','closing','messages','messages','management','messages','storage'];
    settingsPanels.forEach((panel,index) => { panel.dataset.settingsCategory = panelCategories[index] || 'general'; });

    const settingsHome = document.createElement('section');
    settingsHome.className = 'settings-category-home';
    settingsHome.innerHTML = `
      <div class="settings-category-intro"><span class="eyebrow">CONFIGURAÇÕES</span><h3>Escolha o que deseja configurar</h3><p>As opções foram organizadas em blocos para não deixar tudo misturado em uma única página.</p></div>
      <div class="settings-category-grid">
        ${settingsCategories.map(([id,iconName,title,description])=>`<button type="button" data-settings-category="${id}">${icon(iconName,24)}<strong>${title}</strong><small>${description}</small><span>Abrir ${icon('chevronDown',15)}</span></button>`).join('')}
      </div>`;
    $('.settings-sections').before(settingsHome);

    const settingsToolbar = document.createElement('div');
    settingsToolbar.className = 'settings-category-toolbar hidden';
    settingsToolbar.innerHTML = `<button class="btn btn-soft btn-small" id="back-settings-menu" type="button">${icon('back',15)} Todas as configurações</button><div><span class="eyebrow">CONFIGURAÇÕES</span><strong id="settings-category-title"></strong></div>`;
    $('.settings-sections').before(settingsToolbar);

    const activateSettingsCategory = (requestedCategory = 'menu', resetScroll = false) => {
      const category = requestedCategory === 'menu' || settingsCategories.some(([id])=>id===requestedCategory) ? requestedCategory : 'menu';
      state.settingsSection = category;
      localStorage.setItem('gm_settings_section', category);
      const showingMenu = category === 'menu';
      settingsHome.classList.toggle('hidden', !showingMenu);
      settingsToolbar.classList.toggle('hidden', showingMenu);
      settingsPanels.forEach((panel) => panel.classList.toggle('hidden', showingMenu || panel.dataset.settingsCategory !== category));
      if (!showingMenu) {
        const selected = settingsCategories.find(([id])=>id===category);
        $('#settings-category-title').textContent = selected?.[2] || 'Configurações';
      }
      if (resetScroll) {
        state.settingsScrollTop = 0;
        const content = $('#page-content');
        if (content) content.scrollTop = 0;
      }
    };
    $$('[data-settings-category]').forEach((button)=>button.addEventListener('click',()=>activateSettingsCategory(button.dataset.settingsCategory, true)));
    $('#back-settings-menu').addEventListener('click',()=>activateSettingsCategory('menu', true));
    activateSettingsCategory(state.settingsSection || 'menu', false);
    const settingsContent = $('#page-content');
    const rememberSettingsScroll = () => { if (settingsContent) state.settingsScrollTop = settingsContent.scrollTop; };
    settingsContent?.addEventListener('scroll', rememberSettingsScroll, { passive: true });
    const preserveTimeInputPosition = (event) => {
      const input = event.target.closest?.('.business-hours-grid input');
      if (!input || !settingsContent) return;
      const before = settingsContent.scrollTop;
      state.settingsScrollTop = before;
      requestAnimationFrame(() => {
        if (!settingsContent.isConnected) return;
        if (Math.abs(settingsContent.scrollTop - before) > 40) settingsContent.scrollTop = before;
      });
    };
    $('.business-hours-grid')?.addEventListener('pointerdown', preserveTimeInputPosition, true);
    $('.business-hours-grid')?.addEventListener('focusin', preserveTimeInputPosition, true);
    $('.business-hours-grid')?.addEventListener('change', preserveTimeInputPosition, true);
    requestAnimationFrame(()=>{ const content=$('#page-content'); if(content && state.settingsScrollTop>0) content.scrollTop=state.settingsScrollTop; });
    $$('[data-management-page]').forEach((button) => button.addEventListener('click', () => navigate(button.dataset.managementPage)));

    $('#settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      payload.notify_order_status = $('#settings-form [name=notify_order_status]').checked ? 'true' : 'false';
      payload.agent_signature_enabled = $('#settings-form [name=agent_signature_enabled]').checked ? 'true' : 'false';
      payload.ai_auto_create_orders = $('#settings-form [name=ai_auto_create_orders]').checked ? 'true' : 'false';
      payload.emojis_enabled = $('#settings-form [name=emojis_enabled]').checked ? 'true' : 'false';
      try {
        await api('/settings', { method: 'PUT', body: JSON.stringify(payload) });
        document.documentElement.style.setProperty('--primary', payload.primary_color);
        toast('Configurações salvas');
      } catch (error) { toast('Erro', error.message, 'error'); }
    });

    $('#open-site-settings-preview')?.addEventListener('click',()=>window.open('/pedido','_blank','noopener'));
    const refreshBotOrderModePreview=()=>{
      const form=$('#site-settings-form');if(!form)return;
      const mode=form.elements.bot_order_mode?.value||'whatsapp_ai';
      const sampleLink=`${location.origin}/pedido/checkout/link-identificado`;
      const fieldByMode={site:'bot_order_site_message',hybrid_ai:'bot_order_hybrid_message',hybrid_human:'bot_order_hybrid_human_message',human:'bot_order_whatsapp_message',whatsapp_ai:'bot_order_whatsapp_ai_message'};
      let message=form.elements[fieldByMode[mode]||'bot_order_whatsapp_ai_message']?.value||'';
      message=String(message).replaceAll('{Link}',sampleLink).replaceAll('{Cliente}','Maria').replaceAll('{Empresa}',state.branding?.companyName||'Sua empresa');
      const target=$('#bot-order-mode-preview-text');if(target)target.textContent=message;
    };
    ['bot_order_mode','bot_order_whatsapp_ai_message','bot_order_whatsapp_message','bot_order_site_message','bot_order_hybrid_message','bot_order_hybrid_human_message'].forEach((name)=>$('#site-settings-form')?.elements[name]?.addEventListener('input',refreshBotOrderModePreview));
    refreshBotOrderModePreview();
    const siteLogoUrl=$('#site-logo-url');
    const siteLogoFile=$('#site-logo-file');
    const siteLogoPreview=$('#site-logo-preview');
    const updateSiteLogoPreview=(source)=>{if(siteLogoPreview)siteLogoPreview.src=source||'/assets/jhow-burguer-logo.jpg';};
    siteLogoUrl?.addEventListener('input',()=>updateSiteLogoPreview(siteLogoUrl.value.trim()));
    siteLogoPreview?.addEventListener('error',()=>{if(!siteLogoPreview.src.endsWith('/assets/jhow-burguer-logo.jpg'))siteLogoPreview.src='/assets/jhow-burguer-logo.jpg';});
    siteLogoFile?.addEventListener('change',async()=>{const file=siteLogoFile.files?.[0];if(!file)return;if(file.size>6*1024*1024){siteLogoFile.value='';return toast('Logo muito grande','O limite é 6 MB.','error');}updateSiteLogoPreview(await readFileAsDataUrl(file));});
    $('#site-settings-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form).entries());
      const logoFile=siteLogoFile?.files?.[0];
      if(logoFile){
        try{
          const upload=await api('/settings/site-logo',{method:'POST',body:JSON.stringify({dataUrl:await readFileAsDataUrl(logoFile)})});
          payload.website_logo_url=upload.image_url;
          if(siteLogoUrl)siteLogoUrl.value=upload.image_url;
        }catch(error){return toast('Não foi possível enviar a logo',error.message,'error');}
      }
      for (const key of ['website_orders_enabled','bot_catalog_navigation_enabled','bot_catalog_show_prices','lunch_menu_enabled','lunch_offer_first_message','website_accept_outside_hours','website_delivery_enabled','website_pickup_enabled','website_payment_pix','website_payment_card','website_payment_cash','restaurant_tables_enabled','restaurant_table_allow_multiple_devices','restaurant_table_customer_edit_enabled','restaurant_table_customer_cancel_enabled','order_status_colors_enabled']) payload[key] = form.querySelector(`[name=${key}]`).checked ? 'true' : 'false';
      if (payload.website_orders_enabled === 'true' && payload.website_delivery_enabled !== 'true' && payload.website_pickup_enabled !== 'true') return toast('Escolha uma modalidade','Ative entrega ou retirada para o site público.','error');
      if (payload.website_orders_enabled === 'true' && payload.website_payment_pix !== 'true' && payload.website_payment_card !== 'true' && payload.website_payment_cash !== 'true') return toast('Escolha um pagamento','Ative pelo menos uma forma de pagamento para os pedidos comuns do site.','error');
      try { await api('/settings',{method:'PUT',body:JSON.stringify(payload)}); state.branding = await api('/branding'); applyOrderStatusTheme(); renderNav(await getWaitingCount()); toast('Módulos atualizados','Site, mesas e cores foram salvos.'); }
      catch (error) { toast('Não foi possível salvar o site',error.message,'error'); }
    });

    const refreshWelcomePreview = () => {
      const form = $('#welcome-settings-form');
      if (!form) return;
      const title = form.querySelector('[name=welcome_menu_title]').value || 'Escolha uma opção:';
      const rows = $$('.welcome-option-row', form).map((row) => ({ number: $('.menu-number', row).value.trim(), label: $('.menu-label', row).value.trim() })).filter((row) => row.number && row.label);
      $('#welcome-preview').innerHTML = `<strong>Prévia do menu</strong><p>${esc(title)}</p><div>${rows.map((row) => `<span><b>${esc(row.number)}</b> — ${esc(row.label)}</span>`).join('')}</div>`;
    };
    $$('.menu-action').forEach((select) => select.addEventListener('change', () => { const row = select.closest('.welcome-option-row'); $('.menu-response', row).classList.toggle('hidden', select.value !== 'custom'); refreshWelcomePreview(); }));
    $$('.welcome-option-row input, .welcome-option-row select').forEach((input) => input.addEventListener('input', refreshWelcomePreview));
    refreshWelcomePreview();
    $('#welcome-settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form).entries());
      for (const key of ['welcome_enabled','returning_welcome_enabled','greeting_enabled','welcome_menu_enabled']) payload[key] = form.querySelector(`[name=${key}]`).checked ? 'true' : 'false';
      payload.welcome_menu_options = JSON.stringify($$('.welcome-option-row', form).map((row) => ({
        number: $('.menu-number', row).value.trim(), label: $('.menu-label', row).value.trim(), action: $('.menu-action', row).value, response: $('.menu-response', row).value.trim(),
      })).filter((row) => row.number && row.label));
      try { await api('/settings', { method: 'PUT', body: JSON.stringify(payload) }); toast('Boas-vindas atualizadas', 'As próximas conversas já usarão o novo menu.'); }
      catch (error) { toast('Não foi possível salvar', error.message, 'error'); }
    });

    $('#new-closure-reason').addEventListener('click', () => openClosureReasonModal());
    $$('.edit-closure-reason').forEach((button) => button.addEventListener('click', () => openClosureReasonModal(closureReasons.find((item) => item.id === Number(button.dataset.id)))));
    $('#new-quick-reply').addEventListener('click', () => openQuickReplyModal());
    $$('.edit-quick-reply').forEach((button) => button.addEventListener('click', () => openQuickReplyModal(configuredQuickReplies.find((item) => item.id === Number(button.dataset.id)))));
    $('#new-sticker').addEventListener('click', () => openStickerSettingsModal());
    $$('.edit-sticker-setting').forEach((button) => button.addEventListener('click', () => openStickerSettingsModal(configuredStickers.find((item) => item.id === Number(button.dataset.id)))));
    $('#new-template')?.addEventListener('click', () => openTemplateModal());
    $$('.edit-template').forEach((button) => button.addEventListener('click', () => openTemplateModal(configuredTemplates.find((item) => item.id === Number(button.dataset.id)))));

    $('#automation-settings-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const scrollBeforeSave = $('#page-content')?.scrollTop || 0;
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.business_hours_enabled = form.querySelector('[name=business_hours_enabled]').checked ? 'true' : 'false';
      payload.satisfaction_enabled = form.querySelector('[name=satisfaction_enabled]').checked ? 'true' : 'false';
      const schedule = {};
      $$('[data-business-day]', form).forEach((row) => {
        schedule[row.dataset.businessDay] = $('.business-closed',row).checked ? [] : [$('.business-open',row).value,$('.business-close',row).value];
      });
      payload.business_hours_json = JSON.stringify(schedule);
      try { await api('/settings',{method:'PUT',body:JSON.stringify(payload)}); toast('Automações atualizadas'); }
      catch (error) { toast('Não foi possível salvar',error.message,'error'); }
      finally { requestAnimationFrame(()=>{ const content=$('#page-content'); if(content) content.scrollTop=scrollBeforeSave; }); }
    });
    $$('.business-closed').forEach((checkbox)=>{const row=checkbox.closest('[data-business-day]');$$('input[type=time]',row).forEach((input)=>input.disabled=checkbox.checked);checkbox.addEventListener('change',()=>{$$('input[type=time]',row).forEach((input)=>input.disabled=checkbox.checked);});});

    $('#whatsapp-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveWhatsappConfig(instance.id, event.currentTarget);
    });
    $('#apply-local-whatsapp').addEventListener('click', async () => {
      const button = $('#apply-local-whatsapp');
      button.disabled = true;
      try {
        await api(`/whatsapp/${instance.id}/local-config`, { method: 'POST' });
        toast('Configuração local aplicada', 'URL, chave e instância foram preparadas. Agora gere o QR ou clique em Corrigir webhook.');
        await refreshSettingsPreservingPosition();
      } catch (error) { toast('Falha ao aplicar configuração', error.message, 'error'); }
      finally { if (button?.isConnected) button.disabled = false; }
    });
    $('#diagnose-whatsapp').addEventListener('click', async () => {
      const button = $('#diagnose-whatsapp');
      button.disabled = true;
      try {
        const result = await api(`/whatsapp/${instance.id}/diagnose`);
        toast('Diagnóstico da Evolution', result.message || `Estado: ${result.state}`);
      } catch (error) { toast('Diagnóstico encontrou um problema', error.message, 'error'); }
      finally { if (button?.isConnected) button.disabled = false; }
    });
    $('#repair-webhook').addEventListener('click', async () => {
      const button = $('#repair-webhook');
      button.disabled = true;
      try {
        await saveWhatsappConfig(instance.id, $('#whatsapp-form'), false);
        const result = await api(`/whatsapp/${instance.id}/repair-webhook`, { method: 'POST' });
        toast('Webhook corrigido', result.webhookUrl || result.message);
        await refreshSettingsPreservingPosition();
      } catch (error) { toast('Falha ao corrigir webhook', error.message, 'error'); }
      finally { if (button?.isConnected) button.disabled = false; }
    });
    $('#connect-whatsapp').addEventListener('click', async () => {
      const button = $('#connect-whatsapp');
      const original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner small"></span> Preparando Evolution API...';
      const slowNotice = setTimeout(() => {
        if (button?.isConnected) button.innerHTML = '<span class="spinner small"></span> Gerando QR — o primeiro acesso pode demorar...';
      }, 12000);
      try {
        await saveWhatsappConfig(instance.id, $('#whatsapp-form'), false);
        const result = await api(`/whatsapp/${instance.id}/connect`, { method: 'POST' });
        if (result.connected) {
          if (result.webhookWarning) toast('WhatsApp conectado, mas confira o webhook', result.webhookWarning, 'error');
          else toast('WhatsApp conectado', 'Webhook confirmado pela Evolution API.');
          await refreshSettingsPreservingPosition();
          return;
        }
        if (result.webhookWarning) toast('Atenção ao webhook', result.webhookWarning, 'error');
        openQrModal(instance.id, result);
      } catch (error) {
        toast('Não foi possível gerar o QR Code', error.message, 'error');
      } finally {
        clearTimeout(slowNotice);
        if (button?.isConnected) { button.disabled = false; button.innerHTML = original; }
      }
    });
    $('#check-whatsapp').addEventListener('click', async () => {
      try {
        const result = await api(`/whatsapp/${instance.id}/status`);
        toast('Status atualizado', result.message || statusLabels[result.status] || result.rawState || result.status);
        await refreshSettingsPreservingPosition();
      } catch (error) { toast('Falha ao verificar', error.message, 'error'); }
    });
    $('#disconnect-whatsapp')?.addEventListener('click', async () => {
      if (!await confirmAction('Desconectar WhatsApp', 'Desconectar este número do sistema?', 'Desconectar', true)) return;
      try { await api(`/whatsapp/${instance.id}/disconnect`, { method: 'POST' }); toast('WhatsApp desconectado'); await refreshSettingsPreservingPosition(); }
      catch (error) { toast('Erro ao desconectar', error.message, 'error'); }
    });
    $('#test-whatsapp')?.addEventListener('click', () => openWhatsAppTestModal(instance.id));
  }

  function openTemplateModal(template = null) {
    const variables = ['{Cliente}','{Atendente}','{Empresa}','{Telefone}','{Pedido}','{Subtotal}','{TaxaEntrega}','{Total}','{Endereco}','{Pagamento}','{Instagram}','{Data}','{Hora}'];
    const buttonsText = Array.isArray(template?.buttons) ? template.buttons.join('\n') : '';
    openModal(template ? 'Editar template' : 'Novo template', `<form id="template-form" class="form-grid">
      <div class="field"><label>Nome interno</label><input name="name" value="${esc(template?.name || '')}" required></div>
      <div class="field"><label>Categoria</label><input name="category" value="${esc(template?.category || 'Atendimento')}"></div>
      <div class="field"><label>Tipo</label><select name="template_type" class="custom-select"><option value="internal" ${template?.template_type!=='official'?'selected':''}>Template interno</option><option value="official" ${template?.template_type==='official'?'selected':''}>Template oficial</option></select></div>
      <div class="field"><label>Status oficial</label><select name="official_status" class="custom-select"><option value="draft" ${template?.official_status==='draft'||!template?'selected':''}>Rascunho</option><option value="pending" ${template?.official_status==='pending'?'selected':''}>Em análise</option><option value="approved" ${template?.official_status==='approved'?'selected':''}>Aprovado</option><option value="rejected" ${template?.official_status==='rejected'?'selected':''}>Rejeitado</option></select></div>
      <div class="field"><label>Nome na API oficial</label><input name="official_name" value="${esc(template?.official_name || '')}" placeholder="ex.: pedido_confirmado"></div>
      <div class="field"><label>Idioma</label><select name="language" class="custom-select"><option value="pt_BR" ${template?.language!=='en_US'?'selected':''}>Português (Brasil)</option><option value="en_US" ${template?.language==='en_US'?'selected':''}>Inglês</option></select></div>
      <div class="field"><label>Tipo de mídia</label><select name="media_type" class="custom-select"><option value="none">Somente texto</option><option value="image" ${template?.media_type==='image'?'selected':''}>Imagem</option><option value="video" ${template?.media_type==='video'?'selected':''}>Vídeo</option><option value="document" ${template?.media_type==='document'?'selected':''}>Documento</option></select></div>
      <div class="field"><label>URL da mídia</label><input name="media_url" value="${esc(template?.media_url || '')}" placeholder="Opcional"></div>
      <div class="field full"><label>Cabeçalho</label><input name="header_text" value="${esc(template?.header_text || '')}" placeholder="Opcional"></div>
      <div class="field full"><label>Corpo da mensagem</label><textarea name="body" rows="7" required>${esc(template?.body || '')}</textarea></div>
      <div class="field full"><label>Rodapé</label><input name="footer_text" value="${esc(template?.footer_text || '')}" placeholder="Opcional"></div>
      <div class="field full"><label>Botões</label><textarea name="buttons_text" rows="3" placeholder="Um botão por linha">${esc(buttonsText)}</textarea></div>
      <div class="field full variable-palette">${variables.map((variable)=>`<button type="button" class="variable-chip" data-variable="${esc(variable)}">${esc(variable)}</button>`).join('')}</div>
      <div class="field full"><div class="message-template-preview" id="template-preview"></div></div>
      <div class="field full info-box"><strong>Templates oficiais</strong><p>A marcação “oficial” organiza o modelo e o status. O envio fora da janela de 24 horas só funciona quando uma conexão oficial da Meta estiver configurada.</p></div>
    </form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button>${template ? '<button class="btn btn-danger" id="disable-template">Desativar</button>' : ''}<button class="btn btn-primary" id="save-template">Salvar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    const form = $('#template-form');
    const textarea = form.querySelector('[name=body]');
    const refresh = () => {
      const header = form.querySelector('[name=header_text]').value;
      const footer = form.querySelector('[name=footer_text]').value;
      const body = applyMessageVariables(textarea.value || 'Sua mensagem aparecerá aqui.', { client: 'Maria', agent: state.user?.name || 'Atendente', order: '0042', total: 'R$ 49,90' });
      $('#template-preview').innerHTML = `${header ? `<strong>${esc(header)}</strong>` : '<strong>Prévia</strong>'}<p>${esc(body).replace(/\n/g,'<br>')}</p>${footer ? `<small>${esc(footer)}</small>` : ''}`;
    };
    ['body','header_text','footer_text'].forEach((name)=>form.querySelector(`[name=${name}]`).addEventListener('input',refresh)); refresh();
    $$('.variable-chip').forEach((button)=>button.addEventListener('click',()=>{ const start=textarea.selectionStart||textarea.value.length; textarea.setRangeText(button.dataset.variable,start,textarea.selectionEnd||start,'end'); textarea.focus(); refresh(); }));
    $('#save-template').addEventListener('click', async () => {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.variables = variables.filter((variable)=>payload.body.includes(variable));
      payload.buttons = String(payload.buttons_text || '').split(/\r?\n/).map((item)=>item.trim()).filter(Boolean);
      delete payload.buttons_text;
      try { await api(template ? `/templates/${template.id}` : '/templates', { method: template ? 'PUT' : 'POST', body: JSON.stringify(payload) }); closeModal(); toast('Template salvo'); await refreshSettingsPreservingPosition(); }
      catch (error) { toast('Não foi possível salvar', error.message, 'error'); }
    });
    $('#disable-template')?.addEventListener('click', async () => { if (!await confirmAction('Desativar template','Este template deixará de aparecer para a equipe.','Desativar',true)) return; await api(`/templates/${template.id}`, { method:'DELETE' }); closeModal(); toast('Template desativado'); await refreshSettingsPreservingPosition(); });
  }

  function openQuickReplyModal(reply = null) {
    const variables = ['{Cliente}','{Atendente}','{Empresa}','{Telefone}','{Pedido}','{Subtotal}','{TaxaEntrega}','{Total}','{Endereco}','{Pagamento}','{Instagram}','{Data}','{Hora}'];
    const allowed = Array.isArray(reply?.allowed_roles) ? reply.allowed_roles : [];
    openModal(reply ? 'Editar resposta rápida' : 'Nova resposta rápida', `
      <form id="quick-reply-form" class="form-grid">
        <div class="field"><label>Atalho</label><input name="shortcut" value="${esc(reply?.shortcut || '/')}" placeholder="/ola" required></div>
        <div class="field"><label>Título</label><input name="title" value="${esc(reply?.title || '')}" placeholder="Saudação" required></div>
        <div class="field"><label>Categoria</label><input name="category" value="${esc(reply?.category || 'Geral')}" placeholder="Atendimento"></div>
        <div class="field switch-row"><div><strong>Favorita</strong><small>Aparece antes das demais.</small></div><label class="switch"><input name="favorite" type="checkbox" ${reply?.favorite?'checked':''}><span></span></label></div>
        <div class="field full"><label>Mensagem</label><textarea name="content" rows="6" required>${esc(reply?.content || '')}</textarea></div>
        <div class="field full"><label>Inserir variável</label><div class="variable-palette">${variables.map((variable)=>`<button type="button" class="variable-chip quick-variable" data-variable="${esc(variable)}">${esc(variable)}</button>`).join('')}</div></div>
        <div class="field full"><label>Equipes autorizadas</label><div class="permission-check-grid">
          ${[['admin','Administrador'],['supervisor','Supervisor'],['agent','Atendente'],['kitchen','Cozinha']].map(([value,label])=>`<label class="check-card"><input type="checkbox" name="allowed_roles" value="${value}" ${allowed.includes(value)?'checked':''}><span>${label}</span></label>`).join('')}
        </div><small>Sem seleção: disponível para todas as equipes.</small></div>
        ${reply ? `<div class="field full switch-row"><div><strong>Resposta ativa</strong><small>Respostas inativas ficam salvas, mas não aparecem no atendimento.</small></div><label class="switch"><input name="active" type="checkbox" ${reply.active===false?'':'checked'}><span></span></label></div>` : ''}
        <div class="field full"><label>Prévia</label><div id="quick-reply-preview" class="message-template-preview"><strong>${esc(reply?.title || 'Mensagem')}</strong><p>${esc(reply?.content || 'Digite a mensagem para visualizar.')}</p></div></div>
      </form>`,
      `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button>${reply ? '<button class="btn btn-danger" id="delete-quick-reply" type="button">Excluir</button>' : ''}<button class="btn btn-primary" id="save-quick-reply" type="button">Salvar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    const form=$('#quick-reply-form'); const textarea=form.querySelector('[name=content]');
    const refresh=()=>{$('#quick-reply-preview').innerHTML=`<strong>${esc(form.querySelector('[name=title]').value||'Mensagem')}</strong><p>${esc(textarea.value||'Digite a mensagem para visualizar.')}</p>`;};
    $$('.quick-variable',form).forEach((button)=>button.addEventListener('click',()=>{const start=textarea.selectionStart||textarea.value.length;textarea.setRangeText(button.dataset.variable,start,textarea.selectionEnd||start,'end');textarea.focus();refresh();}));
    form.querySelector('[name=title]').addEventListener('input',refresh); textarea.addEventListener('input',refresh);
    $('#save-quick-reply').addEventListener('click', async () => {
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.favorite=form.querySelector('[name=favorite]').checked;
      payload.allowed_roles=[...form.querySelectorAll('[name=allowed_roles]:checked')].map((item)=>item.value);
      if(reply) payload.active=form.querySelector('[name=active]').checked;
      try {
        await api(reply ? `/quick-replies/${reply.id}` : '/quick-replies', { method: reply ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        closeModal(); toast('Resposta rápida salva'); await refreshSettingsPreservingPosition();
      } catch (error) { toast('Não foi possível salvar', error.message, 'error'); }
    });
    $('#delete-quick-reply')?.addEventListener('click', async () => {
      if (!await confirmAction('Excluir resposta rápida', 'Esta resposta rápida deixará de aparecer para a equipe.', 'Excluir', true)) return;
      try { await api(`/quick-replies/${reply.id}`, { method: 'DELETE' }); closeModal(); toast('Resposta rápida excluída'); await refreshSettingsPreservingPosition(); }
      catch (error) { toast('Não foi possível excluir', error.message, 'error'); }
    });
  }

  function openClosureReasonModal(reason = null) {
    openModal(reason ? 'Editar motivo de encerramento' : 'Novo motivo de encerramento', `
      <form id="closure-reason-form" class="form-grid">
        <div class="field full"><label>Nome do motivo</label><input name="name" maxlength="80" value="${esc(reason?.name || '')}" placeholder="Ex.: Atendimento concluído" required></div>
        <div class="field full switch-row"><div><strong>Motivo ativo</strong><small>Motivos inativos permanecem no histórico, mas não aparecem em novos encerramentos.</small></div><label class="switch"><input name="active" type="checkbox" ${reason?.active === false ? '' : 'checked'}><span></span></label></div>
      </form>`,
      `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button>${reason?.active ? '<button class="btn btn-danger" id="disable-closure-reason" type="button">Desativar</button>' : ''}<button class="btn btn-primary" id="save-closure-reason" type="button">Salvar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    $('#save-closure-reason').addEventListener('click', async () => {
      const form = $('#closure-reason-form');
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.active = form.querySelector('[name=active]').checked;
      try {
        await api(reason ? `/closure-reasons/${reason.id}` : '/closure-reasons', { method: reason ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        closeModal(); toast('Motivo salvo'); await refreshSettingsPreservingPosition();
      } catch (error) { toast('Não foi possível salvar', error.message, 'error'); }
    });
    $('#disable-closure-reason')?.addEventListener('click', async () => {
      try { await api(`/closure-reasons/${reason.id}`, { method: 'DELETE' }); closeModal(); toast('Motivo desativado'); await refreshSettingsPreservingPosition(); }
      catch (error) { toast('Não foi possível desativar', error.message, 'error'); }
    });
  }

  function openStickerSettingsModal(sticker = null) {
    openModal(sticker ? 'Editar figurinha' : 'Nova figurinha', `
      <form id="sticker-settings-form" class="form-grid">
        <div class="field full"><label>Nome da figurinha</label><input name="name" maxlength="80" value="${esc(sticker?.name || '')}" placeholder="Ex.: Pedido saiu para entrega" required></div>
        <div class="field full"><label>Imagem por URL ou arquivo</label><input name="source" value="${esc(sticker?.source || '')}" placeholder="https://... ou selecione um arquivo abaixo"><small>Use PNG, JPG ou WEBP. Arquivos pequenos carregam melhor no atendimento.</small></div>
        <div class="field full"><input id="sticker-file" type="file" accept="image/png,image/jpeg,image/webp"></div>
        <div class="field full sticker-modal-preview ${sticker?.source ? '' : 'hidden'}" id="sticker-modal-preview">${sticker?.source ? `<img src="${esc(sticker.source)}" alt="Prévia">` : ''}</div>
        <div class="field full switch-row"><div><strong>Figurinha ativa</strong><small>Quando desativada, não aparece no botão de figurinhas do chat.</small></div><label class="switch"><input name="active" type="checkbox" ${sticker?.active === false ? '' : 'checked'}><span></span></label></div>
      </form>`,
      `<button class="btn btn-outline close-modal-action" type="button">Cancelar</button>${sticker?.active ? '<button class="btn btn-danger" id="disable-sticker-setting" type="button">Desativar</button>' : ''}<button class="btn btn-primary" id="save-sticker-setting" type="button">Salvar</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    const fileInput = $('#sticker-file');
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) { fileInput.value = ''; toast('Imagem muito grande', 'Use uma figurinha de até 2 MB.', 'error'); return; }
      const source = await readFileAsDataUrl(file);
      $('#sticker-settings-form [name=source]').value = source;
      const preview = $('#sticker-modal-preview');
      preview.classList.remove('hidden'); preview.innerHTML = `<img src="${esc(source)}" alt="Prévia">`;
    });
    $('#sticker-settings-form [name=source]').addEventListener('input', (event) => {
      const preview = $('#sticker-modal-preview');
      const value = event.target.value.trim();
      if (!value) { preview.classList.add('hidden'); preview.innerHTML = ''; return; }
      preview.classList.remove('hidden'); preview.innerHTML = `<img src="${esc(value)}" alt="Prévia">`;
    });
    $('#save-sticker-setting').addEventListener('click', async () => {
      const form = $('#sticker-settings-form');
      const payload = Object.fromEntries(new FormData(form).entries());
      payload.active = form.querySelector('[name=active]').checked;
      try {
        await api(sticker ? `/stickers/${sticker.id}` : '/stickers', { method: sticker ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        closeModal(); toast('Figurinha salva'); await refreshSettingsPreservingPosition();
      } catch (error) { toast('Não foi possível salvar', error.message, 'error'); }
    });
    $('#disable-sticker-setting')?.addEventListener('click', async () => {
      try { await api(`/stickers/${sticker.id}`, { method: 'DELETE' }); closeModal(); toast('Figurinha desativada'); await refreshSettingsPreservingPosition(); }
      catch (error) { toast('Não foi possível desativar', error.message, 'error'); }
    });
  }

  function whatsappStatus(instance) {
    const status = instance?.status || 'disconnected';
    return `<div class="whatsapp-status status-${status}"><span></span><div><strong>${esc(statusLabels[status] || status)}</strong><small>${esc(instance?.phone ? `+${instance.phone}` : 'Nenhum número identificado')}</small></div></div>`;
  }

  async function saveWhatsappConfig(instanceId, form, showToast = true) {
    const payload = Object.fromEntries(new FormData(form).entries());
    const saved = await api(`/whatsapp/${instanceId}/config`, { method: 'PUT', body: JSON.stringify(payload) });
    if (showToast) { toast('Conexão salva'); await refreshSettingsPreservingPosition(); }
    return saved;
  }

  function openQrModal(instanceId, result) {
    const qr = result.qrCode ? `<img class="qr-image" src="${esc(result.qrCode)}" alt="QR Code do WhatsApp">` : '';
    const pairing = result.pairingCode ? `<div class="pairing-code"><span>Código de pareamento</span><strong>${esc(result.pairingCode)}</strong></div>` : '';
    openModal('Conectar WhatsApp', `<div class="qr-modal"><p>No celular, abra <b>WhatsApp → Aparelhos conectados → Conectar aparelho</b> e leia o código.</p>${qr}${pairing}${result.rawCode ? `<textarea readonly>${esc(result.rawCode)}</textarea>` : ''}<div id="qr-status" class="qr-status"><span class="spinner"></span> Aguardando conexão...</div></div>`, `<button class="btn btn-outline close-modal-action">Fechar</button><button class="btn btn-soft" id="refresh-qr-status">Verificar agora</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    let attempts = 0;
    const check = async () => {
      attempts += 1;
      try {
        const status = await api(`/whatsapp/${instanceId}/status`);
        if (status.status === 'connected') {
          $('#qr-status').innerHTML = `${icon('check',18)} <strong>WhatsApp conectado com sucesso.</strong>`;
          toast('WhatsApp conectado');
          updateConnectionCard(status.instance);
          setTimeout(() => { closeModal(); renderSettings(); }, 900);
          return true;
        }
        $('#qr-status').innerHTML = `<span class="spinner"></span> ${esc(statusLabels[status.status] || 'Aguardando leitura do QR Code...')}`;
      } catch (error) { $('#qr-status').textContent = error.message; }
      return false;
    };
    $('#refresh-qr-status').addEventListener('click', check);
    const timer = setInterval(async () => {
      if (!$('#qr-status') || attempts >= 40 || await check()) clearInterval(timer);
    }, 3000);
  }

  function openWhatsAppTestModal(instanceId) {
    openModal('Enviar mensagem de teste', `<form id="whatsapp-test-form" class="form-grid"><div class="field full"><label>Telefone com DDI e DDD</label><input name="phone" placeholder="5538999999999" required></div><div class="field full"><label>Mensagem</label><textarea name="text">Teste da G&M Automação. A conexão com o WhatsApp está funcionando.</textarea></div></form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="send-whatsapp-test">Enviar teste</button>`);
    $('.close-modal-action').addEventListener('click', closeModal);
    $('#send-whatsapp-test').addEventListener('click', async () => {
      const payload = Object.fromEntries(new FormData($('#whatsapp-test-form')).entries());
      try { await api(`/whatsapp/${instanceId}/test`, { method: 'POST', body: JSON.stringify(payload) }); closeModal(); toast('Mensagem de teste enviada'); }
      catch (error) { toast('Falha no envio', error.message, 'error'); }
    });
  }



  function applyClientVariables(text, conversation = {}) {
    const replacements = {
      Cliente: conversation.contact_name || 'cliente',
      Atendente: state.user?.name || 'Equipe',
      Empresa: state.branding?.companyName || 'G&M Automação',
      Telefone: conversation.phone || '',
      Pedido: '', Subtotal: '', TaxaEntrega: '', Total: '', Endereco: '', Pagamento: '',
      Instagram: state.branding?.instagram || '', Data: new Date().toLocaleDateString('pt-BR'), Hora: new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    };
    let output = String(text || '');
    Object.entries(replacements).forEach(([key,value]) => { output = output.replaceAll(`{${key}}`,value).replaceAll(`{${key.toLowerCase()}}`,value); });
    return output;
  }

  async function openNewConversationModal(prefill = {}) {
    let contacts=[];
    let queues=Array.isArray(state.queues)?state.queues:[];
    let options={users:[]};
    const failed=[];

    const results=await Promise.allSettled([
      api('/contacts'),
      api('/queues'),
      api('/transfer-options'),
    ]);

    if(results[0].status==='fulfilled') contacts=Array.isArray(results[0].value)?results[0].value:[];
    else failed.push('contatos');

    if(results[1].status==='fulfilled') queues=Array.isArray(results[1].value)?results[1].value:queues;
    else failed.push('filas');

    if(results[2].status==='fulfilled') options=results[2].value||options;
    else failed.push('atendentes');

    const queueOptions=queues.length
      ? queues.map((q)=>`<option value="${q.id}">${esc(q.name)}</option>`).join('')
      : '<option value="">Fila padrão</option>';

    const userOptions=Array.isArray(options.users)
      ? options.users.map((u)=>`<option value="${u.id}">${esc(u.name)} · ${u.available?'Online':esc(u.status)}</option>`).join('')
      : '';

    openModal('Abrir conversa', `
      <div class="open-conversation-tabs" role="tablist" aria-label="Forma de abrir conversa">
        <button type="button" class="active" data-open-tab="number" role="tab" aria-selected="true">${icon('phone',16)}<span>Digitar número</span></button>
        <button type="button" data-open-tab="contact" role="tab" aria-selected="false">${icon('users',16)}<span>Buscar contatos</span></button>
      </div>
      ${failed.length?`<div class="inline-warning">Alguns dados auxiliares não carregaram (${esc(failed.join(', '))}), mas você ainda pode abrir pelo número.</div>`:''}
      <form id="open-conversation-form" class="form-grid">
        <div id="open-number-fields" class="field full"><label>Telefone com DDI e DDD</label><input name="phone" value="${esc(prefill.phone||'')}" inputmode="tel" autocomplete="tel" placeholder="5538999999999"><small>Você também pode informar apenas DDD + número; o sistema acrescenta o DDI 55.</small></div>
        <div id="open-contact-fields" class="field full hidden"><label>Contato</label><div class="custom-combobox"><input id="contact-combo-search" placeholder="Digite o nome ou telefone"><div id="contact-combo-list" class="custom-options">${contacts.slice(0,100).map((c)=>`<button type="button" data-contact-id="${c.id}" data-phone="${esc(c.phone)}"><span class="avatar">${initials(c.name)}</span><div><strong>${esc(c.name)}</strong><small>+${esc(c.phone)}</small></div></button>`).join('')||'<div class="empty-state"><p>Nenhum contato carregado. Use a opção de número.</p></div>'}</div></div><input type="hidden" name="contactId"></div>
        <div class="field"><label>Fila</label><select name="queueId" class="custom-select">${queueOptions}</select></div>
        ${['admin','supervisor'].includes(state.user.role)?`<div class="field"><label>Responsável</label><select name="userId" class="custom-select"><option value="">Distribuição automática</option>${userOptions}</select></div>`:''}
        <div class="field full"><label>Mensagem inicial</label><textarea name="message" rows="4" placeholder="Olá! Como podemos ajudar? 😊"></textarea></div>
      </form>`,
      `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="confirm-open-conversation">Abrir conversa</button>`);

    $('.close-modal-action').addEventListener('click',closeModal);

    $$('[data-open-tab]').forEach((btn)=>btn.addEventListener('click',()=>{
      $$('[data-open-tab]').forEach((button)=>{
        const active=button===btn;
        button.classList.toggle('active',active);
        button.setAttribute('aria-selected',String(active));
      });
      const contact=btn.dataset.openTab==='contact';
      $('#open-number-fields').classList.toggle('hidden',contact);
      $('#open-contact-fields').classList.toggle('hidden',!contact);
      if(contact) requestAnimationFrame(()=>$('#contact-combo-search')?.focus());
      else requestAnimationFrame(()=>$('#open-number-fields input')?.focus());
    }));

    $('#contact-combo-search')?.addEventListener('input',(event)=>{
      const term=event.target.value.toLowerCase();
      $$('#contact-combo-list button').forEach((btn)=>btn.classList.toggle('hidden',!btn.textContent.toLowerCase().includes(term)));
    });

    $$('#contact-combo-list button').forEach((btn)=>btn.addEventListener('click',()=>{
      $('#open-conversation-form [name=contactId]').value=btn.dataset.contactId;
      $('#contact-combo-search').value=btn.textContent.trim().replace(/\s+/g,' ');
      $$('#contact-combo-list button').forEach((button)=>button.classList.toggle('selected',button===btn));
    }));

    $('#open-number-fields input')?.addEventListener('input',(event)=>{
      event.target.value=String(event.target.value||'').replace(/[^\d+()\s-]/g,'');
    });

    $('#confirm-open-conversation').addEventListener('click',async()=>{
      const button=$('#confirm-open-conversation');
      const payload=Object.fromEntries(new FormData($('#open-conversation-form')).entries());
      payload.phone=String(payload.phone||'').replace(/\D/g,'');

      if(!payload.contactId&&payload.phone.length<10){
        return toast('Confira o telefone','Informe DDD e número, ou DDI + DDD + número.','error');
      }

      button.disabled=true;
      button.textContent=String(payload.message||'').trim()?'Verificando e enviando...':'Abrindo...';

      try{
        const conversation=await api('/conversations/open',{method:'POST',body:JSON.stringify(payload)});
        closeModal();
        state.selectedConversationId=conversation.id;
        await navigate('chats');

        if(conversation.warning) toast('Conversa aberta, mas a mensagem falhou',conversation.warning,'error');
        else toast('Conversa aberta',conversation.initial_message_sent===true?'A mensagem inicial foi enviada.':'');
      } catch(error){
        button.disabled=false;
        button.textContent='Abrir conversa';
        toast('Não foi possível abrir',error.message,'error');
      }
    });

    if(failed.length){
      toast('Abertura em modo seguro',`Falha ao carregar: ${failed.join(', ')}. Você pode continuar pelo número.`,'error');
    }
  }

  function clearMessageSelection() {
    state.selectedMessageIds.clear();
    $$('.message.is-selected').forEach((item)=>item.classList.remove('is-selected'));
    updateMessageSelectionBar();
  }

  function updateMessageSelectionBar() {
    const bar=$('#message-selection-bar'); if(!bar)return;
    const count=state.selectedMessageIds.size;
    bar.classList.toggle('hidden',!count);
    if($('#selected-count')) $('#selected-count').textContent=count;
  }

  function toggleMessageSelection(messageId) {
    const id=Number(messageId);
    if(state.selectedMessageIds.has(id)) state.selectedMessageIds.delete(id); else state.selectedMessageIds.add(id);
    $(`.message[data-message-id="${id}"]`)?.classList.toggle('is-selected',state.selectedMessageIds.has(id));
    updateMessageSelectionBar();
  }

  function setReplyMessage(message) {
    state.replyToMessage=message;
    const preview=$('#reply-preview'); if(!preview)return;
    preview.classList.remove('hidden');
    const type=String(message.message_type||'text');
    const media=message.media_url&&['image','sticker'].includes(type)?`<img src="${esc(message.media_url)}" alt="Mídia respondida">`:type==='video'?'<span class="reply-preview-media">▶</span>':type==='audio'?'<span class="reply-preview-media">🎤</span>':'';
    const fallback={image:'Imagem',sticker:'Figurinha',video:'Vídeo',audio:'Áudio',document:'Documento'}[type]||'Mensagem';
    const text=String(message.content||'').replace(/^\[[^\]]+\]$/,'').trim()||fallback;
    preview.innerHTML=`<div class="reply-preview-content"><strong>Respondendo ${esc(message.sender_type==='customer'?'Cliente':message.sender_type==='ai'?'IA':message.user_name||'mensagem')}</strong><span>${esc(text.slice(0,150))}</span></div>${media}<button id="cancel-reply" class="icon-button">${icon('close',14)}</button>`;
    $('#cancel-reply').addEventListener('click',()=>{state.replyToMessage=null;preview.classList.add('hidden');preview.innerHTML='';});
    $('#message-input')?.focus();
  }

  function bindAudioPlayers(root = document) {
    $$('[data-audio-player]:not([data-audio-bound])', root).forEach((player)=>{
      player.dataset.audioBound='true';
      const audio=$('[data-audio-element]',player);
      const play=$('[data-audio-play]',player);
      const progress=$('[data-audio-progress]',player);
      const time=$('[data-audio-time]',player);
      const speed=$('[data-audio-speed]',player);
      if(!audio||!play||!progress||!time)return;
      const refresh=()=>{
        const duration=Number.isFinite(audio.duration)?audio.duration:0;
        const current=Number.isFinite(audio.currentTime)?audio.currentTime:0;
        progress.value=duration?String(Math.round((current/duration)*1000)):'0';
        time.textContent=`${formatAudioTime(current)} / ${formatAudioTime(duration)}`;
        play.textContent=audio.paused?'▶':'❚❚';
        play.dataset.tooltip=audio.paused?'Reproduzir':'Pausar';
      };
      play.addEventListener('click',async(event)=>{
        event.stopPropagation();
        try{
          $$('[data-audio-element]').forEach((other)=>{if(other!==audio&&!other.paused)other.pause();});
          if(audio.paused)await audio.play();else audio.pause();
          refresh();
        }catch{toast('Não foi possível reproduzir o áudio','O formato recebido não é compatível com este navegador.','error');}
      });
      progress.addEventListener('input',()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=(Number(progress.value)/1000)*audio.duration;refresh();});
      speed?.addEventListener('click',(event)=>{event.stopPropagation();const speeds=[1,1.5,2];const next=speeds[(speeds.indexOf(audio.playbackRate)+1)%speeds.length];audio.playbackRate=next;speed.textContent=`${String(next).replace('.5',',5')}×`;});
      audio.addEventListener('loadedmetadata',refresh);
      audio.addEventListener('durationchange',refresh);
      audio.addEventListener('timeupdate',refresh);
      audio.addEventListener('play',refresh);
      audio.addEventListener('pause',refresh);
      audio.addEventListener('ended',refresh);
      audio.addEventListener('error',()=>player.classList.add('audio-error'));
      refresh();
    });
  }

  function focusQuotedMessage(messageId){
    const target=document.querySelector(`.message[data-message-id="${Number(messageId)}"]`);
    if(!target)return toast('Mensagem original não encontrada','Ela pode pertencer a um histórico que não foi carregado.','error');
    target.scrollIntoView({behavior:'smooth',block:'center'});
    target.classList.remove('quote-highlight');
    void target.offsetWidth;
    target.classList.add('quote-highlight');
    setTimeout(()=>target.classList.remove('quote-highlight'),1800);
  }

  function openMediaViewer(source,type,fileName){
    if(!source)return;
    const name=String(fileName|| (type==='sticker'?'figurinha.webp':'imagem'));
    const content=type==='video'
      ? `<div class="chat-media-viewer"><video src="${esc(source)}" controls autoplay playsinline></video></div>`
      : `<div class="chat-media-viewer ${type==='sticker'?'is-sticker':''}"><img src="${esc(source)}" alt="${esc(name)}"></div>`;
    openModal(type==='sticker'?'Figurinha':type==='video'?'Vídeo':'Imagem',content,`<button type="button" class="btn btn-outline close-modal-action">Fechar</button><a class="btn btn-primary" href="${esc(source)}" download="${esc(name)}">${icon('download',16)} Baixar</a>`);
    $('.close-modal-action',$('#modal-root'))?.addEventListener('click',closeModal);
  }

  function bindMessageActions(conversation, messages, root = $('#messages') || document) {
    bindAudioPlayers(root);
    const byId=new Map(messages.map((m)=>[Number(m.id),m]));
    const scoped=(selector)=>[...(root?.matches?.(selector)?[root]:[]),...$$(selector,root)];
    scoped('[data-message-select]').forEach((btn)=>btn.addEventListener('click',(event)=>{event.stopPropagation();toggleMessageSelection(btn.dataset.messageSelect);}));
    scoped('[data-quote-target]').forEach((quote)=>quote.addEventListener('click',(event)=>{event.stopPropagation();focusQuotedMessage(quote.dataset.quoteTarget);}));
    scoped('[data-open-media]').forEach((media)=>media.addEventListener('click',(event)=>{event.stopPropagation();openMediaViewer(media.dataset.openMedia,media.dataset.mediaType,media.dataset.fileName);}));
    scoped('.message-media-download').forEach((link)=>link.addEventListener('click',(event)=>event.stopPropagation()));
    scoped('[data-message-action]').forEach((btn)=>btn.addEventListener('click',async(event)=>{
      event.stopPropagation();
      const message=byId.get(Number(btn.dataset.messageId));
      await handleMessageAction(btn.dataset.messageAction, message, conversation);
    }));
    scoped('.message').forEach((node)=>{
      const message=byId.get(Number(node.dataset.messageId));
      node.addEventListener('contextmenu',(event)=>{event.preventDefault();openMessageMenu(event,conversation,message);});
      node.addEventListener('dblclick',()=>setReplyMessage(message));
    });
  }

  function openMessageMenu(event, conversation, message) {
    closeContextMenu();
    const menu=document.createElement('div');menu.id='conversation-context';menu.className='context-menu';
    menu.innerHTML=`
      <button data-action="reply">${icon('reply',15)} Responder</button>
      <button data-action="select">${icon('check',15)} Selecionar</button>
      <button data-action="forward">${icon('forward',15)} Encaminhar</button>
      <button data-action="pin">${icon('pin',15)} ${message.pinned?'Desafixar':'Fixar'}</button>
      <button data-action="react">😀 Reagir</button>
      ${message.delivery_status==='failed'&&!message.deleted_at?`<button data-action="retry">${icon('refresh',15)} Reenviar</button>`:''}
      ${!message.deleted_at&&!message.is_internal&&['agent','ai'].includes(message.sender_type)&&(['admin','supervisor'].includes(state.user?.role)||Number(message.user_id)===Number(state.user?.id))?`<hr><button class="danger" data-action="delete">${icon('trash',15)} Excluir mensagem</button>`:''}
      ${message.is_internal&&!message.deleted_at?`<hr><button data-action="edit">${icon('edit',15)} Editar nota</button><button class="danger" data-action="delete-note">${icon('trash',15)} Excluir nota</button>`:''}`;
    document.body.appendChild(menu);
    menu.style.left=`${Math.max(8,Math.min(event.clientX,window.innerWidth-220))}px`;menu.style.top=`${Math.max(8,Math.min(event.clientY,window.innerHeight-300))}px`;
    menu.addEventListener('click',async(click)=>{
      const action=click.target.closest('button')?.dataset.action;if(!action)return;closeContextMenu();
      await handleMessageAction(action, message, conversation);
    });
  }

  function openReactionMenu(message, conversation) {
    openModal('Reagir à mensagem',`<div class="reaction-picker">${['👍','❤️','😂','😮','🙏','✅'].map((emoji)=>`<button type="button" data-reaction="${emoji}" aria-label="Reagir com ${emoji}">${emoji}</button>`).join('')}</div>`,`<button type="button" class="btn btn-outline close-modal-action">Cancelar</button>`);
    $('.close-modal-action',$('#modal-root'))?.addEventListener('click',closeModal);
    $$('[data-reaction]',$('#modal-root')).forEach((btn)=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await api(`/messages/${message.id}/reaction`,{method:'POST',body:JSON.stringify({emoji:btn.dataset.reaction})});closeModal();await selectConversation(conversation.id,false);}catch(error){btn.disabled=false;toast('Não foi possível reagir',error.message,'error');}}));
  }

  function openDeleteMessagesModal(conversation, messageIds, sourceMessages = []) {
    const ids=[...new Set((messageIds||[]).map(Number).filter(Boolean))];
    if(!ids.length)return toast('Selecione ao menos uma mensagem','','error');
    const selected=(sourceMessages||[]).filter((message)=>ids.includes(Number(message.id)));
    const manager=['admin','supervisor'].includes(state.user?.role);
    const canDeleteForEveryone=selected.length>0&&selected.every((message)=>!message.deleted_at&&!message.is_internal&&['agent','ai'].includes(message.sender_type)&&(manager||Number(message.user_id)===Number(state.user?.id)));
    const totalLabel=ids.length===1?'1 mensagem':`${ids.length} mensagens`;
    openModal(`Excluir ${totalLabel}`,`<div class="delete-message-options">
      <button type="button" class="delete-message-choice" id="delete-for-me"><span>🙈</span><div><strong>Excluir só para mim</strong><small>Some apenas da sua tela. Os outros usuários e o WhatsApp continuam vendo.</small></div></button>
      <button type="button" class="delete-message-choice danger ${canDeleteForEveryone?'':'is-disabled'}" id="delete-for-everyone" ${canDeleteForEveryone?'':'disabled'}><span>🗑️</span><div><strong>Apagar para todos</strong><small>${canDeleteForEveryone?'Remove no WhatsApp. Administradores ainda verão um registro apagado e esmaecido.':'Disponível somente para mensagens enviadas por você ou para administradores.'}</small></div></button>
    </div>`,`<button class="btn btn-outline close-modal-action">Cancelar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    const execute=async(scope,button)=>{
      button.disabled=true;
      try{
        const result=await api('/messages/delete-selection',{method:'POST',body:JSON.stringify({messageIds:ids,scope})});
        closeModal();clearMessageSelection();await selectConversation(conversation.id,false);
        if(scope==='me') toast(`${result.hidden||ids.length} mensagem(ns) removida(s) da sua tela`);
        else{
          const skipped=Number(result.skipped?.length||0); const failed=Number(result.failed?.length||0);
          toast(`${result.deleted||0} mensagem(ns) apagada(s) para todos`,skipped||failed?`${skipped} ignorada(s) · ${failed} com falha`:undefined,failed?'error':undefined);
        }
      }catch(error){button.disabled=false;toast('Não foi possível excluir',error.message,'error');}
    };
    $('#delete-for-me').addEventListener('click',(event)=>execute('me',event.currentTarget));
    $('#delete-for-everyone')?.addEventListener('click',(event)=>execute('everyone',event.currentTarget));
  }

  function openEditInternalMessage(message, conversation) {
    openModal('Editar mensagem interna',`<div class="field"><label>Mensagem</label><textarea id="edit-internal-content" rows="5">${esc(message.content)}</textarea></div>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-internal-edit">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    $('#save-internal-edit').addEventListener('click',async()=>{await api(`/messages/${message.id}`,{method:'PUT',body:JSON.stringify({content:$('#edit-internal-content').value})});closeModal();await selectConversation(conversation.id,false);});
  }

  async function openForwardModal(conversation) {
    const ids=[...state.selectedMessageIds]; if(!ids.length)return;
    let channels=[]; let users=[];
    try{[channels,users]=await Promise.all([api('/internal/channels'),api('/internal/users')]);}catch{/* WhatsApp permanece disponível */}
    const rows=state.conversations.filter((item)=>Number(item.id)!==Number(conversation.id));
    const card=(value,avatar,title,subtitle,extra='')=>`<label class="forward-target-card" data-forward-search="${esc(`${title} ${subtitle}`.toLowerCase())}"><input type="radio" name="forwardTarget" value="${value}"><span class="avatar ${extra}">${avatar}</span><span class="forward-target-copy"><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></span><i class="forward-radio-mark"></i></label>`;
    const whatsappRows=rows.map((row)=>card(`conversation:${row.id}`,initials(row.contact_name),row.contact_name,`WhatsApp · ${row.queue_name}`)).join('');
    const channelRows=channels.map((row)=>card(`channel:${row.id}`,'#',row.name,`Canal interno · ${row.description||'Equipe'}`,'internal-forward-avatar')).join('');
    const userRows=users.map((row)=>card(`user:${row.id}`,initials(row.name),row.name,`Conversa interna · ${roleLabel(row.role)}`)).join('');
    const group=(title,items)=>items?`<section class="forward-target-group"><h4>${title}</h4><div class="forward-target-grid">${items}</div></section>`:'';
    openModal('Encaminhar mensagens',`<div class="forward-modal-content">
      <div class="forward-search-box">${icon('search',16)}<input id="forward-target-search" type="search" placeholder="Buscar conversa, canal ou pessoa"></div>
      <div class="forward-target-list grouped-forward-targets">
        ${group('Conversas do WhatsApp',whatsappRows)}
        ${group('Canais internos',channelRows)}
        ${group('Pessoas da equipe',userRows)}
        ${!whatsappRows&&!channelRows&&!userRows?'<p class="muted">Nenhum destino disponível.</p>':''}
      </div>
    </div>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="confirm-forward">Encaminhar</button>`,'wide');
    $('.close-modal-action').addEventListener('click',closeModal);
    $('#forward-target-search')?.addEventListener('input',(event)=>{
      const term=event.target.value.trim().toLowerCase();
      $$('.forward-target-card',$('#modal-root')).forEach((item)=>item.classList.toggle('hidden',term&&!item.dataset.forwardSearch.includes(term)));
      $$('.forward-target-group',$('#modal-root')).forEach((group)=>group.classList.toggle('hidden',!$$('.forward-target-card:not(.hidden)',group).length));
    });
    $('#confirm-forward').addEventListener('click',async()=>{
      const raw=document.querySelector('[name=forwardTarget]:checked')?.value||'';
      const [type,idText]=raw.split(':'); const targetId=Number(idText||0);
      if(!type||!targetId)return toast('Selecione o destino','','error');
      const button=$('#confirm-forward'); button.disabled=true;
      try{
        if(type==='conversation') await api(`/conversations/${conversation.id}/forward`,{method:'POST',body:JSON.stringify({messageIds:ids,targetConversationId:targetId})});
        else await api(`/conversations/${conversation.id}/forward-internal`,{method:'POST',body:JSON.stringify({messageIds:ids,targetType:type,targetId})});
        closeModal();clearMessageSelection();toast(type==='conversation'?'Mensagens encaminhadas':'Mensagens enviadas ao chat interno');
      }catch(error){button.disabled=false;toast('Falha ao encaminhar',error.message,'error');}
    });
  }

  function notificationsEnabled(preferences = state.user?.preferences || {}) {
    return preferences.sounds_enabled !== false && preferences.desktop_notifications !== false;
  }

  function updateNotificationMuteButton() {
    const button=$('#notifications-button'); if(!button)return;
    const enabled=notificationsEnabled();
    button.classList.toggle('is-muted',!enabled);
    button.dataset.tooltip=enabled?'Notificações':'Notificações silenciadas';
  }

  async function toggleNotifications({ keepPanelOpen = true } = {}) {
    const enabled=notificationsEnabled();
    const preferences={...(state.user?.preferences||{}),sounds_enabled:!enabled,desktop_notifications:!enabled};
    try{
      await api('/profile',{method:'PUT',body:JSON.stringify({preferences})});
      state.user.preferences=preferences;
      updateNotificationMuteButton();
      if(!enabled){
        requestBrowserNotifications();
        playUiSound('notification');
        toast('Notificações ativadas');
      } else toast('Notificações silenciadas','O sino e os contadores de não lidas continuam visíveis.');
      const panel=$('#notification-panel');
      if(keepPanelOpen && panel && !panel.classList.contains('hidden')) await openNotifications(true);
    }catch(error){toast('Não foi possível alterar',error.message,'error');}
  }

  function applyUserPreferences(preferences={}) {
    const theme=preferences.theme||localStorage.getItem('atenderbem_theme')||'light';
    document.documentElement.dataset.theme=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;
    document.body.classList.toggle('compact-density',preferences.density==='compact'||preferences.compact_mode);
    updateNotificationMuteButton();
  }

  async function toggleTheme() {
    const current=document.documentElement.dataset.theme||'light'; const next=current==='dark'?'light':'dark';
    document.documentElement.dataset.theme=next;localStorage.setItem('atenderbem_theme',next);closeHeaderMenus();
    try{await api('/profile',{method:'PUT',body:JSON.stringify({preferences:{...(state.user.preferences||{}),theme:next}})});state.user.preferences={...(state.user.preferences||{}),theme:next};}catch{}
  }

  async function openPresenceModal() {
    const [reasons,myQueues]=await Promise.all([api('/pause-reasons'),api('/my-queues')]);
    openModal('Disponibilidade',`<form id="presence-form" class="form-grid"><div class="field full"><label>Status</label><select name="status" id="presence-status" class="custom-select"><option value="online" ${state.user.status==='online'?'selected':''}>🟢 Online</option><option value="busy" ${state.user.status==='busy'?'selected':''}>🟠 Ocupado</option><option value="paused" ${state.user.status==='paused'?'selected':''}>⏸️ Pausado</option><option value="offline" ${state.user.status==='offline'?'selected':''}>⚫ Offline</option></select></div><div class="field full ${state.user.status==='paused'?'':'hidden'}" id="pause-reason-field"><label>Motivo da pausa</label><select name="pause_reason" class="custom-select"><option value="">Selecione</option>${reasons.map((r)=>`<option>${esc(r.name)}</option>`).join('')}</select></div><div class="field full switch-row"><div><strong>Receber novos atendimentos</strong><small>Quando desligado, você continua podendo acompanhar e assumir conversas.</small></div><label class="switch"><input name="receive_assignments" type="checkbox" ${state.user.receive_assignments?'checked':''}><span></span></label></div><div class="field full"><label>Filas em que estou disponível</label><div class="queue-choice-grid">${myQueues.filter((q)=>q.allowed).map((q)=>`<label><input type="checkbox" name="joined_queue" value="${q.id}" ${q.joined?'checked':''}><i style="background:${esc(q.color)}"></i><span>${esc(q.name)}</span></label>`).join('')||'<small>Nenhuma fila foi liberada para seu usuário.</small>'}</div></div></form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-presence">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#presence-status').addEventListener('change',(e)=>$('#pause-reason-field').classList.toggle('hidden',e.target.value!=='paused'));
    $('#save-presence').addEventListener('click',async()=>{const form=$('#presence-form');const payload=Object.fromEntries(new FormData(form).entries());payload.receive_assignments=form.querySelector('[name=receive_assignments]').checked;const queue_ids=$$('input[name=joined_queue]:checked',form).map((input)=>Number(input.value));const updated=await api('/presence',{method:'PUT',body:JSON.stringify(payload)});await api('/my-queues',{method:'PUT',body:JSON.stringify({queue_ids})});state.user={...state.user,...updated};renderHeaderAvatar(state.user);closeModal();toast('Disponibilidade atualizada');});
  }

  function notificationPanelMarkup(rows = []) {
    const unread = rows.filter((row)=>!row.is_read).length;
    const enabled = notificationsEnabled();
    const controlLabel = enabled ? 'Silenciar notificações' : 'Ativar notificações';
    return `<div class="notification-panel-head"><div><strong>Notificações</strong><small>${unread ? `${unread} não lida${unread === 1 ? '' : 's'}` : 'Tudo em dia'}</small></div><div class="notification-panel-controls"><button type="button" id="notification-toggle-inside" class="notification-toggle-inside ${enabled?'':'is-muted'}" aria-label="${controlLabel}" data-tooltip="${controlLabel}"><svg class="notification-bell" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/><path class="mute-slash" d="M4 4l16 16"/></svg></button>${unread ? '<button type="button" id="read-all-notifications">Marcar todas</button>' : ''}<button type="button" id="close-notification-panel" aria-label="Fechar">×</button></div></div><div class="notification-panel-list">${rows.map((n)=>{const visual=notificationVisual(n.type);return `<button class="notification-panel-item ${n.is_read?'':'unread'}" data-notification-id="${n.id}" data-entity-type="${esc(n.entity_type||'')}" data-entity-id="${n.entity_id||''}"><span class="notification-panel-icon ${visual.className}">${visual.icon}</span><span class="notification-panel-copy"><strong>${esc(n.title)}</strong><p>${esc(n.message)}</p><small>${dateTime(n.created_at)}</small></span><i></i></button>`;}).join('')||'<div class="notification-panel-empty">🔔<strong>Nenhuma notificação</strong><span>Quando algo novo acontecer, aparecerá aqui.</span></div>'}</div>`;
  }

  function bindNotificationPanel(rows = []) {
    const panel=$('#notification-panel'); if(!panel)return;
    $('#close-notification-panel')?.addEventListener('click',()=>closeHeaderMenus());
    $('#notification-toggle-inside')?.addEventListener('click',async(event)=>{event.preventDefault();event.stopPropagation();await toggleNotifications({keepPanelOpen:true});});
    $('#read-all-notifications')?.addEventListener('click',async()=>{await api('/notifications/read-all',{method:'POST'});await openNotifications(true);});
    $$('[data-notification-id]',panel).forEach((btn)=>btn.addEventListener('click',async()=>{
      await api(`/notifications/${btn.dataset.notificationId}/read`,{method:'POST'});
      btn.classList.remove('unread');
      await refreshNotifications();
      await openNotificationEntity(btn.dataset.entityType,Number(btn.dataset.entityId||0));
    }));
    bindSmartTooltips(panel);
  }

  async function refreshNotifications() {
    const rows=await api('/notifications');
    const unread=rows.filter((row)=>!row.is_read).length;
    const button=$('#notifications-button');
    if(button){button.classList.toggle('has-unread',unread>0);button.dataset.count=unread?String(Math.min(unread,99)):'';button.setAttribute('aria-label',unread?`Notificações: ${unread} não lida${unread===1?'':'s'}`:'Notificações');}
    updateNotificationMuteButton();
    const panel=$('#notification-panel');
    if(panel && !panel.classList.contains('hidden')){panel.innerHTML=notificationPanelMarkup(rows);bindNotificationPanel(rows);}
    return rows;
  }

  async function openNotifications(forceOpen = false) {
    requestBrowserNotifications();
    const panel=$('#notification-panel');
    const button=$('#notifications-button');
    if(!panel)return;
    const alreadyOpen=!panel.classList.contains('hidden');
    if(!forceOpen && alreadyOpen){
      closeHeaderMenus();
      return;
    }
    closeHeaderMenus('notifications');
    panel.classList.remove('hidden');
    button?.setAttribute('aria-expanded','true');
    const requestId=++state.notificationPanelRequest;
    panel.innerHTML='<div class="notification-panel-loading"><span class="spinner"></span><span>Carregando notificações...</span></div>';
    try{
      const rows=await api('/notifications');
      if(requestId!==state.notificationPanelRequest || panel.classList.contains('hidden'))return;
      panel.innerHTML=notificationPanelMarkup(rows);
      bindNotificationPanel(rows);
      const unread=rows.filter((row)=>!row.is_read).length;
      if(button){button.classList.toggle('has-unread',unread>0);button.dataset.count=unread?String(Math.min(unread,99)):'';}
      updateNotificationMuteButton();
    } catch(error){
      if(requestId!==state.notificationPanelRequest || panel.classList.contains('hidden'))return;
      panel.innerHTML=`<div class="notification-panel-empty">⚠️<strong>Não foi possível carregar</strong><span>${esc(error.message)}</span></div>`;
    }
  }


  async function renderPresenceBoard() {
    const [board,myQueues,reasons,whatsappSummary]=await Promise.all([api('/presence-board'),api('/my-queues'),api('/pause-reasons'),api('/whatsapp-summary').catch(()=>({status:'disconnected',name:'WhatsApp',phone:''}))]);
    const me=board.me || state.user;
    state.user={...state.user,...me};
    renderHeaderAvatar(state.user);
    const statuses=[['online','🟢','Online'],['busy','🟠','Ocupado'],['paused','⏸️','Pausado'],['offline','⚫','Offline']];
    $('#page-content').innerHTML=`<div class="presence-page">
      <div class="compact-page-toolbar"><div><h2>Filas e presença</h2><small>Controle sua disponibilidade e veja a equipe conectada.</small></div><button class="icon-button" id="refresh-presence-board" data-tooltip="Atualizar">${icon('refresh',17)}</button></div>
      <section class="presence-connection-card"><span class="status-dot ${whatsappSummary.status==='connected'?'online':'offline'}"></span><div><strong>${esc(whatsappSummary.name||'WhatsApp principal')}</strong><small>${esc(statusLabels[whatsappSummary.status]||'Desconectado')}${whatsappSummary.phone?` · +${esc(whatsappSummary.phone)}`:''}</small></div><button class="btn btn-outline btn-small" id="open-whatsapp-settings">Configurar conexão</button></section>
      <section class="presence-control-card"><div class="presence-profile"><span class="avatar">${initials(me.name)}</span><div><strong>${esc(me.name)}</strong><small>${esc(roleLabel(me.role))} · ${esc(me.sector||'Atendimento')}</small></div></div>
        <div class="presence-status-buttons">${statuses.map(([value,emoji,label])=>`<button class="presence-status-option status-${value} ${me.status===value?'active':''}" data-presence-status="${value}" type="button"><span>${emoji}</span><strong>${label}</strong></button>`).join('')}</div>
        <div id="pause-reason-field" class="field ${me.status==='paused'?'':'hidden'}"><label>Motivo da pausa</label><select id="presence-pause-reason" class="custom-select"><option value="">Selecione...</option>${reasons.map((r)=>`<option value="${esc(r.name)}" ${me.pause_reason===r.name?'selected':''}>${esc(r.name)}</option>`).join('')}</select></div>
        <div class="site-toggle-row"><div><strong>Receber novos atendimentos</strong><small>Participar da distribuição automática.</small></div><label class="switch"><input id="presence-receive-assignments" type="checkbox" ${me.receive_assignments?'checked':''}><span></span></label></div>
        <div class="presence-queues-head"><div><strong>Minhas filas</strong><small>Marque onde deseja receber atendimentos.</small></div><div><button class="btn btn-outline btn-small" id="join-all-queues">Entrar em todas</button><button class="btn btn-outline btn-small" id="leave-all-queues">Sair de todas</button></div></div>
        <div class="presence-queue-grid">${myQueues.map((q)=>`<label class="presence-queue-option ${q.joined?'active':''}"><input type="checkbox" data-presence-queue="${q.id}" ${q.joined?'checked':''}><i style="background:${esc(q.color)}"></i><span><strong>${esc(q.name)}</strong><small>${q.joined?'Conectado à fila':'Fora da fila'}</small></span></label>`).join('')}</div>
        <div class="presence-save-row"><button class="btn btn-primary" id="save-presence-board" type="button">Salvar disponibilidade</button></div>
      </section>
      <section class="presence-control-card"><div class="presence-queues-head"><div><strong>Equipe conectada</strong><small>Visão em tempo real de todos os atendentes.</small></div></div><div class="team-presence-grid">${board.users.map((u)=>`<article class="team-presence-card"><div class="team-presence-main"><span class="avatar">${initials(u.name)}</span><div><strong>${esc(u.name)}</strong><small>${esc(roleLabel(u.role))} · ${esc(presenceStatusLabel(u.status,u.pause_reason))}</small></div><i class="availability-dot ${u.status==='online'?'online':'offline'}"></i></div><div class="team-presence-details"><span>${Number(u.open_count||0)} atendimentos ativos</span><span>${u.receive_assignments?'Recebe distribuição':'Não recebe distribuição'}</span></div><div class="team-presence-queues">${(u.queues||[]).filter((q)=>q.joined).map((q)=>`<span><i style="background:${esc(q.color)}"></i>${esc(q.name)}</span>`).join('')||'<span>Nenhuma fila ativa</span>'}</div></article>`).join('')}</div></section>
    </div>`;
    let selectedStatus=me.status || 'online';
    $$('[data-presence-status]').forEach((button)=>button.addEventListener('click',()=>{selectedStatus=button.dataset.presenceStatus;$$('[data-presence-status]').forEach((b)=>b.classList.toggle('active',b===button));$('#pause-reason-field').classList.toggle('hidden',selectedStatus!=='paused');}));
    const setAllQueues=(checked)=>{$$('[data-presence-queue]').forEach((input)=>{input.checked=checked;input.closest('.presence-queue-option').classList.toggle('active',checked);});};
    $$('[data-presence-queue]').forEach((input)=>input.addEventListener('change',()=>input.closest('.presence-queue-option').classList.toggle('active',input.checked)));
    $('#join-all-queues').addEventListener('click',()=>setAllQueues(true));$('#leave-all-queues').addEventListener('click',()=>setAllQueues(false));
    $('#save-presence-board').addEventListener('click',async()=>{const button=$('#save-presence-board');button.disabled=true;try{const updated=await api('/presence',{method:'PUT',body:JSON.stringify({status:selectedStatus,pause_reason:selectedStatus==='paused'?$('#presence-pause-reason')?.value||'':'',receive_assignments:$('#presence-receive-assignments').checked})});state.user={...state.user,...updated};renderHeaderAvatar(state.user);const selected=$$('[data-presence-queue]:checked').map((x)=>Number(x.dataset.presenceQueue));await api('/my-queues',{method:'PUT',body:JSON.stringify({queue_ids:selected})});toast('Disponibilidade atualizada');await renderPresenceBoard();}catch(error){button.disabled=false;toast('Não foi possível salvar',error.message,'error');}});
    $('#refresh-presence-board').addEventListener('click',renderPresenceBoard);$('#open-whatsapp-settings').addEventListener('click',()=>{state.settingsSection='whatsapp';localStorage.setItem('gm_settings_section','whatsapp');navigate('settings');});enhanceSelects($('#page-content'));bindSmartTooltips($('#page-content'));
  }

  async function renderMonitoring() {
    const data=await api('/supervision');
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><h2>Supervisão em tempo real</h2><button class="icon-button" id="refresh-monitoring" data-tooltip="Atualizar">${icon('refresh',17)}</button></div>
      <div class="monitor-stats"><span><b>${data.totals.online}</b> online</span><span><b>${data.totals.paused}</b> pausados</span><span><b>${data.totals.active}</b> conversas</span><span><b>${data.totals.unread}</b> com novas mensagens</span></div>
      <div class="monitor-layout"><section class="monitor-agents">${data.users.map((u)=>`<article class="agent-monitor-card" data-agent-id="${u.id}"><span class="avatar">${initials(u.name)}</span><div><strong>${esc(u.name)}</strong><small>${esc(u.status)}${u.pause_reason?` · ${esc(u.pause_reason)}`:''}</small></div><div class="agent-load"><b>${u.open_count||0}</b><span>ativos</span></div><i class="availability-dot ${u.status==='online'?'online':'offline'}"></i></article>`).join('')}</section><section class="monitor-conversations">${data.conversations.map((c)=>`<button class="monitor-conversation" data-id="${c.id}" data-agent-id="${c.assigned_user_id||0}"><span class="avatar">${initials(c.contact_name)}</span><div><strong>${esc(c.contact_name)}</strong><p>${esc(c.last_message)}</p><small>${esc(c.assigned_user_name||'Sem responsável')} · ${timeAgo(c.last_message_at)}</small></div>${c.unread_count?`<b>${c.unread_count}</b>`:''}</button>`).join('')||emptySmall('Nenhuma conversa ativa')}</section></div>`;
    $('#refresh-monitoring').addEventListener('click',renderMonitoring);
    $$('.agent-monitor-card').forEach((card)=>card.addEventListener('click',()=>{$$('.agent-monitor-card').forEach((c)=>c.classList.toggle('active',c===card));$$('.monitor-conversation').forEach((row)=>row.classList.toggle('hidden',card.dataset.agentId!==row.dataset.agentId));}));
    $$('.monitor-conversation').forEach((btn)=>btn.addEventListener('click',()=>openSupervisionPreview(Number(btn.dataset.id))));
  }

  async function openSupervisionPreview(conversationId){
    const data=await api(`/conversations/${conversationId}`); const c=data.conversation; const messages=data.messages.slice(-30);
    openModal(`Acompanhando · ${c.contact_name}`,`<div class="supervision-preview-head"><span>${statusBadge(c.status)}</span><small>${esc(c.assigned_user_name||'Sem responsável')} · ${esc(c.queue_name)}</small></div><div class="supervision-preview-messages">${messages.map((m)=>`<div class="preview-message ${m.sender_type}"><strong>${esc(m.sender_type==='customer'?c.contact_name:m.sender_type==='ai'?'IA':m.user_name||'Sistema')}</strong><p>${esc(m.content)}</p><small>${dateTime(m.created_at)}</small></div>`).join('')}</div>`,`<button class="btn btn-outline close-modal-action">Fechar</button><button class="btn btn-primary" id="intervene-conversation">Intervir no atendimento</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#intervene-conversation').addEventListener('click',async()=>{closeModal();state.selectedConversationId=conversationId;await navigate('chats');});
  }

  async function renderInternalChat() {
    const [channels,users]=await Promise.all([api('/internal/channels'),api('/internal/users')]);
    if(!state.internalChannelId) state.internalChannelId=channels[0]?.id||null;
    const directUser=users.find((u)=>Number(u.id)===Number(state.internalTargetUserId));
    const activeChannel=channels.find((c)=>Number(c.id)===Number(state.internalChannelId));
    const isDirect=state.internalMode==='direct'&&directUser;
    const messages=isDirect?await api(`/internal/direct/${directUser.id}/messages`):(state.internalChannelId?await api(`/internal/channels/${state.internalChannelId}/messages`):[]);
    const targetName=isDirect?directUser.name:(activeChannel?.name||'Equipe');
    const targetSubtitle=isDirect?`${roleLabel(directUser.role)} · ${esc(presenceStatusLabel(directUser.status,directUser.pause_reason))}`:(activeChannel?.description||'Canal da equipe');
    $('#page-content').innerHTML=`<div class="internal-layout whatsapp-internal">
      <aside class="internal-contacts">
        <div class="internal-sidebar-head"><div><strong>Chat interno</strong><small>Equipe e atendentes</small></div><button class="icon-button" id="refresh-internal" data-tooltip="Atualizar">${icon('refresh',15)}</button></div>
        <div class="internal-search">${icon('search',14)}<input id="internal-search-input" placeholder="Buscar atendente"></div>
        <div class="internal-contact-list" id="internal-contact-list">
          ${channels.map((c)=>`<button class="internal-contact ${!isDirect&&Number(c.id)===Number(state.internalChannelId)?'active':''}" data-channel-id="${c.id}"><span class="internal-avatar group">#</span><span><strong>${esc(c.name)}</strong><small>${esc(c.description||'Canal da equipe')}</small></span></button>`).join('')}
          <div class="internal-list-label">ATENDENTES</div>
          ${users.map((u)=>`<button class="internal-contact ${isDirect&&Number(u.id)===Number(state.internalTargetUserId)?'active':''}" data-internal-user-id="${u.id}" data-search-name="${esc(u.name.toLowerCase())}"><span class="internal-avatar">${initials(u.name)}<i class="availability-dot ${u.status==='online'?'online':'offline'}"></i></span><span><strong>${esc(u.name)}</strong><small>${esc(roleLabel(u.role))} · ${esc(presenceStatusLabel(u.status,u.pause_reason))}</small></span></button>`).join('')}
        </div>
      </aside>
      <section class="internal-chat">
        <header class="internal-chat-header"><span class="internal-avatar ${isDirect?'':'group'}">${isDirect?initials(directUser.name):'#'}</span><div><strong>${esc(targetName)}</strong><small>${esc(targetSubtitle)}</small></div></header>
        <div class="internal-message-list" id="internal-message-list">${messages.length?messages.map((m)=>`<div class="internal-chat-message ${Number(m.user_id)===Number(state.user.id)?'mine':'theirs'}"><div class="internal-bubble"><strong>${Number(m.user_id)===Number(state.user.id)?'Você':esc(m.user_name)}</strong><p>${esc(m.content)}</p><small>${dateTime(m.created_at)}</small></div></div>`).join(''):`<div class="internal-empty">${icon('internal',34)}<strong>Nenhuma mensagem ainda</strong><span>Envie a primeira mensagem para ${esc(targetName)}.</span></div>`}</div>
        <div class="internal-composer whatsapp-composer"><div class="composer-action-wrap"><button id="internal-emoji-button" class="composer-icon" data-tooltip="Emojis">${icon('smile',18)}</button><div id="internal-emoji-picker" class="composer-popover emoji-picker hidden">${['😀','😂','😍','👍','🙏','🎉','❤️','✅'].map((e)=>`<button type="button" data-internal-emoji="${e}">${e}</button>`).join('')}</div></div><textarea id="internal-chat-input" rows="1" placeholder="Mensagem para ${esc(targetName)}..."></textarea><button id="send-internal-chat" class="send-button" data-tooltip="Enviar">${icon('send')}</button></div>
      </section>
    </div>`;
    $('#refresh-internal')?.addEventListener('click',renderInternalChat);
    $$('[data-channel-id]').forEach((btn)=>btn.addEventListener('click',async()=>{state.internalMode='channel';state.internalChannelId=Number(btn.dataset.channelId);state.internalTargetUserId=null;await renderInternalChat();}));
    $$('[data-internal-user-id]').forEach((btn)=>btn.addEventListener('click',async()=>{state.internalMode='direct';state.internalTargetUserId=Number(btn.dataset.internalUserId);await renderInternalChat();}));
    $('#internal-search-input')?.addEventListener('input',(event)=>{const term=event.target.value.trim().toLowerCase();$$('[data-internal-user-id]').forEach((btn)=>btn.classList.toggle('hidden',!btn.dataset.searchName.includes(term)));});
    const input=$('#internal-chat-input');
    const send=async()=>{const content=input?.value.trim();if(!content)return;const path=isDirect?`/internal/direct/${directUser.id}/messages`:`/internal/channels/${state.internalChannelId}/messages`;const button=$('#send-internal-chat');button.disabled=true;try{await api(path,{method:'POST',body:JSON.stringify({content})});input.value='';await renderInternalChat();}catch(error){toast('Não foi possível enviar',error.message,'error');button.disabled=false;input.focus();}};
    $('#send-internal-chat')?.addEventListener('click',send);
    input?.addEventListener('keydown',(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}});
    $('#internal-emoji-button')?.addEventListener('click',(event)=>{event.stopPropagation();$('#internal-emoji-picker').classList.toggle('hidden');});
    $$('[data-internal-emoji]').forEach((btn)=>btn.addEventListener('click',()=>{insertAtCursor(input,btn.dataset.internalEmoji);$('#internal-emoji-picker').classList.add('hidden');}));
    const list=$('#internal-message-list');if(list)requestAnimationFrame(()=>{list.scrollTop=list.scrollHeight;});
    bindSmartTooltips($('#page-content'));
  }

  async function renderCrm() {
    const [funnels,opportunities,contacts]=await Promise.all([api('/crm/funnels'),api('/crm/opportunities'),api('/contacts')]); const funnel=funnels[0];
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><h2>CRM</h2><button class="icon-button primary-icon" id="new-opportunity" data-tooltip="Nova oportunidade">${icon('plus',17)}</button></div><div class="kanban-board">${(funnel?.stages||[]).map((stage)=>`<section class="kanban-column"><header><span class="queue-color" style="background:${esc(stage.color)}"></span><strong>${esc(stage.name)}</strong><b>${opportunities.filter((o)=>o.stage_id===stage.id).length}</b></header><div>${opportunities.filter((o)=>o.stage_id===stage.id).map((o)=>`<article class="opportunity-card" data-opportunity-id="${o.id}"><strong>${esc(o.title)}</strong><p>${esc(o.contact_name||'Sem contato')}</p><div><span>${money(o.value)}</span><small>${esc(o.assigned_user_name||'Sem responsável')}</small></div></article>`).join('')}</div></section>`).join('')}</div>`;
    $('#new-opportunity').addEventListener('click',()=>openOpportunityModal(funnel,contacts));
    $$('.opportunity-card').forEach((card)=>card.addEventListener('click',()=>{const item=opportunities.find((o)=>o.id===Number(card.dataset.opportunityId));openOpportunityModal(funnel,contacts,item);}));
  }

  function openOpportunityModal(funnel,contacts,item=null){
    openModal(item?'Editar oportunidade':'Nova oportunidade',`<form id="opportunity-form" class="form-grid"><div class="field full"><label>Título</label><input name="title" value="${esc(item?.title||'')}"></div><div class="field"><label>Contato</label><select name="contact_id" class="custom-select"><option value="">Sem contato</option>${contacts.map((c)=>`<option value="${c.id}" ${item?.contact_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Etapa</label><select name="stage_id" class="custom-select">${funnel.stages.map((s)=>`<option value="${s.id}" ${item?.stage_id===s.id?'selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label>Valor</label><input type="number" step="0.01" name="value" value="${item?.value||0}"></div><div class="field"><label>Status</label><select name="status" class="custom-select"><option value="open">Aberta</option><option value="won" ${item?.status==='won'?'selected':''}>Ganha</option><option value="lost" ${item?.status==='lost'?'selected':''}>Perdida</option></select></div><div class="field full"><label>Notas</label><textarea name="notes">${esc(item?.notes||'')}</textarea></div><input type="hidden" name="funnel_id" value="${funnel.id}"></form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-opportunity">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-opportunity').addEventListener('click',async()=>{const payload=Object.fromEntries(new FormData($('#opportunity-form')).entries());await api(item?`/crm/opportunities/${item.id}`:'/crm/opportunities',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Oportunidade salva');await renderCrm();});
  }

  async function renderTickets() {
    const [rows,contacts,queues,options]=await Promise.all([api('/tickets'),api('/contacts'),api('/queues'),api('/transfer-options')]);
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><h2>Tickets</h2><button class="icon-button primary-icon" id="new-ticket" data-tooltip="Novo ticket">${icon('plus',17)}</button></div><div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Protocolo</th><th>Título</th><th>Cliente</th><th>Responsável</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((t)=>`<tr><td><strong>${esc(t.protocol)}</strong></td><td>${esc(t.title)}</td><td>${esc(t.contact_name||'—')}</td><td>${esc(t.assigned_user_name||'—')}</td><td>${esc(t.priority)}</td><td>${statusBadge(t.status)}</td><td><button class="icon-button edit-ticket" data-id="${t.id}" data-tooltip="Editar">${icon('edit',15)}</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#new-ticket').addEventListener('click',()=>openTicketModal(contacts,queues,options.users));$$('.edit-ticket').forEach((btn)=>btn.addEventListener('click',()=>openTicketModal(contacts,queues,options.users,rows.find((t)=>t.id===Number(btn.dataset.id)))));
  }

  function openTicketModal(contacts,queues,users,item=null){
    openModal(item?'Editar ticket':'Novo ticket',`<form id="ticket-form" class="form-grid"><div class="field full"><label>Título</label><input name="title" value="${esc(item?.title||'')}"></div><div class="field"><label>Cliente</label><select name="contact_id" class="custom-select"><option value="">Sem cliente</option>${contacts.map((c)=>`<option value="${c.id}" ${item?.contact_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Responsável</label><select name="assigned_user_id" class="custom-select">${users.map((u)=>`<option value="${u.id}" ${item?.assigned_user_id===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div><div class="field"><label>Fila</label><select name="queue_id" class="custom-select">${queues.map((q)=>`<option value="${q.id}" ${item?.queue_id===q.id?'selected':''}>${esc(q.name)}</option>`).join('')}</select></div><div class="field"><label>Prioridade</label><select name="priority" class="custom-select"><option>normal</option><option ${item?.priority==='high'?'selected':''}>high</option><option ${item?.priority==='urgent'?'selected':''}>urgent</option></select></div><div class="field"><label>Status</label><select name="status" class="custom-select"><option value="open">Aberto</option><option value="waiting_customer" ${item?.status==='waiting_customer'?'selected':''}>Aguardando cliente</option><option value="resolved" ${item?.status==='resolved'?'selected':''}>Resolvido</option></select></div><div class="field full"><label>Descrição</label><textarea name="description">${esc(item?.description||'')}</textarea></div></form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-ticket">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-ticket').addEventListener('click',async()=>{const payload=Object.fromEntries(new FormData($('#ticket-form')).entries());await api(item?`/tickets/${item.id}`:'/tickets',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Ticket salvo');await renderTickets();});
  }

  async function renderTasks() {
    const [rows,options,contacts]=await Promise.all([api('/tasks'),api('/transfer-options'),api('/contacts')]);
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><h2>Tarefas</h2><button class="icon-button primary-icon" id="new-task" data-tooltip="Nova tarefa">${icon('plus',17)}</button></div><div class="task-board">${['pending','in_progress','completed'].map((status)=>`<section><header><strong>${status==='pending'?'Pendentes':status==='in_progress'?'Em andamento':'Concluídas'}</strong><b>${rows.filter((t)=>t.status===status).length}</b></header>${rows.filter((t)=>t.status===status).map((t)=>`<article class="task-card" data-task-id="${t.id}"><strong>${esc(t.title)}</strong><p>${esc(t.description||'')}</p><small>${esc(t.assigned_user_name||'Sem responsável')}${t.due_at?` · ${dateTime(t.due_at)}`:''}</small></article>`).join('')}</section>`).join('')}</div>`;
    $('#new-task').addEventListener('click',()=>openTaskModal(options.users,contacts));$$('.task-card').forEach((card)=>card.addEventListener('click',()=>openTaskModal(options.users,contacts,rows.find((t)=>t.id===Number(card.dataset.taskId)))));
  }

  function openTaskModal(users,contacts,item=null){
    openModal(item?'Editar tarefa':'Nova tarefa',`<form id="task-form" class="form-grid"><div class="field full"><label>Título</label><input name="title" value="${esc(item?.title||'')}"></div><div class="field"><label>Responsável</label><select name="assigned_user_id" class="custom-select">${users.map((u)=>`<option value="${u.id}" ${item?.assigned_user_id===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div><div class="field"><label>Cliente</label><select name="contact_id" class="custom-select"><option value="">Sem cliente</option>${contacts.map((c)=>`<option value="${c.id}" ${item?.contact_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="status" class="custom-select"><option value="pending">Pendente</option><option value="in_progress" ${item?.status==='in_progress'?'selected':''}>Em andamento</option><option value="completed" ${item?.status==='completed'?'selected':''}>Concluída</option></select></div><div class="field"><label>Prazo</label><input name="due_at" type="datetime-local" value="${item?.due_at?esc(item.due_at.slice(0,16)):''}"></div><div class="field full"><label>Descrição</label><textarea name="description">${esc(item?.description||'')}</textarea></div></form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-task">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-task').addEventListener('click',async()=>{const payload=Object.fromEntries(new FormData($('#task-form')).entries());await api(item?`/tasks/${item.id}`:'/tasks',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Tarefa salva');await renderTasks();});
  }

  async function renderStructure() {
    const [queues, users, memberships, pauseReasons] = await Promise.all([
      api('/queues?all=1'), api('/users'), api('/queue-memberships'), api('/pause-reasons?all=1'),
    ]);
    const byUser = new Map();
    memberships.filter((m)=>m.active).forEach((m)=>{ if(!byUser.has(m.user_id)) byUser.set(m.user_id,[]); byUser.get(m.user_id).push(m.queue_id); });
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><div><h2>Filas e pausas</h2><small>Controle quem recebe cada tipo de atendimento.</small></div><div class="toolbar-icons"><button class="icon-button primary-icon" id="new-queue" data-tooltip="Nova fila">${icon('plus',17)}</button><button class="icon-button" id="new-pause-reason" data-tooltip="Novo motivo de pausa">${icon('clock',17)}</button><button class="icon-button" data-back-settings data-tooltip="Voltar">${icon('back',17)}</button></div></div>
      <div class="dashboard-grid"><section class="card"><div class="card-head"><h3>Filas</h3></div><div class="card-body settings-list">${queues.map((q)=>`<div class="settings-list-row ${q.active?'':'is-inactive'}"><div><strong><i class="queue-dot" style="background:${esc(q.color)}"></i>${esc(q.name)}</strong><small>${q.member_count||0} membros</small></div><button class="icon-button edit-queue" data-id="${q.id}" data-tooltip="Editar">${icon('edit',15)}</button></div>`).join('')}</div></section>
      <section class="card"><div class="card-head"><h3>Motivos de pausa</h3></div><div class="card-body settings-list">${pauseReasons.map((r)=>`<div class="settings-list-row ${r.active?'':'is-inactive'}"><div><strong>${esc(r.name)}</strong><small>${r.active?'Disponível':'Desativado'}</small></div><button class="icon-button edit-pause" data-id="${r.id}" data-tooltip="Editar">${icon('edit',15)}</button></div>`).join('')}</div></section></div>
      <section class="card structure-members"><div class="card-head"><div><h3>Atendentes por fila</h3><small>Sem filas marcadas, o atendente não recebe novas conversas.</small></div></div><div class="card-body"><div class="table-scroll"><table class="data-table"><thead><tr><th>Usuário</th>${queues.filter((q)=>q.active).map((q)=>`<th>${esc(q.name)}</th>`).join('')}<th></th></tr></thead><tbody>${users.filter((u)=>u.role!=='kitchen').map((u)=>`<tr data-user-id="${u.id}"><td><strong>${esc(u.name)}</strong><small>${roleLabel(u.role)}</small></td>${queues.filter((q)=>q.active).map((q)=>`<td><label class="check-cell"><input type="checkbox" value="${q.id}" ${byUser.get(u.id)?.includes(q.id)?'checked':''}><span></span></label></td>`).join('')}<td><button class="icon-button save-user-queues" data-id="${u.id}" data-tooltip="Salvar filas">${icon('check',15)}</button></td></tr>`).join('')}</tbody></table></div></div></section>`;
    $('[data-back-settings]').addEventListener('click',()=>navigate('settings'));
    $('#new-queue').addEventListener('click',()=>openQueueModal());
    $$('.edit-queue').forEach((b)=>b.addEventListener('click',()=>openQueueModal(queues.find((q)=>q.id===Number(b.dataset.id)))));
    $('#new-pause-reason').addEventListener('click',()=>openPauseReasonModal());
    $$('.edit-pause').forEach((b)=>b.addEventListener('click',()=>openPauseReasonModal(pauseReasons.find((r)=>r.id===Number(b.dataset.id)))));
    $$('.save-user-queues').forEach((b)=>b.addEventListener('click',async()=>{const row=b.closest('tr');const queue_ids=$$('input[type=checkbox]:checked',row).map((input)=>Number(input.value));await api(`/users/${b.dataset.id}/queues`,{method:'PUT',body:JSON.stringify({queue_ids})});toast('Filas atualizadas');}));
  }

  function openQueueModal(item=null){
    openModal(item?'Editar fila':'Nova fila',`<form id="queue-form" class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(item?.name||'')}" required></div><div class="field"><label>Cor</label><input type="color" name="color" value="${esc(item?.color||'#1458EA')}"></div>${item?`<div class="field full switch-row"><div><strong>Fila ativa</strong></div><label class="switch"><input name="active" type="checkbox" ${item.active?'checked':''}><span></span></label></div>`:''}</form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-queue">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-queue').addEventListener('click',async()=>{const form=$('#queue-form');const payload=Object.fromEntries(new FormData(form).entries());if(item)payload.active=form.querySelector('[name=active]').checked;await api(item?`/queues/${item.id}`:'/queues',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Fila salva');await renderStructure();});
  }

  function openPauseReasonModal(item=null){
    openModal(item?'Editar motivo de pausa':'Novo motivo de pausa',`<form id="pause-form" class="form-grid"><div class="field full"><label>Motivo</label><input name="name" value="${esc(item?.name||'')}" required></div>${item?`<div class="field full switch-row"><div><strong>Motivo ativo</strong></div><label class="switch"><input name="active" type="checkbox" ${item.active?'checked':''}><span></span></label></div>`:''}</form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-pause">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-pause').addEventListener('click',async()=>{const form=$('#pause-form');const payload=Object.fromEntries(new FormData(form).entries());if(item)payload.active=form.querySelector('[name=active]').checked;await api(item?`/pause-reasons/${item.id}`:'/pause-reasons',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Motivo salvo');await renderStructure();});
  }

  async function renderCampaigns(){
    const [rows,templates]=await Promise.all([api('/campaigns'),api('/templates')]);
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><div><h2>Campanhas</h2><small>Planeje comunicações. O disparo em massa permanece desativado até uma integração oficial ser configurada.</small></div><div class="toolbar-icons"><button class="icon-button primary-icon" id="new-campaign" data-tooltip="Nova campanha">${icon('plus',17)}</button><button class="icon-button" data-back-settings data-tooltip="Voltar">${icon('back',17)}</button></div></div><div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Campanha</th><th>Template</th><th>Status</th><th>Agendamento</th><th></th></tr></thead><tbody>${rows.map((c)=>`<tr><td><strong>${esc(c.name)}</strong><small>${esc(c.description||'')}</small></td><td>${esc(c.template_name||'—')}</td><td>${statusBadge(c.status)}</td><td>${c.scheduled_at?dateTime(c.scheduled_at):'—'}</td><td><button class="icon-button edit-campaign" data-id="${c.id}" data-tooltip="Editar">${icon('edit',15)}</button></td></tr>`).join('')||`<tr><td colspan="5">${emptySmall('Nenhuma campanha criada')}</td></tr>`}</tbody></table></div></div>`;
    $('[data-back-settings]').addEventListener('click',()=>navigate('settings'));$('#new-campaign').addEventListener('click',()=>openCampaignModal(templates));$$('.edit-campaign').forEach((b)=>b.addEventListener('click',()=>openCampaignModal(templates,rows.find((r)=>r.id===Number(b.dataset.id)))));
  }

  function openCampaignModal(templates,item=null){
    openModal(item?'Editar campanha':'Nova campanha',`<form id="campaign-form" class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(item?.name||'')}" required></div><div class="field"><label>Template</label><select name="template_id" class="custom-select"><option value="">Selecione</option>${templates.map((t)=>`<option value="${t.id}" ${item?.template_id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div><div class="field"><label>Status</label><select name="status" class="custom-select"><option value="draft">Rascunho</option><option value="scheduled" ${item?.status==='scheduled'?'selected':''}>Agendada</option><option value="paused" ${item?.status==='paused'?'selected':''}>Pausada</option><option value="completed" ${item?.status==='completed'?'selected':''}>Concluída</option></select></div><div class="field"><label>Agendamento</label><input name="scheduled_at" type="datetime-local" value="${item?.scheduled_at?esc(item.scheduled_at.slice(0,16)):''}"></div><div class="field full"><label>Descrição</label><textarea name="description">${esc(item?.description||'')}</textarea></div></form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-campaign">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-campaign').addEventListener('click',async()=>{const payload=Object.fromEntries(new FormData($('#campaign-form')).entries());await api(item?`/campaigns/${item.id}`:'/campaigns',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Campanha salva');await renderCampaigns();});
  }

  async function renderAutomations(){
    const [rows,queues]=await Promise.all([api('/automations'),api('/queues')]);
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><div><h2>Automações</h2><small>Regras simples por palavras-chave para responder ou encaminhar.</small></div><div class="toolbar-icons"><button class="icon-button primary-icon" id="new-automation" data-tooltip="Nova automação">${icon('plus',17)}</button><button class="icon-button" data-back-settings data-tooltip="Voltar">${icon('back',17)}</button></div></div><div class="settings-list automation-list">${rows.map((a)=>`<div class="settings-list-row ${a.active?'':'is-inactive'}"><div><strong>${esc(a.name)}</strong><small>Quando contém “${esc(a.trigger_value)}” → ${esc(a.action_type)}${a.queue_name?` · ${esc(a.queue_name)}`:''}</small></div><div class="row-actions"><span class="status-badge ${a.active?'status-open':'status-closed'}">${a.active?'Ativa':'Inativa'}</span><button class="icon-button edit-automation" data-id="${a.id}" data-tooltip="Editar">${icon('edit',15)}</button></div></div>`).join('')||emptySmall('Nenhuma automação cadastrada')}</div>`;
    $('[data-back-settings]').addEventListener('click',()=>navigate('settings'));$('#new-automation').addEventListener('click',()=>openAutomationModal(queues));$$('.edit-automation').forEach((b)=>b.addEventListener('click',()=>openAutomationModal(queues,rows.find((r)=>r.id===Number(b.dataset.id)))));
  }

  function openAutomationModal(queues,item=null){
    const payload=item?.action_payload||{};
    openModal(item?'Editar automação':'Nova automação',`<form id="automation-form" class="form-grid"><div class="field"><label>Nome</label><input name="name" value="${esc(item?.name||'')}" required></div><div class="field"><label>Palavras-chave</label><input name="trigger_value" value="${esc(item?.trigger_value||'')}" placeholder="cardápio, menu, preço"></div><div class="field"><label>Ação</label><select name="action_type" class="custom-select"><option value="reply">Responder texto</option><option value="human" ${item?.action_type==='human'?'selected':''}>Encaminhar para humano</option><option value="queue" ${item?.action_type==='queue'?'selected':''}>Encaminhar para fila</option></select></div><div class="field"><label>Fila</label><select name="queue_id" class="custom-select"><option value="">Nenhuma</option>${queues.map((q)=>`<option value="${q.id}" ${item?.queue_id===q.id?'selected':''}>${esc(q.name)}</option>`).join('')}</select></div><div class="field full"><label>Mensagem enviada</label><textarea name="text">${esc(payload.text||'')}</textarea></div>${item?`<div class="field full switch-row"><div><strong>Automação ativa</strong></div><label class="switch"><input name="active" type="checkbox" ${item.active?'checked':''}><span></span></label></div>`:''}</form>`,`<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="save-automation">Salvar</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);$('#save-automation').addEventListener('click',async()=>{const form=$('#automation-form');const raw=Object.fromEntries(new FormData(form).entries());const payload={name:raw.name,trigger_type:'keyword',trigger_value:raw.trigger_value,action_type:raw.action_type,queue_id:raw.queue_id,action_payload:{text:raw.text}};if(item)payload.active=form.querySelector('[name=active]').checked;await api(item?`/automations/${item.id}`:'/automations',{method:item?'PUT':'POST',body:JSON.stringify(payload)});closeModal();toast('Automação salva');await renderAutomations();});
  }

  async function renderAudit(){
    const filters=state.auditFilters||={userId:'',action:'',entity:'',from:'',to:''};
    const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));
    const data=await api(`/audit?${query.toString()}`); const rows=data.rows||[];
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><div><h2>Auditoria</h2><small>${rows.length} ações encontradas.</small></div><div class="toolbar-icons"><button class="icon-button" id="refresh-audit" data-tooltip="Atualizar">${icon('refresh',17)}</button><button class="icon-button" data-back-settings data-tooltip="Voltar">${icon('back',17)}</button></div></div>
      <div class="audit-filters"><select id="audit-user"><option value="">Todos os usuários</option>${data.users.map((u)=>`<option value="${u.id}" ${String(filters.userId)===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select><select id="audit-action"><option value="">Todas as ações</option>${data.actions.map((value)=>`<option value="${esc(value)}" ${filters.action===value?'selected':''}>${esc(value)}</option>`).join('')}</select><select id="audit-entity"><option value="">Todas as áreas</option>${data.entities.map((value)=>`<option value="${esc(value)}" ${filters.entity===value?'selected':''}>${esc(value)}</option>`).join('')}</select><input id="audit-from" type="date" value="${esc(filters.from)}"><input id="audit-to" type="date" value="${esc(filters.to)}"><button class="btn btn-soft" id="clear-audit-filters">Limpar</button></div>
      <div class="table-card"><div class="table-scroll"><table class="data-table"><thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Área</th><th>Detalhes</th></tr></thead><tbody>${rows.map((r)=>`<tr><td>${dateTime(r.created_at)}</td><td>${esc(r.user_name||'Sistema')}</td><td><strong>${esc(r.action)}</strong></td><td>${esc(r.entity)} ${r.entity_id||''}</td><td><code class="audit-details">${esc(JSON.stringify(r.details||{}))}</code></td></tr>`).join('')||`<tr><td colspan="5">${emptySmall('Nenhuma ação encontrada')}</td></tr>`}</tbody></table></div></div>`;
    $('[data-back-settings]').addEventListener('click',()=>navigate('settings'));
    $('#refresh-audit').addEventListener('click',renderAudit);
    const apply=async()=>{filters.userId=$('#audit-user').value;filters.action=$('#audit-action').value;filters.entity=$('#audit-entity').value;filters.from=$('#audit-from').value;filters.to=$('#audit-to').value;await renderAudit();};
    ['audit-user','audit-action','audit-entity','audit-from','audit-to'].forEach((id)=>$(`#${id}`).addEventListener('change',apply));
    $('#clear-audit-filters').addEventListener('click',async()=>{state.auditFilters={userId:'',action:'',entity:'',from:'',to:''};await renderAudit();});
  }

  async function renderSecurity(){
    const [overview,sessions,backupData]=await Promise.all([api('/security/overview'),api('/security/sessions'),api('/security/backups')]);
    const size=(bytes)=>`${(Number(bytes||0)/1024/1024).toFixed(2)} MB`;
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><div><h2>Segurança e backups</h2><small>Proteção de credenciais, dispositivos conectados e cópias do banco.</small></div><button class="icon-button" data-back-settings data-tooltip="Voltar">${icon('back',17)}</button></div>
      <div class="security-status-grid"><div class="security-status ${overview.jwtSecretConfigured?'ok':'warning'}"><strong>Chave de sessão</strong><span>${overview.jwtSecretConfigured?'Configurada':'Troque a chave padrão no .env'}</span></div><div class="security-status ${overview.encryptionKeyConfigured?'ok':'warning'}"><strong>Criptografia</strong><span>${overview.encryptionKeyConfigured?'Ativa':'Configure APP_ENCRYPTION_KEY'}</span></div><div class="security-status ${overview.webhookSecretProtected?'ok':'warning'}"><strong>Webhook</strong><span>${overview.webhookSecretProtected?'Protegido com segredo e antirrepetição':'Salve novamente a conexão'}</span></div></div>
      <section class="card security-card"><div class="card-head"><div><h3>Sessões e dispositivos</h3><small>Uma conta não permanece conectada em dois lugares ao mesmo tempo.</small></div><button class="btn btn-soft" id="revoke-other-sessions">Encerrar outras sessões</button></div><div class="card-body session-list">${sessions.map((item)=>`<div class="session-row ${item.current?'current':''}"><div><strong>${esc(item.device_name||'Dispositivo')}</strong><small>${esc(item.ip_address||'IP não identificado')} · acesso ${dateTime(item.created_at)} · visto ${timeAgo(item.last_seen_at)}</small></div><div>${item.current?'<span class="status-badge status-open">Esta sessão</span>':item.active?`<button class="btn btn-danger btn-small revoke-session" data-id="${item.id}">Desconectar</button>`:`<span class="muted">Encerrada</span>`}</div></div>`).join('')}</div></section>
      <section class="card security-card"><div class="card-head"><div><h3>Backups automáticos</h3><small>Os arquivos são salvos na pasta backups e testados sem alterar o banco atual.</small></div><button class="btn btn-primary" id="create-backup">Criar backup agora</button></div><div class="card-body"><form id="security-settings-form" class="security-settings-form"><label><span>Backup automático diário</span><input type="checkbox" name="automatic_backups_enabled" ${overview.automaticBackupsEnabled?'checked':''}></label><label><span>Guardar por quantos dias</span><input type="number" name="backup_retention_days" min="3" max="90" value="${overview.backupRetentionDays}"></label><label><span>Alertas de espera (minutos)</span><input name="waiting_alert_minutes" value="${esc(overview.waitingAlertMinutes)}" placeholder="2,5,10"></label><button class="btn btn-primary" type="submit">Salvar segurança</button></form><div class="backup-list">${backupData.backups.map((item)=>`<div class="backup-row"><div><strong>${esc(item.name)}</strong><small>${size(item.size)} · ${dateTime(item.modified_at)}</small></div><button class="btn btn-soft btn-small test-backup" data-name="${esc(item.name)}">Testar integridade</button></div>`).join('')||'<p class="muted">Nenhum backup criado ainda.</p>'}</div></div></section>`;
    $('[data-back-settings]').addEventListener('click',()=>navigate('settings'));
    $('#revoke-other-sessions').addEventListener('click',async()=>{await api('/security/sessions/revoke-others',{method:'POST'});toast('Outras sessões encerradas');await renderSecurity();});
    $$('.revoke-session').forEach((button)=>button.addEventListener('click',async()=>{await api(`/security/sessions/${button.dataset.id}/revoke`,{method:'POST'});toast('Sessão encerrada');await renderSecurity();}));
    $('#create-backup').addEventListener('click',async()=>{const button=$('#create-backup');button.disabled=true;try{await api('/security/backups',{method:'POST'});toast('Backup criado');await renderSecurity();}catch(error){button.disabled=false;toast('Falha no backup',error.message,'error');}});
    $$('.test-backup').forEach((button)=>button.addEventListener('click',async()=>{button.disabled=true;try{await api(`/security/backups/${encodeURIComponent(button.dataset.name)}/test`,{method:'POST'});toast('Backup íntegro','O arquivo passou no teste e possui todas as tabelas principais.');}catch(error){toast('Backup inválido',error.message,'error');}finally{button.disabled=false;}}));
    $('#security-settings-form').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;await api('/settings',{method:'PUT',body:JSON.stringify({automatic_backups_enabled:form.automatic_backups_enabled.checked,backup_retention_days:form.backup_retention_days.value,waiting_alert_minutes:form.waiting_alert_minutes.value})});toast('Configurações de segurança salvas');await renderSecurity();});
  }


  function resolvePeriodDates(filters){
    const today=new Date().toISOString().slice(0,10);
    const ago=(days)=>new Date(Date.now()-days*86400000).toISOString().slice(0,10);
    if(filters.period==='today'||filters.period==='realtime')return{from:today,to:today};
    if(filters.period==='yesterday'){const date=ago(1);return{from:date,to:date};}
    if(filters.period==='30days')return{from:ago(29),to:today};
    if(filters.period==='custom')return{from:filters.from||today,to:filters.to||today};
    return{from:ago(6),to:today};
  }

  function fiscalDocumentLabel(value) {
    return ({ nfce:'NFC-e (modelo 65)', nfe:'NF-e (modelo 55)', unconfigured:'A definir com o contador' })[value] || 'A definir com o contador';
  }

  function fiscalPreviewStatus(status) {
    if (status === 'preview_ready') return '<span class="status-badge status-open">Prévia pronta</span>';
    if (status === 'needs_review') return '<span class="status-badge status-waiting">Revisar dados</span>';
    return '<span class="status-badge status-closed">Sem prévia</span>';
  }

  function openFiscalPreviewDetails(document) {
    const payload=document?.payload||{};
    const sale=payload.sale||{};
    const missing=document?.missing_fields||[];
    openModal(`Prévia fiscal do pedido #${String(document.order_id).padStart(4,'0')}`, `<div class="fiscal-preview-detail">
      <div class="fiscal-preparation-warning"><span>🧾</span><div><strong>Documento sem valor fiscal</strong><p>Esta prévia não foi transmitida à SEFAZ e não possui chave de acesso.</p></div></div>
      <div class="detail-grid"><div class="detail-card"><span>Tipo sugerido</span><strong>${esc(fiscalDocumentLabel(document.document_type))}</strong></div><div class="detail-card"><span>Status</span><strong>${document.status==='preview_ready'?'Pronta para validação do contador':'Dados pendentes'}</strong></div><div class="detail-card"><span>Cliente</span><strong>${esc(document.contact_name||payload.customer?.name||'')}</strong></div><div class="detail-card"><span>Total</span><strong>${money(document.total||sale.total||0)}</strong></div></div>
      ${missing.length?`<div class="fiscal-missing-list"><strong>O que ainda falta</strong>${missing.map((item)=>`<span>• ${esc(item)}</span>`).join('')}</div>`:'<div class="fiscal-ready-box">✓ Os campos mínimos estão preenchidos. O contador ainda precisa validar a tributação antes de qualquer integração real.</div>'}
      <div class="fiscal-preview-items"><strong>Itens da prévia</strong>${(payload.items||[]).map((item)=>`<div><span>${item.quantity}x ${esc(item.name)}<small>NCM ${esc(item.ncm||'—')} · CFOP ${esc(item.cfop||'—')} · CST/CSOSN ${esc(item.cstCsosn||'—')}</small></span><strong>${money(item.total)}</strong></div>`).join('')||'<p class="muted">Nenhum item encontrado.</p>'}</div>
    </div>`, `<button class="btn btn-outline close-modal-action">Fechar</button><button class="btn btn-danger" id="delete-fiscal-preview">Excluir prévia</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    $('#delete-fiscal-preview').addEventListener('click',async()=>{if(!await confirmAction('Excluir prévia fiscal','Isso remove apenas a preparação interna. Nenhuma nota real foi emitida.','Excluir',true))return;await api(`/fiscal/documents/${document.id}`,{method:'DELETE'});closeModal();toast('Prévia excluída');await renderFiscal();});
  }

  function openFiscalPreviewModal(order) {
    const defaultType=order.fiscal_document_type||'unconfigured';
    openModal(`Preparar pedido #${String(order.id).padStart(4,'0')}`, `<form id="fiscal-preview-form" class="form-grid"><div class="field full fiscal-preparation-warning"><span>🧾</span><div><strong>Somente preparação</strong><p>O sistema criará uma prévia interna, sem transmissão à SEFAZ e sem valor fiscal.</p></div></div><div class="field"><label>Documento sugerido</label><select class="custom-select" name="documentType"><option value="unconfigured" ${defaultType==='unconfigured'?'selected':''}>A definir com o contador</option><option value="nfce" ${defaultType==='nfce'?'selected':''}>NFC-e (modelo 65)</option><option value="nfe" ${defaultType==='nfe'?'selected':''}>NF-e (modelo 55)</option></select></div><div class="field"><label>CPF/CNPJ do cliente <small>(opcional)</small></label><input name="customerDocument" inputmode="numeric" placeholder="Somente números"></div><div class="field full module-info-box"><strong>${esc(order.contact_name)}</strong><small>${orderFulfillmentLabel(order)} · ${money(order.total)} · ${dateTime(order.created_at)}</small></div></form>`, `<button class="btn btn-outline close-modal-action">Cancelar</button><button class="btn btn-primary" id="generate-fiscal-preview">Gerar prévia</button>`);
    $('.close-modal-action').addEventListener('click',closeModal);
    enhanceSelects($('#modal-root'));
    $('#generate-fiscal-preview').addEventListener('click',async()=>{const button=$('#generate-fiscal-preview');const values=Object.fromEntries(new FormData($('#fiscal-preview-form')).entries());button.disabled=true;button.textContent='Preparando...';try{const document=await api('/fiscal/documents/preview',{method:'POST',body:JSON.stringify({orderId:order.id,...values})});closeModal();toast(document.status==='preview_ready'?'Prévia pronta':'Prévia criada com pendências',document.status==='preview_ready'?'Envie os dados ao contador antes de integrar uma API real.':'Abra a prévia para ver os campos que faltam.');await renderFiscal();}catch(error){button.disabled=false;button.textContent='Gerar prévia';toast('Não foi possível preparar',error.message,'error');}});
  }

  async function renderFiscal() {
    const data=await api('/fiscal/overview');
    const s=data.settings||{};
    const documentsByOrder=new Map((data.documents||[]).map((item)=>[Number(item.order_id),item]));
    const pendingProducts=(data.products||[]).filter((item)=>!item.complete);
    const docOptions=(selected)=>`<option value="unconfigured" ${selected==='unconfigured'?'selected':''}>A definir com o contador</option><option value="nfce" ${selected==='nfce'?'selected':''}>NFC-e (modelo 65)</option><option value="nfe" ${selected==='nfe'?'selected':''}>NF-e (modelo 55)</option>`;
    $('#page-content').innerHTML=`<div class="compact-page-toolbar"><div><h2>Fiscal</h2><small>Preparação para futura integração fiscal</small></div><div class="toolbar-icons"><button class="icon-button" id="export-fiscal-products" data-tooltip="Exportar cadastro fiscal dos produtos">${icon('report',17)}</button><button class="icon-button" id="refresh-fiscal" data-tooltip="Atualizar">${icon('refresh',17)}</button></div></div>
      <div class="fiscal-preparation-banner"><div>🧾</div><section><strong>Modo preparação — sem emissão de nota</strong><p>Esta versão organiza os dados fiscais, cria prévias e mostra o que falta. Nenhum documento é enviado à SEFAZ.</p></section><span>HOMOLOGAÇÃO</span></div>
      <div class="stats-grid fiscal-stats">${statCard('product',`${data.counts.productsComplete}/${data.counts.products}`,'Produtos fiscais','Com dados mínimos')}${statCard('order',data.counts.ordersWithoutPreview,'Sem prévia','Pedidos recentes')}${statCard('check',data.counts.previewsReady,'Prévias prontas','Para validar')}${statCard('flag',data.counts.needsReview,'Com pendências','Revisar dados')}</div>
      <div class="fiscal-layout">
        <section class="card fiscal-settings-card"><div class="card-head"><div><h3>Configuração fiscal</h3><small>Use somente dados conferidos pelo responsável e pelo contador.</small></div></div><div class="card-body"><form id="fiscal-settings-form" class="form-grid">
          <div class="field full switch-row"><div><strong>Ativar módulo fiscal de preparação</strong><small>Ao desligar, as prévias ficam salvas, mas novas não podem ser geradas.</small></div><label class="switch"><input name="fiscal_module_enabled" type="checkbox" ${s.fiscal_module_enabled==='true'?'checked':''}><span></span></label></div>
          <div class="field"><label>Razão social</label><input name="fiscal_legal_name" value="${esc(s.fiscal_legal_name||'')}"></div><div class="field"><label>Nome fantasia</label><input name="fiscal_trade_name" value="${esc(s.fiscal_trade_name||'')}"></div>
          <div class="field"><label>CNPJ</label><input name="fiscal_cnpj" inputmode="numeric" value="${esc(s.fiscal_cnpj||'')}"></div><div class="field"><label>Inscrição estadual</label><input name="fiscal_state_registration" value="${esc(s.fiscal_state_registration||'')}"></div>
          <div class="field"><label>CRT / regime</label><input name="fiscal_crt" value="${esc(s.fiscal_crt||'')}" placeholder="Definido pelo contador"></div><div class="field"><label>CEP</label><input name="fiscal_zip_code" value="${esc(s.fiscal_zip_code||'')}"></div>
          <div class="field full"><label>Endereço fiscal</label><input name="fiscal_address" value="${esc(s.fiscal_address||'')}"></div><div class="field"><label>Cidade</label><input name="fiscal_city" value="${esc(s.fiscal_city||'')}"></div><div class="field"><label>UF</label><input name="fiscal_state" maxlength="2" value="${esc(s.fiscal_state||'MG')}"></div>
          <div class="field"><label>Mesa</label><select class="custom-select" name="fiscal_default_table_document">${docOptions(s.fiscal_default_table_document)}</select></div><div class="field"><label>Retirada</label><select class="custom-select" name="fiscal_default_pickup_document">${docOptions(s.fiscal_default_pickup_document)}</select></div><div class="field"><label>Entrega/WhatsApp</label><select class="custom-select" name="fiscal_default_delivery_document">${docOptions(s.fiscal_default_delivery_document)}</select></div><div class="field"><label>Pedido pelo site</label><select class="custom-select" name="fiscal_default_website_document">${docOptions(s.fiscal_default_website_document)}</select></div>
          <div class="field full"><label>Orientações do contador</label><textarea name="fiscal_accountant_notes" rows="4" placeholder="Cole aqui as regras entregues pelo contador.">${esc(s.fiscal_accountant_notes||'')}</textarea></div>
          <div class="field full"><button class="btn btn-primary" type="submit">Salvar preparação fiscal</button></div>
        </form></div></section>
        <section class="card fiscal-pending-card"><div class="card-head"><div><h3>Produtos pendentes</h3><small>NCM, CFOP, CST/CSOSN e unidade.</small></div><button class="btn btn-soft btn-small" id="open-products-fiscal">Abrir estoque</button></div><div class="card-body fiscal-pending-products">${pendingProducts.slice(0,12).map((item)=>`<div><span><strong>${esc(item.name)}</strong><small>${esc(item.category)}</small></span><b>Pendente</b></div>`).join('')||'<div class="fiscal-ready-box">✓ Todos os produtos possuem os campos mínimos preenchidos.</div>'}${pendingProducts.length>12?`<small class="muted">E mais ${pendingProducts.length-12} produtos.</small>`:''}</div></section>
      </div>
      <section class="card fiscal-orders-card"><div class="card-head"><div><h3>Pedidos e prévias</h3><small>Uma prévia por pedido, sem chave de acesso.</small></div></div><div class="card-body"><div class="table-scroll"><table class="data-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Modalidade</th><th>Total</th><th>Documento</th><th>Situação</th><th></th></tr></thead><tbody>${(data.orders||[]).map((order)=>{const document=documentsByOrder.get(Number(order.id));return `<tr><td><strong>#${String(order.id).padStart(4,'0')}</strong><small>${dateTime(order.created_at)}</small></td><td>${esc(order.contact_name)}</td><td>${esc(orderFulfillmentLabel(order))}</td><td><strong>${money(order.total)}</strong></td><td>${esc(fiscalDocumentLabel(document?.document_type||order.fiscal_document_type||'unconfigured'))}</td><td>${fiscalPreviewStatus(document?.status)}</td><td><div class="row-icon-actions">${document?`<button class="icon-button view-fiscal-preview" data-id="${document.id}" data-tooltip="Ver prévia">${icon('eye',15)}</button>`:''}<button class="icon-button primary-icon prepare-fiscal-preview" data-id="${order.id}" data-tooltip="${document?'Atualizar':'Gerar'} prévia">${icon(document?'refresh':'plus',15)}</button></div></td></tr>`;}).join('')||`<tr><td colspan="7">${emptySmall('Nenhum pedido disponível')}</td></tr>`}</tbody></table></div></div></section>`;
    $('#refresh-fiscal').addEventListener('click',renderFiscal);
    $('#export-fiscal-products').addEventListener('click',()=>{const escapeCsv=(value)=>`"${String(value??'').replaceAll('"','""')}"`;const csv=['Produto,Categoria,NCM,CEST,CFOP,CST/CSOSN,Origem,Unidade,IBS/CBS,Observações',...(data.products||[]).map((item)=>[item.name,item.category,item.fiscal_ncm,item.fiscal_cest,item.fiscal_cfop,item.fiscal_cst_csosn,item.fiscal_origin,item.fiscal_unit,item.fiscal_ibs_cbs,item.fiscal_notes].map(escapeCsv).join(','))].join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='cadastro-fiscal-produtos.csv';link.click();URL.revokeObjectURL(link.href);});
    $('#open-products-fiscal').addEventListener('click',()=>navigate('products'));
    $('#fiscal-settings-form').addEventListener('submit',async(event)=>{event.preventDefault();const form=event.currentTarget;const payload=Object.fromEntries(new FormData(form).entries());payload.fiscal_module_enabled=form.elements.fiscal_module_enabled.checked;try{await api('/fiscal/settings',{method:'PUT',body:JSON.stringify(payload)});state.branding=await api('/branding');renderNav(await getWaitingCount());toast('Configuração fiscal salva','O modo continua sendo apenas preparação, sem emissão real.');if(state.branding.fiscalEnabled===false){await navigate('dashboard');return;}await renderFiscal();}catch(error){toast('Não foi possível salvar',error.message,'error');}});
    $$('.prepare-fiscal-preview').forEach((button)=>button.addEventListener('click',()=>{const order=(data.orders||[]).find((item)=>Number(item.id)===Number(button.dataset.id));if(order)openFiscalPreviewModal(order);}));
    $$('.view-fiscal-preview').forEach((button)=>button.addEventListener('click',()=>{const document=(data.documents||[]).find((item)=>Number(item.id)===Number(button.dataset.id));if(document)openFiscalPreviewDetails(document);}));
  }

  async function renderReports() {
    if(state.reportTimer){clearInterval(state.reportTimer);state.reportTimer=null;}
    const filters=state.reportFilters;const range=resolvePeriodDates(filters);
    const data=await api(`/reports/summary?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
    $('#page-content').innerHTML=`<div class="compact-page-toolbar dashboard-toolbar"><div><h2>Relatórios</h2><small>${filters.period==='realtime'?'<span class="live-dot"></span> Atualização automática':`De ${range.from} até ${range.to}`}</small></div><div class="toolbar-filter-group"><select id="report-period" class="custom-select compact-filter-select">${periodOptions(filters.period)}</select><div id="report-custom-dates" class="compact-date-fields ${filters.period==='custom'?'':'hidden'}"><input id="report-from" type="date" value="${esc(filters.from)}"><input id="report-to" type="date" value="${esc(filters.to)}"></div><button class="icon-button" id="refresh-report" data-tooltip="Atualizar">${icon('refresh',17)}</button><button class="icon-button" id="export-report" data-tooltip="Exportar CSV">${icon('report',17)}</button></div></div>
      <div class="stats-grid">${statCard('order',data.orders.total,'Pedidos','No período')}${statCard('dollar',money(data.orders.revenue),'Faturamento',`Ticket ${money(data.orders.average)}`)}${statCard('chat',data.byAgent.reduce((a,b)=>a+Number(b.total||0),0),'Atendimentos','No período')}${statCard('smile',Number(data.satisfaction.average||0).toFixed(1),'Satisfação',`${data.satisfaction.total} respostas`)}${statCard('close',data.totalCancelled||0,'Cancelamentos','Separados no relatório')}</div>
      <div class="card report-orders-card"><div class="card-head"><div><h3>Todos os pedidos do período</h3><small>${data.orders.list?.length || 0} registros, incluindo cancelados</small></div></div><div class="table-scroll"><table class="data-table report-orders-table"><thead><tr><th>Pedido</th><th>Cliente</th><th>Modalidade</th><th>Itens</th><th>Valor</th><th>Status</th><th>Data</th><th></th></tr></thead><tbody>${(data.orders.list||[]).map((order)=>`<tr><td><strong>#${String(order.id).padStart(4,'0')}</strong>${order.source==='website'?'<span class="order-source-badge">Site</span>':''}</td><td><strong>${esc(order.contact_name)}</strong><small>+${esc(order.phone)}</small></td><td>${orderFulfillmentBadge(order)}</td><td><span class="report-items-summary">${esc(order.items_summary||'Sem itens')}</span></td><td><strong>${money(order.total)}</strong>${Number(order.delivery_fee||0)>0?`<small>Taxa ${money(order.delivery_fee)}</small>`:''}</td><td>${statusBadge(order.status)}</td><td>${dateTime(order.created_at)}</td><td><button class="icon-button view-report-order" data-id="${order.id}" data-tooltip="Exibir todos os detalhes">${icon('eye',15)}</button></td></tr>`).join('')||`<tr><td colspan="8">${emptySmall('Nenhum pedido no período')}</td></tr>`}</tbody></table></div></div>
      <div class="dashboard-grid"><div class="card"><div class="card-head"><h3>Por atendente</h3></div><div class="card-body">${data.byAgent.map((a)=>`<div class="queue-row"><strong>${esc(a.name)}</strong><span>${a.total} atendimentos · ${a.closed||0} concluídos · ${Math.round(a.avg_first_response_seconds||0)}s primeira resposta</span></div>`).join('')||emptySmall('Sem dados no período')}</div></div><div class="card"><div class="card-head"><h3>Por fila</h3></div><div class="card-body">${data.byQueue.map((q)=>`<div class="queue-row"><strong>${esc(q.name)}</strong><span>${q.total} total · ${q.closed||0} concluídos</span></div>`).join('')||emptySmall('Sem dados no período')}</div></div></div>${data.cancellations?.length?`<div class="card cancellations-report"><div class="card-head"><h3>Pedidos cancelados</h3></div><div class="card-body">${data.cancellations.map((item)=>`<div class="cancellation-report-row"><div><strong>#${String(item.id).padStart(4,'0')} · ${esc(item.contact_name)}</strong><p>${esc(item.cancel_reason||'Sem motivo informado')}</p></div><span>${money(item.total)} · ${item.cancelled_at?dateTime(item.cancelled_at):''}</span></div>`).join('')}</div></div>`:''}`;
    $$('.view-report-order').forEach((button)=>button.addEventListener('click',()=>openOrderDetailsModal(Number(button.dataset.id))));
    $('#refresh-report').addEventListener('click',renderReports);
    $('#report-period').addEventListener('change',async(event)=>{state.reportFilters.period=event.target.value;if(event.target.value!=='custom'){state.reportFilters.from='';state.reportFilters.to='';}await renderReports();});
    $('#report-from')?.addEventListener('change',(event)=>{state.reportFilters.from=event.target.value;});
    $('#report-to')?.addEventListener('change',async(event)=>{state.reportFilters.to=event.target.value;if(state.reportFilters.from&&state.reportFilters.to)await renderReports();});
    $('#export-report').addEventListener('click',()=>{const escapeCsv=(value)=>`"${String(value??'').replaceAll('"','""')}"`;const csv=['Período,'+range.from+' até '+range.to,'','PEDIDOS','Número,Cliente,Telefone,Modalidade,Mesa,Itens,Pagamento,Subtotal,Taxa,Total,Status,Data,Observações',...(data.orders.list||[]).map((order)=>[String(order.id).padStart(4,'0'),order.contact_name,order.phone,orderFulfillmentLabel(order),order.table_name||'',order.items_summary||'',orderPaymentLabel(order),Number(order.subtotal||0).toFixed(2),Number(order.delivery_fee||0).toFixed(2),Number(order.total||0).toFixed(2),statusLabels[order.status]||order.status,order.created_at,order.notes||''].map(escapeCsv).join(',')),'','ATENDIMENTOS POR ATENDENTE','Atendente,Atendimentos,Concluídos,Primeira resposta (s)',...data.byAgent.map((a)=>[a.name,a.total,a.closed,Math.round(a.avg_first_response_seconds||0)].map(escapeCsv).join(','))].join('\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=`relatorio-gm-automacao-${range.from}-${range.to}.csv`;link.click();URL.revokeObjectURL(link.href);});
    if(filters.period==='realtime')state.reportTimer=setInterval(()=>{if(state.page==='reports')renderReports().catch(()=>{});},15000);
  }



  function confirmAction(title, message, confirmLabel = 'Confirmar', danger = false) {
    return new Promise((resolve) => {
      openModal(title, `<div class="confirm-dialog"><span class="confirm-dialog-icon">${danger ? '⚠️' : '✅'}</span><p>${esc(message)}</p></div>`, `<button class="btn btn-outline" id="confirm-cancel">Cancelar</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-ok">${esc(confirmLabel)}</button>`);
      $('#confirm-cancel').addEventListener('click', () => { closeModal(); resolve(false); });
      $('#confirm-ok').addEventListener('click', () => { closeModal(); resolve(true); });
      $('.close-modal').addEventListener('click', () => resolve(false), { once: true });
    });
  }

  function openModal(title, body, footer = '', size = 'normal') {
    closeCustomSelects();
    document.body.classList.add('modal-open');
    $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal modal-${esc(size)}"><div class="modal-head"><h3>${esc(title)}</h3><button class="close-modal icon-button" aria-label="Fechar" data-tooltip="Fechar">${icon('close',18)}</button></div><div class="modal-body">${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ''}</div></div>`;
    $('.modal-backdrop').addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) closeModal(); });
    $('.close-modal').addEventListener('click', closeModal);
    enhanceSelects($('#modal-root'));
    bindSmartTooltips($('#modal-root'));
  }
  function closeModal() { closeCustomSelects(); hideSmartTooltip(); $('#modal-root').innerHTML = ''; document.body.classList.remove('modal-open'); }

  initializeApp();
})();
