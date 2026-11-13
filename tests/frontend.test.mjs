import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/app.js', import.meta.url), 'utf8')
  .replace(/\ninit\(\)\.catch[\s\S]*$/, '');
const inventorySource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/inventory.js', import.meta.url), 'utf8');
const productionSource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/production.js', import.meta.url), 'utf8');
const accessSource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/access.js', import.meta.url), 'utf8');
const qrSource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/load-qr.js', import.meta.url), 'utf8');
const qrVendor = readFileSync(new URL('../src/DudaErp.Api/wwwroot/vendor/qrcode-1.4.4.js', import.meta.url), 'utf8');
const paginationSource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/pagination.js', import.meta.url), 'utf8');

function setupPages() {
  const ui = setup(); ui.context.URLSearchParams = URLSearchParams;
  vm.runInContext(paginationSource, ui.context);
  ui.run(`accessToken='token';state.currentUser={permissions:['customers.read']};renderPagination=()=>{};
    renderCustomersList=()=>{window.rendered=listRows('customers').map(row=>row.id)}`);
  return ui;
}

test('paginação solicita apenas a página escolhida com busca no backend e preserva o total retornado', async () => {
  const ui = setupPages();
  let requested;
  ui.context.fetchPage = async path => { requested = path; return { items: [{ id: 'servidor', legalName: 'Servidor' }], total: 426, page: 2, totalPages: 22 }; };
  ui.run(`api=fetchPage;listPage('customers').search='nome & cidade';state.customers=[{id:'cache',legalName:'nome & cidade'}]`);
  await ui.run(`refreshList('customers',2)`);
  const url = new URL(requested, 'https://test.invalid');
  assert.equal(url.searchParams.get('pageSize'), '20'); assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('search'), 'nome & cidade');
  assert.equal(ui.run(`listCount('customers')`), '21–40 de 426');
  assert.deepEqual(Array.from(ui.context.window.rendered), ['servidor']); // Não filtra a página nem usa o cache como lista.
});

test('resposta antiga de busca não sobrescreve a nova e resposta de outra sessão é descartada', async () => {
  const ui = setupPages(); const requests = [];
  ui.context.fetchPage = () => new Promise(resolve => requests.push(resolve)); ui.run('api=fetchPage');
  const old = ui.run(`refreshList('customers',2)`);
  ui.run(`listPage('customers').search='nova'`);
  const current = ui.run(`refreshList('customers',1)`);
  requests[1]({ items: [{ id: 'nova' }], total: 1, page: 1, totalPages: 1 }); await current;
  requests[0]({ items: [{ id: 'antiga' }], total: 426, page: 2, totalPages: 22 }); await old;
  assert.equal(ui.run(`listRows('customers')[0].id`), 'nova');
  const expired = ui.run(`refreshList('customers')`); ui.run(`accessToken='outra-sessao'`);
  requests[2]({ items: [{ id: 'sessao-anterior' }], total: 1, page: 1, totalPages: 1 }); await expired;
  assert.equal(ui.run(`listRows('customers')[0].id`), 'nova');
});

test('pedidos enviam busca e situação ao backend sem filtrar o cache local', async () => {
  const ui=setupPages(); let path;
  ui.elements.set('#orderStatusFilter',{value:'Scheduled'});
  ui.elements.set('#orderApprovalFilter',{value:'true'});
  ui.elements.set('#orderDeliveryFilter',{value:'false'});
  ui.context.fetchPage=async url=>{path=url;return {items:[{id:'resultado-api'}],total:1,page:1,totalPages:1};};
  ui.run(`state.currentUser={permissions:['orders.commercial']};api=fetchPage;renderOrders=()=>{};listPage('orders').search='cliente & vendedor';state.orders=[{id:'cache'}]`);
  await ui.run(`refreshList('orders',1)`);
  const query=new URL(path,'https://test.invalid').searchParams;
  assert.equal(query.get('status'),'Scheduled');assert.equal(query.get('search'),'cliente & vendedor');
  assert.equal(query.get('approved'), 'true'); assert.equal(query.get('delivered'), 'false');
  assert.deepEqual(Array.from(ui.run(`listRows('orders')`),row=>row.id),['resultado-api']);
});

