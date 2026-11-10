const state = {
  regions: [],
  sellers: [],
  customers: [],
  vehicles: [],
  products: [],
  orders: [],
  loads: [],
  payables: [],
  receivables: [],
  inventory: { items: [], movements: [] },
  productionPlans: [],
  users: [],
  currentUser: null,
  editing: {}
};
let visibleOrders = 40;
let refreshPromise = null;
let toastTimer;
let accessToken = sessionStorage.getItem("forty.accessToken") || "";

const editModal = {
  form: null,
  placeholder: null
};

const PaymentMethod = {
  None: 0,
  Cash: 1,
  Pix: 2,
  Boleto: 3,
  Check: 4,
  Card: 5,
  Transfer: 6,
  Other: 7
};

const paymentTerms = {
  "À vista": 0,
  "7 dias": 7,
  "15 dias": 15,
  "28 ddl": 28,
  "30/60 ddl": 30,
  "30 ddl": 30,
  "45 ddl": 45
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = value => Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR") : "-";
const dateTimeToDateOnly = value => value ? new Date(value).toISOString().slice(0, 10) : null;
const localDateOnly = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const normalize = value => String(value ?? "").toLowerCase();
const apiBaseUrl = String(window.FORTY_CONFIG?.apiBaseUrl ?? "").replace(/\/$/, "");
const hasPermission = permission => Boolean(state.currentUser?.permissions?.includes(permission));

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.style.display = "none", 6500);
}

async function api(path, options = {}) {
  const requestToken = accessToken;
  let response;
  try {
    response = await fetch(apiUrl(path), {
    signal: AbortSignal.timeout(30000),
    ...options,
    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(options.headers ?? {}) },
  });
  } catch {
    throw new Error("Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.");
  }

  if (requestToken && requestToken !== accessToken) throw new Error("A sessão mudou. Entre novamente para continuar.");

  if (!response.ok) {
    if (response.status === 401 && path !== "/api/auth/login") showLogin("Sua sessão expirou. Entre novamente.");
    if (response.status === 429) throw new Error("Muitas tentativas de acesso. Aguarde um minuto e tente novamente.");
    if (response.status === 403) throw new Error("Seu perfil não tem permissão para esta operação.");
    const text = await response.text();
    throw new Error(errorMessage(text) || `Erro ${response.status}`);
  }

  if (response.status === 204) return null;
  const data = await response.json();
  if (requestToken && requestToken !== accessToken) throw new Error("A sessão mudou. Entre novamente para continuar.");
  return data;
}

function errorMessage(text) {
  if (!text) return "";
  try {
    const data = JSON.parse(text);
    if (data.errors) {
      return Object.values(data.errors).flat().join(" ");
    }
    return data.detail || data.title || "Não foi possível concluir a operação.";
  } catch {
    return "O servidor não conseguiu concluir a operação. Tente novamente.";
  }
}

function formJson(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  for (const key of Object.keys(data)) {
    if (data[key] === "") data[key] = null;
  }
  return data;
}

function fillSelect(selector, rows, label, includeEmpty = false) {
  $$(selector).forEach(select => {
    const selected = select.value;
    const placeholders = { customerId: "Selecione um cliente", sellerId: "Selecione um vendedor", regionId: "Selecione uma região", vehicleId: "Selecione um veículo", productId: "Selecione um produto" };
    select.innerHTML = `<option value="">${placeholders[select.name] || "Selecione uma opção"}</option>`;
    for (const row of rows) {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = label(row);
      select.append(option);
    }
    if ([...select.options].some(option => option.value === selected)) {
      select.value = selected;
    }
    window.FortyControls?.syncSelect(select);
  });
}

function getFilter(name) {
  return normalize($(`[data-filter='${name}']`)?.value || "");
}

function matches(row, term, fields) {
  if (!term) return true;
  return fields.some(field => normalize(field(row)).includes(term));
}

function filteredCustomersForOrder() {
  const raw = normalize($("#customerSearch")?.value || "");
  const digits = raw.replace(/\D/g, "");

  if (!raw) return state.customers;

  return state.customers
    .filter(customer => normalize(customer.legalName).includes(raw) ||
      normalize(customer.tradeName).includes(raw) || (digits.length > 0 && customer.taxId.replace(/\D/g, "").includes(digits)));
}

function fillCustomerSelect() {
  fillSelect("#orderForm select[name='customerId']", filteredCustomersForOrder().filter(x => x.isActive), customer =>
    `${customer.legalName} - ${customer.taxId}`);
  updateOrderCustomerHint();
}

function updateOrderCustomerHint() {
  const select = $("#orderForm select[name='customerId']");
  const hint = $("#customerSelected");
  if (!select || !hint) return;
  const selected = state.customers.find(x => x.id === select.value);
  hint.textContent = selected
    ? `Cliente selecionado: ${selected.legalName} - ${selected.taxId}`
    : "Nenhum cliente encontrado com esse filtro. Tente digitar outro nome ou CNPJ.";
}

async function refreshCatalog() {
  const [regions, sellers, vehicles, products, customers] = await Promise.all([
    hasPermission("catalog.references") ? api("/api/catalog/regions") : [],
    hasPermission("catalog.references") ? api("/api/catalog/sellers") : [],
    hasPermission("catalog.references") ? api("/api/catalog/vehicles") : [],
    api("/api/catalog/products"),
    hasPermission("customers.manage") ? api("/api/customers") : []
  ]);

  state.regions = regions;
  state.sellers = sellers;
  state.vehicles = vehicles;
  state.products = products;
  state.customers = customers;

  fillSelect("select[name='regionId']", regions.filter(x => x.isActive), x => x.name);
  fillSelect("[data-report-region]", regions.filter(x => x.isActive), x => x.name, true);
  $$("[data-report-region] option[value='']").forEach(option => option.textContent = "Todas");
  fillSelect("#orderForm select[name='sellerId']", sellers.filter(x => x.isActive), x => `${x.code} - ${x.name}`, true);
  fillSelect("[data-report-seller]", sellers.filter(x => x.isActive), x => `${x.code} - ${x.name}`, true);
  $$("[data-report-seller] option[value='']").forEach(option => option.textContent = "Todos");
  fillSelect("[data-report-product]", products.filter(x => x.isActive), x => `${x.code} - ${x.name}`, true);
  $$("[data-report-product] option[value='']").forEach(option => option.textContent = "Todos");
  fillSelect("#customerForm select[name='sellerId']", sellers.filter(x => x.isActive), x => `${x.code} - ${x.name}`);
  fillSelect("select[name='vehicleId']", vehicles.filter(x => x.isActive), x => `${x.name} - ${x.plate}`, true);
  fillSelect("#receivableForm select[name='customerId']", customers.filter(x => x.isActive), x => x.legalName, true);
  fillSelect("#stockForm select[name='productId']", products.filter(x => x.isActive), x => `${x.code} — ${x.name} (${x.unit})`, true);
  $("#stockForm select[name='productId'] option[value='']").textContent = "Selecione um produto";
  fillCustomerSelect();
  $$('select').forEach(select => window.FortyControls?.syncSelect(select));
  refreshProductHints();
  renderMetrics();
  renderCatalogLists();
}

async function refreshOrders() {
  const orders = [];
  let page = 1;
  let result;
  do {
    result = await api(`/api/orders/page?page=${page++}&pageSize=200`);
    orders.push(...result.items);
  } while (result.items.length > 0 && orders.length < result.total);
  state.orders = orders;
  renderOrders();
  renderLoadOrderChoices();
  renderMetrics();
}

async function refreshLoads() {
  state.loads = await api("/api/delivery-loads");
  renderLoads();
  renderMetrics();
}

async function refreshFinancial() {
  const [payables, receivables] = await Promise.all([
    api("/api/financial/payables"),
    api("/api/financial/receivables")
  ]);
  state.payables = payables;
  state.receivables = receivables;
  renderFinancial();
  renderNotifications();
  renderMetrics();
}

function renderCatalogLists() {
  renderCustomersList();
  renderProductsList();
  renderSellersList();
  renderRegionsList();
  renderVehiclesList();
}

function renderCustomersList() {
  const rows = listRows("customers");
  $("#customersCount").textContent = listCount("customers");
  $("#customersList").innerHTML = rows.map(customer => `
    <div class="mini-card">
      <strong>${escapeHtml(customer.legalName)}</strong>
      <div class="meta">CNPJ ${escapeHtml(customer.taxId)} | ${escapeHtml(customer.city)} - ${escapeHtml(customer.state)}</div>
      <div class="meta">${escapeHtml(customer.street)}, ${escapeHtml(customer.number)} | ${escapeHtml(customer.phone || "sem telefone")}</div>
      <div class="card-actions">
        <button type="button" data-edit-customer="${customer.id}">Editar</button>
        <button type="button" data-delete-customer="${customer.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum cliente encontrado.");
}

function renderProductsList() {
  const rows = listRows("products");
  $("#productsCount").textContent = listCount("products");
  $("#productsList").innerHTML = rows.map(product => `
    <div class="mini-card">
      <strong>${escapeHtml(product.code)} - ${escapeHtml(product.name)}</strong>
      <div class="meta">${money(product.salePrice)} por ${escapeHtml(product.unit)} | Unitário ${money(product.unitSalePrice)}</div>
      <div class="meta">NCM ${escapeHtml(product.ncm || "-")} | CEST ${escapeHtml(product.cest || "-")} | DUN ${escapeHtml(product.boxBarcode || "-")}</div>
      <div class="card-actions">
        <button type="button" data-edit-product="${product.id}">Editar</button>
        <button type="button" data-delete-product="${product.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum produto encontrado.");
}

function renderSellersList() {
  const rows = listRows("sellers");
  $("#sellersCount").textContent = listCount("sellers");
  $("#sellersList").innerHTML = rows.map(seller => `
    <div class="mini-card">
      <strong>${escapeHtml(seller.code)} - ${escapeHtml(seller.name)}</strong>
      <div class="meta">Comissão padrão: ${seller.defaultCommissionPercentage ?? 0}%</div>
      <div class="meta">${escapeHtml(seller.email || "sem email")} | ${escapeHtml(seller.phone || "sem telefone")}</div>
      <div class="card-actions">
        <button type="button" data-edit-seller="${seller.id}">Editar</button>
        <button type="button" data-delete-seller="${seller.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum vendedor encontrado.");
}

function renderRegionsList() {
  const rows = listRows("regions");
  $("#regionsCount").textContent = listCount("regions");
  $("#regionsList").innerHTML = rows.map(region => `
    <div class="mini-card">
      <strong>${escapeHtml(region.name)}</strong>
      <div class="meta">${region.isActive ? "Ativa" : "Inativa"}</div>
      <div class="card-actions">
        <button type="button" data-edit-region="${region.id}">Editar</button>
        <button type="button" data-delete-region="${region.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhuma região encontrada.");
}

