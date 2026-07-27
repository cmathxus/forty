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
  editing: {}
};

const editModal = {
  form: null,
  placeholder: null
};

const DeliveryStatus = {
  Delivered: 1,
  Returned: 4
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
const normalize = value => String(value ?? "").toLowerCase();
const apiBaseUrl = String(window.FORTY_CONFIG?.apiBaseUrl ?? "").replace(/\/$/, "");

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.style.display = "block";
  setTimeout(() => el.style.display = "none", 3200);
}

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    headers: { "Content-Type": "application/json", ...(options.headers ?? {}) },
    ...options
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(errorMessage(text) || `Erro ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

function errorMessage(text) {
  if (!text) return "";
  try {
    const data = JSON.parse(text);
    if (data.errors) {
      return Object.values(data.errors).flat().join(" ");
    }
    return data.title || data.detail || text;
  } catch {
    return text;
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
    select.innerHTML = includeEmpty ? "<option value=\"\">Padrao</option>" : "";
    for (const row of rows) {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = label(row);
      select.append(option);
    }
    if ([...select.options].some(option => option.value === selected)) {
      select.value = selected;
    }
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

  if (!raw) return state.customers.slice(0, 40);

  return state.customers
    .filter(customer => normalize(customer.legalName).includes(raw) || customer.taxId.includes(digits))
    .slice(0, 40);
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
    api("/api/catalog/regions"),
    api("/api/catalog/sellers"),
    api("/api/catalog/vehicles"),
    api("/api/catalog/products"),
    api("/api/customers")
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
  fillCustomerSelect();
  refreshProductHints();
  renderMetrics();
  renderCatalogLists();
}

async function refreshOrders() {
  state.orders = await api("/api/orders");
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
  const term = getFilter("customers");
  const rows = state.customers
    .filter(customer => customer.isActive)
    .filter(customer => matches(customer, term, [
      x => x.legalName,
      x => x.taxId,
      x => x.city,
      x => x.phone,
      x => x.email
    ]))
    .slice(0, 80);

  $("#customersCount").textContent = `${rows.length} de ${state.customers.filter(x => x.isActive).length}`;
  $("#customersList").innerHTML = rows.map(customer => `
    <div class="mini-card">
      <strong>${customer.legalName}</strong>
      <div class="meta">CNPJ ${customer.taxId} | ${customer.city} - ${customer.state}</div>
      <div class="meta">${customer.street}, ${customer.number} | ${customer.phone || "sem telefone"}</div>
      <div class="card-actions">
        <button type="button" data-edit-customer="${customer.id}">Editar</button>
        <button type="button" data-delete-customer="${customer.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum cliente encontrado.");
}

function renderProductsList() {
  const term = getFilter("products");
  const rows = state.products
    .filter(product => product.isActive)
    .filter(product => matches(product, term, [
      x => x.code,
      x => x.name,
      x => x.ncm,
      x => x.cest,
      x => x.boxBarcode
    ]))
    .slice(0, 80);

  $("#productsCount").textContent = `${rows.length} de ${state.products.filter(x => x.isActive).length}`;
  $("#productsList").innerHTML = rows.map(product => `
    <div class="mini-card">
      <strong>${product.code} - ${product.name}</strong>
      <div class="meta">${money(product.salePrice)} por ${product.unit} | Unitario ${money(product.unitSalePrice)}</div>
      <div class="meta">NCM ${product.ncm || "-"} | CEST ${product.cest || "-"} | DUN ${product.boxBarcode || "-"}</div>
      <div class="card-actions">
        <button type="button" data-edit-product="${product.id}">Editar</button>
        <button type="button" data-delete-product="${product.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum produto encontrado.");
}

function renderSellersList() {
  const term = getFilter("sellers");
  const rows = state.sellers.filter(seller => seller.isActive && matches(seller, term, [x => x.code, x => x.name, x => x.email, x => x.phone]));
  $("#sellersCount").textContent = `${rows.length} de ${state.sellers.filter(x => x.isActive).length}`;
  $("#sellersList").innerHTML = rows.map(seller => `
    <div class="mini-card">
      <strong>${seller.code} - ${seller.name}</strong>
      <div class="meta">Comissão padrão: ${seller.defaultCommissionPercentage ?? 0}%</div>
      <div class="meta">${seller.email || "sem email"} | ${seller.phone || "sem telefone"}</div>
      <div class="card-actions">
        <button type="button" data-edit-seller="${seller.id}">Editar</button>
        <button type="button" data-delete-seller="${seller.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhum vendedor encontrado.");
}