test('QR carrega o detalhe por ID mesmo quando a carga não está na página retornada', async () => {
  const ui=setup(); vm.runInContext(qrSource,ui.context);
  const id='11111111-2222-3333-4444-555555555555', paths=[];
  ui.context.window.location={hash:`#conferencia=${id}`};
  ui.context.request=async path=>{ paths.push(path);return path.endsWith('/summary') ? {preparing:25,onRoute:1} : {id,number:99,orders:[]}; };
  ui.run(`api=request;refreshLoadPage=async()=>{};refreshLoadFilterOptions=async()=>{};renderLoads=()=>{};renderMetrics=()=>{};state.loads=[]`);
  await ui.run('refreshLoads()');
  assert(paths.includes(`/api/delivery-loads/${id}`));assert(!paths.includes('/api/delivery-loads'));
  assert.equal(ui.run('state.loads[0].id'),id);
});

test('digitar busca volta à primeira página e agrupa digitação antes de chamar a API', async () => {
  const ui = setupPages(); const handlers = {}, pending = new Map(); let timerId = 0, calls = 0;
  ui.context.setTimeout = callback => { pending.set(++timerId, callback); return timerId; };
  ui.context.clearTimeout = id => pending.delete(id);
  for (const key of ['orders','customers','products','sellers','regions','vehicles','users']) {
    const input = { value: '', setAttribute() {}, addEventListener: (_event, handler) => handlers[key] = handler };
    ui.elements.set(key === 'orders' ? '#orderSearch' : key === 'users' ? '#userSearch' : `[data-filter='${key}']`, input);
  }
  ui.context.fetchPage = async () => { calls++; return { items: [], total: 0, page: 1, totalPages: 1 }; };
  ui.run(`api=fetchPage;listPage('customers').page=7;wireListPagination()`);
  const input = ui.elements.get(`[data-filter='customers']`);
  input.value = 'a'; handlers.customers(); input.value = 'azul'; handlers.customers();
  assert.equal(calls, 0); assert.equal(pending.size, 1); assert.equal(ui.run(`listPage('customers').page`), 1);
  await [...pending.values()][0](); assert.equal(calls, 1);
  assert.equal(ui.run(`listPage('customers').search`), 'azul');
});

function setupQr(href = 'https://cmathxus.github.io/forty/?secret=discard#old') {
  const ui = setup();
  ui.context.URL = URL;
  ui.context.window.location = new URL(href);
  ui.context.window.history = { replaceState(_state, _title, path) { ui.context.window.location = new URL(path, ui.context.window.location); } };
  vm.runInContext(qrVendor + '\n' + qrSource + '\n' + inventorySource, ui.context);
  ui.run(`renderLoads=()=>{}; showView=view=>{window.openedView=view}; toast=message=>{window.message=message}`);
  return ui;
}

test('romaneios geram QR local por carga com destino no Pages e sem credenciais', () => {
  const ui = setupQr();
  const id = '11111111-2222-3333-4444-555555555555';
  const other = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  assert.equal(ui.run(`loadQrUrl('${id}')`), `https://cmathxus.github.io/forty/#conferencia=${id}`);
  assert.throws(() => ui.run(`loadQrUrl('<script>')`));
  ui.run(`state.loads=[{id:'${id}',number:10,orders:[]},{id:'${other}',number:11,orders:[]}]`);
  const body = ui.run('reportLoadingLoad(state.loads[0].id).body');
  assert(body.includes('<svg')); assert(body.includes(`#conferencia=${id}`));
  assert(!body.includes('secret='));
  assert(ui.run('reportSingleLoad(state.loads[0].id).body').includes(`#conferencia=${id}`));
  const grouped = ui.run('state.loads.map(load=>renderLoadingLoadBody(load,true)).join("")');
  assert.equal((grouped.match(/<svg/g) || []).length, 2);
  assert(grouped.includes(`#conferencia=${other}`));
  ui.context.window.location = new URL('https://forty-3ot8.onrender.com/');
  assert.equal(ui.run(`loadQrUrl('${id}')`), `https://forty-3ot8.onrender.com/#conferencia=${id}`);
});

