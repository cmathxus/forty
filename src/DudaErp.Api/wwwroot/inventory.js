const stockKinds = { Receipt: 'Entrada', Count: 'Contagem / ajuste', Dispatch: 'Saída de carga', Return: 'Devolução', Production: 'Produção' };
const stockQuantity = value => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

async function refreshInventory() {
  state.inventory = await api('/api/inventory');
  renderInventory();
}

function renderInventory() {
  const term = normalize($('#stockSearch').value);
  const rows = state.inventory.items.filter(x => normalize(`${x.code} ${x.name}`).includes(term));
  $('#stockCount').textContent = `${rows.length} produtos · saldo na unidade de venda`;
  $('#stockBalances').innerHTML = rows.map(x => `<tr><td>${escapeHtml(x.code)}</td><td>${escapeHtml(x.name)}</td>
    <td>${escapeHtml(x.unit)}</td><td class="stock-number">${stockQuantity(x.quantity)}</td>
    <td>${!x.hasHistory ? '<span class="badge amber">Contagem inicial pendente</span>' : x.quantity === 0 ? '<span class="badge">Sem saldo</span>' : '<span class="badge green">Disponível</span>'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum produto encontrado.</td></tr>';
  $('#stockHistory').innerHTML = state.inventory.movements.map(x => `<tr><td>${new Date(x.createdAt).toLocaleString('pt-BR')}</td>
    <td>${escapeHtml(x.code)} — ${escapeHtml(x.productName)}</td><td>${stockKinds[x.kind] || escapeHtml(x.kind)}${x.productionDate ? `<div class="meta">Produzido em ${dateBR(x.productionDate)}</div>` : ''}</td>
    <td class="stock-number ${x.quantity < 0 ? 'stock-out' : 'stock-in'}">${x.quantity > 0 ? '+' : ''}${stockQuantity(x.quantity)} ${escapeHtml(x.unit)}</td>
    <td>${escapeHtml(x.reason)}</td><td>${escapeHtml(x.recordedBy)}</td></tr>`).join('') || '<tr><td colspan="6">Nenhuma movimentação. Comece pela contagem física do estoque.</td></tr>';
}

function updateStockHint() {
  const form = $('#stockForm');
  const product = state.inventory.items.find(x => x.id === form.elements.productId.value);
  const production = form.elements.kind.value === 'Production';
  $('#stockProductionDate').hidden = !production;
  form.elements.productionDate.required = production;
  form.elements.productionDate.disabled = !production;
  const visibleDate = form.elements.productionDate._flatpickr?.altInput;
  if (visibleDate) { visibleDate.required = production; visibleDate.disabled = !production; }
  $('#stockFormHint').textContent = product ? `Saldo atual: ${stockQuantity(product.quantity)} ${product.unit}. ${form.elements.kind.value === 'Count' ? 'Informe o total contado no depósito. A diferença será registrada como ajuste.' : production ? 'Informe a quantidade de produtos acabados produzida. Ela será somada ao estoque.' : 'Informe a quantidade que entrou no depósito.'}` : 'Selecione um produto. As quantidades usam a unidade de venda do cadastro.';
}

function deliveryCheckSummary(originals, inputs) {
  let missing = false, complete = true, deliveredAmount = 0, deliveredAny = false, allDelivered = true;
  const items = originals.map(original => {
    const input = inputs.find(x => x.orderItemId === original.id);
    if (!input || input.deliveredQuantity === '' || input.returnedQuantity === '') complete = false;
    const deliveredQuantity = Number(input?.deliveredQuantity || 0);
    const returnedQuantity = Number(input?.returnedQuantity || 0);
    const shortage = Math.round((Number(original.quantity) - deliveredQuantity - returnedQuantity) * 1000) / 1000;
    if (deliveredQuantity < 0 || returnedQuantity < 0 || shortage < 0 || !Number.isFinite(deliveredQuantity + returnedQuantity)) complete = false;
    if (shortage > 0) missing = true;
    if (deliveredQuantity > 0) deliveredAny = true;
    if (deliveredQuantity !== Number(original.quantity)) allDelivered = false;
    deliveredAmount += Number(original.totalAmount) * deliveredQuantity / Number(original.quantity);
    return { orderItemId: original.id, deliveredQuantity, returnedQuantity, missingQuantity: shortage };
  });
  return { items, missing, complete, deliveredAmount: Math.round((deliveredAmount + Number.EPSILON) * 100) / 100,
    status: allDelivered ? 1 : deliveredAny ? 2 : 4 };
}

function activeDeliveryCheck() {
  const form = $('#deliveryCheckForm');
  const load = state.loads.find(x => x.id === form.dataset.loadId);
  const link = load?.orders.find(x => x.orderId === form.dataset.orderId);
  return { form, load, link };
}

function updateDeliveryCheck() {
  const { form, link } = activeDeliveryCheck();
  if (!link) return;
  const rows = $$('.reconciliation-row', form);
  const summary = deliveryCheckSummary(link.order.items, rows.map(row => ({ orderItemId: row.dataset.itemId,
    deliveredQuantity: $('[name=deliveredQuantity]', row).value, returnedQuantity: $('[name=returnedQuantity]', row).value })));
  summary.items.forEach((item, i) => {
    const filled = $('[name=deliveredQuantity]', rows[i]).value !== '' && $('[name=returnedQuantity]', rows[i]).value !== '';
    $('.reconciliation-missing', rows[i]).textContent = filled ? stockQuantity(item.missingQuantity) : 'A conferir';
    rows[i].classList.toggle('has-shortage', filled && item.missingQuantity > 0);
    $('[name=returnedQuantity]', rows[i]).setCustomValidity(item.missingQuantity < 0 ? 'Entregue + devolvido supera a quantidade de saída.' : '');
  });
  form.elements.deliveryNotes.required = summary.complete && summary.missing;
  form.elements.amountReceived.max = summary.deliveredAmount;
  $('#deliveryCheckTotal').textContent = `Valor dos itens entregues: ${money(summary.deliveredAmount)}${summary.missing && summary.complete ? ' · Há falta de produtos: descreva a divergência.' : ''}`;
  return summary;
}

function fillDeliveryPreset(preset) {
  const { form, link } = activeDeliveryCheck();
  $$('.reconciliation-row', form).forEach(row => {
    const item = link.order.items.find(x => x.id === row.dataset.itemId);
    $('[name=deliveredQuantity]', row).value = preset === 'delivered' ? item.quantity : 0;
    $('[name=returnedQuantity]', row).value = preset === 'returned' ? item.quantity : 0;
  });
  form.dataset.dirty = 'true';
  updateDeliveryCheck();
}

function openDeliveryCheck(value) {
  const [loadId, orderId] = value.split(':');
  const load = state.loads.find(x => x.id === loadId);
  const link = load?.orders.find(x => x.orderId === orderId);
  if (!link || load.status !== 'Dispatched' || link.deliveryStatus !== 'Pending') return toast('Este pedido não está disponível para conferência.');
  const form = $('#deliveryCheckForm');
  if (form.dataset.dirty === 'true' && !confirm('Descartar a conferência em preenchimento?')) return;
  form.reset(); delete form.dataset.dirty;
  form.dataset.loadId = loadId; form.dataset.orderId = orderId;
  $('#deliveryCheckContext').textContent = `Carga ${load.number} · Pedido ${link.order.number} · ${link.order.customer?.legalName || 'Cliente'}`;
  $('#deliveryLegacyHint').hidden = load.inventoryTracked;
  $('#deliveryCheckItems').innerHTML = link.order.items.map(item => `<div class="reconciliation-row" data-item-id="${item.id}">
    <div><strong>${escapeHtml(item.productCode)} — ${escapeHtml(item.productName)}</strong><span class="meta">Saída: ${stockQuantity(item.quantity)} ${escapeHtml(item.unit)}</span></div>
    <label>Entregue<input name="deliveredQuantity" aria-label="Entregue: ${escapeHtml(item.productCode)}" type="number" min="0" max="${item.quantity}" step="0.001" required></label>
    <label>Devolvido ao depósito<input name="returnedQuantity" aria-label="Devolvido: ${escapeHtml(item.productCode)}" type="number" min="0" max="${item.quantity}" step="0.001" required></label>
    <div class="reconciliation-shortage"><span>Faltante</span><strong class="reconciliation-missing">A conferir</strong></div></div>`).join('');
  window.FortyControls?.sync(form);
  updateDeliveryCheck();
  openEditModal(form, 'Conferir entrega e retorno');
}

function wireInventory() {
  $('#stockSearch').addEventListener('input', renderInventory);
  $('#stockForm').addEventListener('change', updateStockHint);
  $('#stockForm').addEventListener('submit', event => {
    event.preventDefault();
    submitJson(event.target, '/api/inventory/movements', form => ({ requestId: form.dataset.requestId,
      productId: form.elements.productId.value, kind: form.elements.kind.value,
      quantity: Number(form.elements.quantity.value), reason: form.elements.reason.value,
      productionDate: form.elements.kind.value === 'Production' ? form.elements.productionDate.value : null }));
  });
  $('#deliveryCheckForm').addEventListener('input', updateDeliveryCheck);
  $('#deliveryCheckForm').addEventListener('submit', async event => {
    event.preventDefault();
    const summary = updateDeliveryCheck();
    if (!summary?.complete) return toast('Confira as quantidades de todos os produtos.');
    const { form, load, link } = activeDeliveryCheck();
    if (!form.reportValidity() || form.dataset.saving === 'true') return;
    if (!confirm(`Registrar a conferência do pedido ${link.order.number}?${summary.missing ? ' Há produtos faltantes.' : ''} A baixa não poderá ser repetida.`)) return;
    form.dataset.saving = 'true';
    const button = $('button[type=submit]', form); button.disabled = true;
    try {
      await api(`/api/delivery-loads/${load.id}/orders/${link.orderId}/close`, { method: 'POST', body: JSON.stringify({
        deliveryStatus: summary.status, paymentMethod: Number(form.elements.paymentMethod.value),
        amountReceived: Number(form.elements.amountReceived.value), deliveryNotes: form.elements.deliveryNotes.value,
        items: summary.items.map(({ orderItemId, deliveredQuantity, returnedQuantity }) => ({ orderItemId, deliveredQuantity, returnedQuantity })) }) });
      delete form.dataset.dirty; closeEditModal(); toast('Conferência registrada. Devoluções físicas atualizadas no estoque.');
      await refreshAll();
    } catch (error) { toast(error.message); }
    finally { delete form.dataset.saving; button.disabled = false; }
  });
}

function reportReconciliation(id) {
  const load = state.loads.find(x => x.id === id);
  if (!load) return { title: 'Conferência da carga', body: '<p>Carga não encontrada.</p>' };
  const rows = load.orders.flatMap(link => (link.order?.items || []).map(item => {
    const result = link.itemResults?.find(x => x.orderItemId === item.id);
    return `<tr><td>${link.order.number}</td><td>${escapeHtml(link.order.customer?.legalName)}</td><td>${escapeHtml(item.productCode)} — ${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(item.unit)}</td><td>${stockQuantity(item.quantity)}</td><td>${result ? stockQuantity(result.deliveredQuantity) : '—'}</td>
      <td>${result ? stockQuantity(result.returnedQuantity) : '—'}</td><td>${result ? stockQuantity(result.missingQuantity) : '—'}</td>
      <td>${result ? escapeHtml(link.deliveryNotes || 'Conferido') : link.deliveryStatus === 'Pending' ? 'A conferir' : 'Histórico sem conferência'}</td></tr>`;
  }));
  return { title: `Conferência da carga ${load.number}`, body: `<p>Devolvido significa retorno físico ao depósito. Faltante = saída − entregue − devolvido. As quantidades respeitam a unidade de cada produto.</p>
    <table><thead><tr><th>Pedido</th><th>Cliente</th><th>Produto</th><th>Unidade</th><th>Saída</th><th>Entregue</th><th>Devolvido</th><th>Faltante</th><th>Observação</th></tr></thead><tbody>${rows.join('')}</tbody></table>` };
}

function reportInventory() {
  return { title: 'Posição de estoque', body: `<p>Saldo por unidade de venda. Produtos sem histórico precisam de contagem inicial.</p><table><thead><tr><th>Código</th><th>Produto</th><th>Unidade</th><th>Saldo</th><th>Conferência</th></tr></thead><tbody>${state.inventory.items.map(x => `<tr><td>${escapeHtml(x.code)}</td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.unit)}</td><td>${stockQuantity(x.quantity)}</td><td>${x.hasHistory ? 'Com movimentação' : 'Contagem pendente'}</td></tr>`).join('')}</tbody></table>` };
}