function renderRegionsList() {
  const term = getFilter("regions");
  const rows = state.regions.filter(region => region.isActive && matches(region, term, [x => x.name]));
  $("#regionsCount").textContent = `${rows.length} de ${state.regions.filter(x => x.isActive).length}`;
  $("#regionsList").innerHTML = rows.map(region => `
    <div class="mini-card">
      <strong>${region.name}</strong>
      <div class="meta">${region.isActive ? "Ativa" : "Inativa"}</div>
      <div class="card-actions">
        <button type="button" data-edit-region="${region.id}">Editar</button>
        <button type="button" data-delete-region="${region.id}">Excluir</button>
      </div>
    </div>
  `).join("") || emptyList("Nenhuma região encontrada.");
}

function renderVehiclesList() {
  const term = getFilter("vehicles");
  const rows = state.vehicles.filter(vehicle => vehicle.isActive && matches(vehicle, term, [x => x.name, x => x.plate, x => x.model]));
  $("#vehiclesCount").textContent = `${rows.length} de ${state.vehicles.filter(x => x.isActive).length}`;
  $("#vehiclesList").innerHTML = rows.map(vehicle => `
    <div class="mini-card">
      <strong>${vehicle.name} - ${vehicle.plate}</strong>
      <div class="meta">${vehicle.model || "Modelo não informado"} | ${vehicle.isActive ? "Ativo" : "Inativo"}</div>
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
  const ordersTotal = state.orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const loadsOnStreet = state.loads.filter(load => load.status === "Dispatched").length;
  const pendingOrders = state.orders.filter(order => order.status === "Confirmed").length;
  const metrics = $("#metrics");

  if (metrics) {
    metrics.innerHTML = `
      <div class="metric"><span>Clientes ativos</span><strong>${state.customers.filter(x => x.isActive).length}</strong></div>
      <div class="metric"><span>Produtos ativos</span><strong>${state.products.filter(x => x.isActive).length}</strong></div>
      <div class="metric"><span>Pedidos pendentes</span><strong>${pendingOrders}</strong></div>
      <div class="metric"><span>Total dos pedidos</span><strong>${money(ordersTotal)}</strong></div>
    `;
  }

  const loadMetric = loadsOnStreet ? `${loadsOnStreet} carga(s) na rua` : "Nenhuma carga na rua";
  document.title = `Forty - ${loadMetric}`;
  renderDashboard();
}

function renderDashboard() {
  const actions = $("#dashboardActions");
  const recent = $("#dashboardRecentOrders");
  if (!actions || !recent) return;

  const pendingOrders = state.orders.filter(order => order.status === "Confirmed");
  const loadsOnStreet = state.loads.filter(load => load.status === "Dispatched");
  const duePayables = state.payables
    .filter(item => item.status === "Open")
    .map(item => ({ ...item, days: daysUntil(item.dueDate) }))
    .filter(item => item.days <= 7)
    .sort((a, b) => a.days - b.days);

  const actionRows = [
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
  ].slice(0, 6);

  $("#dashboardActionCount").textContent = actionRows.length ? `${actionRows.length} item(s)` : "Tudo em ordem";
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
      <strong>Nada urgente agora</strong>
      <span>Quando tiver pedido pendente, carga na rua ou conta vencendo, aparece aqui.</span>
    </div>
  `;

  recent.innerHTML = state.orders.slice(0, 6).map(order => `
    <button class="dashboard-row" type="button" data-view-shortcut="orders">
      <span>
        <strong>Pedido ${order.number} · ${money(order.totalAmount)}</strong>
        <small>${escapeHtml(order.customer?.legalName ?? "Cliente")} · ${escapeHtml(order.seller?.name ?? "Vendedor")} · ${escapeHtml(order.status)}</small>
      </span>
      ${statusBadge(order.status)}
    </button>
  `).join("") || `
    <div class="empty-state">
      <strong>Nenhum pedido lançado</strong>
      <span>Use “Novo pedido” para começar o fluxo.</span>
    </div>
  `;
}

function renderOrders() {
  const list = $("#ordersList");
  list.innerHTML = "";

  if (state.orders.length === 0) {
    list.innerHTML = `<div class="card"><strong>Nenhum pedido ainda</strong><div class="meta">Crie um pedido para demonstrar o fluxo.</div></div>`;
    return;
  }

  for (const order of state.orders) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-header">
        <div>
          <strong>Pedido ${order.number} - ${money(order.totalAmount)}</strong>
          <div class="meta">${order.customer?.legalName ?? "Cliente"} | ${order.seller?.name ?? "Vendedor"}</div>
          <div class="meta">${order.isFiscalInvoiceRequested ? "Pedido para NF-e" : "Executado"} | ${order.paymentCondition || "sem condição"} | Peso ${Number(order.totalWeightInKg || 0).toFixed(3)} kg</div>
        </div>
        ${statusBadge(order.status)}
      </div>
      <div class="card-actions">
        <button type="button" data-vale="${order.id}">Ver executado</button>
        <button type="button" data-edit-order="${order.id}">Editar</button>
        <button type="button" data-delete-order="${order.id}">Excluir</button>
      </div>
    `;
    list.append(card);
  }
}

function renderLoads() {
  const list = $("#loadsList");
  list.innerHTML = "";
  const visibleLoads = state.loads.filter(load => load.orders.length > 0);

  if (visibleLoads.length === 0) {
    list.innerHTML = `<div class="card"><strong>Nenhuma carga criada</strong><div class="meta">Selecione pedidos confirmados e monte uma carga.</div></div>`;
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
          <strong>Carga ${load.number} - ${load.region?.name ?? ""}</strong>
          <div class="meta">${dateBR(load.scheduledDate)} | ${load.vehicle ? `${load.vehicle.name} - ${load.vehicle.plate}` : "Sem veículo"} | Motorista: ${load.driverName || "-"}</div>
          <div class="meta">${load.orders.length} pedidos | Total ${money(total)} | Recebido ${money(received)}</div>
        </div>
        ${statusBadge(load.status)}
      </div>
      <div class="card-actions">
        ${load.status === "Open" ? `<button type="button" data-dispatch="${load.id}">Marcar saída pra rua</button>` : ""}
        <button type="button" data-report-load="${load.id}">PDF da carga</button>
        <button type="button" data-report-loading="${load.id}">Carregamento expedição</button>
        <button type="button" data-edit-load="${load.id}">Editar</button>
        <button type="button" data-delete-load="${load.id}">Excluir</button>
      </div>
      <p class="delivery-help">Baixa da entrega: informe quanto recebeu em cada pedido e clique em Entregue ou Retornou.</p>
      <div class="order-lines">
        ${load.orders.map(item => renderLoadOrder(load, item)).join("")}
      </div>
    `;
    list.append(card);
  }
}

