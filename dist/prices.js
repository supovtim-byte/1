// Audience and text filters only change visibility; the complete price list stays in HTML.
const priceFilters = [...document.querySelectorAll('[data-price-filter]')];
const priceSearch = document.querySelector('[data-price-search]');
const priceGroups = [...document.querySelectorAll('.prices-category')];
const priceStatus = document.querySelector('[data-price-status]');
const priceEmpty = document.querySelector('[data-price-empty]');
const priceNavLinks = [...document.querySelectorAll('.prices-page .treatment-nav a')];
const normalizePriceText = text => text.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
let priceAudience = 'all';

function filterPrices() {
  const query = normalizePriceText(priceSearch.value);
  let visibleRows = 0;
  for (const group of priceGroups) {
    const heading = group.querySelector('h2').textContent;
    const rows = [...group.querySelectorAll('.prices-list > div')];
    let visibleInGroup = 0;
    for (const row of rows) {
      const matchesAudience = priceAudience === 'all' || row.dataset.priceAudience.split(' ').includes(priceAudience);
      const matchesSearch = normalizePriceText(heading + ' ' + row.textContent).includes(query);
      row.hidden = !matchesAudience || !matchesSearch;
      if (!row.hidden) visibleInGroup++;
    }
    group.hidden = visibleInGroup === 0;
    const link = priceNavLinks.find(link => link.hash === '#' + group.id);
    if (link) link.hidden = group.hidden;
    visibleRows += visibleInGroup;
  }
  priceEmpty.hidden = visibleRows !== 0;
  priceStatus.textContent = visibleRows ? `Найдено позиций: ${visibleRows}` : 'По вашему запросу ничего не найдено';
  // The shared navigation recalculates the active group after filtering.
  window.dispatchEvent(new Event('resize'));
}

for (const button of priceFilters) {
  button.addEventListener('click', () => {
    priceAudience = button.dataset.priceFilter;
    for (const item of priceFilters) item.setAttribute('aria-pressed', String(item === button));
    filterPrices();
  });
}
priceSearch.form.addEventListener('submit', event => event.preventDefault());
priceSearch.addEventListener('input', filterPrices);
