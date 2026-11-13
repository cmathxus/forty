import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/loads.js', import.meta.url), 'utf8');
function setup() {
  const elements = new Map();
  const state = { loads: [] };
  const context = vm.createContext({ state, qrSelectedLoadId: null, authGeneration: 0, URLSearchParams,
    $: selector => { if (!elements.has(selector)) elements.set(selector, { value: '', hidden: false, checked: false, innerHTML: '', scrollIntoView() {} }); return elements.get(selector); },
    escapeHtml: value => String(value), dateBR: value => value, checkedDateTime: value => value,
    hasPermission: () => true, loadHasShortage: () => false, renderLoadOrder: () => 'PEDIDO',
    renderLoadReconciliation: () => 'RESUMO_PRODUTOS', loadReturnDetails: () => 'RETORNO', renderLoads() {} });
  vm.runInContext(source, context);
  return { state, elements, context, run: code => vm.runInContext(code, context) };
}
test('lista de cargas mostra apenas resumo e não mistura ações ou conferência', () => {
  const ui = setup(); ui.state.loads = [{ id: 'a', number: 1, status: 'Open', orders: [] }];
  ui.run('loadListPage.items=state.loads');
  ui.run('renderLoadWorkspace()');
  const html = ui.elements.get('#loadsList').innerHTML;
  assert.match(html, /data-open-load="a"/); assert.match(html, /Preparação/);
  for (const action of ['data-dispatch', 'data-report-load', 'data-delete-load', 'RESUMO_PRODUTOS']) assert(!html.includes(action));
});

test('filtros e paginação vão na requisição e o frontend exibe somente a resposta da API', async () => {
  const ui = setup(); ui.run('renderLoadWorkspace()');
  for (const [field,value] of [['Status','2'],['Region','regiao-id'],['Vehicle','veiculo-id'],['Driver','João'],['Search','São Paulo & cliente'],['From','2026-11-01'],['To','2026-11-10']]) {
    ui.run(`$('#loadFilter${field}').value=${JSON.stringify(value)}`);
  }
  ui.run("$('#loadMissingOnly').checked=true;state.loads=[{id:'cache',status:'Open',number:1}]");
  let path;
  ui.context.api=async url => { path=url;return {items:[{id:'servidor',status:'Dispatched',returnedAt:'2026-11-10',number:9}],total:45,page:2,totalPages:3}; };
  await ui.run('refreshLoadPage(2)');
  const query=new URL(path,'https://test.invalid').searchParams;
  for(const [key,value] of [['page','2'],['pageSize','20'],['stage','2'],['regionId','regiao-id'],['vehicleId','veiculo-id'],['driver','João'],['search','São Paulo & cliente'],['shortages','true'],['from','2026-11-01'],['to','2026-11-10']]) assert.equal(query.get(key),value);
  const html=ui.elements.get('#loadsList').innerHTML;
  assert.match(html,/data-open-load="servidor"/); assert(!html.includes('data-open-load="cache"'));
});

test('resposta antiga ou de outra sessão não altera a página de cargas', async () => {
  const ui=setup(); const requests=[];
  ui.context.api=()=>new Promise(resolve=>requests.push(resolve));
  const first=ui.run('refreshLoadPage(1)'),second=ui.run('refreshLoadPage(2)');
  requests[1]({items:[],total:25,page:2,totalPages:2});await second;
  requests[0]({items:[],total:1,page:1,totalPages:1});await first;
  assert.equal(ui.run('loadListPage.page'),2);
  const oldSession=ui.run('refreshLoadPage(1)');ui.run('authGeneration++');
  requests[2]({items:[],total:0,page:1,totalPages:1});await oldSession;
  assert.equal(ui.run('loadListPage.page'),2);
});
test('etapas exibem uma ação principal e só mostram resumo por produto na conferência', () => {
  const ui = setup();
  ui.state.loads = [{ id: 'a', number: 1, status: 'Open', orders: [{ orderId: 'o', deliveryStatus: 'Pending' }] }];
  const render = () => ui.run('renderLoadDetails(state.loads[0])');
  let html = render(); assert.match(html, /Registrar saída/); assert(!html.includes('RESUMO_PRODUTOS')); assert(!html.includes('RETORNO'));
  ui.state.loads[0].status = 'Dispatched'; html = render(); assert.match(html, /Registrar retorno ao depósito/); assert(!html.includes('RESUMO_PRODUTOS'));
  ui.state.loads[0].returnedAt = '2026-11-10'; html = render(); assert.match(html, /Conferir próximo pedido/); assert.match(html, /RESUMO_PRODUTOS/);
  ui.state.loads[0].status = 'Closed'; html = render(); assert.match(html, /Conferência concluída/); assert(!html.includes('class="primary"'));
  assert(!html.includes('data-delete-load')); assert(!html.includes('data-edit-load'));
});
test('entrada pelo QR abre os detalhes e oculta ferramentas da lista', () => {
  const ui = setup(); ui.state.loads = [{ id: 'a', number: 1, status: 'Open', orders: [] }];
  ui.context.qrSelectedLoadId = 'a'; ui.run('renderLoadWorkspace()');
  assert.equal(ui.elements.get('#newLoadButton').hidden, true);
  assert.equal(ui.elements.get('#loadListTools').hidden, true);
  assert.match(ui.elements.get('#loadsList').innerHTML, /data-close-load/);
});