function renderVehiclesList() {
  const rows = listRows("vehicles");
  $("#vehiclesCount").textContent = listCount("vehicles");
  $("#vehiclesList").innerHTML = rows.map(vehicle => `
    <div class="mini-card">
      <strong>${escapeHtml(vehicle.name)} - ${escapeHtml(vehicle.plate)}</strong>
      <div class="meta">${escapeHtml(vehicle.model || "Modelo não informado")} | ${vehicle.isActive ? "Ativo" : "Inativo"}</div>
      <div class="card-actions">
        <button type="button" data-edit-vehicle="${vehicle.id}">Editar</button>
        <button type="button" data-delete-vehicle="${vehicle.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum veículo encontrado.");
}

function emptyList(message) {
  return `<div class="mini-card"><strong>${message}</strong></div>`;
}

function statusBadge(status) {
  const map = {
    Pending: ["Pendente", "amber"],
    Confirmed: ["Confirmado", "blue"],
    Scheduled: ["Na carga", "amber"],
    Delivered: ["Entregue", "green"],
    PartiallyDelivered: ["Parcial", "amber"],
    Returned: ["Retornou", "red"],
    Cancelled: ["Cancelado", "red"],
    Open: ["Aberta", "blue"],
    Dispatched: ["Na rua", "amber"],
    Closed: ["Fechada", "green"]
  };
  const [label, color] = map[status] ?? [status, ""];
  return `<span class="badge ${color}">${label}</span>`;
}

function renderMetrics() {
  const pendingOrders = state.orders.filter(order => order.status === "Confirmed");
  const openLoads = state.loads.filter(load => load.status === "Open");
  const streetLoads = state.loads.filter(load => load.status === "Dispatched" && !load.returnedAt);
  const receivableTotal = state.receivables.filter(item => item.status === "Open").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overdue = state.payables.filter(item => item.status === "Open" && daysUntil(item.dueDate) < 0).length;
  $("#waitingOrderValue").textContent = money(pendingOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0));
  $("#waitingOrderCount").textContent = pendingOrders.length === 1 ? "1 pedido confirmado" : `${pendingOrders.length} pedidos confirmados`;
  $("#flowWaiting").textContent = pendingOrders.length;
  $("#flowPreparing").textContent = openLoads.length;
  $("#flowOnRoute").textContent = streetLoads.length;
  $("#flowSummary").textContent = streetLoads.length ? `${streetLoads.length} ${streetLoads.length === 1 ? "carga" : "cargas"} em rota.` : "Nenhuma carga em rota.";
  const summaries = [
    ["Clientes ativos", state.customers.filter(x => x.isActive).length, '<circle cx="12" cy="8" r="3.5"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2"></path>'],
    ["Produtos no catálogo", state.products.filter(x => x.isActive).length, '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9"></path>'],
    ["Contas a receber abertas", money(receivableTotal), '<path d="M12 3v18M17 7H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6"></path>'],
    ["Contas a pagar vencidas", overdue, '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v6l4 2"></path>']
  ];
  $("#metrics").innerHTML = summaries.map(([label, value, icon]) => `<div class="metric"><span class="metric-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span><span class="metric-label">${label}</span><strong>${value}</strong></div>`).join("");
  document.title = streetLoads.length ? `FORTY · ${streetLoads.length} carga(s) em rota` : "FORTY · Operação";
  renderDashboard();
}

function renderDashboard() {
  const actions = $("#dashboardActions");
  const recent = $("#dashboardRecentOrders");
  if (!actions || !recent) return;

  const pendingOrders = state.orders.filter(order => order.status === "Confirmed");
  const loadsOnStreet = state.loads.filter(load => load.status === "Dispatched" && !load.returnedAt);
  const duePayables = state.payables
    .filter(item => item.status === "Open")
    .map(item => ({ ...item, days: daysUntil(item.dueDate) }))
    .filter(item => item.days <= 7)
    .sort((a, b) => a.days - b.days);

  const setupActions = [];
  if (!state.regions.some(x => x.isActive)) setupActions.push({title:"Defina as regiões de entrega",meta:"Organize os destinos das suas cargas.",view:"regions"});
  if (!state.sellers.some(x => x.isActive)) setupActions.push({title:"Cadastre os vendedores",meta:"Identifique os responsáveis pelos pedidos.",view:"sellers"});
  if (!state.customers.some(x => x.isActive)) setupActions.push({title:"Adicione os clientes",meta:"Vincule cada cliente a uma região e vendedor.",view:"customers"});
  if (!state.products.some(x => x.isActive)) setupActions.push({title:"Monte o catálogo de produtos",meta:"Cadastre códigos, preços e embalagens.",view:"products"});
  const actionRows = [
    ...setupActions,
    ...pendingOrders.slice(0, 3).map(order => ({
      title: `Pedido ${order.number} aguardando carga`,
      meta: `${order.customer?.legalName ?? "Cliente"} · ${money(order.totalAmount)}`,
      view: "loads"
    })),
    ...loadsOnStreet.slice(0, 3).map(load => ({
      title: `Carga ${load.number} está na rua`,
      meta: `${load.region?.name ?? "Região"} · ${load.orders.length} pedido(s)`,
      view: "loads"
    })),
    ...duePayables.slice(0, 3).map(item => ({
      title: item.days < 0 ? `Conta vencida: ${item.description}` : `Conta próxima: ${item.description}`,
      meta: `${money(item.amount)} · vence ${dateBR(item.dueDate)}`,
      view: "payables"
    }))
  ].filter(item => !window.FortyAccess || window.FortyAccess.canView(item.view)).slice(0, 6);

  $("#dashboardActionCount").textContent = actionRows.length ? `${actionRows.length} ${actionRows.length === 1 ? "ação" : "ações"}` : "";
  actions.innerHTML = actionRows.map(item => `
    <button class="dashboard-row" type="button" data-view-shortcut="${item.view}">
      <span>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.meta)}</small>
      </span>
      <span class="row-arrow">›</span>
    </button>
  `).join("") || `
    <div class="empty-state">
      <span>Nenhuma pendência no momento.</span>
    </div>
  `;

  $("#dashboardOrderCount").textContent = `${state.orders.length} ${state.orders.length === 1 ? "pedido" : "pedidos"} no histórico`;
  const hasCatalog = state.customers.some(x => x.isActive) && state.products.some(x => x.isActive);
  const emptyOrders = `<tr><td colspan="4" class="table-empty"><div class="empty-order"><svg viewBox="0 0 80 62" aria-hidden="true"><path d="m19 17 21-11 21 11-21 12zM19 17v27l21 12 21-12V17M40 29v27"></path><path class="parcel-tape" d="m30 11 21 12v11M7 45h8M65 8h8"></path></svg><strong>Nenhum pedido cadastrado</strong><span>${hasCatalog ? "Clientes e catálogo prontos para lançar o primeiro pedido." : "Adicione clientes e produtos para começar a lançar pedidos."}</span><div class="empty-order-actions">${hasCatalog ? '<button class="text-button" type="button" data-create="order">Lançar primeiro pedido</button>' : '<button class="text-button" type="button" data-view-shortcut="customers">Cadastrar cliente</button><button class="text-button" type="button" data-view-shortcut="products">Cadastrar produto</button>'}</div></div></td></tr>`;
  recent.innerHTML = `
    <table class="dashboard-table">
      <thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col" class="amount">Valor</th><th scope="col">Situação</th></tr></thead>
      <tbody>
        ${state.orders.slice(0, 8).map(order => `
          <tr><td><button class="text-button" type="button" data-view-shortcut="orders">${order.number}</button></td><td>${escapeHtml(order.customer?.legalName ?? "Cliente")}</td><td class="amount">${money(order.totalAmount)}</td><td>${statusBadge(order.status)}</td></tr>
        `).join("") || emptyOrders}
      </tbody>
    </table>
  `;

}

function renderOrders() {
  const list = $("#ordersList");
  list.innerHTML = "";

  const term = normalize($("#orderSearch")?.value).trim();
  const status = $("#orderStatusFilter")?.value;
  const filtered = state.orders.filter(order => (!status || order.status === status) &&
    matches(order, term, [x => x.number, x => x.customer?.legalName, x => x.seller?.name]));
  $("#orderCount").textContent = `${filtered.length} pedido(s)`;
  $("#moreOrders").hidden = filtered.length <= visibleOrders;
  if (filtered.length === 0) {
    list.innerHTML = `<div class="card"><strong>Nenhum pedido encontrado</strong><div class="meta">Revise os filtros ou lance um novo pedido.</div></div>`;
    return;
  }

  for (const order of filtered.slice(0, visibleOrders)) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header">
        <div>
          <strong>Pedido ${order.number} - ${money(order.totalAmount)}</strong>
          <div class="meta">${escapeHtml(order.customer?.legalName ?? "Cliente")} | ${escapeHtml(order.seller?.name ?? "Vendedor")}</div>
          <div class="meta">${order.isFiscalInvoiceRequested ? "Pedido para NF-e" : "Executado"} | ${escapeHtml(order.paymentCondition || "sem condição")} | Peso ${Number(order.totalWeightInKg || 0).toFixed(3)} kg</div>
        </div>
        ${statusBadge(order.status)}
      </div>
      <div class="card-actions">
        <button type="button" data-vale="${order.id}">Ver executado</button>
        <button type="button" data-edit-order="${order.id}" ${order.status !== "Confirmed" ? 'disabled title="Pedido vinculado à operação de entrega"' : ""}>Editar</button>
        <button type="button" data-delete-order="${order.id}" ${order.status !== "Confirmed" ? "disabled" : ""}>Excluir</button>
      </div>
    `;
    list.append(card);
  }
}

function renderLoads() {
  const list = $("#loadsList");
  list.innerHTML = "";
  const onlyShortages = $("#loadMissingOnly")?.checked;
  const qrId = typeof qrSelectedLoadId === 'undefined' ? null : qrSelectedLoadId;
  const visibleLoads = state.loads.filter(load => qrId ? load.id === qrId : load.orders.length > 0 && (!onlyShortages || loadHasShortage(load)));
  if (qrId) list.innerHTML = `<div class="qr-load-context"><div><strong>Carga aberta pelo romaneio</strong><p>Confira os pedidos abaixo. Escanear o QR Code não altera o estoque.</p></div><button type="button" id="showAllQrLoads">Ver todas as cargas</button></div>`;
  $('#showAllQrLoads')?.addEventListener('click', closeLoadQrTarget);

  if (visibleLoads.length === 0) {
    list.innerHTML = onlyShortages ? `<div class="empty-state">Nenhuma carga com falta registrada.</div>` : `<div class="card"><strong>Nenhuma carga criada</strong><div class="meta">Selecione pedidos confirmados e monte uma carga.</div></div>`;
    return;
  }

  for (const load of visibleLoads) {
    const total = load.orders.reduce((sum, item) => sum + Number(item.order?.totalAmount ?? 0), 0);
    const received = load.orders.reduce((sum, item) => sum + Number(item.amountReceived ?? 0), 0);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header">
        <div>
          <strong>Carga ${load.number} - ${escapeHtml(load.region?.name ?? "")}</strong>
          <div class="meta">${dateBR(load.scheduledDate)} | ${escapeHtml(load.vehicle ? `${load.vehicle.name} - ${load.vehicle.plate}` : "Sem veículo")} | Motorista: ${escapeHtml(load.driverName || "-")}</div>
          <div class="meta">${load.orders.length} pedidos | Total ${money(total)} | Recebido ${money(received)}</div>
          ${load.dispatchedAt ? `<div class="meta">Saída registrada por ${escapeHtml(load.dispatchedBy || 'Não registrado')} em ${checkedDateTime(load.dispatchedAt)}</div>` : ''}
          ${loadReturnDetails(load)}
        </div>
        ${load.returnedAt && load.status === 'Dispatched' ? '<span class="badge amber">Retornou · a conferir</span>' : statusBadge(load.status)}
      </div>
      <div class="card-actions">
        ${load.status === "Open" ? `<button type="button" data-dispatch="${load.id}">Marcar saída pra rua</button>` : ""}
        ${['Dispatched', 'Closed'].includes(load.status) && !load.returnedAt ? `<button type="button" data-load-return="${load.id}">Registrar retorno da carga</button>` : ''}
        <button type="button" data-report-load="${load.id}">Relatório da carga</button>
        <button type="button" data-report-loading="${load.id}">Carregamento expedição</button><button type="button" data-report-reconciliation="${load.id}">Conferência da carga</button>
        <button type="button" data-edit-load="${load.id}" ${load.status !== "Open" ? "disabled" : ""}>Editar</button>
        <button type="button" data-delete-load="${load.id}" ${load.status !== "Open" ? "disabled" : ""}>Excluir</button>
      </div>
      ${renderLoadReconciliation(load)}
      <p class="delivery-help">Confira, por produto, o que foi entregue, o que voltou ao depósito e o que faltou. Só a devolução física volta ao estoque.</p>
      <div class="order-lines">
        ${load.orders.map(item => renderLoadOrder(load, item)).join("")}
      </div>
    `;
    list.append(card);
  }
}

