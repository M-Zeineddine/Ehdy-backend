const state = {
  token: localStorage.getItem('ehdy_admin_token') || '',
  admin: null,
  dashboard: null,
  reference: { categories: [], merchants: [] },
  collections: {
    users: [],
    merchants: [],
    items: [],
    credits: [],
    gifts: [],
    purchases: [],
  },
  pagination: {
    users: { page: 1, pages: 1, total: 0 },
    merchants: { page: 1, pages: 1, total: 0 },
    items: { page: 1, pages: 1, total: 0 },
    credits: { page: 1, pages: 1, total: 0 },
    gifts: { page: 1, pages: 1, total: 0 },
    purchases: { page: 1, pages: 1, total: 0 },
  },
};

const els = {
  notice: document.getElementById('notice'),
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  setupPanel: document.getElementById('setupPanel'),
  loginPanel: document.getElementById('loginPanel'),
  setupForm: document.getElementById('setupForm'),
  loginForm: document.getElementById('loginForm'),
  adminIdentity: document.getElementById('adminIdentity'),
  overviewMetrics: document.getElementById('overviewMetrics'),
  trendChart: document.getElementById('trendChart'),
  topMerchantsList: document.getElementById('topMerchantsList'),
  recentUsersList: document.getElementById('recentUsersList'),
  recentGiftsList: document.getElementById('recentGiftsList'),
  usersTable: document.getElementById('usersTable'),
  merchantsTable: document.getElementById('merchantsTable'),
  itemsTable: document.getElementById('itemsTable'),
  creditsTable: document.getElementById('creditsTable'),
  giftsTable: document.getElementById('giftsTable'),
  purchasesTable: document.getElementById('purchasesTable'),
  merchantForm: document.getElementById('merchantForm'),
  itemForm: document.getElementById('itemForm'),
  creditForm: document.getElementById('creditForm'),
  merchantCategory: document.getElementById('merchantCategory'),
  itemMerchant: document.getElementById('itemMerchant'),
  creditMerchant: document.getElementById('creditMerchant'),
  refreshAllButton: document.getElementById('refreshAllButton'),
  logoutButton: document.getElementById('logoutButton'),
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) {return '-';}
  return new Date(value).toLocaleString();
}

function formatCurrency(value, currency = 'USD') {
  const amount = Number(value || 0);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (_err) {
    return `${amount.toFixed(2)} ${currency || ''}`.trim();
  }
}

function showNotice(message, type = 'info') {
  els.notice.textContent = message;
  els.notice.className = `notice ${type === 'error' ? 'error' : ''}`.trim();
  els.notice.hidden = false;
  clearTimeout(showNotice.timeout);
  showNotice.timeout = setTimeout(() => {
    els.notice.hidden = true;
  }, 3600);
}

async function apiRequest(path, options = {}, needsAuth = true) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (needsAuth && state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.success === false) {
    if (response.status === 401 && needsAuth) {
      logout();
    }
    throw new Error(payload?.error?.message || 'Request failed');
  }

  return payload;
}

function setAuthState(isAuthenticated) {
  els.authView.hidden = isAuthenticated;
  els.appView.hidden = !isAuthenticated;
}

function renderIdentity() {
  if (!state.admin) {
    els.adminIdentity.innerHTML = '';
    return;
  }
  const name = [state.admin.first_name, state.admin.last_name].filter(Boolean).join(' ') || state.admin.email;
  els.adminIdentity.innerHTML = `
    <strong>${escapeHtml(name)}</strong>
    <span>${escapeHtml(state.admin.role)} - ${escapeHtml(state.admin.email)}</span>
  `;
}

function serializeForm(form) {
  const data = {};
  for (const element of form.elements) {
    if (!element.name) {continue;}
    if (element.type === 'checkbox') {
      data[element.name] = element.checked;
      continue;
    }
    data[element.name] = element.value.trim();
  }
  return data;
}

function setFormValues(form, values = {}) {
  for (const element of form.elements) {
    if (!element.name) {continue;}
    if (element.type === 'checkbox') {
      element.checked = Boolean(values[element.name]);
    } else {
      element.value = values[element.name] ?? '';
    }
  }
}