test('leitura do QR preserva destino no login e abre somente a carga autorizada', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const ui = setupQr(`https://cmathxus.github.io/forty/#conferencia=${id}`);
  ui.run('openLoadQrTarget()');
  assert.equal(ui.run('qrSelectedLoadId'), null);
  assert.equal(ui.context.window.location.hash, `#conferencia=${id}`);
  ui.run(`accessToken='token';state.currentUser={permissions:['loads.read']};state.loads=[{id:'${id}'}];openLoadQrTarget()`);
  assert.equal(ui.run('qrSelectedLoadId'), id);
  assert.equal(ui.context.window.openedView, 'loads');
  ui.run('closeLoadQrTarget()');
  assert.equal(ui.run('qrSelectedLoadId'), null); assert.equal(ui.context.window.location.hash, '');
});

test('QR rejeita perfil sem permissão, carga ausente e identificador inválido sem gravar baixa', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  const ui = setupQr(`https://cmathxus.github.io/forty/#conferencia=${id}`);
  ui.run(`accessToken='token';state.currentUser={permissions:['production.read']};openLoadQrTarget()`);
  assert.match(ui.context.window.message, /não tem acesso/);
  assert.equal(ui.run('qrSelectedLoadId'), null);
  ui.context.window.location.hash = `conferencia=${id}`;
  ui.run(`state.currentUser={permissions:['loads.read']};openLoadQrTarget()`);
  assert.match(ui.context.window.message, /não encontrada/);
  ui.context.window.location.hash = 'conferencia=abc';
  ui.run('openLoadQrTarget()');
  assert.match(ui.context.window.message, /inválido/);
  assert.equal(ui.context.window.location.hash, '');
});

test('retorno de entrega não realizada destaca falta sem tratar pedidos pendentes como desvio', () => {
  const ui = setup(); vm.runInContext(inventorySource, ui.context);
  ui.run(`state.loads = [{id:'c',driverName:'Motorista',orders:[
    {deliveryStatus:'Returned',order:{number:1,items:[{id:'a',productId:'p',productCode:'A',productName:'Flokmel',unit:'FD',quantity:10}]},itemResults:[{orderItemId:'a',deliveredQuantity:0,returnedQuantity:8,missingQuantity:2}]},
    {deliveryStatus:'Pending',order:{number:2,items:[{id:'b',productId:'p',productCode:'A',productName:'Flokmel',unit:'FD',quantity:5}]},itemResults:[]},
    {deliveryStatus:'Delivered',order:{number:3,items:[{id:'c',productId:'p',productCode:'A',productName:'Flokmel',unit:'FD',quantity:4}]},itemResults:[]},
    {deliveryStatus:'Pending',order:{number:4,items:[{id:'d',productId:'p',productCode:'A',productName:'Flokmel',unit:'UN',quantity:20}]},itemResults:[]}
  ]}]`);
  const rows = ui.run('loadProductReconciliation(state.loads[0])');
  assert.equal(rows.length, 2);
  const fardos = rows.find(x => x.unit === 'FD');
  assert.equal(fardos.sent, 19); assert.equal(fardos.returned, 8); assert.equal(fardos.missing, 2);
  assert.equal(fardos.pending, 5); assert.equal(fardos.historical, 4);
  assert.equal(ui.run('loadHasShortage(state.loads[0])'), true);
  const check = ui.run(`deliveryCheckSummary([{id:'a',quantity:10,totalAmount:100}], [{orderItemId:'a',deliveredQuantity:'0',returnedQuantity:'8'}])`);
  assert.equal(check.status, 4); assert.equal(check.items[0].missingQuantity, 2); assert.equal(check.deliveredAmount, 0);
  assert(ui.run('reportReconciliation("c").body').includes('Resumo por produto'));
});

test('registro de chegada abre vazio e distingue retorno físico do horário da conferência', () => {
  const ui = setup(); vm.runInContext(inventorySource, ui.context);
  const form = { dataset: {}, elements: { returnDate: { value: '2026-01-01' }, returnTime: { value: '10:00' } },
    reset() { this.elements.returnDate.value=''; this.elements.returnTime.value=''; } };
  ui.elements.set('#loadReturnForm', form);
  ui.run(`state.currentUser={permissions:['loads.return']};state.loads=[{id:'load',number:42,status:'Dispatched',driverName:'Motorista'}];
    openEditModal=()=>{};openLoadReturn('load')`);
  assert.equal(form.elements.returnDate.value, ''); assert.equal(form.elements.returnTime.value, '');
  assert.equal(form.dataset.loadId, 'load');
  const details = ui.run(`loadReturnDetails({returnedAt:'2026-11-10T17:30:00Z',returnRecordedAt:'2026-11-10T18:00:00Z',returnRecordedBy:'Operador <QA>'})`);
  assert.match(details, /Retorno ao depósito/); assert(details.includes('Operador &lt;QA&gt;'));
  assert.match(ui.run(`loadReturnDetails({})`), /Não registrado/);
});

