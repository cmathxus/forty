const authStorageKey = 'forty.session';
let authRefreshPromise = null;
let authGeneration = 0;

function readAuthSession() {
  try { return JSON.parse(localStorage.getItem(authStorageKey) || 'null'); }
  catch { return null; }
}

function saveAuthSession(tokens, previous = null) {
  const session = { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken,
    expiresAt: Date.now() + Number(tokens.expiresIn) * 1000,
    key: previous?.key || crypto.randomUUID() };
  localStorage.setItem(authStorageKey, JSON.stringify(session));
  sessionStorage.removeItem('forty.accessToken');
  accessToken = session.accessToken;
}

function clearAuthSession() {
  authGeneration++;
  localStorage.removeItem(authStorageKey);
  sessionStorage.removeItem('forty.accessToken');
  accessToken = '';
}

async function renewAuthSession(failedToken = null) {
  if (authRefreshPromise) return authRefreshPromise;
  const generation = authGeneration;
  const renew = async () => {
    const session = readAuthSession();
    if (!session?.refreshToken) return false;
    // Outra aba pode ter renovado enquanto esta esperava pelo lock.
    if ((failedToken && session.accessToken !== failedToken) ||
        (!failedToken && session.expiresAt > Date.now() + 60000)) {
      accessToken = session.accessToken;
      return true;
    }
    let response;
    try {
      response = await fetch(apiUrl('/api/auth/refresh'), { method: 'POST', signal: AbortSignal.timeout(30000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: session.refreshToken }) });
    } catch { throw new Error('Não foi possível renovar a sessão. Verifique sua conexão e tente novamente.'); }
    if (generation !== authGeneration || readAuthSession()?.key !== session.key) throw new Error('A sessão mudou. Entre novamente.');
    if (response.status === 401 || response.status === 400) return false;
    if (!response.ok) throw new Error('Não foi possível renovar a sessão. Tente novamente.');
    const tokens = await response.json();
    if (generation !== authGeneration || readAuthSession()?.key !== session.key) throw new Error('A sessão mudou. Entre novamente.');
    saveAuthSession(tokens, session);
    return true;
  };
  authRefreshPromise = (async () => {
    try { return await (navigator.locks ? navigator.locks.request('forty-auth-refresh', renew) : renew()); }
    finally { authRefreshPromise = null; }
  })();
  return authRefreshPromise;
}

async function authFetch(path, options = {}) {
  const generation = authGeneration;
  const authenticated = path !== '/api/auth/login';
  const session = readAuthSession();
  if (authenticated && session?.refreshToken && session.expiresAt <= Date.now() + 60000) {
    if (!(await renewAuthSession())) { showLogin('Sua sessão expirou. Entre novamente.'); throw new Error('Sessão expirada.'); }
  }
  const send = () => fetch(apiUrl(path), { signal: AbortSignal.timeout(30000), ...options,
    headers: { 'Content-Type': 'application/json', ...(authenticated && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(options.headers || {}) } });
  const usedToken = accessToken;
  let response = await send();
  if (generation !== authGeneration) throw new Error('A sessão mudou. Entre novamente.');
  if (authenticated && response.status === 401 && readAuthSession()?.refreshToken) {
    if (await renewAuthSession(usedToken)) response = await send(); // Só repete após 401, antes de qualquer gravação autorizada.
  }
  if (generation !== authGeneration) throw new Error('A sessão mudou. Entre novamente.');
  return response;
}

function watchAuthSession() {
  window.addEventListener('storage', event => {
    if (event.key !== authStorageKey) return;
    let before = null;
    try { before = event.oldValue ? JSON.parse(event.oldValue) : null; } catch { /* Ignora dados antigos inválidos. */ }
    const after = readAuthSession();
    if (!after) showLogin('A sessão foi encerrada em outra aba.');
    else if (before && before.key !== after.key) {
      authGeneration++; // Descarta respostas da identidade anterior antes de recarregar.
      window.location.reload();
    }
    else if (after) accessToken = after.accessToken;
  });
}