function renderStatusPill(label, tone) {
  return `<span class="status-pill status-${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
}

function renderPagination(target) {
  const info = state.pagination[target];
  return `
    <div class="pagination-row">
      <span class="muted">Page ${info.page} of ${info.pages} - ${info.total} total</span>
      <div class="row-actions">
        <button class="mini-button" data-page-target="${target}" data-page-direction="prev" ${info.page <= 1 ? 'disabled' : ''}>Previous</button>
        <button class="mini-button" data-page-target="${target}" data-page-direction="next" ${info.page >= info.pages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
}

function renderOverview() {
  const totals = state.dashboard?.totals;
  if (!totals) {
    els.overviewMetrics.innerHTML = '';
    return;
  }

  const metrics = [
    ['Users', totals.total_users, `${totals.active_users} active - ${totals.disabled_users} disabled`],
    ['Merchants', totals.total_merchants, `${totals.active_merchants} active - ${totals.featured_merchants} featured`],
    ['Catalog items', totals.total_items, `${totals.active_items} active now`],
    ['Store credit', totals.total_store_credits, `${totals.active_store_credits} active presets`],
    ['Gifts', totals.total_gifts, `${totals.paid_gifts} paid - ${totals.pending_gifts} pending`],
    ['Claims', totals.claimed_gifts, `${Math.max(totals.paid_gifts - totals.claimed_gifts, 0)} still unclaimed`],
    ['Purchases', totals.purchase_count, `Processed volume ${formatCurrency(totals.purchase_volume, 'USD')}`],
    ['Failures', totals.failed_gifts, 'Gift sends that need attention'],
  ];

  els.overviewMetrics.innerHTML = metrics
    .map(
      ([label, value, sub]) => `
        <article class="metric-card">
          <p>${escapeHtml(label)}</p>
          <strong>${escapeHtml(value)}</strong>
          <span>${escapeHtml(sub)}</span>
        </article>
      `
    )
    .join('');

  const trend = state.dashboard.gift_trend || [];
  const maxCount = Math.max(...trend.map(item => Number(item.gift_count || 0)), 1);
  els.trendChart.innerHTML = trend
    .map(item => {
      const count = Number(item.gift_count || 0);
      const height = Math.max(10, Math.round((count / maxCount) * 160));
      return `
        <div class="trend-bar">
          <span class="trend-bar-value">${count}</span>
          <div class="trend-bar-fill" style="height:${height}px"></div>
          <span class="trend-bar-label">${escapeHtml(item.day.slice(5))}</span>
        </div>
      `;
    })
    .join('');

  els.topMerchantsList.innerHTML = (state.dashboard.top_merchants || [])
    .map(
      row => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(row.merchant_name || 'Unknown merchant')}</strong>
            <span>${escapeHtml(row.merchant_id || '')}</span>
          </div>
          ${renderStatusPill(`${row.gift_count} gifts`, 'paid')}
        </div>
      `
    )
    .join('');

  els.recentUsersList.innerHTML = (state.dashboard.recent_users || [])
    .map(
      row => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml([row.first_name, row.last_name].filter(Boolean).join(' ') || row.email)}</strong>
            <span>${escapeHtml(row.email)}</span>
          </div>
          <span>${escapeHtml(formatDate(row.created_at))}</span>
        </div>
      `
    )
    .join('');

  els.recentGiftsList.innerHTML = (state.dashboard.recent_gifts || [])
    .map(
      row => `
        <div class="list-row">
          <div>
            <strong>${escapeHtml(row.gift_label || 'Gift')}</strong>
            <span>${escapeHtml(row.sender_label || 'Unknown sender')} -> ${escapeHtml(row.recipient_name || 'Pending recipient')}</span>
          </div>
          ${renderStatusPill(row.payment_status, row.payment_status)}
        </div>
      `
    )
    .join('');
}

