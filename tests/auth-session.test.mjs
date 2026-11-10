import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/DudaErp.Api/wwwroot/auth-session.js', import.meta.url), 'utf8');
function setup() {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) || null, setItem: (key,value) => entries.set(key,value), removeItem: key => entries.delete(key) };
  const context = vm.createContext({ localStorage: storage, sessionStorage: storage, navigator: {},
    crypto: { randomUUID: () => 'session-id' }, AbortSignal, Date, fetch: () => { throw new Error('unexpected fetch'); },
    apiUrl: path => path, showLogin: () => vm.runInContext('clearAuthSession()', context), window: { addEventListener() {} } });
  vm.runInContext('let accessToken="";\n' + source, context);
  context.call = code => vm.runInContext(code, context);
  context.call('saveAuthSession({accessToken:"old",refreshToken:"refresh-old",expiresIn:900})');
  return context;
}
const response = (status, data = {}) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
const tokens = { accessToken: 'new', refreshToken: 'refresh-new', expiresIn: 900 };

test('requisições concorrentes com 401 compartilham uma renovação e repetem com o novo token', async () => {
  const ui = setup(); let refreshes = 0, writes = 0;
  ui.fetch = async (path, options) => {
    if (path === '/api/auth/refresh') { refreshes++; await new Promise(resolve => setImmediate(resolve)); return response(200, tokens); }
    if (options.headers.Authorization === 'Bearer old') return response(401);
    assert.equal(options.headers.Authorization, 'Bearer new'); writes++; return response(200);
  };
  await Promise.all([ui.call('authFetch("/write",{method:"POST",body:"original"})'), ui.call('authFetch("/read")')]);
  assert.equal(refreshes, 1); assert.equal(writes, 2);
  assert.equal(ui.call('readAuthSession().refreshToken'), 'refresh-new');
});

test('sessão persistida renova antes do vencimento sem pedir login', async () => {
  const ui = setup(); const paths = [];
  ui.call('const saved=readAuthSession();saved.expiresAt=0;localStorage.setItem(authStorageKey,JSON.stringify(saved))');
  ui.fetch = async path => { paths.push(path); return path === '/api/auth/refresh' ? response(200,tokens) : response(200); };
  assert.equal((await ui.call('authFetch("/api/auth/me")')).status, 200);
  assert.deepEqual(paths, ['/api/auth/refresh','/api/auth/me']);
});

test('falha temporária na renovação preserva a sessão para tentar novamente', async () => {
  const ui = setup(); ui.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(ui.call('renewAuthSession("old")'), /conexão/);
  assert.equal(ui.call('readAuthSession().refreshToken'), 'refresh-old');
  assert.equal(ui.call('authRefreshPromise'), null);
});

test('resposta atrasada não restaura sessão após sair', async () => {
  const ui = setup(); let finish;
  ui.fetch = () => new Promise(resolve => finish=resolve);
  const pending = ui.call('renewAuthSession("old")');
  ui.call('clearAuthSession()'); finish(response(200,tokens));
  await assert.rejects(pending, /sessão mudou/);
  assert.equal(ui.call('readAuthSession()'), null); assert.equal(ui.call('accessToken'), '');
});

test('refresh recusado pede login e não reenvia gravação', async () => {
  const ui = setup(); let writes = 0;
  ui.call('const saved=readAuthSession();saved.expiresAt=0;localStorage.setItem(authStorageKey,JSON.stringify(saved))');
  ui.fetch = async path => { if(path !== '/api/auth/refresh') writes++; return response(401); };
  await assert.rejects(ui.call('authFetch("/write",{method:"POST"})'), /expirada/);
  assert.equal(writes, 0); assert.equal(ui.call('readAuthSession()'), null);
});

test('403 não tenta refresh nem repete operação', async () => {
  const ui = setup(); let calls=0;
  ui.fetch = async () => { calls++; return response(403); };
  assert.equal((await ui.call('authFetch("/write",{method:"POST"})')).status, 403);
  assert.equal(calls,1);
});
