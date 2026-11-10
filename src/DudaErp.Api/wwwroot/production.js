async function refreshProduction() {
  state.productionPlans = await api('/api/production');
  renderProduction();
}

function renderProduction() {
  const names = { Planned: 'A produzir', Completed: 'Concluída', Cancelled: 'Cancelada' };
  $('#productionPlans').innerHTML = state.productionPlans.map(plan => `<div class="card">
    <div class="card-header"><div><strong>Produção ${plan.number}</strong><div class="meta">Programada para ${dateBR(plan.scheduledDate)} · ${escapeHtml(plan.createdBy)}</div></div>
    <span class="badge ${plan.status === 'Completed' ? 'green' : plan.status === 'Planned' ? 'amber' : ''}">${names[plan.status] || escapeHtml(plan.status)}</span></div>
    <div class="production-products">${plan.items.map(item => `<div><span>${escapeHtml(item.productCode)} — ${escapeHtml(item.productName)}</span><strong>${stockQuantity(item.plannedQuantity)} ${escapeHtml(item.unit)} a produzir${plan.status === 'Completed' ? ` · ${stockQuantity(item.producedQuantity)} produzido` : ''}</strong></div>`).join('')}</div>
    ${plan.notes ? `<p class="meta">${escapeHtml(plan.notes)}</p>` : ''}
    ${plan.status === 'Completed' ? `<p class="meta">Produzido em ${dateBR(plan.productionDate)} · Confirmado por ${escapeHtml(plan.completedBy)}</p>` : ''}
    <div class="card-actions"><button type="button" data-production-report="${plan.id}">Imprimir lista de produção</button>
    ${plan.status === 'Planned' ? `<button type="button" class="primary" data-production-complete="${plan.id}">Confirmar produção</button><button type="button" data-production-cancel="${plan.id}">Cancelar programação</button>` : ''}</div></div>`).join('') || '<div class="empty-state">Nenhuma produção programada. Crie uma lista de produtos e quantidades para passar à equipe.</div>';
}

function prepareProductionPlan() {
  const form = $('#productionPlanForm');
  form.dataset.requestId = crypto.randomUUID();
  $('#productionPlanRows').innerHTML = '';
  addProductionPlanRow();
}

function addProductionPlanRow() {
  const row = document.createElement('div'); row.className = 'production-item-row';
  row.innerHTML = `<label>Produto<select name="productId" required><option value="">Selecione um produto</option>${state.products.filter(x => x.isActive).map(x => `<option value="${x.id}">${escapeHtml(x.code)} — ${escapeHtml(x.name)} (${escapeHtml(x.unit)})</option>`).join('')}</select></label>
    <label>Quantidade a produzir<input name="quantity" type="number" min="0.001" max="999999999999" step="0.001" placeholder="Informe a quantidade" required></label>
    <button type="button" data-remove-production-item>Remover</button>`;
  $('#productionPlanRows').append(row);
}

async function openProductionCompletion(id) {
  const plan = state.productionPlans.find(x => x.id === id);
  if (!plan || plan.status !== 'Planned') return toast('Esta programação não está disponível para conclusão.');
  const form = $('#productionCompletionForm');
  if (form.dataset.dirty === 'true' && !(await askConfirmation('Descartar a confirmação em preenchimento?', { title: 'Descartar alterações?', accept: 'Descartar', cancel: 'Continuar editando', destructive: true }))) return;
  form.reset(); delete form.dataset.dirty; form.dataset.planId = id;
  $('#productionCompletionContext').textContent = `Programação ${plan.number} · Prevista para ${dateBR(plan.scheduledDate)}. Informe o que realmente foi produzido; somente essa quantidade entra no estoque.`;
  $('#productionCompletionRows').innerHTML = plan.items.map(item => `<div class="production-item-row" data-product-id="${item.productId}"><div><strong>${escapeHtml(item.productCode)} — ${escapeHtml(item.productName)}</strong><p class="meta">Planejado: ${stockQuantity(item.plannedQuantity)} ${escapeHtml(item.unit)}</p></div><label>Produzido (${escapeHtml(item.unit)})<input name="producedQuantity" type="number" min="0" max="999999999999" step="0.001" placeholder="Quantidade real" required></label></div>`).join('');
  window.FortyControls?.sync(form);
  openEditModal(form, 'Confirmar produção');
}