function renderUsersTable() {
  const rows = state.collections.users;
  if (!rows.length) {
    els.usersTable.innerHTML = '<div class="empty-state">No users matched this filter.</div>';
    return;
  }

  els.usersTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Verification</th>
          <th>Activity</th>
          <th>Spend</th>
          <th>Created</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>
                  <div class="cell-stack">
                    <strong>${escapeHtml([row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed user')}</strong>
                    <small>${escapeHtml(row.email)}</small>
                    <small>${escapeHtml(row.phone || 'No phone')}</small>
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    ${renderStatusPill(row.deleted_at ? 'Disabled' : 'Active', row.deleted_at ? 'disabled' : 'active')}
                    ${renderStatusPill(row.is_email_verified ? 'Email verified' : 'Email pending', row.is_email_verified ? 'verified' : 'pending')}
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    <small>${row.purchase_count} purchases</small>
                    <small>${row.wallet_count} wallet items</small>
                    <small>${row.gifts_sent_count} gifts sent</small>
                  </div>
                </td>
                <td>${formatCurrency(row.total_spent, row.currency_code || 'USD')}</td>
                <td>${escapeHtml(formatDate(row.created_at))}</td>
                <td>
                  <div class="row-actions">
                    <button class="mini-button ${row.deleted_at ? 'good' : 'warn'}" data-action="toggle-user" data-id="${row.id}">
                      ${row.deleted_at ? 'Reactivate' : 'Disable'}
                    </button>
                  </div>
                </td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    ${renderPagination('users')}
  `;
}

function renderMerchantsTable() {
  const rows = state.collections.merchants;
  if (!rows.length) {
    els.merchantsTable.innerHTML = '<div class="empty-state">No merchants matched this filter.</div>';
    return;
  }

  els.merchantsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Merchant</th>
          <th>Category</th>
          <th>Inventory</th>
          <th>Visibility</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>
                  <div class="cell-stack">
                    <strong>${escapeHtml(row.name)}</strong>
                    <small>${escapeHtml(row.slug || 'No slug')}</small>
                    <small>${escapeHtml(row.contact_email || 'No contact email')}</small>
                  </div>
                </td>
                <td>${escapeHtml(row.category_name)}</td>
                <td>
                  <div class="cell-stack">
                    <small>${row.item_count} gift items</small>
                    <small>${row.store_credit_count} store-credit presets</small>
                    <small>${row.paid_gift_count} paid gifts</small>
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    ${renderStatusPill(row.is_active ? 'Active' : 'Inactive', row.is_active ? 'active' : 'inactive')}
                    ${renderStatusPill(row.is_verified ? 'Verified' : 'Unverified', row.is_verified ? 'verified' : 'pending')}
                    ${renderStatusPill(row.is_featured ? 'Featured' : 'Standard', row.is_featured ? 'paid' : 'pending')}
                  </div>
                </td>
                <td>${escapeHtml(formatDate(row.created_at))}</td>
                <td>
                  <div class="row-actions">
                    <button class="mini-button" data-action="edit-merchant" data-id="${row.id}">Edit</button>
                    <button class="mini-button ${row.is_active ? 'warn' : 'good'}" data-action="toggle-merchant-active" data-id="${row.id}">
                      ${row.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="mini-button" data-action="toggle-merchant-verified" data-id="${row.id}">
                      ${row.is_verified ? 'Unverify' : 'Verify'}
                    </button>
                    <button class="mini-button" data-action="toggle-merchant-featured" data-id="${row.id}">
                      ${row.is_featured ? 'Unfeature' : 'Feature'}
                    </button>
                  </div>
                </td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    ${renderPagination('merchants')}
  `;
}

function renderItemsTable() {
  const rows = state.collections.items;
  if (!rows.length) {
    els.itemsTable.innerHTML = '<div class="empty-state">No gift items matched this filter.</div>';
    return;
  }

  els.itemsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Merchant</th>
          <th>Price</th>
          <th>Paid gifts</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>
                  <div class="cell-stack">
                    <strong>${escapeHtml(row.name)}</strong>
                    <small>${escapeHtml(row.item_sku || 'No SKU')}</small>
                    <small>${escapeHtml(row.description || 'No description')}</small>
                  </div>
                </td>
                <td>${escapeHtml(row.merchant_name)}</td>
                <td>${formatCurrency(row.price, row.currency_code)}</td>
                <td>${row.paid_gift_count}</td>
                <td>${renderStatusPill(row.is_active ? 'Active' : 'Inactive', row.is_active ? 'active' : 'inactive')}</td>
                <td>
                  <div class="row-actions">
                    <button class="mini-button" data-action="edit-item" data-id="${row.id}">Edit</button>
                    <button class="mini-button ${row.is_active ? 'warn' : 'good'}" data-action="toggle-item" data-id="${row.id}">
                      ${row.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    ${renderPagination('items')}
  `;
}

function renderCreditsTable() {
  const rows = state.collections.credits;
  if (!rows.length) {
    els.creditsTable.innerHTML = '<div class="empty-state">No store-credit presets matched this filter.</div>';
    return;
  }

  els.creditsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Preset</th>
          <th>Merchant</th>
          <th>Paid gifts</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>${formatCurrency(row.amount, row.currency_code)}</td>
                <td>${escapeHtml(row.merchant_name)}</td>
                <td>${row.paid_gift_count}</td>
                <td>${renderStatusPill(row.is_active ? 'Active' : 'Inactive', row.is_active ? 'active' : 'inactive')}</td>
                <td>${escapeHtml(formatDate(row.created_at))}</td>
                <td>
                  <div class="row-actions">
                    <button class="mini-button" data-action="edit-credit" data-id="${row.id}">Edit</button>
                    <button class="mini-button ${row.is_active ? 'warn' : 'good'}" data-action="toggle-credit" data-id="${row.id}">
                      ${row.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    ${renderPagination('credits')}
  `;
}

function renderGiftsTable() {
  const rows = state.collections.gifts;
  if (!rows.length) {
    els.giftsTable.innerHTML = '<div class="empty-state">No gifts matched this filter.</div>';
    return;
  }

  els.giftsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Gift</th>
          <th>Sender / recipient</th>
          <th>Merchant</th>
          <th>Payment</th>
          <th>Claim</th>
          <th>Sent</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>
                  <div class="cell-stack">
                    <strong>${escapeHtml(row.gift_label || 'Gift')}</strong>
                    <small>${escapeHtml(row.theme || 'No theme')}</small>
                    <small>${escapeHtml(row.redemption_code || 'No redemption code yet')}</small>
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    <small>${escapeHtml(row.sender_label || row.sender_name || 'Unknown sender')}</small>
                    <small>${escapeHtml(row.recipient_label || row.recipient_name || row.recipient_phone || 'Pending recipient')}</small>
                  </div>
                </td>
                <td>${escapeHtml(row.merchant_name || 'Unknown merchant')}</td>
                <td>${renderStatusPill(row.payment_status, row.payment_status)}</td>
                <td>
                  <div class="cell-stack">
                    ${renderStatusPill(row.is_claimed ? 'Claimed' : 'Unclaimed', row.is_claimed ? 'claimed' : 'unclaimed')}
                    <small>${row.current_balance === null ? 'No remaining balance field' : formatCurrency(row.current_balance, 'USD')}</small>
                  </div>
                </td>
                <td>${escapeHtml(formatDate(row.sent_at))}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    ${renderPagination('gifts')}
  `;
}

function renderPurchasesTable() {
  const rows = state.collections.purchases;
  if (!rows.length) {
    els.purchasesTable.innerHTML = '<div class="empty-state">No purchases matched this filter.</div>';
    return;
  }

  els.purchasesTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Purchase</th>
          <th>Buyer</th>
          <th>Items</th>
          <th>Total</th>
          <th>Status</th>
          <th>Purchased</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            row => `
              <tr>
                <td>
                  <div class="cell-stack">
                    <strong>${escapeHtml(row.id)}</strong>
                    <small>${escapeHtml(row.stripe_payment_intent_id || 'No payment intent')}</small>
                  </div>
                </td>
                <td>
                  <div class="cell-stack">
                    <strong>${escapeHtml([row.first_name, row.last_name].filter(Boolean).join(' ') || row.email)}</strong>
                    <small>${escapeHtml(row.email)}</small>
                  </div>
                </td>
                <td>${row.item_count}</td>
                <td>${formatCurrency(row.total_amount, row.currency_code)}</td>
                <td>${renderStatusPill(row.payment_status, row.payment_status)}</td>
                <td>${escapeHtml(formatDate(row.purchased_at))}</td>
              </tr>
            `
          )
          .join('')}
      </tbody>
    </table>
    ${renderPagination('purchases')}
  `;
}

function populateSelect(select, rows, placeholder) {
  select.innerHTML = [`<option value="">${escapeHtml(placeholder)}</option>`]
    .concat(rows.map(row => `<option value="${row.id}">${escapeHtml(row.name)}</option>`))
    .join('');
}

function populateCategorySelect() {
  els.merchantCategory.innerHTML = state.reference.categories
    .map(row => `<option value="${row.id}">${escapeHtml(row.name)}</option>`)
    .join('');
}

function fillMerchantForm(id) {
  const merchant = state.collections.merchants.find(row => row.id === id);
  if (!merchant) {return;}
  setFormValues(els.merchantForm, merchant);
  showPanel('merchants');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillItemForm(id) {
  const item = state.collections.items.find(row => row.id === id);
  if (!item) {return;}
  setFormValues(els.itemForm, item);
  showPanel('items');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function fillCreditForm(id) {
  const credit = state.collections.credits.find(row => row.id === id);
  if (!credit) {return;}
  setFormValues(els.creditForm, credit);
  showPanel('credits');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showPanel(target) {
  document.querySelectorAll('.content-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${target}`);
  });
  document.querySelectorAll('.nav-item').forEach(button => {
    button.classList.toggle('active', button.dataset.navTarget === target);
  });
}

async function loadSetupStatus() {
  const payload = await apiRequest('/v1/admin/auth/setup-status', {}, false);
  els.setupPanel.hidden = !payload.data.needs_setup;
  els.loginPanel.hidden = payload.data.needs_setup;
}

async function loadAdminProfile() {
  const payload = await apiRequest('/v1/admin/me');
  state.admin = payload.data.admin_user;
  renderIdentity();
}

async function loadOverview() {
  const payload = await apiRequest('/v1/admin/dashboard');
  state.dashboard = payload.data;
  renderOverview();
}

async function loadReferenceData() {
  const payload = await apiRequest('/v1/admin/reference-data');
  state.reference = payload.data;
  populateCategorySelect();
  populateSelect(els.itemMerchant, state.reference.merchants, 'Select merchant');
  populateSelect(els.creditMerchant, state.reference.merchants, 'Select merchant');
}

async function loadUsers() {
  const search = document.getElementById('usersSearch').value.trim();
  const status = document.getElementById('usersStatus').value;
  const page = state.pagination.users.page;
  const params = new URLSearchParams({ page, limit: 12 });
  if (search) {params.set('search', search);}
  if (status) {params.set('status', status);}
  const payload = await apiRequest(`/v1/admin/users?${params.toString()}`);
  state.collections.users = payload.data;
  state.pagination.users = payload.pagination;
  renderUsersTable();
}

async function loadMerchants() {
  const search = document.getElementById('merchantsSearch').value.trim();
  const status = document.getElementById('merchantsStatus').value;
  const page = state.pagination.merchants.page;
  const params = new URLSearchParams({ page, limit: 10 });
  if (search) {params.set('search', search);}
  if (status) {params.set('status', status);}
  const payload = await apiRequest(`/v1/admin/merchants?${params.toString()}`);
  state.collections.merchants = payload.data;
  state.pagination.merchants = payload.pagination;
  renderMerchantsTable();
}

async function loadItems() {
  const search = document.getElementById('itemsSearch').value.trim();
  const status = document.getElementById('itemsStatus').value;
  const page = state.pagination.items.page;
  const params = new URLSearchParams({ page, limit: 10 });
  if (search) {params.set('search', search);}
  if (status) {params.set('status', status);}
  const payload = await apiRequest(`/v1/admin/items?${params.toString()}`);
  state.collections.items = payload.data;
  state.pagination.items = payload.pagination;
  renderItemsTable();
}

async function loadCredits() {
  const search = document.getElementById('creditsSearch').value.trim();
  const status = document.getElementById('creditsStatus').value;
  const page = state.pagination.credits.page;
  const params = new URLSearchParams({ page, limit: 10 });
  if (search) {params.set('search', search);}
  if (status) {params.set('status', status);}
  const payload = await apiRequest(`/v1/admin/store-credits?${params.toString()}`);
  state.collections.credits = payload.data;
  state.pagination.credits = payload.pagination;
  renderCreditsTable();
}

async function loadGifts() {
  const search = document.getElementById('giftsSearch').value.trim();
  const paymentStatus = document.getElementById('giftsStatus').value;
  const page = state.pagination.gifts.page;
  const params = new URLSearchParams({ page, limit: 12 });
  if (search) {params.set('search', search);}
  if (paymentStatus) {params.set('payment_status', paymentStatus);}
  const payload = await apiRequest(`/v1/admin/gifts?${params.toString()}`);
  state.collections.gifts = payload.data;
  state.pagination.gifts = payload.pagination;
  renderGiftsTable();
}

async function loadPurchases() {
  const search = document.getElementById('purchasesSearch').value.trim();
  const status = document.getElementById('purchasesStatus').value;
  const page = state.pagination.purchases.page;
  const params = new URLSearchParams({ page, limit: 12 });
  if (search) {params.set('search', search);}
  if (status) {params.set('status', status);}
  const payload = await apiRequest(`/v1/admin/purchases?${params.toString()}`);
  state.collections.purchases = payload.data;
  state.pagination.purchases = payload.pagination;
  renderPurchasesTable();
}

async function refreshAll() {
  await loadReferenceData();
  await Promise.all([
    loadOverview(),
    loadUsers(),
    loadMerchants(),
    loadItems(),
    loadCredits(),
    loadGifts(),
    loadPurchases(),
  ]);
}

function persistToken(token) {
  state.token = token;
  localStorage.setItem('ehdy_admin_token', token);
}

function resetPagination(target) {
  state.pagination[target].page = 1;
}

async function handleSetup(event) {
  event.preventDefault();
  const payload = serializeForm(els.setupForm);
  const response = await apiRequest(
    '/v1/admin/auth/setup',
    { method: 'POST', body: JSON.stringify(payload) },
    false
  );
  persistToken(response.data.access_token);
  state.admin = response.data.admin_user;
  setAuthState(true);
  renderIdentity();
  await refreshAll();
  showNotice('Owner account created. The CMS is ready.');
}

async function handleLogin(event) {
  event.preventDefault();
  const payload = serializeForm(els.loginForm);
  const response = await apiRequest(
    '/v1/admin/auth/login',
    { method: 'POST', body: JSON.stringify(payload) },
    false
  );
  persistToken(response.data.access_token);
  state.admin = response.data.admin_user;
  setAuthState(true);
  renderIdentity();
  await refreshAll();
  showNotice('Signed in to Ehdy CMS.');
}

async function handleMerchantSubmit(event) {
  event.preventDefault();
  const data = serializeForm(els.merchantForm);
  const id = data.id;
  delete data.id;
  const method = id ? 'PUT' : 'POST';
  const path = id ? `/v1/admin/merchants/${id}` : '/v1/admin/merchants';
  const response = await apiRequest(path, { method, body: JSON.stringify(data) });
  els.merchantForm.reset();
  setFormValues(els.merchantForm, { is_active: true, is_verified: false, is_featured: false });
  await Promise.all([loadMerchants(), loadReferenceData(), loadOverview()]);
  showNotice(response.message || 'Merchant saved.');
}

async function handleItemSubmit(event) {
  event.preventDefault();
  const data = serializeForm(els.itemForm);
  const id = data.id;
  delete data.id;
  const method = id ? 'PUT' : 'POST';
  const path = id ? `/v1/admin/items/${id}` : '/v1/admin/items';
  const response = await apiRequest(path, { method, body: JSON.stringify(data) });
  els.itemForm.reset();
  setFormValues(els.itemForm, { is_active: true, currency_code: 'USD' });
  await Promise.all([loadItems(), loadOverview()]);
  showNotice(response.message || 'Item saved.');
}

async function handleCreditSubmit(event) {
  event.preventDefault();
  const data = serializeForm(els.creditForm);
  const id = data.id;
  delete data.id;
  const method = id ? 'PUT' : 'POST';
  const path = id ? `/v1/admin/store-credits/${id}` : '/v1/admin/store-credits';
  const response = await apiRequest(path, { method, body: JSON.stringify(data) });
  els.creditForm.reset();
  setFormValues(els.creditForm, { is_active: true, currency_code: 'USD' });
  await Promise.all([loadCredits(), loadOverview()]);
  showNotice(response.message || 'Store-credit preset saved.');
}

function logout() {
  localStorage.removeItem('ehdy_admin_token');
  state.token = '';
  state.admin = null;
  setAuthState(false);
  loadSetupStatus().catch(() => {
    els.loginPanel.hidden = false;
    els.setupPanel.hidden = true;
  });
}

async function toggleUser(id) {
  const row = state.collections.users.find(item => item.id === id);
  if (!row) {return;}
  await apiRequest(`/v1/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: Boolean(row.deleted_at) }),
  });
  await Promise.all([loadUsers(), loadOverview()]);
}

async function toggleMerchantField(id, field) {
  const row = state.collections.merchants.find(item => item.id === id);
  if (!row) {return;}
  await apiRequest(`/v1/admin/merchants/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ [field]: !row[field] }),
  });
  await Promise.all([loadMerchants(), loadOverview()]);
}

async function toggleItem(id) {
  const row = state.collections.items.find(item => item.id === id);
  if (!row) {return;}
  await apiRequest(`/v1/admin/items/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !row.is_active }),
  });
  await Promise.all([loadItems(), loadOverview()]);
}

async function toggleCredit(id) {
  const row = state.collections.credits.find(item => item.id === id);
  if (!row) {return;}
  await apiRequest(`/v1/admin/store-credits/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: !row.is_active }),
  });
  await Promise.all([loadCredits(), loadOverview()]);
}

