(() => {
  const views = {
    dashboard: 'orders.commercial', noAccess: null, orders: 'orders.commercial', loads: 'loads.read', inventory: 'stock.read', production: 'production.read',
    payables: 'payables.read', receivables: 'receivables.read', customers: 'customers.read', products: 'products.read',
    sellers: 'sellers.read', regions: 'regions.read', vehicles: 'vehicles.read', users: 'users.manage',
    reportOrders: 'orders.commercial', reportSalesPosition: 'orders.commercial', reportLoads: 'loads.read', reportLoading: 'loads.read',
    reportCustomers: 'customers.read', reportProducts: 'products.read'
  };
  const creates = { order: 'orders.create', load: 'loads.create', stock: 'stock.manage', productionPlan: 'production.create',
    customer: 'customers.create', product: 'products.create', seller: 'sellers.create', region: 'regions.create', vehicle: 'vehicles.create',
    payable: 'payables.create', receivable: 'receivables.create', user: 'users.manage' };
  const reports = { inventory: 'stock.read', productionPlan: 'production.read', reconciliation: 'loads.read',
    orders: 'orders.commercial', salesPosition: 'orders.commercial', loads: 'loads.read', load: 'loads.read', loading: 'loads.read',
    loadingLoad: 'loads.read', customers: 'customers.read', products: 'products.read' };
  const actions = { editCustomer: 'customers.edit', deleteCustomer: 'customers.delete', editProduct: 'products.edit', deleteProduct: 'products.delete',
    editSeller: 'sellers.edit', deleteSeller: 'sellers.delete', editRegion: 'regions.edit', deleteRegion: 'regions.delete',
    editVehicle: 'vehicles.edit', deleteVehicle: 'vehicles.delete', editOrder: 'orders.edit', deleteOrder: 'orders.delete', vale: 'orders.commercial',
    approveOrder: 'orders.approve', billOrder: 'orders.bill', checkPayable: 'payables.check', customerFinance: 'finance.customer',
    editLoad: 'loads.edit', deleteLoad: 'loads.delete', dispatch: 'loads.dispatch', reconcile: 'loads.reconcile',
    loadReturn: 'loads.return',
    reportLoad: 'loads.read', reportLoading: 'loads.read', reportReconciliation: 'loads.read',
    editPayable: 'payables.edit', deletePayable: 'payables.delete', payPayable: 'payables.pay',
    editReceivable: 'receivables.edit', deleteReceivable: 'receivables.delete', receiveReceivable: 'receivables.receive',
    productionComplete: 'production.complete', productionReport: 'production.read', productionCancel: 'production.cancel',
    editUser: 'users.manage', resetUserPassword: 'users.manage' };

  const canView = view => view === 'noAccess' ? Boolean(state.currentUser) : Boolean(views[view] && hasPermission(views[view]));
  const canCreate = key => Boolean(creates[key] && hasPermission(creates[key]));
  const canReport = type => Boolean(reports[type] && hasPermission(reports[type]));
  function canUse(element) {
    const data = element?.dataset || {};
    if (data.permission && !hasPermission(data.permission)) return false;
    if (data.view && !canView(data.view)) return false;
    if (data.viewShortcut && !canView(data.viewShortcut)) return false;
    if (data.create && !canCreate(data.create)) return false;
    if (data.report && !canReport(data.report)) return false;
    return Object.entries(actions).every(([key, permission]) => !(key in data) || hasPermission(permission));
  }
  function setVisible(element, visible) {
    if (!visible) { element.hidden = true; element.dataset.accessHidden = 'true'; }
    else if (element.dataset.accessHidden) { element.hidden = false; delete element.dataset.accessHidden; }
  }
  function apply(root = document) {
    const elements = [...root.querySelectorAll('button, [data-permission]')];
    if (root.matches?.('button, [data-permission]')) elements.push(root);
    elements.forEach(element => setVisible(element, canUse(element)));
    if (root !== document) return;
    document.querySelectorAll('.nav-group').forEach(group => {
      group.hidden = ![...group.querySelectorAll('[data-view]')].some(button => canView(button.dataset.view));
    });
    document.querySelectorAll('.view').forEach(view => { view.hidden = !canView(view.id); });
  }
  function clear() {
    state.loadSummary = null;
    loadListPage.generation++; loadListPage.items = []; loadListPage.total = 0; loadListPage.page = 1;
    loadListPage.totalPages = 1; loadListPage.loading = false; loadListPage.error = '';
    clearTimeout(loadFilterTimer);
    document.querySelectorAll('#loadListTools input, #loadListTools select').forEach(field => {
      if (field.type === 'checkbox') field.checked = false;
      else if (field._flatpickr) field._flatpickr.clear();
      else field.value = '';
      window.FortyControls?.syncSelect(field);
    });
    selectedLoadId = null;
    clearListPagination();
    qrSelectedLoadId = null;
    state.currentUser = null;
    for (const key of ['regions', 'sellers', 'customers', 'vehicles', 'products', 'orders', 'loads', 'payables', 'receivables', 'productionPlans', 'users']) state[key] = [];
    state.inventory = { items: [], movements: [] }; state.editing = {};
    document.querySelectorAll('.view .list, #metrics, #dashboardRecentOrders, #dashboardActions, #stockBalances, #stockHistory, #loadOrderChoices, #deliveryCheckItems, #productionPlanRows, #productionCompletionRows, #valeContent, #deliveryCheckContext, #productionCompletionContext, #userPasswordContext, #loadReturnContext').forEach(el => el.replaceChildren());
    closeVale();
    document.querySelectorAll('form[data-edit-key]').forEach(form => { form.reset(); delete form.dataset.dirty; });
    document.querySelectorAll('select[name="customerId"], select[name="sellerId"], select[name="productId"], select[name="regionId"], select[name="vehicleId"]').forEach(field => {
      field.replaceChildren(new Option('Selecione…', '')); window.FortyControls?.syncSelect(field);
    });
    window.FortyControls?.closeAll();
    renderMetrics();
    renderNotifications();
    apply();
  }
  function observe() {
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) apply(node);
    }))).observe(document.body, { childList: true, subtree: true });
  }
  window.FortyAccess = { apply, clear, canUse, canView, canCreate, canReport, observe,
    home: () => ['dashboard', 'loads', 'production', 'payables', ...Object.keys(views)]
      .find(view => view !== 'noAccess' && canView(view)) || 'noAccess' };
})();