async function cancelProductionPlan(id) {
  if (!(await askConfirmation('Cancelar esta programação de produção? O estoque não será alterado.', { title: 'Cancelar programação', accept: 'Cancelar programação', cancel: 'Manter programação', destructive: true }))) return;
  try { await api(`/api/production/${id}/cancel`, { method: 'POST' }); toast('Programação cancelada.'); await refreshProduction(); }
  catch (error) { toast(error.message); }
}

function wireProduction() {
  $('#addProductionItem').addEventListener('click', () => { addProductionPlanRow(); $('#productionPlanForm').dataset.dirty = 'true'; });
  $('#productionPlanForm').addEventListener('submit', event => {
    event.preventDefault();
    const form = event.target;
    const items = $$('.production-item-row', form).map(row => ({ productId: $("select[name='productId']", row).value,
      quantity: Number($("input[name='quantity']", row).value) }));
    if (!items.length) return toast('Adicione pelo menos um produto à lista.');
    if (new Set(items.map(x => x.productId)).size !== items.length) return toast('Agrupe a quantidade em uma única linha por produto.');
    submitJson(form, '/api/production', () => ({ requestId: form.dataset.requestId, scheduledDate: form.elements.scheduledDate.value,
      notes: form.elements.notes.value, items }));
  });
  $('#productionCompletionForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target;
    if (form.dataset.saving === 'true' || !form.reportValidity()) return;
    const items = $$('.production-item-row', form).map(row => ({ productId: row.dataset.productId,
      quantity: Number($("input[name='producedQuantity']", row).value) }));
    if (!items.some(x => x.quantity > 0)) return toast('Informe uma quantidade produzida. Se nada foi produzido, cancele a programação.');
    if (!(await askConfirmation('Concluir a programação e adicionar as quantidades produzidas ao estoque? Confira os valores: esta confirmação não pode ser repetida.', { title: 'Confirmar produção', accept: 'Confirmar produção' }))) return;
    form.dataset.saving = 'true'; const button = $('button[type=submit]', form); button.disabled = true;
    try {
      await api(`/api/production/${form.dataset.planId}/complete`, { method: 'POST', body: JSON.stringify({ productionDate: form.elements.productionDate.value, items }) });
      delete form.dataset.dirty; closeEditModal(); toast('Produção confirmada e adicionada ao estoque.'); await refreshAll();
    } catch (error) { toast(error.message); }
    finally { delete form.dataset.saving; button.disabled = false; }
  });
}

function reportProductionPlan(id) {
  const plan = state.productionPlans.find(x => x.id === id);
  if (!plan) return { title: 'Lista de produção', body: '<p>Programação não encontrada.</p>' };
  const status = { Planned: 'A produzir', Completed: 'Concluída', Cancelled: 'Cancelada' };
  return { title: `Lista de produção ${plan.number}`, body: `<div class="summary"><div><strong>Data programada</strong><br>${dateBR(plan.scheduledDate)}</div><div><strong>Situação</strong><br>${status[plan.status]}</div><div><strong>Solicitado por</strong><br>${escapeHtml(plan.createdBy)}</div></div>
    <p>${escapeHtml(plan.notes || 'Lista para separação e programação da produção.')}</p>
    <table><thead><tr><th>Código</th><th>Produto</th><th>Unidade</th><th>A produzir</th><th>Produzido</th><th>Conferência</th></tr></thead><tbody>${plan.items.map(item => `<tr><td>${escapeHtml(item.productCode)}</td><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.unit)}</td><td class="strong-qty right">${stockQuantity(item.plannedQuantity)}</td><td class="right">${plan.status === 'Completed' ? stockQuantity(item.producedQuantity) : '________________'}</td><td>________________</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:24px">Responsável pela produção: ____________________ &nbsp; Conferido por: ____________________</p>
    <p>${plan.status === 'Completed' ? `Produzido em ${dateBR(plan.productionDate)}. Confirmado por ${escapeHtml(plan.completedBy)}.` : 'A programação não movimenta estoque. Registre as quantidades realmente produzidas em Confirmar produção.'}</p>` };
}