async function changePage(target, direction) {
  const pagination = state.pagination[target];
  const nextPage = direction === 'next' ? pagination.page + 1 : pagination.page - 1;
  if (nextPage < 1 || nextPage > pagination.pages) {return;}
  pagination.page = nextPage;
  const loaders = {
    users: loadUsers,
    merchants: loadMerchants,
    items: loadItems,
    credits: loadCredits,
    gifts: loadGifts,
    purchases: loadPurchases,
  };
  await loaders[target]();
}

function bindEvents() {
  els.setupForm.addEventListener('submit', event => {
    handleSetup(event).catch(err => showNotice(err.message, 'error'));
  });

  els.loginForm.addEventListener('submit', event => {
    handleLogin(event).catch(err => showNotice(err.message, 'error'));
  });

  els.merchantForm.addEventListener('submit', event => {
    handleMerchantSubmit(event).catch(err => showNotice(err.message, 'error'));
  });

  els.itemForm.addEventListener('submit', event => {
    handleItemSubmit(event).catch(err => showNotice(err.message, 'error'));
  });

  els.creditForm.addEventListener('submit', event => {
    handleCreditSubmit(event).catch(err => showNotice(err.message, 'error'));
  });

  document.getElementById('merchantResetButton').addEventListener('click', () => {
    els.merchantForm.reset();
    setFormValues(els.merchantForm, { is_active: true, is_verified: false, is_featured: false });
  });

  document.getElementById('itemResetButton').addEventListener('click', () => {
    els.itemForm.reset();
    setFormValues(els.itemForm, { is_active: true, currency_code: 'USD' });
  });

  document.getElementById('creditResetButton').addEventListener('click', () => {
    els.creditForm.reset();
    setFormValues(els.creditForm, { is_active: true, currency_code: 'USD' });
  });

  document.querySelectorAll('[data-nav-target]').forEach(button => {
    button.addEventListener('click', () => showPanel(button.dataset.navTarget));
  });

  document.querySelectorAll('[data-load-target]').forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.loadTarget;
      resetPagination(target);
      const loaders = {
        users: loadUsers,
        merchants: loadMerchants,
        items: loadItems,
        credits: loadCredits,
        gifts: loadGifts,
        purchases: loadPurchases,
      };
      loaders[target]().catch(err => showNotice(err.message, 'error'));
    });
  });

  els.refreshAllButton.addEventListener('click', () => {
    refreshAll().catch(err => showNotice(err.message, 'error'));
  });

  els.logoutButton.addEventListener('click', logout);

  document.addEventListener('click', event => {
    const actionButton = event.target.closest('[data-action], [data-page-target]');
    if (!actionButton) {return;}

    if (actionButton.dataset.pageTarget) {
      changePage(actionButton.dataset.pageTarget, actionButton.dataset.pageDirection).catch(err => showNotice(err.message, 'error'));
      return;
    }

    const { action, id } = actionButton.dataset;
    const handlers = {
      'toggle-user': () => toggleUser(id),
      'edit-merchant': () => Promise.resolve(fillMerchantForm(id)),
      'toggle-merchant-active': () => toggleMerchantField(id, 'is_active'),
      'toggle-merchant-verified': () => toggleMerchantField(id, 'is_verified'),
      'toggle-merchant-featured': () => toggleMerchantField(id, 'is_featured'),
      'edit-item': () => Promise.resolve(fillItemForm(id)),
      'toggle-item': () => toggleItem(id),
      'edit-credit': () => Promise.resolve(fillCreditForm(id)),
      'toggle-credit': () => toggleCredit(id),
    };

    if (handlers[action]) {
      handlers[action]().catch(err => showNotice(err.message, 'error'));
    }
  });
}

async function bootstrap() {
  bindEvents();

  if (state.token) {
    try {
      await loadAdminProfile();
      setAuthState(true);
      renderIdentity();
      await refreshAll();
      return;
    } catch (_err) {
      logout();
    }
  }

  setAuthState(false);
  await loadSetupStatus();
}

bootstrap().catch(err => showNotice(err.message, 'error'));
