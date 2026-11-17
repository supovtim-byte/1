// Keep a selected specialty in the URL so reloads and shared links keep the view.
const doctorFilters = document.querySelector('[data-doctor-filters]');
if (doctorFilters) {
  const buttons = [...doctorFilters.querySelectorAll('[data-specialty]')];
  const cards = [...document.querySelectorAll('[data-doctor-specialties]')];
  const count = document.querySelector('[data-doctor-count]');
  const doctorWord = value => value === 1 ? 'врач' : value < 5 ? 'врача' : 'врачей';

  function filterDoctors(specialty) {
    const selected = buttons.some(button => button.dataset.specialty === specialty) ? specialty : 'all';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.specialty === selected));
    for (const card of cards) card.hidden = selected !== 'all' && !card.dataset.doctorSpecialties.split(' ').includes(selected);
    const visible = cards.filter(card => !card.hidden).length;
    count.textContent = `${visible} ${doctorWord(visible)}`;
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
