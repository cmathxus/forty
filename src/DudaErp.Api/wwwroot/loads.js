let selectedLoadId = null;

function loadStage(load) {
  if (load.status === 'Closed') return 3;
  if (load.status === 'Dispatched') return load.returnedAt ? 2 : 1;
  return 0;
}

function loadStageLabel(load) { return ['Preparação', 'Em rota', 'Conferência', 'Concluída'][loadStage(load)]; }

const loadListPage = { items: [], total: 0, page: 1, totalPages: 1, generation: 0, loading: false, error: '' };
let loadFilterTimer;

async function refreshLoadPage(page = loadListPage.page) {
  if (!hasPermission('loads.read')) return;
  const generation = ++loadListPage.generation, session = authGeneration;
  loadListPage.loading = true; loadListPage.error = ''; loadListPage.items = [];
  renderLoadWorkspace();
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  for (const [id,key] of [['Search','search'],['Status','stage'],['Region','regionId'],['Vehicle','vehicleId'],['Driver','driver'],['From','from'],['To','to']]) {
    const value = $(`#loadFilter${id}`).value.trim();
    if (value) query.set(key,value);
  }
  if ($('#loadMissingOnly').checked) query.set('shortages','true');
  try {
    const result = await api(`/api/delivery-loads/page?${query}`);
    if (generation !== loadListPage.generation || session !== authGeneration) return;
    Object.assign(loadListPage, result);
    const cache = new Map(state.loads.map(load => [load.id,load]));
    result.items.forEach(load => cache.set(load.id,load)); state.loads = [...cache.values()];
  } catch (error) {
    if (generation !== loadListPage.generation || session !== authGeneration) return;
    loadListPage.items = []; loadListPage.error = error.message;
  } finally {
    if (generation === loadListPage.generation && session === authGeneration) {
      loadListPage.loading = false; renderLoadWorkspace();
    }
  }
}

async function refreshLoadFilterOptions() {
  const options = await api('/api/delivery-loads/filter-options');
  fillSelect('#loadFilterRegion', options.regions, row => row.name, true);
  fillSelect('#loadFilterVehicle', options.vehicles, row => `${row.name} · ${row.plate}`, true);
  for (const [selector,label] of [['#loadFilterRegion','Todas as regiões'],['#loadFilterVehicle','Todos os veículos']]) {
    $(`${selector} option[value='']`).textContent = label;
    window.FortyControls?.syncSelect($(selector));
  }
}

function queueLoadFilter() {
  if (!state.currentUser || !hasPermission('loads.read')) return;
  clearTimeout(loadFilterTimer);
  loadListPage.generation++; // Respostas anteriores não podem sobrescrever novos critérios.
  loadFilterTimer = setTimeout(() => refreshLoadPage(1), 250);
}
function wireLoadFilters() {
  for (const id of ['Search', 'Status', 'Region', 'Driver', 'Vehicle', 'From', 'To']) {
    const field = $(`#loadFilter${id}`);
    field.addEventListener(field.type === 'search' ? 'input' : 'change', queueLoadFilter);
  }
  $('#clearLoadFilters').addEventListener('click', () => {
    for (const id of ['Search', 'Status', 'Region', 'Driver', 'Vehicle', 'From', 'To']) {
      const field = $(`#loadFilter${id}`);
      if (field._flatpickr) field._flatpickr.clear();
      else field.value = '';
      window.FortyControls?.syncSelect(field);
    }
    $('#loadMissingOnly').checked = false;
    clearTimeout(loadFilterTimer);
    refreshLoadPage(1);
  });
  $('#loadsPagination').addEventListener('click', event => {
    const button = event.target.closest('[data-load-page]');
    if (button && !button.disabled) refreshLoadPage(Number(button.dataset.loadPage));
  });
}

function openLoadDetails(id) {
  if (!hasPermission('loads.read')) return;
  selectedLoadId = id;
  renderLoads();
  $('#loadsList').scrollIntoView({ block: 'start', behavior: 'instant' });
}

function closeLoadDetails() {
  selectedLoadId = null;
  if (qrSelectedLoadId) closeLoadQrTarget();
  else renderLoads();
}