test('atalho de entrega não realizada zera entregue e pede contagem física do que voltou', () => {
  const ui = setup(); vm.runInContext(inventorySource, ui.context);
  const delivered = { value: '4' }, returned = { value: '6', focus() {} };
  const row = { dataset: { itemId: 'a' }, querySelector: selector => selector === '[name=deliveredQuantity]' ? delivered : returned };
  const form = { dataset: { loadId: 'c', orderId: 'o' }, elements: { amountReceived: { value: '10' }, paymentMethod: { value: '2' } }, querySelectorAll: () => [row], querySelector: () => returned };
  ui.elements.set('#deliveryCheckForm', form);
  ui.run(`state.loads=[{id:'c',orders:[{orderId:'o',order:{items:[{id:'a',quantity:10}]}}]}]; updateDeliveryCheck=()=>{}; fillDeliveryPreset('notDelivered')`);
  assert.equal(delivered.value, 0); assert.equal(returned.value, ''); assert.equal(form.dataset.dirty, 'true');
  assert.equal(form.elements.amountReceived.value, '0'); assert.equal(form.elements.paymentMethod.value, '0');
});

test('menus, atalhos e ações respeitam os acessos confirmados para cada setor', () => {
  const ui = setup();
  vm.runInContext(accessSource, ui.context);
  ui.run(`state.currentUser = {permissions:['products.read','stock.read','production.read']}`);
  assert.equal(ui.run(`window.FortyAccess.home()`), 'production');
  assert.equal(ui.run(`window.FortyAccess.canView('production')`), true);
  assert.equal(ui.run(`window.FortyAccess.canView('products')`), true);
  for (const view of ['users','payables','customers','orders','loads']) assert.equal(ui.run(`window.FortyAccess.canView('${view}')`), false);
  assert.equal(ui.run(`window.FortyAccess.canUse({dataset:{editProduct:'x'}})`), false);
  assert.equal(ui.run(`window.FortyAccess.canCreate('stock')`), false);
  ui.run(`state.currentUser = {permissions:['products.read','stock.read','loads.read','loads.create','orders.read']}`);
  assert.equal(ui.run(`window.FortyAccess.home()`), 'loads');
  assert.equal(ui.run(`window.FortyAccess.canCreate('load')`), true);
  assert.equal(ui.run(`window.FortyAccess.canCreate('order')`), false);
  assert.equal(ui.run(`window.FortyAccess.canReport('reconciliation')`), true);
  assert.equal(ui.run(`window.FortyAccess.canReport('salesPosition')`), false);
  ui.run(`state.currentUser = {permissions:['orders.commercial','orders.create','customers.read','customers.edit','receivables.create']}`);
  assert.equal(ui.run(`window.FortyAccess.home()`), 'dashboard');
  assert.equal(ui.run(`window.FortyAccess.canView('payables')`), false);
  assert.equal(ui.run(`window.FortyAccess.canCreate('receivable')`), true);
  assert.equal(ui.run(`window.FortyAccess.canUse({dataset:{editCustomer:'x'}})`), true);
  assert.equal(ui.run(`window.FortyAccess.canView('users')`), false);
});

test('envio da programação lê 301 do campo de quantidade, ignorando a busca do dropdown', () => {
  const ui = setup();
  vm.runInContext(productionSource, ui.context);
  const handlers = {};
  const searchInput = { value: '' };
  const row = { querySelector(selector) {
    if (selector === "select[name='productId']") return { value: 'produto-a' };
    if (selector === "input[name='quantity']") return { value: '301' };
    if (selector === 'input') return searchInput;
    throw new Error('Seletor inesperado: ' + selector);
  } };
  const form = { dataset: { requestId: 'req-a' }, elements: { scheduledDate: { value: '2026-11-06' }, notes: { value: '' } },
    querySelectorAll: () => [row], addEventListener: (type, handler) => handlers[type] = handler };
  ui.elements.set('#productionPlanForm', form);
  for (const id of ['#addProductionItem', '#productionCompletionForm']) ui.elements.set(id, { addEventListener() {} });
  let sent;
  ui.context.captureSubmission = (target, url, build) => sent = { url, body: build(target) };
  ui.run('submitJson = captureSubmission; wireProduction()');
  handlers.submit({ preventDefault() {}, target: form });
  assert.equal(sent.url, '/api/production');
  assert.equal(sent.body.items[0].productId, 'produto-a');
  assert.equal(sent.body.items[0].quantity, 301);
});

