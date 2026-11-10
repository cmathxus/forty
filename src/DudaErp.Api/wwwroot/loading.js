(() => {
  const root = document.getElementById('appLoading');
  const message = document.getElementById('loadingMessage');
  const hint = document.getElementById('loadingHint');
  const tasks = new Map();
  const inertElements = new Map();
  let displayTimer, hintTimer;

  function render() {
    const screen = [...tasks.values()].find(task => task.screen);
    const task = screen || [...tasks.values()][0];
    clearTimeout(displayTimer);
    if (!task) {
      root.hidden = true;
      root.classList.remove('loading-screen');
      document.body.classList.remove('is-loading-screen');
      inertElements.forEach((previous, element) => element.inert = previous);
      inertElements.clear();
      clearTimeout(hintTimer);
      hintTimer = null;
      hint.hidden = true;
      return;
    }
    root.classList.toggle('loading-screen', Boolean(screen));
    document.body.classList.toggle('is-loading-screen', Boolean(screen));
    if (screen) {
      document.querySelectorAll('body > aside, body > main, .login-screen').forEach(element => {
        if (!inertElements.has(element)) inertElements.set(element, element.inert);
        element.inert = true;
      });
    } else {
      inertElements.forEach((previous, element) => element.inert = previous);
      inertElements.clear();
    }
    message.textContent = task.message;
    if (screen || !root.hidden) root.hidden = false;
    else displayTimer = setTimeout(() => { root.hidden = false; }, 180);
    if (!hintTimer) hintTimer = setTimeout(() => { hint.hidden = false; }, 8000);
  }

  function begin({ screen = false, message = 'Carregando dados…' } = {}) {
    const id = Symbol();
    tasks.set(id, { screen, message });
    render();
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      tasks.delete(id);
      render();
    };
  }

  window.FortyLoading = { begin };
  window.FortyLoading.ready = begin({ screen: true, message: 'Preparando seu espaço de trabalho…' });
})();
