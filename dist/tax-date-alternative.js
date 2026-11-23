// Runs before the shared tax form script; keeps its ISO date values in sync.
(() => {
  const form = document.querySelector('#tax-form');
  const groups = [...form.querySelectorAll('.split-date')];
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  let updating = false;
  function update(group) {
    const parts = [...group.querySelectorAll('[data-date-part]')];
    const [day,month,year] = parts.map(p => p.value.trim());
    const value = group.querySelector('.split-date-value');
    const hasAny = parts.some(p => p.value);
    let error = '', badParts = [];
    if (parts.some(p => !p.value)) {
      error = hasAny ? 'Введите дату полностью: день, месяц и год.' : 'Введите дату.';
      badParts = parts.filter(p => !p.value);
    } else if (!/^\d{4}$/.test(year)) {
      error = 'Введите год четырьмя цифрами.'; badParts = [parts[2]];
    } else {
      const d = Number(day), m = Number(month), y = Number(year);
      const parsed = new Date(Date.UTC(y, m-1, d));
      if (!/^\d{1,2}$/.test(day) || d < 1 || d > 31) { error = 'Введите день от 1 до 31.'; badParts = [parts[0]]; }
      else if (!/^\d{1,2}$/.test(month) || m < 1 || m > 12) { error = 'Введите месяц от 1 до 12.'; badParts = [parts[1]]; }
      else if (y < 1900) { error = 'Введите год не раньше 1900.'; badParts = [parts[2]]; }
      else if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m-1 || parsed.getUTCDate() !== d) { error = 'Такой даты нет. Проверьте день и месяц.'; badParts = [parts[0],parts[1]]; }
      else {
        const iso = `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')}`;
        const birthId = value.id === 'tax-issued' ? 'tax-birth' : value.id === 'patient-issued' ? 'patient-birth' : '';
        const birth = birthId ? document.getElementById(birthId).value : '';
        if (iso > todayISO) { error = 'Дата не может быть в будущем.'; badParts = parts; }
        else if (birth && iso < birth) { error = 'Дата выдачи не может быть раньше даты рождения.'; badParts = parts; }
        else value.value = iso;
      }
    }
    if (error) value.value = '';
    parts.forEach(p => {
      p.setCustomValidity(badParts.includes(p) ? error : '');
      if (group.dataset.touched && badParts.includes(p)) p.setAttribute('aria-invalid','true');
      else p.removeAttribute('aria-invalid');
    });
    group.classList.toggle('is-valid-date', !error);
    const message = group.querySelector('.split-date-error');
    message.textContent = error;
    message.hidden = !error || !group.dataset.touched;
  }
  function sync() {
    if (updating) return;
    updating = true;
    groups.forEach(update); // Birth groups precede their corresponding issue dates.
    groups[0].querySelector('.split-date-value').dispatchEvent(new Event('input',{bubbles:true}));
    updating = false;
  }
  groups.forEach(group => {
    group.addEventListener('paste', event => {
      if (!event.target.matches('[data-date-part]')) return;
      const text = event.clipboardData.getData('text').trim();
      const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const local = text.match(/^(\d{1,2})[.\s/\-]+(\d{1,2})[.\s/\-]+(\d{4})$/);
      if (!iso && !local) return;
      event.preventDefault();
      const values = iso ? [iso[3],iso[2],iso[1]] : local.slice(1);
      group.querySelectorAll('[data-date-part]').forEach((input,i) => { input.value = values[i]; });
      sync();
    });
  });
  form.addEventListener('input', event => {
    if (updating || !event.target.matches('[data-date-part]')) return;
    event.stopPropagation();
    const input = event.target;
    input.value = input.value.replace(/\D/g,'').slice(0,input.dataset.datePart === 'year' ? 4 : 2);
    sync();
  }, true);
  form.addEventListener('focusout', event => {
    if (!event.target.matches('[data-date-part]')) return;
    event.stopPropagation();
    const group = event.target.closest('.split-date');
    queueMicrotask(() => {
      if (!group.contains(document.activeElement)) { group.dataset.touched = 'true'; sync(); }
    });
  }, true);
  window.addEventListener('pageshow', sync);
  groups.forEach(update);
})();
