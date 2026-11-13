const userRoleDescriptions = {
  Administrador: 'Acesso completo, gestão de usuários e ajustes de estoque.',
  Faturamento: 'Comercial: clientes, pedidos, vendas e lançamento de contas a receber.',
  Financeiro: 'Aprovação de pedidos, consulta comercial, contas a pagar e a receber.',
  Comprador: 'Consulta de contas a pagar.',
  'Expedição': 'Cargas, saídas, documentos de expedição e conferência de retorno.',
  'Produção': 'Programações, listas e confirmação das quantidades produzidas.'
};

const permissionColumns = ['Consultar', 'Criar', 'Editar', 'Excluir'];
let permissionCatalog;

function loadPermissionCatalog() {
  permissionCatalog ??= api('/api/users/permissions').catch(error => {
    permissionCatalog = null;
    throw error;
  });
  return permissionCatalog;
}

function renderPermissionMatrix(catalog, selected, locked) {
  const active = new Set(selected);
  const groups = [...new Set(catalog.modules.map(module => module.group))];
  const control = (module, action) => `<input type="checkbox" value="${escapeHtml(action.key)}"
    aria-label="${escapeHtml(`${module.name}: ${action.label}`)}" ${active.has(action.key) ? 'checked' : ''} ${locked ? 'disabled' : ''}>`;
  $('#permissionMatrix').innerHTML = `<table class="permission-table"><thead><tr><th scope="col">Módulo</th>
    ${permissionColumns.map(label => `<th scope="col">${label}</th>`).join('')}<th scope="col">Ações específicas</th></tr></thead>
    ${groups.map(group => `<tbody><tr class="permission-group"><th scope="rowgroup" colspan="6">${escapeHtml(group)}</th></tr>
      ${catalog.modules.filter(module => module.group === group).map(module => {
        const extra = module.actions.filter(action => !permissionColumns.includes(action.label));
        return `<tr data-permission-module><th scope="row">${escapeHtml(module.name)}</th>
          ${permissionColumns.map(label => {
            const action = module.actions.find(item => item.label === label);
            return `<td class="permission-cell">${action ? control(module, action) : '<span aria-label="Não se aplica">—</span>'}</td>`;
          }).join('')}
          <td><div class="permission-extras">${extra.map(action => `<label>${control(module, action)}<span>${escapeHtml(action.label)}</span></label>`).join('')}</div></td></tr>`;
      }).join('')}</tbody>`).join('')}</table>`;
}

function selectedPermissions() {
  return $$('#permissionMatrix input:checked').map(input => input.value);
}

function updatePermissionStatus(catalog) {
  const role = $('#userForm').elements.role.value;
  const selected = selectedPermissions();
  const template = catalog.templates[role] ?? [];
  const matchesTemplate = selected.length === template.length && template.every(key => selected.includes(key));
  $('#permissionMode').textContent = role === 'Administrador' ? 'Acesso completo' : matchesTemplate ? 'Modelo padrão' : 'Personalizado';
  $('#restorePermissions').disabled = !role || role === 'Administrador' || matchesTemplate;
  return matchesTemplate || role === 'Administrador' ? null : selected;
}

function applyPermissionTemplate(catalog, custom = null) {
  const role = $('#userForm').elements.role.value;
  $('#userPermissions').hidden = !role;
  renderPermissionMatrix(catalog, custom ?? catalog.templates[role] ?? [], role === 'Administrador');
  updatePermissionStatus(catalog);
}

async function refreshUsers() {
  await refreshList('users');
}

function renderUsers() {
  const rows = listRows('users');
  $('#usersCount').textContent = listCount('users');
  $('#usersList').innerHTML = rows.map(user => `<div class="mini-card"><strong>${escapeHtml(user.name)}${user.id === state.currentUser?.id ? ' · Você' : ''}</strong>
    <div class="meta">${escapeHtml(user.email)}</div><div class="meta">${escapeHtml(user.role)}${user.customPermissions ? ' · Personalizado' : ''} · <span class="badge ${user.isActive ? 'green' : ''}">${user.isActive ? 'Ativo' : 'Inativo'}</span></div>
    <div class="card-actions"><button type="button" data-edit-user="${user.id}">Editar acesso</button>${user.id !== state.currentUser?.id ? `<button type="button" data-reset-user-password="${user.id}">Redefinir senha</button>` : ''}</div></div>`).join('') || '<div class="empty-state">Nenhum usuário encontrado.</div>';
}

