import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/app.js', import.meta.url), 'utf8')
  .replace(/\ninit\(\)\.catch[\s\S]*$/, '');
const inventorySource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/inventory.js', import.meta.url), 'utf8');
const productionSource = readFileSync(new URL('../src/DudaErp.Api/wwwroot/production.js', import.meta.url), 'utf8');

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
