(() => {
  let pending = null;
  function cancel() { if (pending) document.getElementById('confirmationDialog').close('cancel'); }

  async function ask(message, options = {}) {
    if (pending) return false;
    const dialog = document.getElementById('confirmationDialog');
    const token = accessToken;
    window.FortyControls?.closeAll();
    document.getElementById('confirmationTitle').textContent = options.title || 'Confirmar ação';
    document.getElementById('confirmationMessage').textContent = message;
    const button = document.getElementById('confirmationAccept');
    button.textContent = options.accept || 'Confirmar';
    document.getElementById('confirmationCancel').textContent = options.cancel || 'Cancelar';
    button.classList.toggle('destructive', Boolean(options.destructive));
    const accepted = new Promise(resolve => { pending = resolve; });
    const finish = () => {
      const resolve = pending; pending = null;
      resolve(dialog.returnValue === 'accept' && token === accessToken);
    };
    dialog.addEventListener('close', finish, { once: true });
    dialog.returnValue = 'cancel';
    dialog.showModal();
    document.getElementById('confirmationCancel').focus();
    return accepted;
  }
  window.FortyDialogs = { ask, cancel, isOpen: () => Boolean(pending) };
})();

const askConfirmation = (message, options) => window.FortyDialogs.ask(message, options);
