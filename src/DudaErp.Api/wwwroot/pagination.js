const listPages = {};
const pagedListDefinitions = {
  orders: { label: 'Pedidos', permission: 'orders.commercial', render: () => renderOrders() },
  customers: { label: 'Clientes', permission: 'customers.read', render: () => renderCustomersList() },
  products: { label: 'Produtos', permission: 'products.read', render: () => renderProductsList() },
  sellers: { label: 'Vendedores', permission: 'sellers.read', render: () => renderSellersList() },
  regions: { label: 'Regiões', permission: 'regions.read', render: () => renderRegionsList() },
  vehicles: { label: 'Veículos', permission: 'vehicles.read', render: () => renderVehiclesList() },
  users: { label: 'Usuários', permission: 'users.manage', render: () => renderUsers() }
};
const orderListFilters = { status: '#orderStatusFilter', approved: '#orderApprovalFilter', delivered: '#orderDeliveryFilter' };

function listPage(key) {
  return listPages[key] ??= { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1, search: '', generation: 0, loading: false };
}

function listRows(key) { return listPage(key).items; }

function listCount(key) {
  const page = listPage(key);
  if (page.loading) return 'Buscando…';
  if (page.error) return 'Falha ao carregar';
  if (!page.total) return '0 registros';
  return `${(page.page - 1) * 20 + 1}–${Math.min(page.page * 20, page.total)} de ${page.total}`;
}

function renderPagination(key) {
  const page = listPage(key), container = $(`#${key}List`);
  if (!container) return;
  let nav = $(`#${key}Pagination`);
  if (!nav) {
    nav = document.createElement('nav'); nav.id = `${key}Pagination`; nav.className = 'list-pagination';
    nav.setAttribute('aria-label', `Paginação: ${pagedListDefinitions[key].label}`);
    container.after(nav);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-list-page]');
      if (button && !button.disabled) refreshList(key, Number(button.dataset.listPage)).catch(error => toast(error.message));
    });
  }
  container.setAttribute('aria-busy', String(page.loading));
  nav.innerHTML = `<span role="status" aria-live="polite">${page.error ? 'Não foi possível carregar a lista.' : `${listCount(key)} · 20 por página`}</span><div>
    <button type="button" data-list-page="${page.error ? page.page : page.page - 1}" ${page.loading || (!page.error && page.page <= 1) ? 'disabled' : ''}>${page.error ? 'Tentar novamente' : 'Anterior'}</button>
    <span>Página ${page.page} de ${page.totalPages}</span>
    <button type="button" data-list-page="${page.page + 1}" ${page.loading || page.error || page.page >= page.totalPages ? 'disabled' : ''}>Próxima</button></div>`;
}

async function refreshList(key, requestedPage = listPage(key).page) {
  const definition = pagedListDefinitions[key];
  if (!definition || !hasPermission(definition.permission)) return;
  const page = listPage(key), generation = ++page.generation;
  const session = typeof authGeneration === 'undefined' ? accessToken : authGeneration;
  const sameSession = () => session === (typeof authGeneration === 'undefined' ? accessToken : authGeneration);
  page.page = requestedPage; page.loading = true; page.error = false;
  renderPagination(key);
  const query = new URLSearchParams({ page: String(requestedPage), pageSize: '20', search: page.search });
  if (key === 'orders') {
    for (const [name, selector] of Object.entries(orderListFilters)) {
      const value = $(selector)?.value;
      if (value) query.set(name, value);
    }
  }
  try {
    const result = await api(`/api/lists/${key}?${query}`);
    if (generation !== page.generation || !sameSession()) return;
    Object.assign(page, { items: result.items, total: result.total, page: result.page, totalPages: result.totalPages });
    // Cache separado da página: editar uma linha continua encontrando o registro.
    if (key === 'users') state.users = result.items;
    else {
      const cache = new Map(state[key].map(item => [item.id, item]));
      result.items.forEach(item => cache.set(item.id, item)); state[key] = [...cache.values()];
    }
  } catch (error) {
    if (generation !== page.generation || !sameSession()) return;
    page.items = []; page.error = true;
    throw error;
  } finally {
    if (generation === page.generation && sameSession()) {
      page.loading = false; definition.render(); renderPagination(key);
    }
  }
}

function refreshVisibleList() {
  const key = $('.view.active')?.id;
  return pagedListDefinitions[key] ? refreshList(key) : Promise.resolve();
}

function wireListPagination() {
  for (const key of Object.keys(pagedListDefinitions)) {
    const input = key === 'orders' ? $('#orderSearch') : key === 'users' ? $('#userSearch') : $(`[data-filter='${key}']`);
    input.type = 'search'; input.maxLength = 200;
    input.setAttribute('aria-label', `Buscar: ${pagedListDefinitions[key].label}`);
    input.addEventListener('input', () => {
      const page = listPage(key);
      clearTimeout(page.timer); page.generation++; page.search = input.value.trim(); page.page = 1; page.loading = true;
      renderPagination(key);
      page.timer = setTimeout(() => refreshList(key, 1).catch(error => toast(error.message)), 300);
    });
  }
}

function clearListPagination() {
  for (const [key, page] of Object.entries(listPages)) {
    clearTimeout(page.timer); page.generation++; page.items = []; page.total = 0; page.page = 1;
    page.totalPages = 1; page.search = ''; page.error = false; page.loading = false;
    const input = key === 'orders' ? $('#orderSearch') : key === 'users' ? $('#userSearch') : $(`[data-filter='${key}']`);
    if (input) input.value = '';
    if (key === 'orders') for (const selector of Object.values(orderListFilters)) {
      const field = $(selector);
      field.value = '';
      window.FortyControls?.syncSelect(field);
    }
    $(`#${key}Pagination`)?.remove();
  }
}
