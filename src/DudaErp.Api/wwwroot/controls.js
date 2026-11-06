/* Controles visuais preservam os campos originais usados por FormData e pela API. */
(() => {
  const selects = new Set();
  const dates = new Set();
  let started = false;

  function fieldLabel(field) {
    const label = field.labels?.[0] || field.closest('label');
    return field.getAttribute('aria-label') || (label && [...label.childNodes]
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(' ').trim()) || 'Selecionar opção';
  }

  function syncSelect(field) {
    const control = field.tomselect;
    if (!control) return;
    const value = field.value;
    const options = [...field.options];
    control.clear(true);
    control.clearOptions();
    field.replaceChildren(...options);
    field.value = value;
    control.sync();
    control.refreshOptions(false);
  }

  function enhanceSelect(field) {
    if (field.tomselect || field.closest('.flatpickr-calendar, .ts-wrapper') || !window.TomSelect) return;
    const searchable = ['customerId', 'sellerId', 'productId', 'productCode', 'regionId', 'vehicleId'].includes(field.name) || field.options.length > 8;
    const label = fieldLabel(field);
    const settings = {
      create: false,
      allowEmptyOption: true,
      maxOptions: 150,
      closeAfterSelect: true,
      selectOnTab: false,
      placeholder: 'Selecione…',
      hideSelected: false,
      render: {
        no_results: () => '<div class="no-results">Nenhum resultado encontrado.</div>',
        option: (data, escape) => `<div class="option"><span>${escape(data.text)}</span><span class="option-check" aria-hidden="true">✓</span></div>`
      }
    };
    if (searchable) settings.plugins = ['dropdown_input'];
    else settings.controlInput = null;
    const control = new TomSelect(field, settings);
    field.setAttribute('aria-hidden', 'true');
    control.control.setAttribute('aria-label', label);
    if (control.control_input) {
      control.control_input.placeholder = 'Buscar…';
      control.control_input.setAttribute('aria-label', `Buscar: ${label}`);
      control.control_input.autocomplete = 'off';
    }
    control.on('dropdown_open', () => {
      selects.forEach(other => { if (other !== field) other.tomselect?.close(); });
      dates.forEach(other => other._flatpickr?.close());
    });
    selects.add(field);
  }

  function syncDate(field) {
    const picker = field._flatpickr;
    if (!picker || document.activeElement === picker.altInput) return;
    if (field.value) picker.setDate(field.value, false, 'Y-m-d');
    else picker.clear(false);
    picker.altInput.setCustomValidity('');
  }

  function validDateText(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!match) return false;
    const [, day, month, year] = match.map(Number);
    if (year < 100 || year > 9999) return false;
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function enhanceDate(field) {
    if (field._flatpickr || !window.flatpickr) return;
    const label = fieldLabel(field);
    const picker = flatpickr(field, {
      locale: { ...flatpickr.l10ns.pt, firstDayOfWeek: 1 },
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      ariaDateFormat: 'j \\d\\e F \\d\\e Y',
      altInputClass: 'forty-date-input',
      allowInput: true,
      disableMobile: true,
      static: true,
      monthSelectorType: 'static',
      onChange: (_, __, instance) => instance.altInput.setCustomValidity(''),
      onReady: (_, __, instance) => {
        instance.altInput.placeholder = 'dd/mm/aaaa';
        instance.altInput.setAttribute('aria-label', label);
        instance.altInput.setAttribute('inputmode', 'numeric');
        instance.altInput.required = field.required;
        const footer = document.createElement('div');
        footer.className = 'calendar-footer';
        const today = document.createElement('button');
        today.type = 'button'; today.textContent = 'Hoje';
        today.addEventListener('click', () => { instance.setDate(new Date(), true); instance.close(); });
        const clear = document.createElement('button');
        clear.type = 'button'; clear.textContent = 'Limpar data';
        clear.addEventListener('click', () => { instance.clear(); instance.close(); });
        footer.append(today, clear);
        instance.calendarContainer.append(footer);
        instance.prevMonthNav.setAttribute('aria-label', 'Mês anterior');
        instance.nextMonthNav.setAttribute('aria-label', 'Próximo mês');
        instance.calendarContainer.querySelector('.cur-year').setAttribute('aria-label', 'Ano');
        [instance.prevMonthNav, instance.nextMonthNav].forEach(nav => {
          nav.setAttribute('role', 'button'); nav.tabIndex = 0;
          nav.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); nav.click(); }
          });
        });
      },
      onOpen: (_, __, instance) => {
        selects.forEach(other => other.tomselect?.close());
        dates.forEach(other => { if (other !== field) other._flatpickr?.close(); });
        const rect = instance.altInput.getBoundingClientRect();
        const width = Math.min(308, window.innerWidth - 32);
        const shift = Math.min(0, window.innerWidth - 16 - rect.left - width);
        instance.calendarContainer.style.marginLeft = `${shift}px`;
        instance.calendarContainer.classList.toggle('calendar-above', window.innerHeight - rect.bottom < 355 && rect.top > 355);
      }
    });
    field.dataset.dateEnhanced = 'true';
    dates.add(field);
    const checkTypedDate = event => {
      if (!picker.altInput.value || validDateText(picker.altInput.value)) {
        picker.altInput.setCustomValidity('');
        return;
      }
      picker.altInput.setCustomValidity('Informe uma data válida no formato dd/mm/aaaa.');
      field.value = '';
      event.stopImmediatePropagation();
      if (event.type === 'keydown') { event.preventDefault(); picker.altInput.reportValidity(); }
    };
    picker.altInput.addEventListener('input', () => picker.altInput.setCustomValidity(''));
    picker.altInput.addEventListener('blur', checkTypedDate, true);
    picker.altInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') checkTypedDate(event);
    }, true);
    // O calendário estático acompanha o campo quando o formulário vai para o modal.
    picker.altInput.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') { event.preventDefault(); picker.open(); }
    });
  }

  function enhance(root = document) {
    const fields = [];
    if (root.matches?.('select, input[type="date"]')) fields.push(root);
    fields.push(...root.querySelectorAll('select, input[type="date"]'));
    fields.forEach(field => field.tagName === 'SELECT' ? enhanceSelect(field) : enhanceDate(field));
  }

  function sync(root = document) {
    root.querySelectorAll('select').forEach(syncSelect);
    root.querySelectorAll('[data-date-enhanced]').forEach(syncDate);
  }

  function closeAll() {
    selects.forEach(field => field.tomselect?.close());
    dates.forEach(field => field._flatpickr?.close());
  }

  function isOpen() {
    return [...selects].some(field => field.tomselect?.isOpen) || [...dates].some(field => field._flatpickr?.isOpen);
  }

  function init() {
    if (started) return;
    started = true;
    enhance();
    window.addEventListener('resize', closeAll);
    document.addEventListener('reset', event => queueMicrotask(() => sync(event.target)));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isOpen()) {
        event.fortyControlHandled = true;
        closeAll();
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
    document.addEventListener('invalid', event => {
      const field = event.target;
      if (field.tomselect) { event.preventDefault(); field.tomselect.focus(); }
    }, true);
    new MutationObserver(records => {
      // Componentes criados nas baixas de entrega também recebem o mesmo tratamento.
      selects.forEach(field => {
        if (!field.isConnected) { field.tomselect?.destroy(); selects.delete(field); }
      });
      dates.forEach(field => {
        if (!field.isConnected) { field._flatpickr?.destroy(); dates.delete(field); }
      });
      records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && node.isConnected) enhance(node);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }

  window.FortyControls = { init, sync, syncSelect, syncDate, closeAll, isOpen };
})();