function renderLoadOrder(load, item) {
  const order = item.order;
  const pending = item.deliveryStatus === "Pending";
  const received = item.amountReceived ?? order?.totalAmount ?? 0;
  return `
    <div class="load-order" data-load-order="${load.id}:${order.id}">
      <div>
        <strong>Pedido ${order?.number ?? "-"} - ${money(order?.totalAmount)}</strong>
        <div class="meta">${order?.customer?.legalName ?? "Cliente"} | ${statusBadge(item.deliveryStatus)}</div>
        ${item.deliveryNotes ? `<div class="meta">Obs.: ${item.deliveryNotes}</div>` : ""}
      </div>
      ${pending ? `
        <div class="delivery-close">
          <label>Recebido
            <input name="amountReceived" type="number" step="0.01" min="0" value="${Number(received).toFixed(2)}">
          </label>
          <label>Pagamento
            <select name="paymentMethod">
              <option value="${PaymentMethod.Pix}">Pix</option>
              <option value="${PaymentMethod.Cash}">Dinheiro</option>
              <option value="${PaymentMethod.Boleto}">Boleto</option>
              <option value="${PaymentMethod.Check}">Cheque</option>
              <option value="${PaymentMethod.Card}">Cartão</option>
              <option value="${PaymentMethod.Transfer}">Transferência</option>
              <option value="${PaymentMethod.Other}">Outro</option>
            </select>
          </label>
          <label class="delivery-note">Observação
            <input name="deliveryNotes" placeholder="ex: pago no Pix, voltou fechado">
          </label>
          <div class="card-actions">
            <button type="button" class="primary" data-close-delivered="${load.id}:${order.id}">Entregue</button>
            <button type="button" data-close-returned="${load.id}:${order.id}">Retornou</button>
          </div>
        </div>
      ` : `
        <div class="delivery-done">
          <strong>Baixa feita</strong>
          <div class="meta">Recebido ${money(item.amountReceived)} | ${item.paymentMethod}</div>
        </div>
      `}
    </div>
  `;
}