test('lista de produção imprime planejado e espaço para conferência sem presumir fabricação', () => {
  const ui = setup();
  vm.runInContext(inventorySource, ui.context);
  vm.runInContext(productionSource, ui.context);
  ui.run(`state.productionPlans = [{id:'p',number:1,scheduledDate:'2026-11-07',status:'Planned',createdBy:'Operador',notes:'<script>teste</script>',items:[{productCode:'A',productName:'Flokmel',unit:'FD',plannedQuantity:100}]}]`);
  const report = ui.run(`reportProductionPlan('p')`);
  assert(report.body.includes('100'));
  assert(report.body.includes('Flokmel'));
  assert(report.body.includes('________________'));
  assert(report.body.includes('não movimenta estoque'));
  assert(!report.body.includes('<script>teste</script>'));
  ui.run(`state.productionPlans[0].status='Completed';state.productionPlans[0].items[0].producedQuantity=90;state.productionPlans[0].productionDate='2026-11-07'`);
  assert(ui.run(`reportProductionPlan('p').body`).includes('90'));
});

test('conferência diferencia devolução física, entrega parcial e falta', () => {
  const context = vm.createContext({});
  vm.runInContext(inventorySource, context);
  const summary = vm.runInContext(`deliveryCheckSummary([{id:'a',quantity:10,totalAmount:100}],
    [{orderItemId:'a',deliveredQuantity:'6',returnedQuantity:'3'}])`, context);
  assert.equal(summary.items[0].missingQuantity, 1);
  assert.equal(summary.status, 2);
  assert.equal(summary.deliveredAmount, 60);
  assert.equal(summary.complete, true);
});

test('conferência não trata campos vazios como confirmação e rejeita excesso', () => {
  const context = vm.createContext({});
  vm.runInContext(inventorySource, context);
  for (const input of [`{orderItemId:'a',deliveredQuantity:'',returnedQuantity:''}`, `{orderItemId:'a',deliveredQuantity:'9',returnedQuantity:'2'}`]) {
    assert.equal(vm.runInContext(`deliveryCheckSummary([{id:'a',quantity:10,totalAmount:100}], [${input}]).complete`, context), false);
  }
});

function setup() {
  const fields = Object.fromEntries(['productCode', 'quantity', 'unitPrice', 'totalAmount'].map(name => [name, { name, value: '' }]));
  const hint = { textContent: '', classList: { add() {}, remove() {} } };
  const row = { dataset: {}, querySelector(selector) {
    return selector === '.product-hint' ? hint : fields[selector.match(/name='([^']+)'/)[1]];
  } };
  Object.values(fields).forEach(field => field.closest = () => row);
  const search = { value: '' }, total = { textContent: '' };
  const elements = new Map([['#customerSearch', search], ['#orderPreviewTotal', total]]);
  const context = vm.createContext({ console, window: {}, sessionStorage: { getItem: () => null }, document: {
    querySelector: selector => {
      if (!elements.has(selector)) elements.set(selector, { textContent: '', innerHTML: '' });
      return elements.get(selector);
    },
    querySelectorAll: selector => selector === '.item-row' ? [row] : []
  } });
  vm.runInContext(source, context);
  vm.runInContext('state.products = [{code:"A",name:"Produto A",salePrice:10,isActive:true},{code:"B",name:"Produto B",salePrice:25,isActive:true}]', context);
  return { context, row, fields, search, elements, run: script => vm.runInContext(script, context) };
}

test('busca por nome não retorna clientes sem correspondência', () => {
  const ui = setup();
  ui.run('state.customers = [{legalName:"Mercado Azul",taxId:"123"},{legalName:"Loja Verde",taxId:"456"}]');
  ui.search.value = 'Azul';
  assert.equal(ui.run('filteredCustomersForOrder().length'), 1);
  assert.equal(ui.run('filteredCustomersForOrder()[0].taxId'), '123');
});

