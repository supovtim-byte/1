import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadDoctors, validateDoctor, renderDoctor, renderCatalog, renderCard, updateRelatedCards, readImportedReviews, updateHomepageReviews } from './generate-doctors.mjs';

const root = path.resolve(import.meta.dirname, '..');
const doctors = loadDoctors();
const profile = fs.readFileSync(path.join(root, 'templates/doctor.html'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'templates/doctors.html'), 'utf8');
const copy = id => structuredClone(doctors.find(d => d.id === id));

test('imported reviews show the author and a platform link and escape the full text', () => {
  const source = 'https://spb.startsmile.ru/stomatologi/test.html';
  const card = {
    date: '2026-11-25', author: 'Анна & Олег', excerpt: 'Отзыв <img src=x> {{example}}',
    text: 'Полный отзыв\n</template><img src=x> {{example}}', rating: 4.5,
  };
  const imported = readImportedReviews({ version: 1, sources: {
    'startsmile:hodykina': [
      { ...card, url: source + '#review1234' },
      { ...card, url: source },
      { ...card, url: 'https://other.example/store#review1234' },
    ],
  } });
  const reviews = imported.get('hodykina');
  assert.equal(reviews.length, 1);
  const html = renderDoctor(copy('hodykina'), profile, reviews);
  assert.match(html, /<h3>Анна &amp; Олег<\/h3>/);
  assert.match(html, /Отзыв &lt;img src=x&gt; &#123;&#123;example&#125;&#125;/);
  assert.match(html, /<template data-review-text>Полный отзыв\n&lt;\/template&gt;&lt;img src=x&gt; &#123;&#123;example&#125;&#125;<\/template>/);
  assert.doesNotMatch(html, /из 5|Читать оригинал/);
  assert.match(html, /href="https:\/\/spb\.startsmile\.ru\/stomatologi\/test\.html#review1234"[^>]*>Startsmile/);
  assert.match(html, /Все отзывы на ПроДокторов/);
});

test('updating the homepage review slot is idempotent and keeps the editorial cards', () => {
  const initial = '  <!-- imported-reviews:start -->\n  <!-- imported-reviews:end -->\n  <article>Отзыв клиники</article>';
  const imported = readImportedReviews({ version: 1, sources: { 'yandex:clinic': [{
    date: '2026-11-25', excerpt: 'Сохранённый фрагмент', rating: 5,
    url: 'https://yandex.ru/maps/org/metelitsa/1132881772/reviews/?reviews%5BpublicId%5D=testreviewauthor123',
  }] } });
  const cards = imported.get('clinic');
  const updated = updateHomepageReviews(initial, cards);
  assert.match(updated, /<h3>Автор не указан<\/h3>/);
  assert.match(updated, /target="_blank" rel="noopener">Яндекс<\/a>/);
  assert.doesNotMatch(updated, /data-review-text|Яндекс Карты|из 5/);
  assert.equal(updateHomepageReviews(updated, cards), updated);
  assert.equal(updateHomepageReviews(updated, []), initial);
});

test('data cannot inject markup through profile text, image alt or external review links', () => {
  const d = copy('hodykina');
  d.name = '<script>alert("name")</script>';
  d.about[0].text = '<img src=x onerror="alert(1)">';
  d.photo.alt = '" onload="alert(1)';
  d.sources.reviews.url += '?one=1&two=2';
  const html = renderDoctor(validateDoctor(d), profile);
  assert.ok(html.includes('&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
  assert.ok(html.includes('alt="&quot; onload=&quot;alert(1)"'));
  assert.ok(html.includes('?one=1&amp;two=2'));
});

test('deferred information stays out of HTML, including source URLs', () => {
  const d = copy('nikiforov');
  d.deferred.publications[0].title = 'DEFERRED-PUBLICATION';
  d.deferred.employment[0].organization = 'DEFERRED-EMPLOYMENT';
  d.sources['paper-1'].url = 'https://example.org/deferred-source';
  const html = renderDoctor(d, profile);
  assert.doesNotMatch(html, /DEFERRED-|example\.org\/deferred-source|10\.18705/);
  assert.doesNotMatch(html, /sourceRefs|checkedAt|"deferred"/);
});

test('unknown experience, education, photo and reviews do not produce invented content or broken navigation', () => {
  const d = copy('novakovskaya');
  d.about = []; d.education = []; d.directions = []; d.reviews.links = []; d.experience = null;
  const html = renderDoctor(d, profile);
  assert.doesNotMatch(html, /опыт:|id="education"|id="doctor-about"|id="directions"|id="reviews"|href="#reviews"/);
  assert.ok(html.includes('assets/doctors/placeholder.svg'));
  assert.ok(html.includes('href="index.html#reviews"'));
  assert.ok(html.includes('id="appointment-title"'));
  assert.doesNotMatch(html, /Наталья Иванова|2022-08-24/);
});

test('reviews identify each platform without copying sample testimonials or inventing a combined score', () => {
  const html = renderDoctor(copy('hodykina'), profile);
  assert.ok(html.includes('<h3>ПроДокторов</h3>'));
  assert.ok(html.includes('<h3>Startsmile</h3>'));
  assert.doesNotMatch(html, /Наталья Иванова|Лечимся в данной клинике|<time|ratingValue|aggregateRating/);
});

test('every interactive review carousel provides the controls required by the shared site script', () => {
  for (const d of doctors) {
    const html = renderDoctor(d, profile);
    for (const [section] of html.matchAll(/<section\b[^>]*\bdata-carousel\b[\s\S]*?<\/section>/g)) {
      assert.ok(section.includes('data-prev'), `${d.id}: previous control missing`);
      assert.ok(section.includes('data-next'), `${d.id}: next control missing`);
    }
  }
});

test('unavailable and document-only doctors do not offer an appointment with that doctor', () => {
  for (const id of ['doncova', 'kilyusheva', 'buhtoyarova', 'nikiforov', 'efimova']) {
    const d = copy(id);
    const html = renderDoctor(d, profile);
    assert.ok(html.includes('связаться с клиникой'));
    assert.ok(!html.includes(`data-book="${d.name}"`));
    assert.ok(!html.includes('записаться к врачу'));
  }
});

test('validator rejects missing references, unsafe links and paths, and unsourced visible facts', () => {
  for (const mutate of [
    d => { d.about[0].sourceRefs = ['missing']; },
    d => { delete d.about[0].sourceRefs; },
    d => { d.sources.reviews.url = 'javascript:alert(1)'; },
    d => { d.sources.reviews.url = 'https://user:password@example.org/'; },
    d => { d.photo.path = 'assets/doctors/../../logo.png'; },
    d => { d.directions[0].items[0].href = 'https://example.org'; },
    d => { d.experience.years = -1; },
  ]) {
    const d = copy('hodykina'); mutate(d);
    assert.throws(() => validateDoctor(d));
  }
});

test('catalogue links every listed doctor once and excludes unconfirmed active staff', () => {
  const html = renderCatalog(doctors, catalog);
  const links = [...html.matchAll(/class="doctor-profile-link" href="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(links).size, 28);
  for (const d of doctors) assert.equal(links.includes(`doctor-${d.id}.html`), d.publication.catalog);
  assert.doesNotMatch(html, /data-doctor-copy/);
  assert.ok(html.includes('data-specialty="orthodontics"'));
  assert.ok(html.includes('data-specialty="orthopedics"'));
});

test('preview cards use surname and given name while profiles and data keep the full name', () => {
  const d = copy('hodykina');
  const original = structuredClone(d);
  const card = renderCard(d);
  assert.ok(card.includes('>Ходыкина Дарья</a></h3>'));
  assert.ok(!card.includes('Ходыкина Дарья Александровна'));
  assert.ok(renderDoctor(d, profile).includes('<h1 id="doctor-title">Ходыкина Дарья Александровна</h1>'));
  assert.deepEqual(d, original);
  const legacy = '<article class="doctor-card"><h3><a href="doctor-barmashev.html">Филипп Бармашев</a></h3><p>врач-стоматолог-хирург</p></article>';
  const updated = updateRelatedCards(legacy, doctors);
  assert.ok(updated.includes('>Бармашев Филипп</a></h3>'));
  assert.equal(updateRelatedCards(updated, doctors), updated);
});

test('specialty labels retain specific roles without repeated physician prefixes or redundant general roles', () => {
  const chief = renderDoctor(copy('sizonec'), profile);
  assert.ok(chief.includes('<p>Главный врач, детский стоматолог, терапевт, хирург</p>'));
  assert.ok(renderCard(copy('skalozub')).includes('<p>Хирург</p>'));
  assert.ok(renderCard(copy('simonin')).includes('<p>Терапевт</p>'));
  assert.ok(renderCard(copy('bogdanova')).includes('<p>Гигиенист</p>'));
});

test('consultation-only records do not produce a placeholder clinical-scope block', () => {
  const d = copy('hodykina');
  assert.ok(d.directions.some(group => group.items.some(item => item.kind === 'consultation')));
  const html = renderDoctor(d, profile);
  assert.doesNotMatch(html, /id="directions"|id="directions-title"|Консультация стоматолога-терапевта/);
});

test('individual scope comes from each doctor record and uses the existing accordion design', () => {
  const orthodontist = renderDoctor(copy('dzigua'), profile);
  assert.ok(orthodontist.includes('Исправление прикуса элайнерами'));
  assert.ok(orthodontist.includes('Лечение с применением ортодонтических пластинок'));
  assert.ok(orthodontist.includes('<details name="doctor-directions">'));
  const surgeon = renderDoctor(copy('barmashev'), profile);
  assert.ok(surgeon.includes('Установка зубных имплантатов'));
  assert.ok(!surgeon.includes('Исправление прикуса элайнерами'));
  const therapist = renderDoctor(copy('simonin'), profile);
  assert.ok(therapist.includes('Повторное эндодонтическое лечение'));
  assert.ok(therapist.includes('Апикальная хирургия для сохранения зубов'));
  assert.ok(!therapist.includes('Консультация стоматолога-терапевта'));
});

test('clinical procedures cannot be inferred from a job title, education or patient review', () => {
  for (const ref of ['staff', 'education', 'reviews']) {
    const d = copy('dzigua');
    d.directions[0].items[0].sourceRefs = [ref];
    assert.throws(() => validateDoctor(d), /individual professional source/);
  }
});

test('existing carousel links and stale experience follow doctor data without changing short headings', () => {
  const original = '<article class="doctor-card"><h3><a href="doctor-hodykina.html">Сизонец Александра</a></h3><p class="doctor-experience">опыт: 6 лет</p></article>';
  const updated = updateRelatedCards(original, doctors);
  assert.ok(updated.includes('href="doctor-sizonec.html"'));
  assert.ok(updated.includes('>Сизонец Александра</a>'));
  assert.doesNotMatch(updated, /опыт:/);
  assert.equal(updateRelatedCards(updated, doctors), updated);
});

test('catalogue filtering retains deep links, keyboard-button events, invalid-filter fallback and history', () => {
  const listeners = {};
  const buttons = ['all', 'therapy', 'orthodontics'].map(specialty => ({
    dataset: { specialty }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }, closest() { return this; },
  }));
  const cards = ['therapy', 'orthodontics', 'therapy children'].map(tags => ({ dataset: { doctorSpecialties: tags } }));
  const filters = { hidden: true, querySelectorAll: () => buttons, addEventListener: (k, cb) => { listeners[k] = cb; } };
  const status = {};
  const location = { href: 'https://example.org/1/doctors.html?specialty=orthodontics' };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'dist/catalog.js'), 'utf8'), {
    URL, location, history: { pushState: (_a, _b, url) => { location.href = String(url); } },
    window: { addEventListener: (k, cb) => { listeners[k] = cb; } },
    document: { querySelector: s => s === '[data-doctor-filters]' ? filters : status, querySelectorAll: () => cards },
  });
  assert.equal(filters.hidden, false);
  assert.deepEqual(cards.map(c => c.hidden), [true, false, true]);
  listeners.click({ target: buttons[1] });
  assert.deepEqual(cards.map(c => c.hidden), [false, true, false]);
  assert.ok(location.href.endsWith('?specialty=therapy'));
  assert.equal(buttons[1].attrs['aria-pressed'], 'true');
  location.href = 'https://example.org/1/doctors.html?specialty=invalid'; listeners.popstate();
  assert.deepEqual(cards.map(c => c.hidden), [false, false, false]);
  assert.equal(status.textContent, 'Показано: 3 врача');
});