function renderLoadOrder(load, item) {
  const order = item.order;
  const checked = item.itemResults?.length > 0;
  return `<div class="load-order" data-load-order="${load.id}:${order.id}">
    <div><strong>Pedido ${order.number} — ${money(order.totalAmount)}</strong>
      <div class="meta">${escapeHtml(order.customer?.legalName ?? "Cliente")} | ${statusBadge(item.deliveryStatus)}</div>
      ${item.deliveryNotes ? `<div class="meta">Obs.: ${escapeHtml(item.deliveryNotes)}</div>` : ""}
    </div>
    <div class="delivery-check-summary">
      ${item.deliveryStatus === "Pending" ? load.status === "Dispatched"
        ? `<button type="button" class="primary" data-reconcile="${load.id}:${order.id}">Conferir entrega e retorno</button>`
        : '<span class="meta">Aguardando saída da carga.</span>'
        : `<div class="meta">Recebido ${money(item.amountReceived)} · ${escapeHtml(item.paymentMethod)}</div>
           ${checked ? '<span class="badge green">Produtos conferidos</span>' : '<span class="meta">Histórico sem conferência por produto.</span>'}
           ${checked && item.itemResults.some(x => Number(x.missingQuantity) > 0) ? '<span class="badge red">Falta registrada — veja a conferência da carga</span>' : ''}
           ${checked ? `<div class="meta">Conferido por ${escapeHtml(item.checkedBy || 'Não registrado')} em ${checkedDateTime(item.deliveredAt)}</div>` : ''}`}
    </div></div>`;
}