test('listas de cadastro começam sem seleção e preservam escolha explícita ao atualizar', () => {
  const ui = setup();
  const select = { name: 'customerId', options: [], value: '', append(option) { this.options.push(option); },
    set innerHTML(_) { this.options = [{ value: '', textContent: '' }]; this.value = ''; } };
  ui.context.document.querySelectorAll = () => [select];
  ui.context.document.createElement = () => ({ value: '', textContent: '' });
  ui.run(`fillSelect('select', [{id:'cliente-a',name:'Cliente A'}], row => row.name)`);
  assert.equal(select.value, '');
  assert.equal(select.options[0].value, '');
  select.value = 'cliente-a';
  ui.run(`fillSelect('select', [{id:'cliente-a',name:'Cliente A'}], row => row.name)`);
  assert.equal(select.value, 'cliente-a');
  ui.run(`fillSelect('select', [], row => row.name)`);
  assert.equal(select.value, '');
});

test('trocar produto elimina o preço negociado do produto anterior', () => {
  const ui = setup();
  Object.assign(ui.fields.productCode, { value: 'B' });
  ui.fields.quantity.value = '2'; ui.fields.unitPrice.value = '7'; ui.fields.totalAmount.value = '14';
  ui.row.dataset.manualUnitPrice = 'true'; ui.row.dataset.manualTotal = 'true';
  ui.context.input = ui.fields.productCode;
  ui.run('refreshProductHints(input)');
  assert.equal(ui.fields.unitPrice.value, '25.00');
  assert.equal(ui.fields.totalAmount.value, '50.00');
});

test('alterar quantidade recalcula total de um item em edição', () => {
  const ui = setup();
  ui.fields.productCode.value = 'A'; ui.fields.quantity.value = '3';
  ui.fields.unitPrice.value = '8'; ui.fields.totalAmount.value = '16';
  ui.row.dataset.manualTotal = 'true'; ui.context.input = ui.fields.quantity;
  ui.run('refreshProductHints(input)');
  assert.equal(ui.fields.totalAmount.value, '24.00');
});

test('negociar total recalcula preço unitário', () => {
  const ui = setup();
  ui.fields.productCode.value = 'A'; ui.fields.quantity.value = '2';
  ui.fields.unitPrice.value = '10'; ui.fields.totalAmount.value = '15';
  ui.row.dataset.manualTotal = 'true'; ui.context.input = ui.fields.totalAmount;
  ui.run('refreshProductHints(input)');
  assert.equal(ui.fields.unitPrice.value, '7.50');
});

test('mensagem específica do servidor prevalece sobre título genérico', () => {
  const ui = setup();
  assert.equal(ui.run('errorMessage(JSON.stringify({title:"Erro",detail:"Carga já encerrada."}))'), 'Carga já encerrada.');
});

test('painel separa pedidos confirmados, cargas e contas abertas', () => {
  const ui = setup();
  ui.run(`
    state.orders = [
      {number:1,status:"Confirmed",totalAmount:10},
      {number:2,status:"Confirmed",totalAmount:20},
      {number:3,status:"Delivered",totalAmount:90},
      {number:4,status:"Cancelled",totalAmount:100}
    ];
    state.loads = [{status:"Open",orders:[]},{status:"Open",orders:[]},{status:"Dispatched",orders:[]},{status:"Closed",orders:[]}];
    state.receivables = [{status:"Open",amount:50},{status:"Received",amount:900}];
    state.payables = [{status:"Open",dueDate:"2000-01-01"},{status:"Paid",dueDate:"2000-01-01"},{status:"Open",dueDate:"2999-01-01"}];
    renderMetrics();
  `);
  assert.match(ui.elements.get('#waitingOrderValue').textContent, /30,00/);
  assert.equal(ui.elements.get('#waitingOrderCount').textContent, '2 pedidos confirmados');
  assert.equal(ui.elements.get('#flowWaiting').textContent, 2);
  assert.equal(ui.elements.get('#flowPreparing').textContent, 2);
  assert.equal(ui.elements.get('#flowOnRoute').textContent, 1);
  assert.match(ui.elements.get('#metrics').innerHTML, /50,00/);
  assert.doesNotMatch(ui.elements.get('#metrics').innerHTML, /900,00/);
  assert.match(ui.elements.get('#metrics').innerHTML, /Contas a pagar vencidas<\/span><strong>1<\/strong>/);
});