function prepareUserForm(catalog, user = null) {
  const form = $('#userForm');
  const ownAccount = Boolean(user && user.id === state.currentUser?.id);
  $('#userInitialPassword').hidden = Boolean(user);
  for (const name of ['password', 'confirmPassword']) { form.elements[name].disabled = Boolean(user); form.elements[name].required = !user; }
  $('#userActiveField').hidden = !user;
  form.elements.isActive.disabled = !user || ownAccount;
  form.elements.role.disabled = ownAccount;
  $('#userAccessNote').textContent = ownAccount ? 'Você pode atualizar seus dados, mas não pode remover seu próprio acesso de administrador. A atualização encerra sua sessão.' : 'Alterar o perfil, os dados ou o status encerra as sessões desse usuário. Contas inativas não conseguem entrar.';
  window.FortyControls?.sync(form);
  const picker = form.elements.role.tomselect;
  if (picker) ownAccount ? picker.disable() : picker.enable();
  updateUserRoleHint();
  applyPermissionTemplate(catalog, user?.customPermissions);
}

function updateUserRoleHint() {
  $('#userRoleHint').textContent = userRoleDescriptions[$('#userForm').elements.role.value] || 'Selecione um modelo para definir as permissões iniciais.';
}

async function editUser(id) {
  const user = state.users.find(x => x.id === id);
  if (!user || !hasPermission('users.manage')) return;
  const catalog = await loadPermissionCatalog();
  if (!hasPermission('users.manage')) return;
  const form = $('#userForm'); form.reset();
  state.editing.user = id;
  fillForm(form, user); prepareUserForm(catalog, user);
  openEditModal(form, 'Editar usuário e acesso');
}

function openUserPassword(id) {
  const user = state.users.find(x => x.id === id);
  if (!user || !hasPermission('users.manage')) return;
  const form = $('#userPasswordForm'); form.reset(); delete form.dataset.dirty; form.dataset.userId = id;
  $('#userPasswordContext').textContent = `Redefinir a senha de ${user.name} (${user.email}). As sessões atuais serão encerradas.`;
  openEditModal(form, 'Redefinir senha do usuário');
}

function wireUsers() {
  $('#userForm').elements.role.addEventListener('change', async () => {
    updateUserRoleHint();
    applyPermissionTemplate(await loadPermissionCatalog());
  });
  $('#restorePermissions').addEventListener('click', async () => {
    applyPermissionTemplate(await loadPermissionCatalog());
    $('#userForm').dataset.dirty = 'true';
  });
  $('#permissionMatrix').addEventListener('change', async event => {
    const input = event.target;
    const row = input.closest('[data-permission-module]');
    const consult = row?.querySelector('td:first-of-type input');
    if (consult && input.value !== 'receivables.create') {
      if (input.checked) consult.checked = true;
      else if (input === consult) row.querySelectorAll('input').forEach(field => {
        if (field.value !== 'receivables.create') field.checked = false;
      });
    }
    updatePermissionStatus(await loadPermissionCatalog());
  });
  $('#userForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target;
    if (!state.editing.user && form.elements.password.value !== form.elements.confirmPassword.value) return toast('As senhas não conferem.');
    const customPermissions = updatePermissionStatus(await loadPermissionCatalog());
    submitJson(form, submitUrl(form, '/api/users'), () => ({ name: form.elements.name.value, email: form.elements.email.value,
      role: form.elements.role.value, customPermissions,
      ...(state.editing.user ? { isActive: form.elements.isActive.checked } : { password: form.elements.password.value }) }), null, submitMethod(form));
  });
  $('#userPasswordForm').addEventListener('submit', event => {
    event.preventDefault(); const form = event.target;
    if (form.elements.password.value !== form.elements.confirmPassword.value) return toast('As senhas não conferem.');
    submitJson(form, `/api/users/${form.dataset.userId}/password`, () => ({ password: form.elements.password.value }));
  });
}