function renderLoadOrderChoices() {
  const container = $("#loadOrderChoices");
  if (!container) return;
  const selectedRegionId = $("#loadForm select[name='regionId']")?.value;
  const editingLoad = state.loads.find(x => x.id === state.editing.load);
  const selectedOrderIds = new Set($("#loadForm").dataset.dirty === "true"
    ? $$("input:checked", container).map(x => x.value)
    : editingLoad?.orders.map(x => x.orderId) ?? []);
  const linkedOrderIds = new Set(editingLoad?.orders.map(x => x.orderId) ?? []);
  const available = state.orders.filter(order => {
    const sameRegion = !selectedRegionId || order.customer?.regionId === selectedRegionId;
    const canUse = order.status === "Confirmed" || linkedOrderIds.has(order.id);
    return sameRegion && canUse;
  });
  container.innerHTML = "";

  if (available.length === 0) {
    container.innerHTML = "<p>Nenhum pedido confirmado disponível para essa região.</p>";
    return;
  }

  for (const order of available) {
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" name="orderIds" value="${order.id}" ${selectedOrderIds.has(order.id) ? "checked" : ""}>
      <span>Pedido ${order.number}<br><small>${escapeHtml(order.customer?.legalName ?? "Cliente")} - ${escapeHtml(order.customer?.region?.name ?? "sem região")} - ${money(order.totalAmount)}</small></span>
    `;
    container.append(label);
  }
}

function financialStatusBadge(status) {
  const map = {
    Open: ["Aberto", "amber"],
    Paid: ["Pago", "green"],
    Received: ["Recebido", "green"],
    Cancelled: ["Cancelado", "red"]
  };
  const [label, color] = map[status] ?? [status, ""];
  return `<span class="badge ${color}">${label}</span>`;
}

function renderFinancial() {
  $("#payablesCount").textContent = `${state.payables.length} conta(s)`;
  $("#payablesList").innerHTML = state.payables.map(item => `
    <div class="card">
      <div class="card-header">
        <div>
          <strong>${escapeHtml(item.description)} - ${money(item.amount)}</strong>
          <div class="meta">${escapeHtml(item.supplierName || "Fornecedor não informado")} | vence ${dateBR(item.dueDate)}</div>
          ${item.notes ? `<div class="meta">${escapeHtml(item.notes)}</div>` : ""}
        </div>
        ${financialStatusBadge(item.status)}
      </div>
      <div class="card-actions">
        ${item.status === "Open" ? `<button type="button" class="primary" data-pay-payable="${item.id}">Marcar pago</button>` : ""}
        <button type="button" data-edit-payable="${item.id}" ${item.status !== "Open" ? "disabled" : ""}>Editar</button>
        <button type="button" data-delete-payable="${item.id}" ${item.status !== "Open" ? "disabled" : ""}>Excluir</button>
      </div>
    </div>
  `).join("") || `<div class="card"><strong>Nenhuma conta a pagar.</strong></div>`;

  $("#receivablesCount").textContent = `${state.receivables.length} conta(s)`;
  $("#receivablesList").innerHTML = state.receivables.map(item => `
    <div class="card">
      <div class="card-header">
        <div>
          <strong>${escapeHtml(item.description)} - ${money(item.amount)}</strong>
          <div class="meta">${escapeHtml(item.customer?.legalName || "Cliente não informado")} ${item.orderNumber != null ? `| Pedido ${item.orderNumber}` : ""} | vence ${dateBR(item.dueDate)}</div>
          ${item.notes ? `<div class="meta">${escapeHtml(item.notes)}</div>` : ""}
        </div>
        ${financialStatusBadge(item.status)}
      </div>
      <div class="card-actions">
        ${item.status === "Open" ? `<button type="button" class="primary" data-receive-receivable="${item.id}">Marcar recebido</button>` : ""}
        <button type="button" data-edit-receivable="${item.id}" ${item.status !== "Open" ? "disabled" : ""}>Editar</button>
        <button type="button" data-delete-receivable="${item.id}" ${item.status !== "Open" ? "disabled" : ""}>Excluir</button>
      </div>
    </div>
  `).join("") || `<div class="card"><strong>Nenhuma conta a receber.</strong></div>`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function daysUntil(value) {
  const due = parseDateOnly(value);
  if (!due) return 9999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

function renderNotifications() {
  const alerts = state.payables
    .filter(item => item.status === "Open")
    .map(item => ({ ...item, days: daysUntil(item.dueDate) }))
    .filter(item => item.days <= 7)
    .sort((a, b) => a.days - b.days);

  const badge = $("#notificationBadge");
  const button = $("#notificationButton");
  const summary = $("#notificationSummary");
  const list = $("#notificationList");
  if (!badge || !button || !summary || !list) return;

  badge.textContent = alerts.length;
  button.classList.toggle("has-alert", alerts.length > 0);
  summary.textContent = alerts.length
    ? `${alerts.length} conta(s) em atenção`
    : "Nenhum alerta";

  list.innerHTML = alerts.map(item => {
    const status = item.days < 0
      ? `Vencida há ${Math.abs(item.days)} dia(s)`
      : item.days === 0
        ? "Vence hoje"
        : `Vence em ${item.days} dia(s)`;

    return `
      <div class="notification-item ${item.days < 0 ? "overdue" : ""}">
        <strong>
          <span>${escapeHtml(item.description)}</span>
          <span>${money(item.amount)}</span>
        </strong>
        <div class="meta">${escapeHtml(item.supplierName || "Fornecedor não informado")}</div>
        <div class="meta">${status} - ${dateBR(item.dueDate)}</div>
        <div class="card-actions">
          <button type="button" data-view-shortcut="payables">Abrir contas</button>
          <button type="button" class="primary" data-pay-payable="${item.id}">Marcar pago</button>
        </div>
      </div>
    `;
  }).join("") || `<div class="notification-item"><strong>Nenhuma conta próxima do vencimento.</strong></div>`;
}

function addItemRow() {
  const row = document.createElement("div");
  row.className = "row item-row";
  row.innerHTML = `
    <input name="productCode" aria-label="Código do produto" placeholder="4300" required>
    <input name="quantity" aria-label="Quantidade" type="number" step="0.001" min="0.001" placeholder="Qtd." required>
    <input name="unitPrice" aria-label="Preço por unidade de venda" type="number" step="0.01" min="0.01" placeholder="auto">
    <input name="totalAmount" aria-label="Total do item" type="number" step="0.01" min="0.01" placeholder="auto">
    <div class="product-hint">Digite o código</div>
    <button type="button">Remover</button>
  `;
  $("button", row).addEventListener("click", () => {
    row.remove();
    refreshProductHints();
  });
  $("input[name='unitPrice']", row).addEventListener("input", () => row.dataset.manualUnitPrice = "true");
  $("input[name='totalAmount']", row).addEventListener("input", () => row.dataset.manualTotal = "true");
  $$("input", row).forEach(input => input.addEventListener("input", () => refreshProductHints(input)));
  $("#itemRows").append(row);
  refreshProductHints();
}

function refreshProductHints(source = null) {
  let total = 0;

  $$(".item-row").forEach(row => {
    const code = $("input[name='productCode']", row).value.trim();
    const quantity = Number($("input[name='quantity']", row).value || 0);
    const unitPriceInput = $("input[name='unitPrice']", row);
    const totalInput = $("input[name='totalAmount']", row);
    const hint = $(".product-hint", row);
    const product = state.products.find(x => x.code.toLowerCase() === code.toLowerCase());

    if (source?.name === "productCode" && source.closest(".item-row") === row) {
      row.dataset.manualUnitPrice = "false";
      row.dataset.manualTotal = "false";
      unitPriceInput.value = "";
      totalInput.value = "";
    }
    if (source?.name === "quantity" && source.closest(".item-row") === row)
      row.dataset.manualTotal = "false";

    hint.classList.remove("ok", "warn");
    if (!code) {
      hint.textContent = "Digite o código";
      return;
    }

    if (!product || !product.isActive) {
      hint.textContent = "Produto não encontrado";
      hint.classList.add("warn");
      return;
    }

    if (!unitPriceInput.value && row.dataset.manualUnitPrice !== "true") {
      unitPriceInput.value = Number(product.salePrice || 0).toFixed(2);
    }

    if (source === unitPriceInput) {
      row.dataset.manualTotal = "false";
    }

    const unitPrice = Number(unitPriceInput.value || product.salePrice || 0);
    let lineTotal = Number(totalInput.value || 0);
    if (!lineTotal || row.dataset.manualTotal !== "true") {
      lineTotal = quantity * unitPrice;
      totalInput.value = lineTotal ? lineTotal.toFixed(2) : "";
    } else if (source === totalInput && quantity > 0) {
      unitPriceInput.value = (lineTotal / quantity).toFixed(2);
    }

    total += lineTotal;
    hint.textContent = `${product.name} | Tabela ${money(product.salePrice)} | Total ${money(lineTotal)}`;
    hint.classList.add("ok");
  });

  $("#orderPreviewTotal").textContent = `Total previsto ${money(total)}`;
}

async function submitJson(form, url, bodyFactory, afterSave, method = "POST") {
  if (form.dataset.saving === "true") return;
  const submit = $("button[type='submit']", form);
  form.dataset.saving = "true";
  form.setAttribute("aria-busy", "true");
  if (submit) { submit.disabled = true; submit.textContent = "Salvando…"; }
  try {
    const result = await api(url, { method, body: JSON.stringify(bodyFactory(form)) });
    form.reset();
    delete form.dataset.dirty;
    state.editing[form.dataset.editKey] = null;
    updateFormMode(form);
    closeEditModal();
    if (form.id === "orderForm") {
      $("#itemRows").innerHTML = "";
      addItemRow();
    }
    toast("Salvo com sucesso.");
    try { await refreshAll(); }
    catch { toast("Salvo. A atualização da lista falhou; use Atualizar dados."); }
    if (afterSave) afterSave(result);
  } catch (error) {
    toast(error.message || "Não foi possível salvar. Veja os dados informados.");
    console.error(error);
  } finally {
    delete form.dataset.saving;
    form.removeAttribute("aria-busy");
    if (submit) submit.disabled = false;
    updateFormMode(form);
  }
}

function submitUrl(form, createUrl) {
  const id = state.editing[form.dataset.editKey];
  return id ? `${createUrl}/${id}` : createUrl;
}

function submitMethod(form) {
  return state.editing[form.dataset.editKey] ? "PUT" : "POST";
}

function updateFormMode(form) {
  if (!form?.dataset?.editKey) return;
  const editing = Boolean(state.editing[form.dataset.editKey]);
  const primary = $("button.primary", form);
  const cancel = $("[data-cancel-edit]", form);
  if (primary) primary.textContent = editing ? "Salvar edição" : primary.dataset.createLabel;
  if (cancel) cancel.style.display = editing || editModal.form === form ? "inline-flex" : "none";
}

async function openCreateForm(key) {
  if (!window.FortyAccess?.canCreate(key)) return toast("Seu perfil não tem acesso a este formulário.");
  const names = { customer: "Novo cliente", product: "Novo produto", seller: "Novo vendedor", region: "Nova região", vehicle: "Novo veículo", order: "Novo pedido", load: "Nova carga", payable: "Nova conta a pagar", receivable: "Nova conta a receber", stock: "Movimentar estoque", productionPlan: "Programar produção", user: "Novo usuário" };
  const form = $(`[data-edit-key='${key}']`);
  if (!form || !names[key]) return;
  const resumeDraft = form.dataset.dirty === "true" && !state.editing[key];
  if (!resumeDraft) {
    if (form.dataset.dirty === "true" && !(await askConfirmation("Descartar as alterações deste formulário?", { title: 'Descartar alterações?', accept: 'Descartar', cancel: 'Continuar editando', destructive: true }))) return;
    form.reset();
    delete form.dataset.dirty;
    if (key === "order") {
      $("#customerSearch").value = "";
      fillCustomerSelect();
      $("#itemRows").innerHTML = "";
      addItemRow();
    }
  }
  state.editing[key] = null;
  if (key === "user") prepareUserForm();
  if (key === "productionPlan" && !resumeDraft) prepareProductionPlan();
  if (key === "load") renderLoadOrderChoices();
  window.FortyControls?.sync(form);
  if (key === "stock") { form.dataset.requestId = crypto.randomUUID(); updateStockHint(); }
  openEditModal(form, names[key]);
}

function openEditModal(form, title) {
  window.FortyControls?.closeAll();
  editModal.returnFocus = document.activeElement;
  if (editModal.form && editModal.form !== form) {
    closeEditModal();
  }

  if (!editModal.form) {
    editModal.placeholder = document.createComment(`placeholder-${form.id}`);
    form.parentNode.insertBefore(editModal.placeholder, form);
  }

  editModal.form = form;
  $("#editModalTitle").textContent = title;
  $("#editModalBody").append(form);
  $("#editModal").classList.toggle("compact-modal", form.id === "regionForm");
  $("#editModal").classList.toggle("medium-modal", ["sellerForm", "vehicleForm", "stockForm", "userForm", "userPasswordForm", "loadReturnForm"].includes(form.id));
  $("#editModal").classList.add("open");
  $("#editModal").setAttribute("aria-hidden", "false");
  updateFormMode(form);
  $("main").inert = true;
  $("aside").inert = true;
  form.scrollTop = 0;
  $("#closeEditModal").focus();
}

function closeEditModal() {
  if (!editModal.form) return;
  window.FortyControls?.closeAll();

  if (editModal.placeholder?.parentNode) {
    editModal.placeholder.parentNode.insertBefore(editModal.form, editModal.placeholder);
    editModal.placeholder.remove();
  }

  $("#editModal").classList.remove("open");
  $("#editModal").setAttribute("aria-hidden", "true");
  $("#editModalTitle").textContent = "Editar item";
  $("main").inert = false;
  $("aside").inert = false;
  editModal.returnFocus?.focus();
  editModal.form = null;
  editModal.placeholder = null;
}

function wireForms() {
  $("#regionForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/catalog/regions"), formJson, null, submitMethod(form));
  });

  $("#sellerForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/catalog/sellers"), form => {
      const data = formJson(form);
      data.defaultCommissionPercentage = data.defaultCommissionPercentage ? Number(data.defaultCommissionPercentage) : null;
      return data;
    }, null, submitMethod(form));
  });

  $("#vehicleForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/catalog/vehicles"), formJson, null, submitMethod(form));
  });

  $("#productForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/catalog/products"), form => {
      const data = formJson(form);
      data.salePrice = Number(data.salePrice);
      data.unitSalePrice = null;
      data.unitBarcode = null;
      data.boxBarcode = null;
      data.blockKType = null;
      data.weightInKg = Number(data.weightInKg ?? 0);
      return data;
    }, null, submitMethod(form));
  });

  $("#customerForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/customers"), formJson, null, submitMethod(form));
  });

  $("#orderForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    const method = submitMethod(form);
    submitJson(form, submitUrl(form, "/api/orders"), form => {
      const data = formJson(form);
      const rows = $$(".item-row", $("#itemRows"));
      data.sellerId = data.sellerId || null;
      data.paymentCondition = data.paymentCondition || null;
      data.isFiscalInvoiceRequested = form.elements.isFiscalInvoiceRequested.checked;
      data.items = rows.map(row => ({
        productCode: $("input[name='productCode']", row).value,
        quantity: Number($("input[name='quantity']", row).value),
        unitPrice: Number($("input[name='unitPrice']", row).value || 0) || null,
        totalAmount: Number($("input[name='totalAmount']", row).value || 0) || null
      }));
      return data;
    }, order => {
      if (method === "POST") openVale(order.id);
    }, method);
  });

  $("#loadForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/delivery-loads"), form => {
      const data = formJson(form);
      data.vehicleId = data.vehicleId || null;
      data.orderIds = $$("input[name='orderIds']:checked", form).map(x => x.value);
      return data;
    }, null, submitMethod(form));
  });

  $("#payableForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/financial/payables"), financialFormJson, null, submitMethod(form));
  });

  $("#receivableForm").addEventListener("submit", event => {
    event.preventDefault();
    const form = event.target;
    submitJson(form, submitUrl(form, "/api/financial/receivables"), form => {
      const data = financialFormJson(form);
      data.customerId = data.customerId || null;
      data.orderNumber = data.orderNumber ? Number(data.orderNumber) : null;
      return data;
    }, null, submitMethod(form));
  });
}

function financialFormJson(form) {
  const data = formJson(form);
  data.amount = Number(data.amount);
  return data;
}

function applyPaymentCondition() {
  const form = $("#orderForm");
  const condition = form.elements.paymentCondition.value;
  const days = paymentTerms[condition];
  if (days === undefined) return;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);
  form.elements.dueDate.value = localDateOnly(dueDate);
  window.FortyControls?.syncDate(form.elements.dueDate);
}

function closeNavGroups() {
  $$(".nav-group").forEach(group => {
    group.classList.remove("open");
    $("[data-menu-toggle]", group)?.setAttribute("aria-expanded", "false");
  });
}

function wireNav() {
  const mobile = matchMedia("(max-width: 980px)");
  const toggle = $("#sidebarToggle");
  const setMobileNavigation = collapsed => {
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.setAttribute("aria-label", collapsed ? "Abrir navegação" : "Fechar navegação");
    toggle.title = collapsed ? "Abrir navegação" : "Fechar navegação";
  };
  setMobileNavigation(mobile.matches);
  toggle.addEventListener("click", () => setMobileNavigation(!document.body.classList.contains("sidebar-collapsed")));
  mobile.addEventListener("change", () => { closeNavGroups(); setMobileNavigation(mobile.matches); });
  $$("aside [data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
  $$("[data-menu-toggle]").forEach(button => {
    const group = button.closest(".nav-group");
    const submenu = $(".nav-submenu", group);
    submenu.id = `nav-${button.dataset.menuToggle}`;
    button.setAttribute("aria-controls", submenu.id);
    button.setAttribute("aria-expanded", "false");
    button.addEventListener("click", () => {
      const open = !group.classList.contains("open");
      closeNavGroups();
      group.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", event => { if (!event.target.closest("#sidebar")) closeNavGroups(); });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const current = $(".nav-group.open [data-menu-toggle]");
    closeNavGroups();
    current?.focus();
  });
}

function setupFormModes() {
  const keys = {
    regionForm: "region",
    sellerForm: "seller",
    vehicleForm: "vehicle",
    productForm: "product",
    customerForm: "customer",
    orderForm: "order",
    loadForm: "load",
    payableForm: "payable",
    receivableForm: "receivable",
    stockForm: "stock",
    deliveryCheckForm: "delivery",
    loadReturnForm: "loadReturn",
    productionPlanForm: "productionPlan",
    productionCompletionForm: "productionCompletion",
    userForm: "user",
    userPasswordForm: "userPassword"
  };

  for (const [formId, key] of Object.entries(keys)) {
    const form = $(`#${formId}`);
    form.dataset.editKey = key;
    form.addEventListener("input", () => form.dataset.dirty = "true");
    form.addEventListener("change", () => form.dataset.dirty = "true");
    const primary = $("button.primary", form);
    if (primary) primary.dataset.createLabel = primary.textContent;
    updateFormMode(form);
  }
}

