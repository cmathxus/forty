import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/loading.js', import.meta.url), 'utf8');
function setup() {
  const classes = () => { const values = new Set(); return { contains: key => values.has(key), remove: key => values.delete(key), toggle(key,on) { if(on) values.add(key); else values.delete(key); } }; };
  const root = { hidden: false, classList: classes() }, message = { textContent: '' }, hint = { hidden: true };
  const controls = [{ inert: false }, { inert: true }];
  const timers = new Map(); let timerId = 0;
  const window = {};
  vm.runInNewContext(source, { window, document: { body: { classList: classes() },
    getElementById: id => ({ appLoading: root, loadingMessage: message, loadingHint: hint })[id],
    querySelectorAll: () => controls }, setTimeout: (fn,ms) => { timers.set(++timerId, { fn,ms }); return timerId; },
    clearTimeout: id => timers.delete(id) });
  return { root, message, hint, controls, loading: window.FortyLoading, timers,
    tick(ms) { for (const [id,timer] of [...timers]) if(timer.ms <= ms) { timers.delete(id); timer.fn(); } } };
}
test('abertura bloqueia os controles e libera a tela preservando o inert anterior', () => {
  const ui = setup(); assert(ui.root.classList.contains('loading-screen')); assert(ui.controls.every(x => x.inert));
  ui.loading.ready(); assert.equal(ui.root.hidden,true); assert.equal(ui.controls[0].inert,false); assert.equal(ui.controls[1].inert,true);
});
test('requisições simultâneas só removem o indicador depois de todas terminarem', () => {
  const ui = setup(); ui.loading.ready();
  const first = ui.loading.begin(), second = ui.loading.begin(); ui.tick(180);
  assert.equal(ui.root.hidden,false); assert(!ui.root.classList.contains('loading-screen'));
  first(); first(); assert.equal(ui.root.hidden,false); second(); assert.equal(ui.root.hidden,true);
});
test('carregamento rápido não pisca e não deixa timer pendente', () => {
  const ui = setup(); ui.loading.ready(); const end = ui.loading.begin(); end(); ui.tick(8000);
  assert.equal(ui.root.hidden,true); assert.equal(ui.timers.size,0);
});
test('tela de login tem prioridade e o finally libera o loading após falha', async () => {
  const ui = setup(); ui.loading.ready(); const request = ui.loading.begin();
  const end = ui.loading.begin({ screen:true, message:'Entrando…' });
  assert.equal(ui.message.textContent,'Entrando…'); assert(ui.root.classList.contains('loading-screen'));
  await assert.rejects((async () => { try { throw new Error('offline'); } finally { end(); request(); } })());
  assert.equal(ui.root.hidden,true); assert.equal(ui.controls[0].inert,false);
});
test('mensagem de conexão lenta também funciona no próximo carregamento', () => {
  const ui = setup(); ui.tick(8000); assert.equal(ui.hint.hidden,false); ui.loading.ready(); assert.equal(ui.hint.hidden,true);
  const end = ui.loading.begin(); ui.tick(8000); assert.equal(ui.hint.hidden,false); end();
});
