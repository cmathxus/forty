import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/load-qr.js', import.meta.url), 'utf8');
const id = '353a4c61-b3b0-418f-9a18-1b2cf70f8139';

function setup() {
  const form = { hidden: false };
  const heading = { dataset: {}, textContent: 'Programação de rua' };
  const list = { setAttribute() {}, focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; } };
  const elements = { '#loadForm': form, '#loads > header h2': heading, '#loadsList': list, '#loadMissingOnly': { checked: true } };
  const state = { currentUser: null, loads: [{ id, number: 12 }] };
  const window = { location: new URL(`https://cmathxus.github.io/forty/#conferencia=${id}`) };
  window.history = { replaceState(_s, _t, path) { window.location = new URL(path, window.location); } };
  const context = vm.createContext({ window, state, accessToken: '', $: selector => elements[selector],
    hasPermission: () => true, renderLoads() {}, showView(view) { window.view = view; }, toast() {} });
  vm.runInContext(source, context);
  return { form, heading, list, window, state, run: code => vm.runInContext(code, context) };
}

test('QR após login coloca a conferência em destaque, sem exibir nova carga antes dos pedidos', () => {
  const ui = setup();
  ui.run('openLoadQrTarget()');
  assert.equal(ui.form.hidden, false); // Ainda aguardando login.
  assert.equal(ui.window.location.hash, `#conferencia=${id}`);
  ui.run("accessToken='sessao';state.currentUser={};openLoadQrTarget()");
  assert.equal(ui.form.hidden, true);
  assert.equal(ui.heading.textContent, 'Conferência da carga 12');
  assert.equal(ui.window.view, 'loads');
  assert.equal(ui.list.focused, true);
  assert.equal(ui.list.scrolled, true);
  ui.run('openLoadQrTarget()'); // Atualização periódica mantém a apresentação.
  assert.equal(ui.form.hidden, true);
  ui.run('closeLoadQrTarget()');
  assert.equal(ui.form.hidden, false);
  assert.equal(ui.heading.textContent, 'Programação de rua');
  assert.equal(ui.window.location.hash, '');
});

test('remover o destino do QR restaura a tela normal', () => {
  const ui = setup();
  ui.run("accessToken='sessao';state.currentUser={};openLoadQrTarget()");
  ui.window.location.hash = '';
  ui.run('openLoadQrTarget()');
  assert.equal(ui.form.hidden, false);
  assert.equal(ui.heading.textContent, 'Programação de rua');
  assert.equal(ui.run('qrSelectedLoadId'), null);
});
