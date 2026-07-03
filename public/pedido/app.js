(() => {
  'use strict';

  const state = {
    store: null,
    products: [],
    category: 'Todos',
    query: '',
    cart: loadCart(),
    trackingTimer: null,
    checkoutToken: '',
    checkoutSession: null,
    tableToken: '',
    tableDeviceToken: '',
    tableSession: null,
    pendingTable: null,
    editingOrderId: null,
    lunchProductId: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const newCartId = () => globalThis.crypto?.randomUUID?.() || `cart-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  function loadCart() {
    try {
      const value = JSON.parse(localStorage.getItem('gm-order-cart') || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveCart() {
    localStorage.setItem('gm-order-cart', JSON.stringify(state.cart));
  }

  async function api(path, options = {}) {
    const response = await fetch(`/api/public${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    let payload = {};
    try { payload = await response.json(); } catch { /* resposta vazia */ }
    if (!response.ok) {
      const error = new Error(payload.error || 'Não foi possível concluir esta ação.');
      error.code = payload.code || '';
      error.payload = payload;
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function refreshStoreState({ render = true } = {}) {
    const fresh = await api('/store');
    state.store = fresh;
    state.products = fresh.products || [];
    if (render) {
      applyBranding();
      renderCategories();
      renderCatalog();
      renderCart();
    }
    return fresh;
  }

  function unavailableProductMessage(product) {
    const ordering = state.store?.ordering || {};
    if (product?.productPeriod === 'lunch') {
      const lunch = ordering.lunch || {};
      return `A marmitex está disponível das ${lunch.start || '09:00'} às ${lunch.end || '14:00'}.`;
    }
    if (ordering.orderingPhase === 'lunch') return 'Neste horário estão disponíveis apenas as marmitex. Os pedidos normais voltam no período noturno.';
    return ordering.orderingMessage || 'Os pedidos estão fora do horário de atendimento.';
  }


  function tableTokenFromLocation() {
    const match = window.location.pathname.match(/\/pedido\/mesa\/([a-f0-9]{48})/i);
    return match ? match[1].toLowerCase() : '';
  }

  function savedTableLink() {
    try {
      const value = JSON.parse(localStorage.getItem('gm-table-link') || 'null');
      if (!value || !/^[a-f0-9]{48}$/i.test(value.token || '') || !/^[a-f0-9]{48}$/i.test(value.deviceToken || '')) return null;
      return { token: value.token.toLowerCase(), deviceToken: value.deviceToken.toLowerCase() };
    } catch { return null; }
  }

  function hasTableContext() {
    return Boolean(state.tableToken && (state.tableSession || state.pendingTable));
  }

  function createBrowserDeviceToken() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map((value)=>value.toString(16).padStart(2,'0')).join('');
  }

  function canOrderNow() {
    if (!hasTableContext()) return Boolean(state.store?.ordering?.canOrderNow);
    return Boolean(
      state.store?.ordering?.tablesEnabled
      && state.store?.ordering?.canOrderNow
      && state.tableSession?.tab?.status !== 'account_requested'
    );
  }

  function canOrderProduct(product) {
    return Boolean(canOrderNow() && product && product.availableNow !== false);
  }

  function renderTableSession() {
    const bar = $('#table-session-bar');
    const contextTable = state.tableSession?.table || state.pendingTable;
    if (!contextTable) { bar.hidden = true; return; }
    bar.hidden = false;
    $('#table-session-name').textContent = contextTable.name;
    $('#table-session-total').textContent = money(state.tableSession?.total || 0);
    const accountRequested = state.tableSession?.tab?.status === 'account_requested' || state.tableSession?.table?.status === 'account_requested';
    const memberName = state.tableSession?.member?.displayName || state.tableSession?.member?.name || '';
    $('#table-session-status').textContent = !state.tableSession
      ? 'A mesa só será ocupada quando você enviar o primeiro pedido.'
      : accountRequested
        ? 'A conta já foi solicitada. Aguarde a equipe.'
        : memberName
          ? `Pedindo como ${memberName}. Você pode fazer novos pedidos até a comanda ser encerrada.`
          : 'Informe seu nome e WhatsApp no primeiro pedido. O vínculo será mantido até a comanda ser encerrada.';
    $('#table-checkout-name').textContent = `Pedido vinculado à ${contextTable.name}`;
    $('#request-bill').disabled = accountRequested || !state.tableSession;
    $('#table-help').disabled = accountRequested || !state.tableSession;
    $('#my-tab').disabled = !state.tableSession;
  }

  async function refreshTableSession() {
    if (!state.tableToken || !state.tableDeviceToken) return;
    try {
      state.tableSession = await api(`/table/${state.tableToken}/session/${state.tableDeviceToken}`);
      renderTableSession();
      renderCatalog();
      renderCart();
    } catch {
      state.tableSession = null;
      localStorage.removeItem('gm-table-link');
      renderTableSession();
    }
  }

  async function loadTableContext() {
    const pathToken = tableTokenFromLocation();
    const saved = savedTableLink();
    const token = pathToken || saved?.token || '';
    if (!token) return;
    state.tableToken = token;
    const payload = await api(`/table/${token}`);
    state.pendingTable = payload.table;

    if (saved?.token === token) {
      state.tableDeviceToken = saved.deviceToken;
      try {
        state.tableSession = await api(`/table/${token}/session/${saved.deviceToken}`);
        state.pendingTable = null;
        renderTableSession();
        return;
      } catch {
        // O aparelho já escolheu a mesa, mas ainda não enviou o primeiro pedido.
        // Mantemos o contexto pendente sem ocupar a mesa no painel.
        renderTableSession();
        return;
      }
    }

    $('#table-confirm-title').textContent = `Você está na ${payload.table.name}`;
    $('#table-confirm-text').textContent = `Deseja abrir o cardápio da ${payload.table.name}? A mesa só aparecerá como ocupada quando você enviar o primeiro pedido.`;
    $('#table-confirm-modal').hidden = false;
  }

  async function confirmTableLink() {
    const button = $('#confirm-table');
    button.disabled = true;
    hideError($('#table-confirm-error'));
    try {
      state.tableDeviceToken = state.tableDeviceToken || createBrowserDeviceToken();
      localStorage.setItem('gm-table-link', JSON.stringify({ token: state.tableToken, deviceToken: state.tableDeviceToken, pending: true }));
      $('#table-confirm-modal').hidden = true;
      renderTableSession();
      applyBranding();
      renderCatalog();
      renderCart();
      toast('Cardápio da mesa aberto', `${state.pendingTable.name} só será ocupada quando o primeiro pedido for enviado.`);
    } catch (error) {
      showError($('#table-confirm-error'), error.message);
    } finally { button.disabled = false; }
  }

  function closeTableHelp() {
    $('#table-help-modal').hidden = true;
    document.body.style.overflow = '';
    hideError($('#table-help-error'));
  }

  function openTableHelp() {
    if (!state.tableSession) return;
    $('#table-help-message').value = '';
    $('#table-help-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  async function sendTableRequest(requestType, message = '') {
    if (!state.tableSession) return;
    const labels = {
      bill:['Conta solicitada','A equipe já recebeu sua solicitação.'], waiter:['Garçom chamado','A equipe foi avisada e irá até a mesa.'],
      napkins:['Guardanapos solicitados','A equipe recebeu o pedido de guardanapos.'], cutlery:['Talheres solicitados','A equipe recebeu o pedido de talheres.'],
      change:['Alteração solicitada','A equipe irá conversar com você sobre o pedido.'], problem:['Problema informado','A equipe foi avisada e irá ajudar.'],
    };
    try {
      const response = await api(`/table/${state.tableToken}/request`, { method: 'POST', body: JSON.stringify({ deviceToken: state.tableDeviceToken, requestType, message }) });
      if (response.session) state.tableSession = response.session;
      renderTableSession();
      closeTableHelp();
      toast(...(labels[requestType] || labels.waiter));
    } catch (error) {
      if (!$('#table-help-modal').hidden) showError($('#table-help-error'), error.message);
      else toast('Não foi possível enviar', error.message);
    }
  }

  function closeMyTab() {
    $('#my-tab-modal').hidden = true;
    document.body.style.overflow = '';
  }

  function orderStatusClass(status) {
    return `status-${String(status || 'new').replaceAll('_','-')}`;
  }

  function renderMyTabContent() {
    if (!state.tableSession) return;
    const ownOrders = state.tableSession.memberOrders || [];
    const pending = state.tableSession.pendingOrder || ownOrders.find((order) => order.status === 'new');
    const actions = state.tableSession.customerActions || { editEnabled:true,cancelEnabled:true,editMinutes:10 };
    const pendingAgeMinutes = pending ? (Date.now()-new Date(pending.createdAt).getTime())/60000 : 0;
    const withinActionTime = pending ? pendingAgeMinutes <= Number(actions.editMinutes||10) : false;
    const canEditPending = Boolean(pending && actions.editEnabled && withinActionTime);
    const canCancelPending = Boolean(pending && actions.cancelEnabled && withinActionTime);
    $('#my-tab-title').textContent = `${state.tableSession.table.name} · Minha comanda`;
    $('#my-tab-content').innerHTML = `
      <div class="my-tab-summary">
        <div><small>Identificação</small><strong>${escapeHtml(state.tableSession.member?.displayName || state.tableSession.member?.name || 'Ainda não informada')}</strong></div>
        <div><small>Seu consumo</small><strong>${money(state.tableSession.memberTotal || 0)}</strong></div>
        <div><small>Total da mesa</small><strong>${money(state.tableSession.total || 0)}</strong></div>
      </div>
      ${pending ? `<div class="pending-order-alert"><div><span>⏳</span><div><strong>Pedido #${pending.number} aguardando confirmação</strong><small>${withinActionTime ? `Você pode alterar por até ${actions.editMinutes} minutos, conforme as regras do estabelecimento.` : 'O prazo de alteração terminou. Use “Preciso de algo” para falar com a equipe.'}</small></div></div>${canEditPending||canCancelPending?`<div class="pending-order-buttons">${canEditPending?`<button class="secondary-button" type="button" data-edit-pending="${pending.id}">✏️ Editar pedido</button>`:''}${canCancelPending?`<button class="danger-button" type="button" data-cancel-pending="${pending.id}">Cancelar pedido</button>`:''}</div>`:''}</div>` : ''}
      <div class="my-tab-orders">
        <div class="my-tab-orders-head"><strong>Seus pedidos</strong><span>${ownOrders.length}</span></div>
        ${ownOrders.length ? ownOrders.map((order) => `<article class="my-tab-order ${orderStatusClass(order.status)}"><header><div><strong>Pedido #${order.number}</strong><small>${new Date(order.createdAt).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></div><span>${escapeHtml(order.statusLabel)}</span></header><div class="my-tab-order-items">${(order.items||[]).map((item)=>`<p><span>${item.quantity}x ${escapeHtml(item.name)}${item.notes?`<small>${escapeHtml(item.notes)}</small>`:''}</span><strong>${money(Number(item.unit_price||0)*Number(item.quantity||0))}</strong></p>`).join('')}</div><footer><span>${escapeHtml(order.memberName || '')}</span><strong>${money(order.total)}</strong></footer></article>`).join('') : '<div class="my-tab-empty"><span>🛒</span><strong>Nenhum pedido ainda</strong><small>Escolha seus itens no cardápio e envie o primeiro pedido.</small></div>'}
      </div>
      <div class="my-tab-footer"><button class="primary-button" type="button" data-continue-ordering>＋ Continuar pedindo</button></div>`;
    $('[data-edit-pending]')?.addEventListener('click', () => beginEditPendingOrder(pending));
    $('[data-cancel-pending]')?.addEventListener('click', () => cancelPendingOrder(pending));
    $('[data-continue-ordering]')?.addEventListener('click', () => { closeMyTab(); window.scrollTo({top:0,behavior:'smooth'}); });
  }

  function openMyTab() {
    if (!state.tableSession) return;
    renderMyTabContent();
    $('#my-tab-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function beginEditPendingOrder(order) {
    if (!order) return;
    state.editingOrderId = Number(order.id);
    state.cart = (order.items || []).map((item) => ({ cartId: newCartId(), productId: Number(item.product_id), quantity: Number(item.quantity || 1), notes: item.notes || '' })).filter((item) => item.productId);
    saveCart();
    closeMyTab();
    renderCart();
    openCart();
    $('#checkout-button').textContent = `Editar pedido #${order.number}`;
    toast('Pedido aberto para edição', 'Altere as quantidades e confirme novamente.');
  }

  async function cancelPendingOrder(order) {
    if (!order || !window.confirm(`Cancelar o pedido #${order.number}?`)) return;
    try {
      const response = await api(`/table/${state.tableToken}/orders/${order.id}/cancel`, { method:'POST', body:JSON.stringify({ deviceToken: state.tableDeviceToken }) });
      state.tableSession = response.session;
      state.editingOrderId = null;
      renderTableSession();
      renderMyTabContent();
      renderCart();
      toast('Pedido cancelado', `O pedido #${order.number} foi cancelado antes da confirmação.`);
    } catch (error) { toast('Não foi possível cancelar', error.message); }
  }


  function toast(title, message) {
    const item = document.createElement('div');
    item.className = 'toast';
    item.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
    $('#toast-region').appendChild(item);
    setTimeout(() => item.remove(), 3800);
  }

  function applyBranding() {
    const branding = state.store.branding;
    document.documentElement.style.setProperty('--primary', branding.primaryColor || '#1458EA');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', branding.primaryColor || '#1458EA');
    $('#brand-name').textContent = branding.companyName;
    $('#brand-subtitle').textContent = branding.subtitle || branding.instagram || 'Cardápio digital';
    $('#brand-logo').src = branding.logoUrl || '/assets/jhow-burguer-logo.jpg';
    $('#brand-logo').onerror = () => { $('#brand-logo').src = '/assets/jhow-burguer-logo.jpg'; };
    $('#hero-title').textContent = branding.heroTitle || 'Seu pedido, do seu jeito.';
    $('#hero-text').textContent = branding.heroText;
    $('#checkout-notice').textContent = state.store.ordering.checkoutNotice || 'O pedido será enviado ao painel e ficará aguardando confirmação da equipe.';
    document.title = `${branding.companyName} · Pedidos`;

    const fulfillment = state.store.ordering.fulfillment || { delivery: true, pickup: true };
    $$('[data-fulfillment-option]').forEach((label) => {
      const type = label.dataset.fulfillmentOption;
      label.hidden = hasTableContext() ? type !== 'table' : (type === 'table' || !fulfillment[type]);
    });
    const visibleFulfillment = $$('[data-fulfillment-option]').filter((label) => !label.hidden);
    const checkedFulfillment = $('input[name="fulfillmentMethod"]:checked');
    if (!checkedFulfillment || checkedFulfillment.closest('label')?.hidden) visibleFulfillment[0]?.querySelector('input')?.click();
    const payments = state.store.ordering.payments || { pix: true, card: true, cash: true };
    $$('[data-payment-option]').forEach((label) => { label.hidden = !payments[label.dataset.paymentOption]; });
    const visiblePayments = $$('[data-payment-option]').filter((label) => !label.hidden);
    const checkedPayment = $('input[name="paymentMethod"]:checked');
    if (!hasTableContext() && (!checkedPayment || checkedPayment.closest('label')?.hidden)) visiblePayments[0]?.querySelector('input')?.click();

    const status = state.store.ordering.business;
    const statusEl = $('#store-status');
    statusEl.classList.toggle('closed', !status.open);
    statusEl.querySelector('span:last-child').textContent = status.message;
    const unavailable = !canOrderNow();
    $('#closed-banner').hidden = !unavailable;
    const unavailableMessage = state.tableSession?.tab?.status === 'account_requested'
      ? 'A conta desta mesa já foi solicitada.'
      : hasTableContext() && !state.store.ordering.tablesEnabled
        ? 'Os pedidos por mesa estão temporariamente desativados.'
        : !hasTableContext() && !state.store.ordering.enabled
          ? 'Os pedidos pelo site estão pausados. Continue seu atendimento normalmente pelo WhatsApp.'
          : (status.message || 'Os pedidos não estão disponíveis agora.');
    $('#closed-message').textContent = unavailableMessage;
    $('#pickup-address').textContent = state.store.ordering.pickupAddress || 'Confirme o endereço com a equipe.';
    const lunch = state.store.ordering.lunch;
    if (lunch?.enabled) {
      $('#lunch-banner').hidden = false;
      $('#lunch-banner').classList.toggle('unavailable', !lunch.available);
      $('#lunch-banner-text').textContent = lunch.available
        ? `Marmitex disponível agora, até ${lunch.end}.`
        : `Fora do horário. Disponível das ${lunch.start} às ${lunch.end}.`;
      $('#open-lunch-category').textContent = lunch.available ? 'Ver marmitex' : 'Ver opções e horários';
    } else {
      $('#lunch-banner').hidden = true;
    }
    renderTableSession();
  }

  function categoryList() {
    return ['Todos', ...new Set(state.products.map((item) => item.category || 'Outros'))];
  }

  function renderCategories() {
    $('#category-tabs').innerHTML = categoryList().map((category) => `
      <button class="category-tab ${category === state.category ? 'active' : ''}" type="button" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
    `).join('');
  }

  function filteredProducts() {
    const query = state.query.toLocaleLowerCase('pt-BR');
    return state.products.filter((product) => {
      const categoryMatch = state.category === 'Todos' || product.category === state.category;
      const searchMatch = !query || `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase('pt-BR').includes(query);
      return categoryMatch && searchMatch;
    });
  }

  function productImage(product) {
    if (product.image_url && (/^https?:\/\//i.test(product.image_url) || product.image_url.startsWith('/'))) {
      return `<img src="${escapeHtml(product.image_url)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=&quot;product-placeholder&quot;>${escapeHtml(product.name.slice(0,1).toUpperCase())}</div>'">`;
    }
    return `<div class="product-placeholder">${escapeHtml(product.name.slice(0,1).toUpperCase())}</div>`;
  }

  function renderCatalog() {
    const products = filteredProducts();
    $('#empty-state').hidden = products.length > 0;
    const grouped = new Map();
    for (const product of products) {
      const category = product.category || 'Outros';
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(product);
    }
    $('#catalog-content').innerHTML = [...grouped.entries()].map(([category, items]) => `
      <section class="category-section" id="category-${slug(category)}">
        <div class="category-heading"><h2>${escapeHtml(category)}</h2><span>${category === 'Marmitex - Almoço' ? escapeHtml(state.store?.ordering?.lunch?.label || '') : `${items.length} ${items.length === 1 ? 'item' : 'itens'}`}</span></div>
        <div class="product-grid">
          ${items.map((product) => `
            <article class="product-card ${product.availableNow === false ? 'product-unavailable' : ''}">
              <div class="product-body">
                <h3>${escapeHtml(product.name)}</h3>
                <p class="product-description">${escapeHtml(product.description || 'Produto disponível para seu pedido.')}</p>
                ${product.productPeriod ? `<span class="time-badge ${product.availableNow === false ? 'closed' : ''}">${product.availableNow === false ? escapeHtml(unavailableProductMessage(product)) : (product.productPeriod === 'lunch' ? 'Almoço disponível agora' : 'Pedidos normais disponíveis agora')}</span>` : ''}
                <div class="product-bottom">
                  <span class="product-price">${money(product.price)}</span>
                  <button class="add-button" type="button" data-add-product="${product.id}" ${canOrderProduct(product) ? '' : 'disabled'}>${product.productPeriod === 'lunch' ? 'Montar' : 'Adicionar'}</button>
                </div>
              </div>
              <div class="product-media">
                ${productImage(product)}
                ${product.stock != null && product.stock <= 5 ? `<span class="stock-badge">Restam ${product.stock}</span>` : ''}
              </div>
            </article>
          `).join('')}
        </div>
      </section>
    `).join('');
  }

  function slug(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function cartProduct(item) {
    return state.products.find((product) => Number(product.id) === Number(item.productId));
  }

  function normalizedCart() {
    state.cart = state.cart.filter((item) => {
      const product = cartProduct(item);
      if (!product) return false;
      const max = product.stock == null ? 20 : Math.min(20, Number(product.stock));
      item.cartId = String(item.cartId || newCartId());
      item.quantity = Math.max(1, Math.min(max, Number(item.quantity || 1)));
      return max > 0;
    });
    saveCart();
  }

  function cartValues(fulfillment = state.tableSession ? 'table' : 'delivery') {
    const subtotal = state.cart.reduce((sum, item) => {
      const product = cartProduct(item);
      return sum + (product ? Number(product.price) * Number(item.quantity) : 0);
    }, 0);
    const delivery = fulfillment === 'delivery' ? Number(state.store?.ordering?.deliveryFee || 0) : 0;
    return { subtotal, delivery, total: subtotal + delivery };
  }

  function cartCount() {
    return state.cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }

  function renderCart() {
    normalizedCart();
    const hasItems = state.cart.length > 0;
    $('#cart-empty').hidden = hasItems;
    $('#cart-summary').hidden = !hasItems;
    const mobileCartButton = $('#mobile-cart-button');
    mobileCartButton.hidden = !hasItems;
    mobileCartButton.setAttribute('aria-hidden', String(!hasItems));
    document.body.classList.toggle('has-mobile-cart', hasItems);
    $('#cart-items').innerHTML = state.cart.map((item) => {
      const product = cartProduct(item);
      if (!product) return '';
      return `
        <div class="cart-item ${item.notes?'has-note':''}">
          <div class="cart-item-main"><div><h4>${escapeHtml(product.name)}</h4><span class="cart-item-price">${money(Number(product.price) * item.quantity)}</span></div><button type="button" class="cart-note-button ${item.notes?'active':''}" data-cart-note="${escapeHtml(item.cartId)}" aria-label="Adicionar observação" aria-expanded="${item.notes?'true':'false'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg></button></div>
          <div class="quantity-control">
            <button type="button" data-cart-minus="${escapeHtml(item.cartId)}" aria-label="Diminuir">−</button>
            <span>${item.quantity}</span>
            <button type="button" data-cart-plus="${escapeHtml(item.cartId)}" aria-label="Aumentar">+</button>
          </div>
          <label class="cart-note-field ${item.notes?'':'hidden'}"><span>Observação do item</span><textarea data-cart-note-input="${escapeHtml(item.cartId)}" rows="2" maxlength="180" placeholder="Ex.: sem cebola, adicionar molho…">${escapeHtml(item.notes||'')}</textarea></label>
        </div>`;
    }).join('');
    const values = cartValues(state.tableSession ? 'table' : 'delivery');
    $('#cart-subtotal').textContent = money(values.subtotal);
    $('#cart-delivery').textContent = money(values.delivery);
    $('#cart-total').textContent = money(values.total);
    $('#mobile-cart-count').textContent = cartCount();
    $('#mobile-cart-total').textContent = money(values.total);
    $('#checkout-button').textContent = state.editingOrderId ? `Salvar alterações do pedido #${String(state.editingOrderId).padStart(4,'0')}` : 'Continuar pedido';
  }

  async function addProduct(productId) {
    try { await refreshStoreState({ render: false }); }
    catch (error) { return toast('Não foi possível atualizar o horário', error.message); }
    const product = state.products.find((item) => Number(item.id) === Number(productId));
    if (!product) return;
    if (!canOrderProduct(product)) {
      renderCatalog();
      return toast('Produto indisponível agora', unavailableProductMessage(product));
    }
    if (product.productPeriod === 'lunch') {
      return openLunchCustomizer(product);
    }
    const existing = state.cart.find((item) => Number(item.productId) === Number(productId));
    const max = product.stock == null ? 20 : Math.min(20, Number(product.stock));
    if (existing) {
      if (existing.quantity >= max) return toast('Limite do produto', 'Você atingiu a quantidade disponível deste item.');
      existing.quantity += 1;
    } else {
      state.cart.push({ cartId: newCartId(), productId: Number(productId), quantity: 1, notes: '' });
    }
    saveCart();
    renderCart();
    toast('Adicionado ao carrinho', product.name);
  }

  function closeLunchCustomizer() {
    $('#lunch-modal').hidden = true;
    state.lunchProductId = null;
    document.body.style.overflow = '';
    hideError($('#lunch-error'));
  }

  function openLunchCustomizer(product) {
    state.lunchProductId = Number(product.id);
    const form = $('#lunch-form');
    form.reset();
    form.elements.lunchQuantity.value = 1;
    const withBarbecue = /\bCom Churrasco\b/i.test(product.name);
    $('#lunch-meat-section').hidden = withBarbecue;
    if (withBarbecue) {
      $$('input[name="lunchMeat"]').forEach((input) => { input.checked = false; input.required = false; });
    } else {
      $$('input[name="lunchMeat"]').forEach((input) => { input.required = true; });
    }
    $('#lunch-product-summary').innerHTML = `<strong>${escapeHtml(product.name)}</strong><span>${money(product.price)}</span><small>${escapeHtml(product.description || '')}</small>`;
    $('#lunch-garnish-help').textContent = 'Selecione exatamente duas opções.';
    hideError($('#lunch-error'));
    $('#lunch-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function submitLunchCustomizer(event) {
    event.preventDefault();
    const product = state.products.find((item) => Number(item.id) === Number(state.lunchProductId));
    if (!product) return closeLunchCustomizer();
    if (product.availableNow === false) return showError($('#lunch-error'), 'A marmitex saiu do horário disponível. Atualize a página e tente novamente amanhã.');
    const form = event.currentTarget;
    const data = new FormData(form);
    const withBarbecue = /\bCom Churrasco\b/i.test(product.name);
    const meat = withBarbecue ? 'Churrasco' : String(data.get('lunchMeat') || '');
    const rice = String(data.get('lunchRice') || '');
    const beans = String(data.get('lunchBeans') || '');
    const garnishes = data.getAll('lunchGarnish').map(String);
    const salad = String(data.get('lunchSalad') || '');
    const quantity = Math.max(1, Math.min(20, Number(data.get('lunchQuantity') || 1)));
    if (!meat || !rice || !beans || !salad) return showError($('#lunch-error'), 'Preencha todas as escolhas da marmitex.');
    if (garnishes.length !== 2) return showError($('#lunch-error'), 'Escolha exatamente duas guarnições.');
    const notes = `Carne: ${meat} | Arroz: ${rice} | Feijão: ${beans} | Guarnições: ${garnishes.join(' + ')} | Salada: ${salad}`;
    const existing = state.cart.find((item) => Number(item.productId) === Number(product.id) && String(item.notes || '') === notes);
    if (existing) existing.quantity = Math.min(20, Number(existing.quantity || 1) + quantity);
    else state.cart.push({ cartId: newCartId(), productId: Number(product.id), quantity, notes });
    saveCart();
    renderCart();
    closeLunchCustomizer();
    toast('Marmitex adicionada', `${quantity}x ${product.name}`);
  }

  function changeQuantity(cartId, change) {
    const item = state.cart.find((cartItem) => String(cartItem.cartId) === String(cartId));
    const product = cartProduct(item || {});
    if (!item || !product) return;
    const max = product.stock == null ? 20 : Math.min(20, Number(product.stock));
    item.quantity += change;
    if (item.quantity <= 0) state.cart = state.cart.filter((cartItem) => String(cartItem.cartId) !== String(cartId));
    else item.quantity = Math.min(max, item.quantity);
    saveCart();
    renderCart();
  }

  function openCart() {
    $('#cart-panel').classList.add('open');
    $('#cart-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    $('#cart-panel').classList.remove('open');
    $('#cart-backdrop').hidden = true;
    document.body.style.overflow = '';
  }

  async function openCheckout() {
    if (!state.cart.length) return;
    try { await refreshStoreState({ render: false }); }
    catch (error) { return toast('Não foi possível atualizar o horário', error.message); }
    const unavailable = state.cart.map((item) => cartProduct(item)).filter((product) => product && !canOrderProduct(product));
    if (!canOrderNow() || unavailable.length) {
      renderCatalog();
      renderCart();
      return toast('Pedido indisponível agora', unavailable.length ? unavailableProductMessage(unavailable[0]) : (state.store?.ordering?.orderingMessage || 'Estamos fora do horário de pedidos.'));
    }
    const pending = state.tableSession?.pendingOrder;
    if (pending && Number(state.editingOrderId) !== Number(pending.id)) {
      openMyTab();
      return toast('Você já possui um pedido pendente', `Edite ou cancele o pedido #${pending.number} antes de enviar outro.`);
    }
    closeCart();
    const form = $('#checkout-form');
    if (state.checkoutSession?.contact) {
      form.elements.name.value = state.checkoutSession.contact.name || form.elements.name.value || '';
      form.elements.phone.value = phoneMask(localPhoneDigits(state.checkoutSession.contact.phone || ''));
      form.elements.phone.readOnly = true;
      form.elements.phone.dataset.linkedWhatsapp = 'true';
      $('#whatsapp-identified').hidden = false;
      $('#whatsapp-identified').textContent = '✓ Número identificado automaticamente pelo link do WhatsApp';
      form.elements.whatsappOptIn.checked = true;
    }
    if (state.tableSession?.member?.linked) {
      form.elements.name.value = state.tableSession.member.name || state.tableSession.member.displayName || '';
      form.elements.phone.value = phoneMask(localPhoneDigits(state.tableSession.member.phone || ''));
      form.elements.name.readOnly = true;
      form.elements.phone.readOnly = true;
      $('#whatsapp-identified').hidden = false;
      $('#whatsapp-identified').textContent = '✓ Identificação vinculada à comanda desta mesa';
      form.elements.whatsappOptIn.checked = true;
    }
    renderCheckoutSummary();
    $('#checkout-modal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeCheckout() {
    $('#checkout-modal').hidden = true;
    document.body.style.overflow = '';
    hideError($('#checkout-error'));
  }

  function parseCurrencyInput(value) {
    const raw = String(value || '').replace(/[^0-9,.-]/g, '').trim();
    if (!raw) return null;
    let normalized = raw;
    if (raw.includes(',') && raw.includes('.')) normalized = raw.replace(/\./g, '').replace(',', '.');
    else if (raw.includes(',')) normalized = raw.replace(',', '.');
    const number = Number(normalized);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function updateCashChangeFields() {
    const form = $('#checkout-form');
    const payment = form.elements.paymentMethod?.value || '';
    const cash = !hasTableContext() && payment === 'cash';
    const wrapper = $('#cash-change-fields');
    const valueField = $('#change-for-field');
    const choice = form.elements.needsChange?.value || '';
    wrapper.hidden = !cash;
    valueField.hidden = !cash || choice !== 'yes';
    const changeInput = form.elements.changeFor;
    if (changeInput) changeInput.required = cash && choice === 'yes';
    if (!cash) {
      $$('input[name="needsChange"]').forEach((input) => { input.checked = false; });
      if (changeInput) changeInput.value = '';
    }
  }

  function renderCheckoutSummary() {
    const fulfillment = hasTableContext() ? 'table' : (new FormData($('#checkout-form')).get('fulfillmentMethod') || 'delivery');
    const values = cartValues(fulfillment);
    $('#checkout-items').innerHTML = state.cart.map((item) => {
      const product = cartProduct(item);
      return product ? `<div class="checkout-item"><span>${item.quantity}x ${escapeHtml(product.name)}${item.notes ? `<small>${escapeHtml(item.notes)}</small>` : ''}</span><strong>${money(product.price * item.quantity)}</strong></div>` : '';
    }).join('');
    $('#checkout-subtotal').textContent = money(values.subtotal);
    $('#checkout-delivery').textContent = money(values.delivery);
    $('#checkout-total').textContent = money(values.total);
    $('#address-field').hidden = fulfillment !== 'delivery';
    $('#pickup-info').hidden = fulfillment !== 'pickup';
    $('#table-checkout-info').hidden = fulfillment !== 'table';
    $('#payment-section').hidden = fulfillment === 'table';
    $$('input[name="paymentMethod"]').forEach((input) => { input.disabled = fulfillment === 'table'; });
    $('#delivery-line').hidden = fulfillment === 'table';
    updateCashChangeFields();
  }

  function showError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function hideError(element) {
    element.hidden = true;
    element.textContent = '';
  }

  function checkoutTokenFromLocation() {
    const pathMatch = window.location.pathname.match(/\/pedido\/checkout\/([a-f0-9]{48})/i);
    const value = pathMatch?.[1] || new URLSearchParams(window.location.search).get('checkout') || '';
    return /^[a-f0-9]{48}$/i.test(value) ? value.toLowerCase() : '';
  }

  function localPhoneDigits(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits;
  }

  function applyLinkedCheckout(checkout) {
    state.checkoutSession = checkout;
    state.checkoutToken = checkout.token;
    state.cart = Array.isArray(checkout.cart) ? checkout.cart.map((item) => ({
      cartId: newCartId(),
      productId: Number(item.productId),
      quantity: Number(item.quantity || 1),
      notes: item.notes || '',
    })) : [];
    saveCart();
    const form = $('#checkout-form');
    form.elements.name.value = checkout.contact?.name || '';
    form.elements.phone.value = phoneMask(localPhoneDigits(checkout.contact?.phone || ''));
    form.elements.phone.readOnly = true;
    form.elements.phone.dataset.linkedWhatsapp = 'true';
    $('#whatsapp-identified').hidden = false;
    form.elements.whatsappOptIn.checked = true;
  }

  function phoneMask(value) {
    const digits = String(value).replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 6) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
    if (digits.length <= 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`;
    return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
  }

  async function submitOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const errorEl = $('#checkout-error');
    hideError(errorEl);
    try { await refreshStoreState({ render: false }); }
    catch (error) { return showError(errorEl, error.message); }
    const unavailable = state.cart.map((item) => cartProduct(item)).filter((product) => product && !canOrderProduct(product));
    if (!canOrderNow() || unavailable.length) {
      renderCatalog();
      renderCart();
      return showError(errorEl, unavailable.length ? unavailableProductMessage(unavailable[0]) : (state.store?.ordering?.orderingMessage || 'Estamos fora do horário de pedidos.'));
    }
    const data = new FormData(form);
    if (!form.reportValidity()) return;
    if (!state.cart.length) return showError(errorEl, 'Seu carrinho está vazio.');
    if (!hasTableContext() && data.get('paymentMethod') === 'cash') {
      const needsChange = data.get('needsChange');
      if (!['yes', 'no'].includes(String(needsChange || ''))) return showError(errorEl, 'Informe se precisa de troco.');
      if (needsChange === 'yes') {
        const changeFor = parseCurrencyInput(data.get('changeFor'));
        const fulfillment = data.get('fulfillmentMethod') || 'delivery';
        const total = cartValues(fulfillment).total;
        if (changeFor == null) return showError(errorEl, 'Informe um valor válido para o troco.');
        if (changeFor < total) return showError(errorEl, `O valor para troco não pode ser menor que ${money(total)}.`);
      }
    }

    const button = $('#submit-order');
    button.disabled = true;
    button.innerHTML = '<span class="spinner" style="width:22px;height:22px;border-width:3px"></span><span>Enviando…</span>';
    try {
      const payload = {
        name: data.get('name'),
        phone: data.get('phone'),
        checkoutToken: state.checkoutToken,
        fulfillmentMethod: hasTableContext() ? 'table' : data.get('fulfillmentMethod'),
        address: data.get('address'),
        tableToken: state.tableToken,
        tableDeviceToken: state.tableDeviceToken,
        deviceToken: state.tableDeviceToken,
        paymentMethod: hasTableContext() ? '' : data.get('paymentMethod'),
        needsChange: !hasTableContext() && data.get('paymentMethod') === 'cash' ? data.get('needsChange') === 'yes' : false,
        changeFor: !hasTableContext() && data.get('paymentMethod') === 'cash' && data.get('needsChange') === 'yes' ? parseCurrencyInput(data.get('changeFor')) : null,
        notes: data.get('notes'),
        whatsappOptIn: data.get('whatsappOptIn') === 'on',
        items: state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity, notes: item.notes || '' })),
      };
      const response = state.tableSession && state.editingOrderId
        ? await api(`/table/${state.tableToken}/orders/${state.editingOrderId}`, { method:'PUT', body:JSON.stringify(payload) })
        : await api('/orders', { method: 'POST', body: JSON.stringify(payload) });
      state.cart = [];
      state.editingOrderId = null;
      saveCart();
      if(response.tableSession){
        state.tableSession=response.tableSession;
        state.pendingTable=null;
        state.tableDeviceToken=response.tableDeviceToken||state.tableDeviceToken;
        localStorage.setItem('gm-table-link',JSON.stringify({token:state.tableToken,deviceToken:state.tableDeviceToken,pending:false}));
      }
      const trackingToken = response.order.trackingToken || response.order.tracking_token;
      if (trackingToken) {
        sessionStorage.setItem('gm-last-tracking-token', trackingToken);
        window.location.href = `/pedido/acompanhar/${trackingToken}?novo=1`;
      } else {
        closeCheckout();
        await refreshTableSession();
        openMyTab();
        toast('Pedido atualizado', 'As alterações foram salvas e aguardam confirmação.');
      }
    } catch (error) {
      if (error.code === 'PENDING_ORDER_EXISTS') {
        await refreshTableSession();
        closeCheckout();
        openMyTab();
        toast('Pedido pendente', error.message);
      } else {
        showError(errorEl, error.message);
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } finally {
      button.disabled = false;
      button.innerHTML = '<span>Confirmar pedido</span>';
    }
  }

  function trackingTokenFromLocation() {
    const match = window.location.pathname.match(/\/pedido\/acompanhar\/([a-f0-9]{48})/i);
    return match ? match[1].toLowerCase() : '';
  }

  function trackingTimeline(order) {
    const steps = order.fulfillmentMethod === 'table'
      ? [['Recebido',0],['Confirmado',1],['Preparando',2],['Pronto para servir',3],['Entregue na mesa',5]]
      : [
        ['Recebido', 0], ['Confirmado', 1], ['Preparando', 2], ['Pronto', 3],
        [order.fulfillmentMethod === 'pickup' ? 'Aguardando retirada' : 'Saiu para entrega', 4],
        [order.fulfillmentMethod === 'pickup' ? 'Retirado' : 'Entregue', 5],
      ];
    return steps.map(([label, index]) => `
      <div class="timeline-step ${order.progress >= index ? 'done' : ''}">
        <span class="timeline-dot">${order.progress >= index ? '✓' : index + 1}</span>
        <span>${escapeHtml(label)}</span>
      </div>
    `).join('');
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function renderTracking(payload) {
    const order = payload.order;
    const isNew = new URLSearchParams(location.search).get('novo') === '1';
    $('#tracking-card').innerHTML = `
      <div class="tracking-top">
        <div class="status-pill ${order.status === 'cancelled' ? 'closed' : ''}"><span class="status-dot"></span><span>${escapeHtml(order.statusLabel)}</span></div>
        <h1>${isNew ? 'Pedido enviado com sucesso!' : `Pedido #${order.number}`}</h1>
        <p>Olá, ${escapeHtml(order.customerName)}. ${isNew ? `Seu pedido #${order.number} já entrou no painel da equipe.` : `Última atualização em ${formatDate(order.updatedAt)}.`}</p>
      </div>
      <div class="tracking-content">
        ${order.status === 'cancelled' ? `<div class="cancelled-box"><strong>Este pedido foi cancelado.</strong><br>${escapeHtml(order.cancelReason || 'Entre em contato com a equipe para mais informações.')}</div>` : `<div class="timeline">${trackingTimeline(order)}</div>`}
        <div class="order-detail-grid">
          <div class="detail-card"><span>Recebimento</span><strong>${order.fulfillmentMethod === 'pickup' ? `Retirada · ${escapeHtml(payload.branding.pickupAddress || 'consulte a equipe')}` : order.fulfillmentMethod === 'table' ? `Consumo no local · ${escapeHtml(order.tableName || 'mesa vinculada')}` : `Entrega · ${escapeHtml(order.address)}`}</strong></div>
          ${order.fulfillmentMethod === 'table' ? '' : `<div class="detail-card"><span>Pagamento</span><strong>${escapeHtml(order.paymentLabel)}${order.paymentMethod === 'cash' ? (order.needsChange && order.changeFor ? ` · Troco para ${money(order.changeFor)}` : ' · Sem troco') : ''}</strong></div>`}
          <div class="detail-card"><span>Pedido realizado</span><strong>${formatDate(order.createdAt)}</strong></div>
          <div class="detail-card"><span>WhatsApp</span><strong>${order.whatsappReceiptStatus === 'failed' ? 'Pedido salvo; mensagem não confirmada' : 'Atualizações autorizadas'}</strong></div>
        </div>
        <div class="tracking-items">
          <h3>Itens do pedido</h3>
          ${order.items.map((item) => `<div class="tracking-item"><span><strong>${item.quantity}x</strong> ${escapeHtml(item.name)}${item.notes ? `<br><small>${escapeHtml(item.notes)}</small>` : ''}</span><strong>${money(item.unit_price * item.quantity)}</strong></div>`).join('')}
          ${order.deliveryFee > 0 ? `<div class="tracking-item"><span>Taxa de entrega</span><strong>${money(order.deliveryFee)}</strong></div>` : ''}
          <div class="tracking-total"><span>Total</span><strong>${money(order.total)}</strong></div>
        </div>
        ${order.fulfillmentMethod === 'table' && savedTableLink() ? `<div class="tracking-next-actions"><a class="primary-button" href="/pedido/mesa/${savedTableLink().token}">＋ Continuar pedindo</a><a class="secondary-button" href="/pedido/mesa/${savedTableLink().token}?comanda=1">Ver minha comanda</a></div>` : ''}
      </div>`;
  }

  async function loadTracking(token) {
    clearTimeout(state.trackingTimer);
    try {
      const payload = await api(`/orders/${token}`);
      document.documentElement.style.setProperty('--primary', payload.branding.primaryColor || '#1458EA');
      $('#brand-name').textContent = payload.branding.companyName;
      $('#brand-subtitle').textContent = `Pedido #${payload.order.number}`;
      document.title = `Pedido #${payload.order.number} · ${payload.branding.companyName}`;
      renderTracking(payload);
      if (!['delivered', 'picked_up', 'cancelled'].includes(payload.order.status)) {
        state.trackingTimer = setTimeout(() => loadTracking(token), 15000);
      }
    } catch (error) {
      $('#tracking-card').innerHTML = `<div class="tracking-loading"><span style="font-size:40px">⚠️</span><strong>Não encontramos este pedido</strong><span>${escapeHtml(error.message)}</span><a class="primary-button" href="/pedido" style="width:auto;padding:0 22px;text-decoration:none">Voltar ao cardápio</a></div>`;
    }
  }

  function showTrackingPage(token) {
    $('#catalog-page').hidden = true;
    $('#tracking-page').hidden = false;
    $('#mobile-cart-button').hidden = true;
    loadTracking(token);
  }

  function updateMobileViewportInset() {
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight;
    const hiddenBottom = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    document.documentElement.style.setProperty('--gm-visual-bottom', `${Math.round(hiddenBottom)}px`);
    document.documentElement.style.setProperty('--gm-store-height', `${Math.round(height)}px`);
    document.body.classList.toggle('store-keyboard-open', hiddenBottom > 110);
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const add = event.target.closest('[data-add-product]');
      if (add) addProduct(add.dataset.addProduct);
      const minus = event.target.closest('[data-cart-minus]');
      if (minus) changeQuantity(minus.dataset.cartMinus, -1);
      const plus = event.target.closest('[data-cart-plus]');
      if (plus) changeQuantity(plus.dataset.cartPlus, 1);
      const note = event.target.closest('[data-cart-note]');
      if (note) {
        event.preventDefault();
        const field = note.closest('.cart-item')?.querySelector('.cart-note-field');
        if (!field) return;
        const opening = field.classList.contains('hidden');
        field.classList.toggle('hidden', !opening);
        note.classList.toggle('active', opening || Boolean(field.querySelector('textarea')?.value.trim()));
        note.setAttribute('aria-expanded', String(opening));
        if (opening) requestAnimationFrame(()=>field.querySelector('textarea')?.focus());
      }
      const category = event.target.closest('[data-category]');
      if (category) {
        state.category = category.dataset.category;
        renderCategories();
        renderCatalog();
        if (window.matchMedia('(max-width: 980px)').matches) document.querySelector('#catalog-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (event.target.closest('[data-close-checkout]')) closeCheckout();
      if (event.target.closest('[data-close-track]')) $('#track-modal').hidden = true;
      if (event.target.closest('[data-close-my-tab]')) closeMyTab();
      if (event.target.closest('[data-close-table-help]')) closeTableHelp();
      if (event.target.closest('[data-close-lunch]')) closeLunchCustomizer();
    });
    document.addEventListener('input',(event)=>{
      const noteInput=event.target.closest('[data-cart-note-input]');
      if(!noteInput)return;
      const item=state.cart.find((cartItem)=>String(cartItem.cartId)===String(noteInput.dataset.cartNoteInput));
      if(item){item.notes=noteInput.value;saveCart();noteInput.closest('.cart-item').classList.toggle('has-note',Boolean(item.notes.trim()));}
    });
    $('#search-input').addEventListener('input', (event) => { state.query = event.target.value.trim(); renderCatalog(); });
    $('#mobile-cart-button').addEventListener('click', openCart);
    $('#close-cart').addEventListener('click', closeCart);
    $('#cart-backdrop').addEventListener('click', closeCart);
    $('#checkout-button').addEventListener('click', openCheckout);
    $('#checkout-form').addEventListener('submit', submitOrder);
    $('#lunch-form').addEventListener('submit', submitLunchCustomizer);
    $$('input[name="lunchGarnish"]').forEach((input) => input.addEventListener('change', () => {
      const selected = $$('input[name="lunchGarnish"]:checked');
      if (selected.length > 2) input.checked = false;
      $('#lunch-garnish-help').textContent = `${Math.min(2, $$('input[name="lunchGarnish"]:checked').length)} de 2 selecionadas.`;
    }));
    $('#fulfillment-control').addEventListener('change', renderCheckoutSummary);
    $$('input[name="paymentMethod"]').forEach((input) => input.addEventListener('change', updateCashChangeFields));
    $$('input[name="needsChange"]').forEach((input) => input.addEventListener('change', updateCashChangeFields));
    $('[name="phone"]').addEventListener('input', (event) => { event.target.value = phoneMask(event.target.value); });
    $('#track-shortcut').addEventListener('click', (event) => {
      event.preventDefault();
      const last = sessionStorage.getItem('gm-last-tracking-token');
      if (last) window.location.href = `/pedido/acompanhar/${last}`;
      else $('#track-modal').hidden = false;
    });
    $('#confirm-table').addEventListener('click', confirmTableLink);
    $('#table-help').addEventListener('click', openTableHelp);
    $('#request-bill').addEventListener('click', () => sendTableRequest('bill'));
    $('#my-tab').addEventListener('click', openMyTab);
    $('#open-lunch-category').addEventListener('click', () => {
      state.category = 'Marmitex - Almoço';
      state.query = '';
      $('#search-input').value = '';
      renderCategories();
      renderCatalog();
      document.querySelector('#catalog-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $$('[data-table-request]').forEach((button)=>button.addEventListener('click',()=>sendTableRequest(button.dataset.tableRequest,$('#table-help-message').value.trim())));
    window.addEventListener('resize',()=>{ updateMobileViewportInset(); if (window.innerWidth > 1180 && !(matchMedia('(hover:none) and (pointer:coarse)').matches)) closeCart(); }, { passive:true });
    window.visualViewport?.addEventListener('resize',updateMobileViewportInset,{passive:true});
    window.visualViewport?.addEventListener('scroll',updateMobileViewportInset,{passive:true});
    $('#track-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const token = new FormData(event.currentTarget).get('token').trim().toLowerCase();
      if (!/^[a-f0-9]{48}$/.test(token)) return showError($('#track-error'), 'Cole o código completo recebido no link de acompanhamento.');
      window.location.href = `/pedido/acompanhar/${token}`;
    });
  }

  async function init() {
    updateMobileViewportInset();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});
    bindEvents();
    const token = trackingTokenFromLocation();
    if (token) {
      $('#loading-screen').hidden = true;
      $('#app').hidden = false;
      showTrackingPage(token);
      return;
    }
    try {
      await refreshStoreState({ render: false });
      try { await loadTableContext(); } catch (error) {
        if (tableTokenFromLocation()) throw error;
        localStorage.removeItem('gm-table-link');
      }
      const checkoutToken = checkoutTokenFromLocation();
      if (checkoutToken) {
        try {
          const linked = await api(`/checkout/${checkoutToken}`);
          applyLinkedCheckout(linked.checkout);
        } catch (error) {
          state.checkoutToken = '';
          toast('Link do WhatsApp inválido', error.message);
        }
      }
      applyBranding();
      renderCategories();
      renderCatalog();
      renderCart();
      $('#loading-screen').hidden = true;
      $('#app').hidden = false;
      if (state.checkoutSession && state.cart.length) {
        setTimeout(() => openCheckout(), 80);
      } else if (state.tableSession && new URLSearchParams(location.search).get('comanda') === '1') {
        setTimeout(() => openMyTab(), 80);
      }
    } catch (error) {
      $('#loading-screen').innerHTML = `<span style="font-size:42px">⚠️</span><strong>Não foi possível abrir o cardápio</strong><span>${escapeHtml(error.message)}</span><button class="primary-button" style="width:auto;padding:0 22px" onclick="location.reload()">Tentar novamente</button>`;
    }
  }

  setInterval(() => {
    if (document.hidden) return;
    refreshStoreState({ render: true }).catch(() => {});
  }, 30000);

  init();
})();
