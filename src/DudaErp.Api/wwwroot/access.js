(() => {
  const views = {
    dashboard: 'orders.manage', orders: 'orders.manage', loads: 'loads.manage', inventory: 'stock.read', production: 'production.manage',
    payables: 'finance.manage', receivables: 'finance.manage', customers: 'customers.manage', products: 'catalog.read',
    sellers: 'catalog.manage', regions: 'catalog.manage', vehicles: 'catalog.manage', users: 'users.manage',
    reportOrders: 'orders.manage', reportSalesPosition: 'orders.manage', reportLoads: 'loads.manage', reportLoading: 'loads.manage',
    reportCustomers: 'customers.manage', reportProducts: 'catalog.read'
  };
  const creates = { order: 'orders.manage', load: 'loads.manage', stock: 'stock.manage', productionPlan: 'production.manage',
    customer: 'customers.manage', product: 'catalog.manage', seller: 'catalog.manage', region: 'catalog.manage', vehicle: 'catalog.manage',
    payable: 'finance.manage', receivable: 'finance.manage', user: 'users.manage' };
  const reports = { inventory: 'stock.read', productionPlan: 'production.manage', reconciliation: 'loads.manage',
    orders: 'orders.manage', salesPosition: 'orders.manage', loads: 'loads.manage', load: 'loads.manage', loading: 'loads.manage',
    loadingLoad: 'loads.manage', customers: 'customers.manage', products: 'catalog.read' };
  const actions = { editCustomer: 'customers.manage', deleteCustomer: 'customers.manage', editProduct: 'catalog.manage', deleteProduct: 'catalog.manage',
    editSeller: 'catalog.manage', deleteSeller: 'catalog.manage', editRegion: 'catalog.manage', deleteRegion: 'catalog.manage',
    editVehicle: 'catalog.manage', deleteVehicle: 'catalog.manage', editOrder: 'orders.manage', deleteOrder: 'orders.manage', vale: 'orders.manage',
    editLoad: 'loads.manage', deleteLoad: 'loads.manage', dispatch: 'loads.manage', reconcile: 'loads.manage',
    loadReturn: 'loads.manage',
    reportLoad: 'loads.manage', reportLoading: 'loads.manage', reportReconciliation: 'loads.manage',
    editPayable: 'finance.manage', deletePayable: 'finance.manage', payPayable: 'finance.manage',
    editReceivable: 'finance.manage', deleteReceivable: 'finance.manage', receiveReceivable: 'finance.manage',
    productionComplete: 'production.manage', productionReport: 'production.manage', productionCancel: 'production.manage',
    editUser: 'users.manage', resetUserPassword: 'users.manage' };

  const canView = view => Boolean(views[view] && hasPermission(views[view]));
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
    home: () => hasPermission('orders.manage') ? 'dashboard' : hasPermission('loads.manage') ? 'loads' : hasPermission('production.manage') ? 'production' : 'inventory' };
})();
