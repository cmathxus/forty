import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/loads.js', import.meta.url), 'utf8');
function setup() {
  const elements = new Map();
  const state = { loads: [] };
  const context = vm.createContext({ state, qrSelectedLoadId: null,
    $: selector => { if (!elements.has(selector)) elements.set(selector, { hidden: false, checked: false, innerHTML: '', scrollIntoView() {} }); return elements.get(selector); },
    escapeHtml: value => String(value), dateBR: value => value, checkedDateTime: value => value,
    hasPermission: () => true, loadHasShortage: () => false, renderLoadOrder: () => 'PEDIDO',
    renderLoadReconciliation: () => 'RESUMO_PRODUTOS', loadReturnDetails: () => 'RETORNO', renderLoads() {} });
  vm.runInContext(source, context);
  return { state, elements, context, run: code => vm.runInContext(code, context) };
}
test('lista de cargas mostra apenas resumo e não mistura ações ou conferência', () => {
  const ui = setup(); ui.state.loads = [{ id: 'a', number: 1, status: 'Open', orders: [] }];
  ui.run('renderLoadWorkspace()');
  const html = ui.elements.get('#loadsList').innerHTML;
  assert.match(html, /data-open-load="a"/); assert.match(html, /Preparação/);
  for (const action of ['data-dispatch', 'data-report-load', 'data-delete-load', 'RESUMO_PRODUTOS']) assert(!html.includes(action));
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
