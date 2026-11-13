import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/app.js', import.meta.url), 'utf8');
const navigation = source.slice(source.indexOf('function closeNavGroups()'), source.indexOf('function setupFormModes()'));

function setup(isMobile) {
  const classes = new Set(), handlers = {}, listeners = {}, attributes = {};
  const media = { matches: isMobile, addEventListener: (_type,fn) => listeners.resize=fn };
  const toggle = { setAttribute: (key,value) => attributes[key]=value, addEventListener: (_type,fn) => listeners.toggle=fn, focus() { this.focused=true; } };
  vm.runInNewContext(navigation + '\nwireNav()', { matchMedia: () => media, $: selector => selector === '#sidebarToggle' ? toggle : null, $$: () => [],
    document: { body: { classList: { contains: key => classes.has(key), toggle(key,enabled) { enabled ? classes.add(key) : classes.delete(key); } } }, addEventListener: (type,fn) => handlers[type]=fn } });
  return { classes, handlers, listeners, attributes, media, toggle };
}
test('menu mobile inicia recolhido e fecha por clique fora ou Escape', () => {
  const ui = setup(true);
  assert(ui.classes.has('sidebar-collapsed')); assert.equal(ui.attributes['aria-expanded'],'false');
  ui.listeners.toggle(); assert(!ui.classes.has('sidebar-collapsed'));
  ui.handlers.click({ target: { closest: () => null } }); assert(ui.classes.has('sidebar-collapsed'));
  ui.listeners.toggle(); ui.handlers.keydown({ key:'Escape' });
  assert(ui.classes.has('sidebar-collapsed')); assert.equal(ui.toggle.focused,true);
});
test('passar entre desktop e tablet reinicia o estado sem esconder o menu desktop', () => {
  const ui = setup(false); assert(!ui.classes.has('sidebar-collapsed'));
  ui.media.matches=true; ui.listeners.resize(); assert(ui.classes.has('sidebar-collapsed'));
  ui.listeners.toggle(); assert(!ui.classes.has('sidebar-collapsed'));
  ui.media.matches=false; ui.listeners.resize(); assert(!ui.classes.has('sidebar-collapsed'));
});
