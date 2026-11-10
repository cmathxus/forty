let selectedLoadId = null;

function loadStage(load) {
  if (load.status === 'Closed') return 3;
  if (load.status === 'Dispatched') return load.returnedAt ? 2 : 1;
  return 0;
}

function loadStageLabel(load) { return ['Preparação', 'Em rota', 'Conferência', 'Concluída'][loadStage(load)]; }

function openLoadDetails(id) {
  if (!hasPermission('loads.manage')) return;
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
  $('#newLoadButton').hidden = Boolean(load);
  if (load) { list.innerHTML = renderLoadDetails(load); return; }
  selectedLoadId = null;
  const rows = state.loads.filter(x => !$('#loadMissingOnly').checked || loadHasShortage(x));
  list.innerHTML = rows.map(x => `<button type="button" class="load-list-row" data-open-load="${x.id}">
    <span><strong>Carga ${x.number}</strong><span>${escapeHtml(x.region?.name || 'Sem região')} · ${dateBR(x.scheduledDate)}</span></span>
    <span>${escapeHtml(x.driverName || 'Motorista não informado')}<span>${escapeHtml(x.vehicle?.plate || 'Sem veículo')}</span></span>
    <span class="load-stage-label stage-${loadStage(x)}">${loadStageLabel(x)}${loadHasShortage(x) ? ' · Com faltas' : ''}</span><span aria-hidden="true">→</span>
  </button>`).join('') || '<div class="empty-state">Nenhuma carga encontrada. Crie uma carga para começar.</div>';
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
