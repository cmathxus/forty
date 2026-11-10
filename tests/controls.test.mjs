import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = new URL('../src/DudaErp.Api/wwwroot/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');

test('calendário e dropdown abrem acima quando não há espaço abaixo, sem escapar da tela', () => {
  const context = vm.createContext({}); vm.runInContext(read('overlays.js'), context);
  const run = expression => vm.runInContext(expression, context);
  const above = run(`popupPlacement({left:40,top:300,bottom:342},308,370,{left:0,top:0,width:900,height:520})`);
  assert.equal(above.upwards, true); assert.equal(above.top, 12); assert.equal(above.maxHeight, 281);
  const below = run(`popupPlacement({left:40,top:80,bottom:122},308,330,{left:0,top:0,width:900,height:900})`);
  assert.equal(below.upwards, false); assert.equal(below.top, 129); assert.equal(below.maxHeight, 330);
  const mobile = run(`popupPlacement({left:240,top:210,bottom:250},308,370,{left:0,top:0,width:320,height:460})`);
  assert.equal(mobile.width, 296); assert.equal(mobile.left, 12);
  assert(mobile.top >= 12); assert(mobile.top + mobile.maxHeight <= 448);
  const keyboard = run(`popupPlacement({left:20,top:170,bottom:212},308,330,{left:0,top:80,width:360,height:260})`);
  assert(keyboard.top >= 92); assert(keyboard.top + keyboard.maxHeight <= 328);
});

test('relógio de 24 horas distingue anéis, minutos exatos e horário digitado inválido', () => {
  const context = vm.createContext({ window: {} }); vm.runInContext(read('time-picker.js'), context);
  const run = expression => vm.runInContext(expression, context);
  assert.equal(run(`clockValueFromPoint(130,21,260,'hour')`), 12);
  assert.equal(run(`clockValueFromPoint(130,58,260,'hour')`), 0);
  assert.equal(run(`clockValueFromPoint(239,130,260,'hour')`), 3);
  assert.equal(run(`clockValueFromPoint(202,130,260,'hour')`), 15);
  assert.equal(run(`clockValueFromPoint(130,239,260,'minute')`), 30);
  assert.equal(run(`clockValueFromPoint(21,130,260,'minute')`), 45);
  assert.equal(run(`clockValueFromPoint(130+Math.sin(222*Math.PI/180)*109,130-Math.cos(222*Math.PI/180)*109,260,'minute')`), 37);
  assert.equal(run(`parseClockTime('23:59').hour`), 23);
  assert.equal(run(`parseClockTime('15:39:07').second`), 7);
  for (const invalid of ['', '24:00', '12:60', '1:00', '10:10:99']) assert.equal(run(`parseClockTime(${JSON.stringify(invalid)})`), null);
});

function dialogHarness() {
  const nodes = new Map();
  class Element extends EventTarget {
    open = false; returnValue = ''; textContent = '';
    classList = { toggle() {} };
    showModal() { this.open = true; }
    close(value) { this.open = false; this.returnValue = value; this.dispatchEvent(new Event('close')); }
    focus() { this.focused = true; }
  }
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const context = vm.createContext({ window: {}, document: { getElementById: node }, accessToken: 'token' });
  vm.runInContext(read('dialogs.js'), context);
  return { context, node, run: expression => vm.runInContext(expression, context) };
}

test('confirmação do produto aguarda escolha, foca cancelar e trata X/Escape como cancelamento', async () => {
  const ui = dialogHarness(); let finished = false;
  const result = ui.run(`askConfirmation('Confirmar retorno?',{title:'Registrar retorno',accept:'Registrar'})`);
  result.then(() => { finished = true; }); await Promise.resolve();
  assert.equal(finished, false); assert.equal(ui.node('confirmationDialog').open, true);
  assert.equal(ui.node('confirmationCancel').focused, true);
  assert.equal(ui.node('confirmationTitle').textContent, 'Registrar retorno');
  assert.equal(ui.node('confirmationAccept').textContent, 'Registrar');
  assert.equal(await ui.run(`askConfirmation('Ação duplicada')`), false);
  ui.node('confirmationDialog').close('cancel'); assert.equal(await result, false);
  const accepted = ui.run(`askConfirmation('Salvar?')`);
  ui.node('confirmationDialog').close('accept'); assert.equal(await accepted, true);
  const changedSession = ui.run(`askConfirmation('Excluir?')`);
  ui.run(`accessToken='outra-sessao'`); ui.node('confirmationDialog').close('accept');
  assert.equal(await changedSession, false);
});

test('sair da conta exige confirmação mesmo sem alterações e cancelar preserva a sessão', async () => {
  const source = read('app.js').replace(/\ninit\(\)\.catch[\s\S]*$/, '');
  let dirty = false, prompts = [], exited = 0, reloaded = 0, accepted = false;
  const context = vm.createContext({ window: {}, sessionStorage: {getItem:()=>null},
    document: {querySelectorAll:()=>dirty?[{}]:[]}, location: {reload:()=>reloaded++},
    askConfirmation: async message => {prompts.push(message);return accepted;}, exit:()=>exited++ });
  vm.runInContext(source, context); vm.runInContext('showLogin=exit', context);
  await vm.runInContext('logout()', context);
  assert.equal(prompts.length,1); assert.equal(exited,0); assert.equal(reloaded,0);
  assert.match(prompts[0], /sair da sua conta/);
  dirty=true; await vm.runInContext('logout()', context);
  assert.match(prompts[1], /descartar/); assert.equal(exited,0);
  accepted=true; await vm.runInContext('logout()', context);
  assert.equal(exited,1); assert.equal(reloaded,1);
});

test('código da aplicação não usa diálogos nativos nem aviso beforeunload', () => {
  for (const file of readdirSync(root).filter(file => file.endsWith('.js'))) {
    assert.doesNotMatch(read(file), /\b(?:confirm|alert|prompt)\s*\(|\bbeforeunload\b/, file);
  }
});
