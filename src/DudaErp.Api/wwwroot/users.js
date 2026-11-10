const userRoleDescriptions = {
  Administrador: 'Acesso completo, gestão de usuários e ajustes de estoque.',
  Faturamento: 'Clientes, pedidos, executados, financeiro e relatórios de vendas.',
  'Expedição': 'Cargas, saídas, documentos de expedição e conferência de retorno.',
  'Produção': 'Programações, listas e confirmação das quantidades produzidas.'
};

async function refreshUsers() {
  state.users = await api('/api/users');
  renderUsers();
}

function renderUsers() {
  const term = normalize($('#userSearch').value);
  const rows = state.users.filter(user => normalize(`${user.name} ${user.email} ${user.role}`).includes(term));
  const active = state.users.filter(x => x.isActive).length;
  $('#usersCount').textContent = `${rows.length} ${rows.length === 1 ? 'usuário' : 'usuários'} · ${active} ${active === 1 ? 'ativo' : 'ativos'}`;
  $('#usersList').innerHTML = rows.map(user => `<div class="mini-card"><strong>${escapeHtml(user.name)}${user.id === state.currentUser?.id ? ' · Você' : ''}</strong>
    <div class="meta">${escapeHtml(user.email)}</div><div class="meta">${escapeHtml(user.role)} · <span class="badge ${user.isActive ? 'green' : ''}">${user.isActive ? 'Ativo' : 'Inativo'}</span></div>
    <div class="card-actions"><button type="button" data-edit-user="${user.id}">Editar acesso</button>${user.id !== state.currentUser?.id ? `<button type="button" data-reset-user-password="${user.id}">Redefinir senha</button>` : ''}</div></div>`).join('') || '<div class="empty-state">Nenhum usuário encontrado.</div>';
}

function prepareUserForm(user = null) {
  const form = $('#userForm');
  const ownAccount = user?.id === state.currentUser?.id;
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
}

function updateUserRoleHint() {
  $('#userRoleHint').textContent = userRoleDescriptions[$('#userForm').elements.role.value] || 'Selecione o setor do usuário. Todos os perfis podem consultar produtos e saldos de estoque.';
}

function editUser(id) {
  const user = state.users.find(x => x.id === id);
  if (!user || !hasPermission('users.manage')) return;
  const form = $('#userForm'); form.reset();
  state.editing.user = id;
  fillForm(form, user); prepareUserForm(user);
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
  $('#userSearch').addEventListener('input', renderUsers);
  $('#userForm').elements.role.addEventListener('change', updateUserRoleHint);
  $('#userForm').addEventListener('submit', event => {
    event.preventDefault(); const form = event.target;
    if (!state.editing.user && form.elements.password.value !== form.elements.confirmPassword.value) return toast('As senhas não conferem.');
    submitJson(form, submitUrl(form, '/api/users'), () => ({ name: form.elements.name.value, email: form.elements.email.value,
      role: form.elements.role.value, ...(state.editing.user ? { isActive: form.elements.isActive.checked } : { password: form.elements.password.value }) }), null, submitMethod(form));
  });
  $('#userPasswordForm').addEventListener('submit', event => {
    event.preventDefault(); const form = event.target;
    if (form.elements.password.value !== form.elements.confirmPassword.value) return toast('As senhas não conferem.');
    submitJson(form, `/api/users/${form.dataset.userId}/password`, () => ({ password: form.elements.password.value }));
  });
}