async function resetEdit(key) {
  const form = $(`[data-edit-key='${key}']`);
  if (!form) return;
  if (form.dataset.saving === "true") return;
  if (form.dataset.dirty === "true" && !(await askConfirmation("Descartar as alterações deste formulário?", { title: 'Descartar alterações?', accept: 'Descartar', cancel: 'Continuar editando', destructive: true }))) return;
  state.editing[key] = null;
  form.reset();
  delete form.dataset.dirty;
  updateFormMode(form);
  if (key === "order") {
    $("#itemRows").innerHTML = "";
    addItemRow();
    refreshProductHints();
  }
  if (key === "load") {
    renderLoadOrderChoices();
  }
  if (editModal.form === form) {
    closeEditModal();
  }
}

function fillForm(form, values) {
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements[key];
    if (!field) continue;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value ?? "";
    }
  }
  window.FortyControls?.sync(form);
}

function editCustomer(id) {
  const customer = state.customers.find(x => x.id === id);
  if (!customer) return;
  state.editing.customer = id;
  const form = $("#customerForm");
  fillForm(form, customer);
  updateFormMode(form);
  openEditModal(form, "Editar cliente");
}

function editProduct(id) {
  const product = state.products.find(x => x.id === id);
  if (!product) return;
  state.editing.product = id;
  const form = $("#productForm");
  fillForm(form, product);
  updateFormMode(form);
  openEditModal(form, "Editar produto");
}

function editSeller(id) {
  const seller = state.sellers.find(x => x.id === id);
  if (!seller) return;
  state.editing.seller = id;
  const form = $("#sellerForm");
  fillForm(form, seller);
  updateFormMode(form);
  openEditModal(form, "Editar vendedor");
}

function editRegion(id) {
  const region = state.regions.find(x => x.id === id);
  if (!region) return;
  state.editing.region = id;
  const form = $("#regionForm");
  fillForm(form, region);
  updateFormMode(form);
  openEditModal(form, "Editar região");
}

function editVehicle(id) {
  const vehicle = state.vehicles.find(x => x.id === id);
  if (!vehicle) return;
  state.editing.vehicle = id;
  const form = $("#vehicleForm");
  fillForm(form, vehicle);
  updateFormMode(form);
  openEditModal(form, "Editar veículo");
}

function editOrder(id) {
  const order = state.orders.find(x => x.id === id);
  if (!order) return;
  state.editing.order = id;
  const form = $("#orderForm");
  $("#customerSearch").value = "";
  fillCustomerSelect();
  fillForm(form, {
    customerId: order.customerId,
    sellerId: order.sellerId,
    dueDate: order.dueDate,
    paymentCondition: order.paymentCondition,
    isFiscalInvoiceRequested: order.isFiscalInvoiceRequested,
    notes: order.notes
  });
  fillCustomerSelect();
  $("#itemRows").innerHTML = "";
  for (const item of order.items ?? []) {
    addItemRow();
    const row = $$(".item-row").at(-1);
    $("input[name='productCode']", row).value = item.productCode;
    $("input[name='quantity']", row).value = item.quantity;
    $("input[name='unitPrice']", row).value = Number(item.unitPrice || 0).toFixed(2);
    $("input[name='totalAmount']", row).value = Number(item.totalAmount || 0).toFixed(2);
    row.dataset.manualUnitPrice = "true";
    row.dataset.manualTotal = "true";
  }
  refreshProductHints();
  updateFormMode(form);
  openEditModal(form, `Editar pedido ${order.number}`);
}

function editLoad(id) {
  const load = state.loads.find(x => x.id === id);
  if (!load) return;
  state.editing.load = id;
  const form = $("#loadForm");
  fillForm(form, {
    scheduledDate: load.scheduledDate,
    regionId: load.regionId,
    vehicleId: load.vehicleId,
    driverName: load.driverName,
    notes: load.notes
  });
  renderLoadOrderChoices();
  updateFormMode(form);
  openEditModal(form, `Editar carga ${load.number}`);
}

function editPayable(id) {
  const payable = state.payables.find(x => x.id === id);
  if (!payable) return;
  state.editing.payable = id;
  const form = $("#payableForm");
  fillForm(form, payable);
  updateFormMode(form);
  openEditModal(form, "Editar conta a pagar");
}

function editReceivable(id) {
  const receivable = state.receivables.find(x => x.id === id);
  if (!receivable) return;
  state.editing.receivable = id;
  const form = $("#receivableForm");
  fillForm(form, receivable);
  updateFormMode(form);
  openEditModal(form, "Editar conta a receber");
}

async function settle(url, message) {
  try {
    await api(url, { method: "POST", body: JSON.stringify({ date: new Date().toISOString().slice(0, 10) }) });
    toast(message);
    await refreshAll();
  } catch (error) {
    toast(error.message || "Não foi possível dar baixa.");
    console.error(error);
  }
}

async function deleteResource(label, url) {
  if (!(await askConfirmation(`Tem certeza que deseja excluir ${label}?`, { title: 'Excluir registro', accept: 'Excluir', destructive: true }))) return;
  try {
    await api(url, { method: "DELETE" });
    toast("Excluído com sucesso.");
    await refreshAll();
  } catch (error) {
    toast(error.message || "Não foi possível excluir.");
    console.error(error);
  }
}

function showView(view) {
  if (!window.FortyAccess?.canView(view)) return toast("Seu perfil não tem acesso a esta área.");
  window.FortyControls?.closeAll();
  const button = $(`aside [data-view='${view}']`);
  if (!button) return;
  $$("aside [data-view]").forEach(x => {
    x.classList.toggle("active", x === button);
    x.setAttribute("aria-current", x === button ? "page" : "false");
  });
  $$(".view").forEach(x => x.classList.toggle("active", x.id === view));
  const currentGroup = button.closest(".nav-group");
  $$(".nav-group").forEach(group => group.classList.toggle("current", group === currentGroup));
  closeNavGroups();
  const category = currentGroup ? $("[data-menu-toggle] .nav-text", currentGroup).textContent : "Área de trabalho";
  $("#workspaceLocation").textContent = `${category} / ${$(".nav-text", button).textContent}`;
  window.scrollTo({ top: 0, behavior: "instant" });
  if (matchMedia("(max-width: 980px)").matches && !document.body.classList.contains("sidebar-collapsed")) $("#sidebarToggle").click();
  const heading = $(`#${view} > header h2`);
  if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
  if (pagedListDefinitions[view]) refreshList(view).catch(error => toast(error.message));
}