function renderLoadOrderChoices() {
  const container = $("#loadOrderChoices");
  if (!container) return;
  const selectedRegionId = $("#loadForm select[name='regionId']")?.value;
  const editingLoad = state.loads.find(x => x.id === state.editing.load);
  const selectedOrderIds = new Set(editingLoad?.orders.map(x => x.orderId) ?? []);
  const available = state.orders.filter(order => {
    const sameRegion = !selectedRegionId || order.customer?.regionId === selectedRegionId;
    const canUse = order.status === "Confirmed" || selectedOrderIds.has(order.id);
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
      <span>Pedido ${order.number}<br><small>${order.customer?.legalName ?? "Cliente"} - ${order.customer?.region?.name ?? "sem região"} - ${money(order.totalAmount)}</small></span>
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
          <strong>${item.description} - ${money(item.amount)}</strong>
          <div class="meta">${item.supplierName || "Fornecedor não informado"} | vence ${dateBR(item.dueDate)}</div>
          ${item.notes ? `<div class="meta">${item.notes}</div>` : ""}
        </div>
        ${financialStatusBadge(item.status)}
      </div>
      <div class="card-actions">
        ${item.status === "Open" ? `<button type="button" class="primary" data-pay-payable="${item.id}">Marcar pago</button>` : ""}
        <button type="button" data-edit-payable="${item.id}">Editar</button>
        <button type="button" data-delete-payable="${item.id}">Excluir</button>
      </div>
    </div>
  `).join("") || `<div class="card"><strong>Nenhuma conta a pagar.</strong></div>`;

  $("#receivablesCount").textContent = `${state.receivables.length} conta(s)`;
  $("#receivablesList").innerHTML = state.receivables.map(item => `
    <div class="card">
      <div class="card-header">
        <div>
          <strong>${item.description} - ${money(item.amount)}</strong>
          <div class="meta">${item.customer?.legalName || "Cliente não informado"} ${item.orderNumber ? `| Pedido ${item.orderNumber}` : ""} | vence ${dateBR(item.dueDate)}</div>
          ${item.notes ? `<div class="meta">${item.notes}</div>` : ""}
        </div>
        ${financialStatusBadge(item.status)}
      </div>
      <div class="card-actions">
        ${item.status === "Open" ? `<button type="button" class="primary" data-receive-receivable="${item.id}">Marcar recebido</button>` : ""}
        <button type="button" data-edit-receivable="${item.id}">Editar</button>
        <button type="button" data-delete-receivable="${item.id}">Excluir</button>
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
          <span>${item.description}</span>
          <span>${money(item.amount)}</span>
        </strong>
        <div class="meta">${item.supplierName || "Fornecedor não informado"}</div>
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
    <input name="productCode" placeholder="4300" required>
    <input name="quantity" type="number" step="0.001" min="0.001" value="1" required>
    <input name="unitPrice" type="number" step="0.01" min="0.01" placeholder="auto">
    <input name="totalAmount" type="number" step="0.01" min="0.01" placeholder="auto">
    <div class="product-hint">Digite o codigo</div>
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

    hint.classList.remove("ok", "warn");
    if (!code) {
      hint.textContent = "Digite o codigo";
      return;
    }

    if (!product) {
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
  try {
    const result = await api(url, { method, body: JSON.stringify(bodyFactory(form)) });
    form.reset();
    state.editing[form.dataset.editKey] = null;
    updateFormMode(form);
    closeEditModal();
    if (form.id === "orderForm") {
      $("#itemRows").innerHTML = "";
      addItemRow();
    }
    toast("Salvo com sucesso.");
    await refreshAll();
    if (afterSave) afterSave(result);
  } catch (error) {
    toast(error.message || "Não foi possível salvar. Veja os dados informados.");
    console.error(error);
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
  if (cancel) cancel.style.display = editing ? "block" : "none";
}

function openEditModal(form, title) {
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
  $("#editModal").classList.add("open");
  $("#editModal").setAttribute("aria-hidden", "false");
  form.scrollTop = 0;
  form.querySelector("input, select, button")?.focus();
}

function closeEditModal() {
  if (!editModal.form) return;

  if (editModal.placeholder?.parentNode) {
    editModal.placeholder.parentNode.insertBefore(editModal.form, editModal.placeholder);
    editModal.placeholder.remove();
  }

  $("#editModal").classList.remove("open");
  $("#editModal").setAttribute("aria-hidden", "true");
  $("#editModalTitle").textContent = "Editar item";
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
  form.elements.dueDate.value = dueDate.toISOString().slice(0, 10);
}

function wireNav() {
  $$("aside [data-view]").forEach(button => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  $$("[data-menu-toggle]").forEach(button => {
    button.addEventListener("click", () => {
      button.closest(".nav-group")?.classList.toggle("open");
    });
  });

  $("#sidebarToggle").addEventListener("click", () => {
    const isCollapsed = document.body.classList.toggle("sidebar-collapsed");
    const label = isCollapsed ? "Expandir menu" : "Minimizar menu";
    $("#sidebarToggle").setAttribute("title", label);
    $("#sidebarToggle").setAttribute("aria-label", label);
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
    receivableForm: "receivable"
  };

  for (const [formId, key] of Object.entries(keys)) {
    const form = $(`#${formId}`);
    form.dataset.editKey = key;
    const primary = $("button.primary", form);
    if (primary) primary.dataset.createLabel = primary.textContent;
    updateFormMode(form);
  }
}

function resetEdit(key) {
  state.editing[key] = null;
  const form = $(`[data-edit-key='${key}']`);
  if (!form) return;
  form.reset();
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
  $("#customerSearch").value = order.customer?.legalName ?? "";
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
  if (!confirm(`Tem certeza que deseja excluir ${label}?`)) return;
  try {
    await api(url, { method: "DELETE" });
    toast("Excluido com sucesso.");
    await refreshAll();
  } catch (error) {
    toast(error.message || "Não foi possível excluir.");
    console.error(error);
  }
}

function showView(view) {
  const button = $(`aside [data-view='${view}']`);
  if (!button) return;
  $$("aside [data-view]").forEach(x => x.classList.remove("active"));
  $$(".view").forEach(x => x.classList.remove("active"));
  button.classList.add("active");
  $(`#${view}`).classList.add("active");
  const group = button.closest(".nav-group");
  if (group) group.classList.add("open");
}

function wireActions() {
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
    const panel = $("#notificationPanel");
    const isHidden = panel.hidden;
    panel.hidden = !isHidden;
    $("#notificationButton").setAttribute("aria-expanded", String(isHidden));
  });

  $$("[data-filter]").forEach(input => {
    input.addEventListener("input", renderCatalogLists);
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
    const target = event.target;
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

    const dispatchId = event.target.dataset?.dispatch;
    if (dispatchId) {
      await api(`/api/delivery-loads/${dispatchId}/dispatch`, { method: "POST" });
      toast("Carga marcada como saiu pra rua.");
      await refreshAll();
      return;
    }

    const delivered = event.target.dataset?.closeDelivered;
    if (delivered) {
      const [loadId, orderId] = delivered.split(":");
      const row = event.target.closest(".load-order");
      const amount = Number($("input[name='amountReceived']", row)?.value || 0);
      const payment = Number($("select[name='paymentMethod']", row)?.value || PaymentMethod.Pix);
      const notes = $("input[name='deliveryNotes']", row)?.value || "Entregue e recebido.";
      await closeDelivery(loadId, orderId, DeliveryStatus.Delivered, payment, amount, notes);
      return;
    }

    const returned = event.target.dataset?.closeReturned;
    if (returned) {
      const [loadId, orderId] = returned.split(":");
      const row = event.target.closest(".load-order");
      const notes = $("input[name='deliveryNotes']", row)?.value || "Retornou da rua.";
      await closeDelivery(loadId, orderId, DeliveryStatus.Returned, PaymentMethod.None, 0, notes);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !editModal.form) return;
    resetEdit(editModal.form.dataset.editKey);
  });
}

async function closeDelivery(loadId, orderId, deliveryStatus, paymentMethod, amountReceived, deliveryNotes) {
  await api(`/api/delivery-loads/${loadId}/orders/${orderId}/close`, {
    method: "POST",
    body: JSON.stringify({ deliveryStatus, paymentMethod, amountReceived, deliveryNotes })
  });
  toast("Baixa registrada.");
  await refreshAll();
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
        <div><strong>Carregamento</strong>: ${vale.loadingNumber ?? "-"}</div>
        <div><strong>Vendedor</strong>: ${vale.seller?.name ?? "-"}</div>
      </div>
      <div class="vale-client">
        <div>
          <strong>Cliente</strong>: ${customer.legalName}<br>
          Endereço: ${customer.street}, ${customer.number} ${customer.complement ?? ""}<br>
          Bairro: ${customer.district}
        </div>
        <div>
          <strong>CNPJ</strong>: ${customer.taxId}
          <strong>IE</strong>: ${customer.stateRegistration ?? "-"}<br>
          Número: ${customer.number} Comp.: ${customer.complement ?? ""}<br>
          CEP: ${customer.postalCode ?? "-"}
        </div>
        <div>
          <strong>Contato</strong>: ${customer.phone ?? "-"}<br>
          Cidade: ${customer.city} - UF: ${customer.state}
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
              <td>${item.unit}</td>
              <td>${item.productCode}</td>
              <td>${item.productName}</td>
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
  if (["orders", "salesPosition"].includes(type)) {
    await refreshOrders();
    return;
  }

  if (["loads", "load", "loading", "loadingLoad"].includes(type)) {
    await refreshLoads();
    return;
  }
}

function buildReport(type, id, filters = {}) {
  const builders = {
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
            <th>Cond. Pgto</th>
            <th class="right">Preço</th>
            <th class="right">V. Total</th>
            <th>Emissão</th>
            <th>Data Ent.</th>
            <th>Obs.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(({ order, item }) => `
            <tr>
              <td class="right">${quantityRaw(item.quantity)}</td>
              <td>${escapeHtml(order.customer?.legalName ?? "-")}</td>
              <td>${escapeHtml(order.paymentCondition ?? "-")}</td>
              <td class="right">${money(item.unitPrice)}</td>
              <td class="right">${money(item.totalAmount)}</td>
              <td>${dateBR(dateTimeToDateOnly(order.createdAt))}</td>
              <td>${dateBR(order.dueDate)}</td>
              <td>${escapeHtml(order.notes ?? "")}</td>
            </tr>
          `).join("") || `<tr><td colspan="8">Nenhuma venda encontrada com os filtros.</td></tr>`}
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
        <thead><tr><th>Carga</th><th>Data</th><th>Região</th><th>Veículo</th><th>Motorista</th><th>Status</th><th>Pedidos</th><th class="right">Total</th><th class="right">Recebido</th></tr></thead>
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
                <td>${load.orders.length}</td>
                <td class="right">${money(total)}</td>
                <td class="right">${money(received)}</td>
              </tr>
            `;
          }).join("") || `<tr><td colspan="9">Nenhuma carga encontrada com os filtros.</td></tr>`}
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
  await refreshCatalog();
  await refreshOrders();
  await refreshLoads();
  await refreshFinancial();
}

async function init() {
  setupFormModes();
  wireNav();
  wireForms();
  wireActions();
  addItemRow();
  await refreshAll();
  setInterval(() => refreshAll().catch(console.error), 30000);
}

init().catch(error => {
  toast("Erro ao carregar dados iniciais.");
  console.error(error);
});
