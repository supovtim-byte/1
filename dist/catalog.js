// Keep a selected specialty in the URL so reloads and shared links keep the view.
const doctorFilters = document.querySelector('[data-doctor-filters]');
if (doctorFilters) {
  const buttons = [...doctorFilters.querySelectorAll('[data-specialty]')];
  const cards = [...document.querySelectorAll('[data-doctor-specialties]')];
  const status = document.querySelector('[data-doctor-status]');
  const doctorWord = value => value % 10 === 1 && value % 100 !== 11 ? 'врач'
    : value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14) ? 'врача' : 'врачей';

  function filterDoctors(specialty) {
    const selected = buttons.some(button => button.dataset.specialty === specialty) ? specialty : 'all';
    for (const card of cards) card.hidden = selected !== 'all' && !card.dataset.doctorSpecialties.split(' ').includes(selected);
    const visible = cards.filter(card => !card.hidden).length;
    for (const button of buttons) {
      const active = button.dataset.specialty === selected;
      button.setAttribute('aria-pressed', String(active));
      const count = button.querySelector('[data-filter-count]');
      count.hidden = button.dataset.specialty !== 'all' && !active;
      count.textContent = button.dataset.specialty === 'all' ? cards.length : visible;
    }
    status.textContent = `Показано: ${visible} ${doctorWord(visible)}`;
  }

  doctorFilters.hidden = false;
  filterDoctors(new URL(location.href).searchParams.get('specialty'));
  doctorFilters.addEventListener('click', event => {
    const button = event.target.closest('[data-specialty]');
    if (!button) return;
    if (button.getAttribute('aria-pressed') === 'true') return;
    const url = new URL(location.href);
    const selected = button.dataset.specialty;
    if (selected === 'all') url.searchParams.delete('specialty');
    else url.searchParams.set('specialty', selected);
    history.pushState(null, '', url);
    filterDoctors(selected);
  });
  window.addEventListener('popstate', () => filterDoctors(new URL(location.href).searchParams.get('specialty')));
}
