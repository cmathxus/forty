function parseClockTime(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  return match ? { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] || 0) } : null;
}

function clockValueFromPoint(x, y, size, mode) {
  const dx = x - size / 2, dy = y - size / 2;
  const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  if (mode === 'minute') return Math.round(angle / 6) % 60;
  const hour = Math.round(angle / 30) % 12;
  return Math.hypot(dx, dy) < size * .35 ? (hour === 0 ? 0 : hour + 12) : (hour === 0 ? 12 : hour);
}

(() => {
  let field = null, mode = 'hour', hour = null, minute = null, second = 0, pointer = null, initialized = false;
  const pad = value => String(value).padStart(2, '0');
  const dialog = () => document.getElementById('timePickerDialog');
  const face = () => document.getElementById('clockFace');
  const input = part => document.getElementById(part === 'hour' ? 'clockHour' : 'clockMinute');

  function update() {
    const value = mode === 'hour' ? hour : minute;
    const valid = Number.isInteger(value) && value >= 0 && value < (mode === 'hour' ? 24 : 60);
    const hand = document.getElementById('clockHand');
    hand.hidden = !valid;
    hand.style.setProperty('--hand-angle', `${mode === 'hour' ? value % 12 * 30 : value * 6}deg`);
    hand.style.setProperty('--hand-length', mode === 'hour' && (value === 0 || value > 12) ? '28%' : '42%');
    document.getElementById('clockNumbers').querySelectorAll('button').forEach(button => {
      const selected = valid && Number(button.dataset.value) === value;
      button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-clock-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.clockMode === mode)));
    document.getElementById('clockHelp').textContent = mode === 'hour' ? 'Escolha a hora · anel interno: 13–23 e 00' : 'Escolha os minutos · clique ou arraste o ponteiro';
    document.getElementById('clockError').textContent = '';
  }

  function renderDial() {
    const numbers = document.getElementById('clockNumbers'); numbers.replaceChildren();
    const values = mode === 'hour' ? Array.from({ length: 24 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i * 5);
    for (const value of values) {
      const angle = (mode === 'hour' ? value % 12 / 12 : value / 60) * Math.PI * 2;
      const radius = mode === 'hour' && (value === 0 || value > 12) ? 28 : 42;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.value = value;
      button.textContent = pad(value); button.setAttribute('aria-label', `${pad(value)} ${mode === 'hour' ? 'horas' : 'minutos'}`);
      button.style.left = `${50 + Math.sin(angle) * radius}%`; button.style.top = `${50 - Math.cos(angle) * radius}%`;
      button.addEventListener('click', event => {
        if (event.detail !== 0) return; // Mouse/toque são tratados pelo ponteiro do relógio.
        const selectedMode = mode;
        select(value);
        if (selectedMode === 'hour') { setMode('minute'); input('minute').focus(); }
      });
      numbers.append(button);
    }
    update();
  }

  function setMode(next) { mode = next; renderDial(); }
  function select(value) {
    if (mode === 'hour') hour = value; else minute = value;
    input(mode).value = pad(value); update();
  }

  function point(event) {
    const rect = face().getBoundingClientRect();
    select(clockValueFromPoint(event.clientX - rect.left, event.clientY - rect.top, rect.width, mode));
  }

  function close() { if (dialog()?.open) dialog().close('cancel'); }

  function init() {
    if (initialized) return; initialized = true;
    const clock = face();
    document.querySelectorAll('[data-clock-mode]').forEach(button => button.addEventListener('click', () => {
      setMode(button.dataset.clockMode); input(mode).focus();
    }));
    for (const part of ['hour', 'minute']) {
      input(part).addEventListener('focus', () => { if (mode !== part) setMode(part); });
      input(part).addEventListener('input', () => {
        const value = /^\d{1,2}$/.test(input(part).value) ? Number(input(part).value) : null;
        if (part === 'hour') hour = value; else minute = value;
        if (mode !== part) setMode(part); else update();
      });
      input(part).addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault(); setMode(part);
        const max = part === 'hour' ? 24 : 60, value = part === 'hour' ? hour : minute;
        select(((value || 0) + (event.key === 'ArrowUp' ? 1 : max - 1)) % max);
      });
    }
    clock.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button > 0) return;
      event.preventDefault(); pointer = event.pointerId; clock.setPointerCapture(pointer); point(event);
    });
    clock.addEventListener('pointermove', event => { if (event.pointerId === pointer) point(event); });
    clock.addEventListener('pointerup', event => {
      if (event.pointerId !== pointer) return;
      point(event); clock.releasePointerCapture(pointer); pointer = null;
      if (mode === 'hour') setMode('minute');
    });
    clock.addEventListener('pointercancel', () => { pointer = null; });
    document.getElementById('clockUse').addEventListener('click', () => {
      if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
        document.getElementById('clockError').textContent = 'Selecione uma hora de 00 a 23 e minutos de 00 a 59.';
        return;
      }
      field.value = `${pad(hour)}:${pad(minute)}${second ? ':' + pad(second) : ''}`;
      field.setCustomValidity('');
      field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));
      dialog().close('apply');
    });
    dialog().addEventListener('close', () => { pointer = null; field = null; });
    dialog().addEventListener('click', event => {
      const rect = dialog().getBoundingClientRect();
      if (event.target === dialog() && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
    });
  }

  function open(target) {
    init(); window.FortyControls?.closeAll(); field = target;
    const value = parseClockTime(field.value);
    hour = value?.hour ?? null; minute = value?.minute ?? null; second = value?.second || 0;
    input('hour').value = hour === null ? '' : pad(hour); input('minute').value = minute === null ? '' : pad(minute);
    setMode('hour'); dialog().showModal(); input('hour').focus();
  }

  function enhance(root = document) {
    const fields = [...root.querySelectorAll('input[type="time"]')];
    if (root.matches?.('input[type="time"]')) fields.push(root);
    for (const target of fields) {
      if (target.dataset.timeEnhanced) continue;
      target.dataset.timeEnhanced = 'true'; target.type = 'text'; target.inputMode = 'numeric';
      target.placeholder = 'HH:mm'; target.maxLength = 8; target.autocomplete = 'off';
      target.pattern = '([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?';
      target.title = 'Horário de 00:00 a 23:59. Você também pode digitar HH:mm:ss.';
      const wrapper = document.createElement('span'); wrapper.className = 'forty-time-control';
      target.before(wrapper); wrapper.append(target);
      const button = document.createElement('button'); button.type = 'button'; button.className = 'time-trigger';
      button.setAttribute('aria-label', 'Escolher horário no relógio'); button.setAttribute('aria-haspopup', 'dialog');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3 2"></path></svg>';
      button.disabled = target.disabled;
      button.addEventListener('click', event => { event.preventDefault(); if (!target.disabled) open(target); });
      target.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); open(target); } });
      wrapper.append(button);
    }
  }
  window.FortyTime = { enhance, close, isOpen: () => Boolean(dialog()?.open) };
})();