function renderLoadWorkspace() {
  const list = $('#loadsList');
  const id = qrSelectedLoadId || selectedLoadId;
  const load = state.loads.find(x => x.id === id);
  $('#loadListTools').hidden = Boolean(load);
  const newLoad = $('#newLoadButton');
  newLoad.hidden = Boolean(load) || !hasPermission('loads.create');
  const pagination = $('#loadsPagination');
  pagination.hidden = Boolean(load);
  if (load) { list.innerHTML = renderLoadDetails(load); return; }
  selectedLoadId = null;
  const rows = loadListPage.items;
  $('#loadFilterCount').textContent = loadListPage.loading ? 'Buscando…' : `${loadListPage.total} cargas encontradas`;
  pagination.innerHTML = `<span>Página ${loadListPage.page} de ${loadListPage.totalPages}</span><div><button type="button" data-load-page="${loadListPage.page-1}" ${loadListPage.loading || loadListPage.page <= 1 ? 'disabled' : ''}>Anterior</button><button type="button" data-load-page="${loadListPage.page+1}" ${loadListPage.loading || loadListPage.page >= loadListPage.totalPages ? 'disabled' : ''}>Próxima</button></div>`;
  if (loadListPage.error) { list.textContent = loadListPage.error; return; }
  list.innerHTML = rows.map(x => `<button type="button" class="load-list-row" data-open-load="${x.id}">
    <span><strong>Carga ${x.number}</strong><span>${escapeHtml(x.region?.name || 'Sem região')} · ${dateBR(x.scheduledDate)}</span></span>
    <span>${escapeHtml(x.driverName || 'Motorista não informado')}<span>${escapeHtml(x.vehicle?.plate || 'Sem veículo')}</span></span>
    <span class="load-stage-label stage-${loadStage(x)}">${loadStageLabel(x)}${loadHasShortage(x) ? ' · Com faltas' : ''}</span><span aria-hidden="true">→</span>
  </button>`).join('') || `<div class="empty-state">${loadListPage.loading ? 'Buscando cargas…' : 'Nenhuma carga corresponde aos filtros. Altere a busca ou crie uma carga.'}</div>`;
}

function renderLoadDetails(load) {
  const stage = loadStage(load);
  const pending = load.orders.filter(x => x.deliveryStatus === 'Pending');
  const first = pending[0];
  const action = stage === 0 ? `<button type="button" class="primary" data-dispatch="${load.id}">Registrar saída</button>`
    : stage === 1 ? `<button type="button" class="primary" data-load-return="${load.id}">Registrar retorno ao depósito</button>`
    : stage === 2 && first ? `<button type="button" class="primary" data-reconcile="${load.id}:${first.orderId}">Conferir próximo pedido</button>` : '';
  return `<div class="load-detail">
    <button type="button" class="text-button" data-close-load>← Todas as cargas</button>
    <div class="load-detail-heading"><div><h3>Carga ${load.number} <span>· ${escapeHtml(load.region?.name || 'Sem região')}</span></h3>
      <p>${dateBR(load.scheduledDate)} · ${escapeHtml(load.driverName || 'Motorista não informado')} · ${escapeHtml(load.vehicle?.plate || 'Sem veículo')}</p></div>
      <details class="load-options"><summary>Opções da carga</summary><div>
        <button type="button" data-report-loading="${load.id}">Imprimir romaneio / QR</button>
        <button type="button" data-report-load="${load.id}">Relatório da carga</button>
        ${stage > 0 ? `<button type="button" data-report-reconciliation="${load.id}">Relatório de conferência</button>` : ''}
        ${stage === 0 ? `<button type="button" data-edit-load="${load.id}">Editar carga</button><button type="button" data-delete-load="${load.id}">Excluir carga</button>` : ''}
        ${stage === 3 && !load.returnedAt ? `<button type="button" data-load-return="${load.id}">Registrar horário de retorno</button>` : ''}
      </div></details></div>
    <ol class="load-progress" aria-label="Etapa da carga">${['Preparação','Em rota','Conferência','Concluída'].map((name,i) => `<li class="${i === stage ? 'current' : i < stage ? 'done' : ''}" ${i === stage ? 'aria-current="step"' : ''}><span>${i < stage ? '✓' : i+1}</span>${name}</li>`).join('')}</ol>
    <div class="load-next-step"><div><strong>${['Carga em preparação','Carga em rota','Conferência do retorno','Conferência concluída'][stage]}</strong><p>${[
      'Confira os pedidos e imprima o romaneio. Registre a saída quando o caminhão sair.',
      'Registre a chegada ao depósito para iniciar a conferência do retorno.',
      `${pending.length} de ${load.orders.length} pedidos aguardando conferência. Informe o que foi entregue e o que voltou.`,
      loadHasShortage(load) ? 'Há faltas registradas. Consulte o resultado por produto abaixo.' : 'Todos os pedidos desta carga foram conferidos.'
    ][stage]}</p></div>${action}</div>
    <div class="load-orders-heading"><h4>${stage === 0 ? 'Pedidos da carga' : 'Pedidos para conferência'}</h4><span>${load.orders.length} pedidos</span></div>
    <div class="order-lines">${load.orders.map(item => renderLoadOrder(load,item)).join('') || '<p class="meta">Nenhum pedido nesta carga.</p>'}</div>
    ${stage >= 2 ? renderLoadReconciliation(load) : ''}
    ${stage > 0 ? `<details class="load-history"><summary>Histórico e informações da carga</summary><p class="meta">Saída: ${checkedDateTime(load.dispatchedAt)} · ${escapeHtml(load.dispatchedBy || 'Não registrado')}</p>${loadReturnDetails(load)}${load.notes ? `<p>${escapeHtml(load.notes)}</p>` : ''}</details>` : ''}
  </div>`;
}
