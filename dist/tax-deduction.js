// UI and validation only. No personal data is transmitted, logged or persisted.
(() => {
  const form = document.querySelector('#tax-form');
  if (!form) return;
  const submit = form.querySelector('.tax-submit');
  const status = form.querySelector('.tax-status');
  const patient = form.querySelector('.tax-patient');
  const method = form.querySelector('#tax-method');
  const localToday = new Date();
  const today = `${localToday.getFullYear()}-${String(localToday.getMonth()+1).padStart(2,'0')}-${String(localToday.getDate()).padStart(2,'0')}`;
  form.querySelectorAll('[type=date]').forEach(input => { input.max = today; input.min = '1900-01-01'; });
  function sync() {
    const different = form.elements['same-person'].value === 'no';
    patient.hidden = !different;
    patient.disabled = !different;
    form.querySelectorAll('[data-method]').forEach(group => {
      const active = group.dataset.method === method.value;
      group.hidden = !active;
      group.querySelectorAll('input').forEach(input => { input.disabled = !active; });
    });
    form.querySelectorAll('.tax-field').forEach(field => {
      const input = field.querySelector('input,select');
      field.classList.toggle('is-filled', !!input.value.trim());
    });
    for (const [birthId, issueId] of [['tax-birth','tax-issued'], ['patient-birth','patient-issued']]) {
      const birth = form.querySelector(`#${birthId}`), issue = form.querySelector(`#${issueId}`);
      issue.min = birth.value || '1900-01-01';
    }
    const fieldsValid = [...form.querySelectorAll('input,select')].filter(el => el.willValidate).every(el => el.validity.valid && (!el.required || el.type === 'radio' || !!el.value.trim()));
    const periodChosen = !!form.querySelector('[name=period]:checked');
    submit.disabled = !(fieldsValid && periodChosen);
  }
  form.addEventListener('input', event => {
    const input = event.target;
    if (input.id === 'tax-phone') {
      let digits = input.value.replace(/\D/g,'');
      if (digits.length === 11 && /^[78]/.test(digits)) digits = digits.slice(1);
      else if (digits.startsWith('7') && input.value.startsWith('+7')) digits = digits.slice(1);
      digits = digits.slice(0,10);
      input.value = digits ? '+7 ' + [digits.slice(0,3),digits.slice(3,6),digits.slice(6,8),digits.slice(8,10)].filter(Boolean).join(' ') : '';
    }
    if (input.id.endsWith('-inn') || input.id === 'tax-fns') input.value = input.value.replace(/\D/g,'');
    if (input.id === 'tax-passport') input.value = input.value.replace(/\D/g,'').slice(0,10).replace(/^(\d{4})(\d)/,'$1 $2');
    input.removeAttribute('aria-invalid');
    input.closest('.tax-field')?.classList.remove('is-invalid');
    status.hidden = true;
    sync();
  });
  form.addEventListener('change', () => { status.hidden = true; sync(); });
  form.addEventListener('focusout', event => {
    const input = event.target;
    if (input.matches('input,select') && input.willValidate && input.value) {
      input.closest('.tax-field')?.classList.toggle('is-invalid', !input.validity.valid);
      input.setAttribute('aria-invalid', String(!input.validity.valid));
    }
  });
  form.querySelectorAll('[data-date-for]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.dateFor);
    input.focus();
    try { input.showPicker?.(); } catch { /* Focus retains keyboard/native date entry. */ }
  }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    sync();
    if (submit.disabled) { form.reportValidity(); return; }
    status.hidden = false;
    status.focus();
  });
  window.addEventListener('pageshow', sync);
  sync();
})();