function wireActions() {
  $("#refreshData").addEventListener("click", () => {
    if ($$("form[data-dirty='true']").length) {
      toast("Salve ou cancele os formulários em preenchimento antes de atualizar.");
      return;
    }
    refreshAll().catch(error => toast(error.message));
  });
  ["#orderSearch", "#orderStatusFilter"].forEach(selector => $(selector).addEventListener(selector === "#orderStatusFilter" ? "change" : "input", () => {
    visibleOrders = 40;
    renderOrders();
  }));
  $("#moreOrders").addEventListener("click", () => { visibleOrders += 40; renderOrders(); });
  window.addEventListener("unhandledrejection", event => {
    toast(event.reason?.message || "Não foi possível concluir a operação.");
    event.preventDefault();
  });
  $("#addItem").addEventListener("click", addItemRow);
  $("#customerSearch").addEventListener("input", fillCustomerSelect);
  $("#orderForm select[name='customerId']").addEventListener("change", updateOrderCustomerHint);
  $("#orderForm select[name='paymentCondition']").addEventListener("change", applyPaymentCondition);
  $("#loadForm select[name='regionId']").addEventListener("change", renderLoadOrderChoices);
  $("#closeVale").addEventListener("click", closeVale);
  $("#printVale").addEventListener("click", () => window.print());
  $("#closeEditModal").addEventListener("click", () => {
    const key = editModal.form?.dataset?.editKey;
    if (key) resetEdit(key);
    else closeEditModal();
  });
  $("#notificationButton").addEventListener("click", () => {
    closeNavGroups();
    const panel = $("#notificationPanel");
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    $("#notificationButton").setAttribute("aria-expanded", String(isHidden));
  });


  $$("[data-report]").forEach(button => {
    button.addEventListener("click", () => {
      const form = button.closest("[data-report-form]");
      const filters = form ? Object.fromEntries(new FormData(form).entries()) : {};
      openReport(button.dataset.report, null, filters);
    });
  });

  $$("[data-cancel-edit]").forEach(button => {
    button.addEventListener("click", () => resetEdit(button.dataset.cancelEdit));
  });

  document.addEventListener("click", async event => {
    const target = event.target.closest("button") || event.target;
    if (window.FortyAccess && !window.FortyAccess.canUse(target)) return toast("Seu perfil não tem permissão para esta ação.");
    if (target.dataset?.editUser) return editUser(target.dataset.editUser);
    if (target.dataset?.resetUserPassword) return openUserPassword(target.dataset.resetUserPassword);
    if (target.dataset?.productionComplete) return openProductionCompletion(target.dataset.productionComplete);
    if (target.dataset?.productionReport) return openReport("productionPlan", target.dataset.productionReport);
    if (target.dataset?.productionCancel) return cancelProductionPlan(target.dataset.productionCancel);
    if (target.hasAttribute?.('data-remove-production-item')) { target.closest('.production-item-row').remove(); $('#productionPlanForm').dataset.dirty = 'true'; return; }
    if (target.dataset?.reconcile) return openDeliveryCheck(target.dataset.reconcile);
    if (target.dataset?.loadReturn) return openLoadReturn(target.dataset.loadReturn);
    if (target.dataset?.checkPreset) return fillDeliveryPreset(target.dataset.checkPreset);
    if (target.dataset?.reportReconciliation) return openReport("reconciliation", target.dataset.reportReconciliation);
    if (target.id === "editModal") {
      const key = editModal.form?.dataset?.editKey;
      if (key) resetEdit(key);
      else closeEditModal();
      return;
    }
    if (!target.closest(".notification-area")) {
      const panel = $("#notificationPanel");
      if (panel) panel.hidden = true;
      $("#notificationButton")?.setAttribute("aria-expanded", "false");
    }
    if (target.dataset?.create) return openCreateForm(target.dataset.create);
    if (target.dataset?.viewShortcut) return showView(target.dataset.viewShortcut);

    if (target.dataset?.editCustomer) return editCustomer(target.dataset.editCustomer);
    if (target.dataset?.editProduct) return editProduct(target.dataset.editProduct);
    if (target.dataset?.editSeller) return editSeller(target.dataset.editSeller);
    if (target.dataset?.editRegion) return editRegion(target.dataset.editRegion);
    if (target.dataset?.editVehicle) return editVehicle(target.dataset.editVehicle);
    if (target.dataset?.editOrder) return editOrder(target.dataset.editOrder);
    if (target.dataset?.editLoad) return editLoad(target.dataset.editLoad);
    if (target.dataset?.editPayable) return editPayable(target.dataset.editPayable);
    if (target.dataset?.editReceivable) return editReceivable(target.dataset.editReceivable);

    if (target.dataset?.deleteCustomer) return deleteResource("este cliente", `/api/customers/${target.dataset.deleteCustomer}`);
    if (target.dataset?.deleteProduct) return deleteResource("este produto", `/api/catalog/products/${target.dataset.deleteProduct}`);
    if (target.dataset?.deleteSeller) return deleteResource("este vendedor", `/api/catalog/sellers/${target.dataset.deleteSeller}`);
    if (target.dataset?.deleteRegion) return deleteResource("esta região", `/api/catalog/regions/${target.dataset.deleteRegion}`);
    if (target.dataset?.deleteVehicle) return deleteResource("este veículo", `/api/catalog/vehicles/${target.dataset.deleteVehicle}`);
    if (target.dataset?.deleteOrder) return deleteResource("este pedido", `/api/orders/${target.dataset.deleteOrder}`);
    if (target.dataset?.deleteLoad) return deleteResource("esta carga", `/api/delivery-loads/${target.dataset.deleteLoad}`);
    if (target.dataset?.deletePayable) return deleteResource("esta conta a pagar", `/api/financial/payables/${target.dataset.deletePayable}`);
    if (target.dataset?.deleteReceivable) return deleteResource("esta conta a receber", `/api/financial/receivables/${target.dataset.deleteReceivable}`);
    if (target.dataset?.payPayable) return settle(`/api/financial/payables/${target.dataset.payPayable}/pay`, "Conta marcada como paga.");
    if (target.dataset?.receiveReceivable) return settle(`/api/financial/receivables/${target.dataset.receiveReceivable}/receive`, "Conta marcada como recebida.");

    const valeId = event.target.dataset?.vale;
    if (valeId) return openVale(valeId);

    const loadReportId = event.target.dataset?.reportLoad;
    if (loadReportId) return openReport("load", loadReportId);

    const loadingReportId = event.target.dataset?.reportLoading;
    if (loadingReportId) return openReport("loadingLoad", loadingReportId);

    const dispatchId = target.dataset?.dispatch;
    if (dispatchId) {
      target.disabled = true;
      try {
        await api(`/api/delivery-loads/${dispatchId}/dispatch`, { method: "POST" });
        toast("Saída registrada e produtos debitados do estoque.");
        await refreshAll();
      } catch (error) { toast(error.message); }
      finally { target.disabled = false; }
      return;
    }


  });

  document.addEventListener("keydown", event => {
    if (event.fortyControlHandled || event.target.closest?.("dialog[open]")) return;
    if (event.key === "Tab" && editModal.form) {
      const elements = $$("#editModal button:not(:disabled), #editModal input:not(:disabled):not([type=hidden]):not(.tomselected), #editModal select:not(:disabled):not(.tomselected), #editModal textarea:not(:disabled), #editModal [tabindex='0'], #controlOverlayRoot button:not(:disabled), #controlOverlayRoot input:not(:disabled), #controlOverlayRoot [tabindex='0']")
        .filter(x => x.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    if (event.key !== "Escape" || !editModal.form) return;
    resetEdit(editModal.form.dataset.editKey);
  });
}


async function openVale(orderId) {
  const vale = await api(`/api/orders/${orderId}/vale`);
  $("#valeContent").innerHTML = renderVale(vale);
  $("#valeModal").classList.add("open");
  $("#valeModal").setAttribute("aria-hidden", "false");
}

function closeVale() {
  $("#valeModal").classList.remove("open");
  $("#valeModal").setAttribute("aria-hidden", "true");
}

function renderVale(vale) {
  const customer = vale.customer;
  const copy = () => `
    <section class="vale-copy">
      <div class="vale-top">
        <div><strong>Data</strong>: ${new Date(vale.issuedAt).toLocaleString("pt-BR")}</div>
        <div><strong>Pedido</strong>: ${vale.number}</div>
        <div><strong>Carregamento</strong>: ${escapeHtml(vale.loadingNumber ?? "-")}</div>
        <div><strong>Vendedor</strong>: ${escapeHtml(vale.seller?.name ?? "-")}</div>
      </div>
      <div class="vale-client">
        <div>
          <strong>Cliente</strong>: ${escapeHtml(customer.legalName)}<br>
          Endereço: ${escapeHtml(customer.street)}, ${escapeHtml(customer.number)} ${escapeHtml(customer.complement ?? "")}<br>
          Bairro: ${escapeHtml(customer.district)}
        </div>
        <div>
          <strong>CNPJ</strong>: ${escapeHtml(customer.taxId)}
          <strong>IE</strong>: ${escapeHtml(customer.stateRegistration ?? "-")}<br>
          Número: ${escapeHtml(customer.number)} Comp.: ${escapeHtml(customer.complement ?? "")}<br>
          CEP: ${escapeHtml(customer.postalCode ?? "-")}
        </div>
        <div>
          <strong>Contato</strong>: ${escapeHtml(customer.phone ?? "-")}<br>
          Cidade: ${escapeHtml(customer.city)} - UF: ${escapeHtml(customer.state)}
        </div>
      </div>
      <div class="vale-products-label">Produtos</div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qtde.</th>
            <th>Unidade</th>
            <th>Código</th>
            <th>Nome</th>
            <th class="right">Unitário</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${vale.items.map((item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td class="right">${Number(item.quantity).toFixed(2)}</td>
              <td>${escapeHtml(item.unit)}</td>
              <td>${escapeHtml(item.productCode)}</td>
              <td>${escapeHtml(item.productName)}</td>
              <td class="right">${money(item.unitPrice)}</td>
              <td class="right">${money(item.totalAmount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      <div class="vale-footer">
        <div><strong>Informações</strong><br>Peso: ${Number(vale.totalWeightInKg || 0).toFixed(2)} Kg</div>
        <div><strong>Vencimentos</strong><br>${escapeHtml(vale.paymentCondition ?? "-")} | ${dateBR(vale.dueDate)} - ${money(vale.totalAmount)}</div>
        <div><strong>Total</strong><br>${money(vale.totalAmount)}</div>
      </div>
    </section>
  `;
  return `
    <div class="vale">
      ${copy()}
      ${copy()}
      ${copy()}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paymentLabel(value) {
  const map = {
    None: "-",
    Cash: "Dinheiro",
    Pix: "Pix",
    Boleto: "Boleto",
    Check: "Cheque",
    Card: "Cartão",
    Transfer: "Transferência",
    Other: "Outro"
  };
  return map[value] ?? value ?? "-";
}

function readFilterText(value) {
  return normalize(value || "").trim();
}

function withinDateRange(value, from, to) {
  const date = parseDateOnly(value);
  if (!date) return true;
  const start = parseDateOnly(from);
  const end = parseDateOnly(to);
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

async function openReport(type, id = null, filters = {}) {
  if (!window.FortyAccess?.canReport(type)) return toast("Seu perfil não tem acesso a este relatório.");
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) {
    toast("O navegador bloqueou a janela do relatorio.");
    return;
  }

  reportWindow.document.write("<p>Gerando relatorio...</p>");
  await refreshReportData(type);

  const report = buildReport(type, id, filters);
  reportWindow.document.open();
  reportWindow.document.write(report);
  reportWindow.document.close();
}

async function refreshReportData(type) {
  if (type === "inventory") return refreshInventory();
  if (type === "productionPlan") return refreshProduction();
  if (["orders", "salesPosition"].includes(type)) {
    await refreshOrders();
    return;
  }

  if (["loads", "load", "loading", "loadingLoad", "reconciliation"].includes(type)) {
    await refreshLoads();
    return;
  }
}

function buildReport(type, id, filters = {}) {
  const builders = {
    inventory: () => reportInventory(),
    productionPlan: () => reportProductionPlan(id),
    reconciliation: () => reportReconciliation(id),
    orders: () => reportOrders(filters),
    loads: () => reportLoads(filters),
    load: () => reportSingleLoad(id),
    loading: () => reportLoadingAll(filters),
    loadingLoad: () => reportLoadingLoad(id),
    salesPosition: () => reportSalesPosition(filters),
    customers: () => reportCustomers(filters),
    products: () => reportProducts(filters)
  };
  return reportLayout(builders[type]?.() ?? reportOrders());
}

function reportLayout(content) {
  return `
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>${escapeHtml(content.title)}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 28px; }
        h1 { margin: 0 0 4px; font-size: 22px; }
        .subtitle { color: #555; margin-bottom: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #999; padding: 6px; text-align: left; vertical-align: top; }
        th { background: #eee; }
        .right { text-align: right; }
        .summary { display: flex; gap: 12px; margin: 16px 0; }
        .summary div { border: 1px solid #999; padding: 8px 10px; }
        .loading-customer { break-inside: avoid; margin: 16px 0 22px; }
        .loading-customer h2 { font-size: 14px; margin: 0 0 4px; }
        .loading-customer p { margin: 0 0 8px; font-size: 12px; color: #333; }
        .loading-region { break-after: page; }
        .loading-region:last-child { break-after: auto; }
        .loading-region-title { border: 2px solid #111; padding: 8px; margin: 18px 0 12px; font-size: 18px; text-transform: uppercase; }
        .loading-load-title { border-bottom: 1px solid #999; margin: 14px 0 8px; padding-bottom: 4px; font-size: 14px; }
        .strong-qty { font-size: 14px; font-weight: 800; }
        .load-qr { display: flex; align-items: center; gap: 16px; border: 1px solid #999; padding: 12px; margin: 16px 0; break-inside: avoid; color: #111; background: #fff; }
        .load-qr-code { flex: 0 0 38mm; width: 38mm; height: 38mm; }
        .load-qr-code svg { width: 100%; height: 100%; display: block; }
        .load-qr p, .load-qr a { font-size: 11px; margin: 6px 0; }
        .load-qr-url { overflow-wrap: anywhere; }
        .actions { margin-bottom: 16px; }
        @media print { .actions { display: none; } body { margin: 12mm; } }
      </style>
    </head>
    <body>
      <div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div>
      <h1>${escapeHtml(content.title)}</h1>
      <div class="subtitle">Emitido em ${new Date().toLocaleString("pt-BR")}</div>
      ${content.body}
      <script>setTimeout(() => window.print(), 300);</script>
    </body>
    </html>
  `;
}

function reportOrders(filters = {}) {
  const customerTerm = readFilterText(filters.customer);
  const digits = customerTerm.replace(/\D/g, "");
  const rows = state.orders.filter(order => {
    const customer = order.customer;
    const customerMatches = !customerTerm
      || normalize(customer?.legalName).includes(customerTerm)
      || (digits && normalize(customer?.taxId).includes(digits));
    const statusMatches = !filters.status || order.status === filters.status;
    const typeMatches = !filters.invoiceType
      || (filters.invoiceType === "nfe" && order.isFiscalInvoiceRequested)
      || (filters.invoiceType === "vale" && !order.isFiscalInvoiceRequested);
    return customerMatches && statusMatches && typeMatches && withinDateRange(order.dueDate, filters.from, filters.to);
  });
  const total = rows.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  return {
    title: "Relatório de pedidos e executados",
    body: `
      <div class="summary">
        <div><strong>Pedidos</strong><br>${rows.length}</div>
        <div><strong>Total</strong><br>${money(total)}</div>
      </div>
      <table>
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Vendedor</th><th>Tipo</th><th>Status</th><th class="right">Valor</th></tr></thead>
        <tbody>
          ${rows.map(order => `
            <tr>
              <td>${order.number}</td>
              <td>${escapeHtml(order.customer?.legalName)}</td>
              <td>${escapeHtml(order.seller?.name ?? "-")}</td>
              <td>${order.isFiscalInvoiceRequested ? "NF-e" : "Executado"}</td>
              <td>${escapeHtml(order.status)}</td>
              <td class="right">${money(order.totalAmount)}</td>
            </tr>
          `).join("") || `<tr><td colspan="6">Nenhum pedido encontrado com os filtros.</td></tr>`}
        </tbody>
      </table>
    `
  };
}

function reportSalesPosition(filters = {}) {
  const selectedSeller = state.sellers.find(x => x.id === filters.sellerId);
  const selectedProduct = state.products.find(x => x.code === filters.productCode || x.id === filters.productCode);
  const rows = [];

  for (const order of state.orders) {
    if (order.status === "Cancelled") continue;
    if (filters.sellerId && order.sellerId !== filters.sellerId) continue;
    if (!withinDateRange(dateTimeToDateOnly(order.createdAt), filters.from, filters.to)) continue;

    for (const item of order.items ?? []) {
      if (filters.productCode && item.productCode !== filters.productCode && item.productId !== filters.productCode) continue;
      rows.push({ order, item });
    }
  }

  rows.sort((a, b) => {
    const sellerCompare = String(a.order.seller?.name ?? "").localeCompare(String(b.order.seller?.name ?? ""), "pt-BR");
    if (sellerCompare) return sellerCompare;
    const productCompare = String(a.item.productName ?? "").localeCompare(String(b.item.productName ?? ""), "pt-BR");
    if (productCompare) return productCompare;
    return new Date(a.order.createdAt) - new Date(b.order.createdAt);
  });

  const totalQuantity = rows.reduce((sum, row) => sum + Number(row.item.quantity || 0), 0);
  const totalAmount = rows.reduce((sum, row) => sum + Number(row.item.totalAmount || 0), 0);
  const year = filters.from ? new Date(`${filters.from}T00:00:00`).getFullYear() : new Date().getFullYear();
  const period = `${dateBR(filters.from) || "-"} a ${dateBR(filters.to) || "-"}`;

  return {
    title: `Posição de vendas por vendedor - ano ${year}`,
    body: `
      <div class="summary">
        <div><strong>Vendedor</strong><br>${escapeHtml(selectedSeller ? `${selectedSeller.code} - ${selectedSeller.name}` : "Todos")}</div>
        <div><strong>Produto</strong><br>${escapeHtml(selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : "Todos")}</div>
        <div><strong>Período</strong><br>${period}</div>
        <div><strong>Qtd.</strong><br>${quantityRaw(totalQuantity)}</div>
        <div><strong>Total</strong><br>${money(totalAmount)}</div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Quant.</th>
            <th>Cliente</th>
            <th>Vendedor</th>
            <th>Produto</th>
            <th>Cond. Pgto</th>
            <th class="right">Preço</th>
            <th class="right">V. Total</th>
            <th>Emissão</th>
            <th>Vencimento</th>
            <th>Obs.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ order, item }) => `
            <tr>
              <td class="right">${quantityRaw(item.quantity)}</td>
              <td>${escapeHtml(order.customer?.legalName ?? "-")}</td>
              <td>${escapeHtml(order.seller?.name ?? "-")}</td>
              <td>${escapeHtml(item.productCode)} — ${escapeHtml(item.productName)}</td>
              <td>${escapeHtml(order.paymentCondition ?? "-")}</td>
              <td class="right">${money(item.unitPrice)}</td>
              <td class="right">${money(item.totalAmount)}</td>
              <td>${dateBR(dateTimeToDateOnly(order.createdAt))}</td>
              <td>${dateBR(order.dueDate)}</td>
              <td>${escapeHtml(order.notes ?? "")}</td>
            </tr>
          `).join("") || `<tr><td colspan="10">Nenhuma venda encontrada com os filtros.</td></tr>`}
        </tbody>
      </table>
    `
  };
}

function reportLoads(filters = {}) {
  const loads = state.loads.filter(load => {
    const hasOrders = load.orders.length > 0;
    const regionMatches = !filters.regionId || load.regionId === filters.regionId || load.region?.id === filters.regionId;
    const statusMatches = !filters.status || load.status === filters.status;
    return hasOrders && regionMatches && statusMatches && withinDateRange(load.scheduledDate, filters.from, filters.to);
  });
  return {
    title: "Relatório de cargas e entregas",
    body: `
      <table>
        <thead><tr><th>Carga</th><th>Data</th><th>Região</th><th>Veículo</th><th>Motorista</th><th>Status</th><th>Retorno ao depósito</th><th>Pedidos</th><th class="right">Total</th><th class="right">Recebido</th></tr></thead>
        <tbody>
          ${loads.map(load => {
            const total = load.orders.reduce((sum, item) => sum + Number(item.order?.totalAmount ?? 0), 0);
            const received = load.orders.reduce((sum, item) => sum + Number(item.amountReceived ?? 0), 0);
            return `
              <tr>
                <td>${load.number}</td>
                <td>${dateBR(load.scheduledDate)}</td>
                <td>${escapeHtml(load.region?.name)}</td>
                <td>${escapeHtml(load.vehicle ? `${load.vehicle.name} - ${load.vehicle.plate}` : "-")}</td>
                <td>${escapeHtml(load.driverName ?? "-")}</td>
                <td>${escapeHtml(load.status)}</td>
                <td>${load.returnedAt ? checkedDateTime(load.returnedAt) : 'Não registrado'}</td>
                <td>${load.orders.length}</td>
                <td class="right">${money(total)}</td>
                <td class="right">${money(received)}</td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="10">Nenhuma carga encontrada com os filtros.</td></tr>`}
        </tbody>
      </table>
    `
  };
}

function reportSingleLoad(id) {
  const load = state.loads.find(x => x.id === id);
  if (!load) return reportLoads();

  const total = load.orders.reduce((sum, item) => sum + Number(item.order?.totalAmount ?? 0), 0);
  const received = load.orders.reduce((sum, item) => sum + Number(item.amountReceived ?? 0), 0);
  return {
    title: `Carga ${load.number} - ${load.region?.name ?? ""}`,
    body: `
      ${renderLoadQr(load)}
      ${loadReturnDetails(load)}
      <div class="summary">
        <div><strong>Data</strong><br>${dateBR(load.scheduledDate)}</div>
        <div><strong>Veículo</strong><br>${escapeHtml(load.vehicle ? `${load.vehicle.name} - ${load.vehicle.plate}` : "-")}</div>
        <div><strong>Motorista</strong><br>${escapeHtml(load.driverName ?? "-")}</div>
        <div><strong>Total</strong><br>${money(total)}</div>
        <div><strong>Recebido</strong><br>${money(received)}</div>
      </div>
      <table>
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Status entrega</th><th>Pagamento</th><th>Obs.</th><th class="right">Valor</th><th class="right">Recebido</th></tr></thead>
        <tbody>
          ${load.orders.map(item => `
            <tr>
              <td>${item.order?.number ?? "-"}</td>
              <td>${escapeHtml(item.order?.customer?.legalName)}</td>
              <td>${escapeHtml(item.deliveryStatus)}</td>
              <td>${escapeHtml(paymentLabel(item.paymentMethod))}</td>
              <td>${escapeHtml(item.deliveryNotes ?? "")}</td>
              <td class="right">${money(item.order?.totalAmount)}</td>
              <td class="right">${money(item.amountReceived)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
  };
}

function quantityRaw(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function reportLoadingAll(filters = {}) {
  const loads = state.loads.filter(load => {
    const hasOrders = load.orders.length > 0;
    const regionMatches = !filters.regionId || load.regionId === filters.regionId || load.region?.id === filters.regionId;
    return hasOrders && regionMatches && withinDateRange(load.scheduledDate, filters.from, filters.to);
  });
  const groups = new Map();

  for (const load of loads) {
    const key = load.region?.id ?? load.regionId ?? "sem-regiao";
    if (!groups.has(key)) {
      groups.set(key, {
        name: load.region?.name ?? "Sem região",
        loads: []
      });
    }
    groups.get(key).loads.push(load);
  }

  const body = [...groups.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map(group => `
      <section class="loading-region">
        <h1 class="loading-region-title">Região: ${escapeHtml(group.name)}</h1>
        ${group.loads
          .sort((a, b) => Number(a.number) - Number(b.number))
          .map(load => renderLoadingLoadBody(load, true))
          .join("")}
      </section>
    `)
    .join("");

  return {
    title: "Relatório de carregamento por região",
    body: body || "<p>Nenhum carregamento encontrado.</p>"
  };
}

function reportLoadingLoad(id) {
  const load = state.loads.find(x => x.id === id);
  if (!load) return reportLoads();

  return {
    title: `Rel. de Carregamento - ${load.number} - ${load.region?.name ?? ""}`,
    body: renderLoadingLoadBody(load, false)
  };
}

function renderLoadingLoadBody(load, showLoadTitle) {
  return `
      ${showLoadTitle ? `<h2 class="loading-load-title">Carregamento ${load.number} - ${escapeHtml(load.region?.name ?? "")}</h2>` : ""}
      ${renderLoadQr(load)}
      ${loadReturnDetails(load)}
      <div class="summary">
        <div><strong>Carregamento</strong><br>${load.number} - ${escapeHtml(load.region?.name ?? "")}</div>
        <div><strong>Data</strong><br>${dateBR(load.scheduledDate)}</div>
        <div><strong>Veículo</strong><br>${escapeHtml(load.vehicle ? `${load.vehicle.name} - ${load.vehicle.plate}` : "-")}</div>
        <div><strong>Motorista</strong><br>${escapeHtml(load.driverName ?? "-")}</div>
      </div>
      ${load.orders.map(item => {
        const order = item.order;
        const customer = order?.customer;
        return `
          <section class="loading-customer">
            <h2>Cliente: ${escapeHtml(customer?.legalName)} - Pedido: ${order?.number ?? "-"}</h2>
            <p>Endereço: ${escapeHtml(customer ? `${customer.street}, ${customer.number} ${customer.district} ${customer.city} ${customer.state}` : "-")}</p>
            <table>
              <thead>
                <tr>
                  <th style="width: 70px;">Qtd.</th>
                  <th style="width: 70px;">Unid.</th>
                  <th style="width: 90px;">Código</th>
                  <th>Produto</th>
                </tr>
              </thead>
              <tbody>
                ${(order?.items ?? []).map(product => `
                  <tr>
                    <td class="right strong-qty">${quantityRaw(product.quantity)}</td>
                    <td>${escapeHtml(product.unit)}</td>
                    <td>${escapeHtml(product.productCode)}</td>
                    <td>${escapeHtml(product.productName)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </section>
        `;
      }).join("")}
    `;
}

function reportCustomers(filters = {}) {
  const term = readFilterText(filters.search);
  const rows = state.customers.filter(customer => {
    const regionMatches = !filters.regionId || customer.regionId === filters.regionId || customer.region?.id === filters.regionId;
    const textMatches = !term || [
      customer.legalName,
      customer.taxId,
      customer.city,
      customer.phone,
      customer.email,
      customer.region?.name
    ].some(value => normalize(value).includes(term));
    return regionMatches && textMatches;
  });
  return {
    title: "Relatório de clientes",
    body: `
      <table>
        <thead><tr><th>Cliente</th><th>CNPJ</th><th>Cidade/UF</th><th>Região</th><th>Telefone</th></tr></thead>
        <tbody>
          ${rows.map(customer => `
            <tr>
              <td>${escapeHtml(customer.legalName)}</td>
              <td>${escapeHtml(customer.taxId)}</td>
              <td>${escapeHtml(customer.city)} / ${escapeHtml(customer.state)}</td>
              <td>${escapeHtml(customer.region?.name ?? "-")}</td>
              <td>${escapeHtml(customer.phone ?? "-")}</td>
            </tr>
          `).join("") || `<tr><td colspan="5">Nenhum cliente encontrado com os filtros.</td></tr>`}
        </tbody>
      </table>
    `
  };
}

function reportProducts(filters = {}) {
  const term = readFilterText(filters.search);
  const rows = state.products.filter(product => !term || [
    product.code,
    product.name,
    product.ncm,
    product.cest,
    product.boxBarcode,
    product.unitBarcode
  ].some(value => normalize(value).includes(term)));
  return {
    title: "Relatório de produtos",
    body: `
      <table>
        <thead><tr><th>Código</th><th>Produto</th><th>Un.</th><th class="right">Preço</th><th>NCM</th><th>CEST</th><th>DUN</th></tr></thead>
        <tbody>
          ${rows.map(product => `
            <tr>
              <td>${escapeHtml(product.code)}</td>
              <td>${escapeHtml(product.name)}</td>
              <td>${escapeHtml(product.unit)}</td>
              <td class="right">${money(product.salePrice)}</td>
              <td>${escapeHtml(product.ncm ?? "-")}</td>
              <td>${escapeHtml(product.cest ?? "-")}</td>
              <td>${escapeHtml(product.boxBarcode ?? "-")}</td>
            </tr>
          `).join("") || `<tr><td colspan="7">Nenhum produto encontrado com os filtros.</td></tr>`}
        </tbody>
      </table>
    `
  };
}

async function refreshAll() {
  if (refreshPromise) return refreshPromise;
  const button = $("#refreshData");
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  $("#syncStatus").textContent = "Atualizando dados…";
  refreshPromise = (async () => {
    try {
      const tasks = [refreshCatalog(), refreshInventory()];
      if (hasPermission("orders.read")) tasks.push(refreshOrders());
      if (hasPermission("loads.manage")) tasks.push(refreshLoads());
      if (hasPermission("finance.manage")) tasks.push(refreshFinancial());
      if (hasPermission("production.manage")) tasks.push(refreshProduction());
      const results = await Promise.allSettled(tasks);
      const failure = results.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
      await refreshVisibleList();
      window.FortyAccess?.apply();
      openLoadQrTarget();
      $("#syncStatus").textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    } catch (error) {
      $("#syncStatus").textContent = "Falha ao atualizar. Tente novamente.";
      throw error;
    } finally {
      button.disabled = false;
      button.removeAttribute("aria-busy");
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function init() {
  wireListPagination();
  window.addEventListener('hashchange', () => {
    if (accessToken) refreshAll().catch(error => toast(error.message));
  });
  wireAuthentication();
  wireInventory();
  wireProduction();
  wireUsers();
  setupFormModes();
  wireNav();
  wireForms();
  wireActions();
  addItemRow();
  window.FortyControls?.init();
  window.FortyAccess?.observe();
  $("#dashboardDate").textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo"
  }).format(new Date());
  const update = () => {
    if (!accessToken || document.hidden || editModal.form || window.FortyControls?.isOpen() || $$("form[data-dirty='true']").length ||
        document.activeElement?.matches("input, select, textarea")) return;
    refreshAll().catch(console.error);
  };
  setInterval(update, 60000);
  if (accessToken) {
    updateProfile(await api("/api/auth/me"));
    document.body.classList.remove("auth-locked");
    await refreshAll();
  }
}

function showLogin(message = "") {
  window.FortyDialogs?.cancel();
  if (editModal.form) closeEditModal();
  if ($("#passwordDialog").open) $("#passwordDialog").close();
  if ($("#profileDialog").open) $("#profileDialog").close();
  accessToken = "";
  sessionStorage.removeItem("forty.accessToken");
  window.FortyAccess?.clear();
  document.body.classList.add("auth-locked");
  $("#loginError").textContent = message;
  $("#loginForm input[name='password']").value = "";
}

function updateProfile(user) {
  state.currentUser = user;
  const name = user.name || "Minha conta";
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toLocaleUpperCase("pt-BR");
  $("#profileTriggerName").textContent = name;
  $("#profileName").textContent = name;
  $("#profileEmail").textContent = user.email || "";
  $("#profileRole").textContent = user.role || "Usuário";
  $("#profileAccess").textContent = user.role || "Usuário";
  $("#profileInitials").textContent = initials;
  $("#profileAvatar").textContent = initials;
  window.FortyAccess?.apply();
  const currentView = $(".view.active")?.id;
  if (!window.FortyAccess?.canView(currentView)) showView(window.FortyAccess.home());
}

async function logout() {
  const dirty = $$("form[data-dirty='true']").length > 0;
  if (!(await askConfirmation(dirty ? 'Sair e descartar os formulários em preenchimento?' : 'Deseja sair da sua conta?', { title: 'Sair da conta', accept: 'Sair da conta' }))) return;
  showLogin();
  location.reload();
}

function wireAuthentication() {
  const profileDialog = $("#profileDialog");
  $("#profileButton").addEventListener("click", () => {
    closeNavGroups();
    $("#notificationPanel").hidden = true;
    $("#notificationButton").setAttribute("aria-expanded", "false");
    profileDialog.showModal();
    $("#profileButton").setAttribute("aria-expanded", "true");
  });
  $("#closeProfile").addEventListener("click", () => profileDialog.close());
  profileDialog.addEventListener("click", event => {
    const rect = profileDialog.getBoundingClientRect();
    if (event.target === profileDialog && (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom)) profileDialog.close();
  });
  profileDialog.addEventListener("close", () => {
    $("#profileButton").setAttribute("aria-expanded", "false");
  });
  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $("button", form);
    button.disabled = true;
    button.textContent = "Entrando…";
    $("#loginError").textContent = "";
    try {
      const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify(formJson(form)) });
      accessToken = result.accessToken;
      sessionStorage.setItem("forty.accessToken", accessToken);
      updateProfile(await api("/api/auth/me"));
      form.elements.password.value = "";
      document.body.classList.remove("auth-locked");
      try { await refreshAll(); } catch (error) { toast(error.message); }
    } catch (error) { $("#loginError").textContent = error.message; }
    finally { button.disabled = false; button.textContent = "Entrar"; }
  });
  $("#logout").addEventListener("click", logout);
  $("#changePassword").addEventListener("click", () => {
    profileDialog.close();
    $("#passwordDialog").showModal();
  });
  $("#passwordDialog").addEventListener("close", () => {
    $("#passwordForm").reset(); $("#passwordError").textContent = "";
    if (accessToken && !document.body.classList.contains("auth-locked") && !profileDialog.open) {
      profileDialog.showModal();
      $("#profileButton").setAttribute("aria-expanded", "true");
    }
  });
  $("#cancelPassword").addEventListener("click", () => { $("#passwordForm").reset(); $("#passwordDialog").close(); });
  $("#closePassword").addEventListener("click", () => $("#passwordDialog").close());
  $("#passwordForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formJson(form);
    if (data.newPassword !== data.confirmPassword) { $("#passwordError").textContent = "As novas senhas não conferem."; return; }
    const button = $("button[type='submit']", form);
    button.disabled = true;
    try {
      await api("/api/auth/password", { method: "POST", body: JSON.stringify(data) });
      form.reset(); $("#passwordDialog").close(); showLogin("Senha alterada. Entre novamente.");
    } catch (error) { $("#passwordError").textContent = error.message; }
    finally { button.disabled = false; }
  });
}

init().catch(error => {
  toast("Erro ao carregar dados iniciais.");
  console.error(error);
});
