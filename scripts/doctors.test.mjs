import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadDoctors, validateDoctor, renderDoctor, renderCatalog, updateRelatedCards } from './generate-doctors.mjs';

const root = path.resolve(import.meta.dirname, '..');
const doctors = loadDoctors();
const profile = fs.readFileSync(path.join(root, 'templates/doctor.html'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'templates/doctors.html'), 'utf8');
const copy = id => structuredClone(doctors.find(d => d.id === id));

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
