import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.FORTY_TEST_BASE_URL;
const options = { skip: !base || !process.env.FORTY_TEST_EMAIL || !process.env.FORTY_TEST_PASSWORD };

test('API exige autenticação em leitura, escrita, importação e seed', options, async () => {
  for (const [method, route] of [['GET','/api/orders'], ['POST','/api/orders'],
    ['GET','/api/financial/payables'], ['POST','/api/demo/seed'], ['POST','/api/import/products']]) {
    const response = await fetch(base + route, { method });
    assert.equal(response.status, 401, `${method} ${route}`);
  }
});

test('login sem confirmação de email, sessão, token adulterado e CORS', options, async () => {
  const credentials = { email: process.env.FORTY_TEST_EMAIL, password: process.env.FORTY_TEST_PASSWORD };
  const invalid = await fetch(base + '/api/auth/login', { method: 'POST',
    headers: { 'Content-Type':'application/json' }, body: JSON.stringify({...credentials, password:'senha-invalida'}) });
  assert.equal(invalid.status, 401);
  const login = await fetch(base + '/api/auth/login', { method: 'POST',
    headers: { 'Content-Type':'application/json' }, body: JSON.stringify(credentials) });
  assert.equal(login.status, 200);
  const session = await login.json();
  assert.equal(session.expiresIn, 28800);
  const headers = { Authorization: `Bearer ${session.accessToken}` };
  const me = await fetch(base + '/api/auth/me', { headers });
  assert.equal(me.status, 200);
  const profile = await me.json();
  assert.equal(profile.email, credentials.email);
  assert.equal(profile.passwordHash, undefined);
  const forged = await fetch(base + '/api/auth/me', { headers: { Authorization:`Bearer ${session.accessToken.slice(0,-8)}invalid!` } });
  assert.equal(forged.status, 401);
  const page = await fetch(base + '/api/orders/page?pageSize=1', {headers});
  assert.equal(page.status, 200);
  assert.equal((await page.json()).pageSize, 1);
  const invalidPage = await fetch(base + '/api/orders/page?page=0', {headers});
  assert.equal(invalidPage.status, 400);
  const cors = await fetch(base + '/api/orders', { method: 'OPTIONS', headers: {
    Origin:'https://not-allowed.example', 'Access-Control-Request-Method':'GET'
  } });
  assert.equal(cors.headers.get('access-control-allow-origin'), null);
});
