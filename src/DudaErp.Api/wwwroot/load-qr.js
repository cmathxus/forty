// O QR identifica a carga; nunca concede acesso nem contém credenciais.
let qrSelectedLoadId = null;
const loadQrIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadQrUrl(id) {
  if (!loadQrIdPattern.test(id)) throw new Error('Identificador de carga inválido.');
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = `conferencia=${id}`;
  return url.href;
}

function renderLoadQr(load) {
  const url = loadQrUrl(load.id);
  const code = qrcode(0, 'M');
  code.addData(url);
  code.make();
  return `<section class="load-qr"><div class="load-qr-code">${code.createSvgTag({ cellSize: 4, margin: 16, scalable: true })}</div>
    <div><strong>Conferência da carga ${escapeHtml(load.number)}</strong>
    <p>Escaneie com a câmera do celular para abrir esta carga no FORTY.</p>
    <p>Entre com seu acesso de expedição ou administrador. Conte os produtos e informe o que foi entregue e o que voltou ao depósito.</p>
    <a href="${escapeHtml(url)}">Abrir conferência da carga ${escapeHtml(load.number)}</a>
    <p class="load-qr-url">${escapeHtml(url)}</p></div></section>`;
}

function openLoadQrTarget() {
  const hash = window.location.hash;
  if (!hash.startsWith('#conferencia=')) {
    if (qrSelectedLoadId) { qrSelectedLoadId = null; renderLoads(); }
    return;
  }
  if (!accessToken || !state.currentUser) return; // Mantém o destino durante o login.
  const id = hash.slice('#conferencia='.length).toLowerCase();
  if (!loadQrIdPattern.test(id) || !hasPermission('loads.manage')) {
    qrSelectedLoadId = null;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    toast(!hasPermission('loads.manage') ? 'Seu perfil não tem acesso à conferência de cargas.' : 'O link de conferência é inválido.');
    return;
  }
  if (!state.loads.some(load => load.id === id)) {
    qrSelectedLoadId = null;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    showView('loads'); renderLoads(); toast('Carga não encontrada. Confira o romaneio.');
    return;
  }
  if (qrSelectedLoadId === id) return;
  qrSelectedLoadId = id;
  $('#loadMissingOnly').checked = false;
  renderLoads();
  showView('loads');
}

function closeLoadQrTarget() {
  qrSelectedLoadId = null;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  renderLoads();
}
