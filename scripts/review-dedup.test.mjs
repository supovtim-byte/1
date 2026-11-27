import test from 'node:test';
import assert from 'node:assert/strict';
import { deduplicateReviews, reviewKey } from './review-dedup.mjs';
import { readImportedReviews, updateHomepageReviews } from './generate-doctors.mjs';
import { allReviews } from './generate-reviews.mjs';

const story = 'На первом приёме врач внимательно выслушал все наши вопросы, объяснил план лечения и показал снимки. Ребёнок спокойно познакомился с кабинетом, выбрал мультфильм и позволил провести осмотр. После визита мы получили подробные рекомендации по уходу за зубами дома.';
const card = (url, changes = {}) => ({ url, date: '2026-11-20', author: 'Анна Иванова', text: story, excerpt: story.slice(0, 180), source: 'Startsmile', ...changes });

test('cross-platform copies match despite punctuation, case, emoji and tracking links', () => {
  const original = card('https://yandex.ru/maps/org/metelitsa/1132881772/reviews/?reviews%5BpublicId%5D=publicauthor1234567890', { source: 'Яндекс' });
  const copy = card('https://spb.startsmile.ru/stomatologii/metelitsa-otzyvy.html#review900001', { text: story.toUpperCase().replaceAll(', ', ' — ').replaceAll('. ', '!\n') + ' 🌷' });
  assert.deepEqual(deduplicateReviews([copy, original], []), [original]);
  assert.equal(reviewKey(original.url), reviewKey(original.url + '&utm_source=share'));
});

test('short praise, anonymous names and shared excerpts do not hide independent stories', () => {
  const a = card('https://example.test/a', { text: 'Спасибо, всё понравилось!', excerpt: 'Спасибо, всё понравилось!', author: 'Пациент' });
  const b = card('https://example.test/b', { ...a, url: 'https://example.test/b' });
  assert.equal(deduplicateReviews([a, b], []).length, 2);
  const c = card('https://example.test/c', { text: story + ' Следующий визит прошёл прекрасно.' });
  const d = card('https://example.test/d', { text: story + ' Следующий визит вызвал дополнительные вопросы.' });
  assert.equal(c.excerpt, d.excerpt);
  assert.equal(deduplicateReviews([c, d], []).length, 2);
});

test('reviewed paraphrases collapse while a doctor page can retain its sole available copy', () => {
  const original = card('https://example.test/original');
  const copy = card('https://example.test/copy', { text: 'Та же история, переписанная другими словами.', date: '2026-11-21' });
  const groups = [{ canonical: original.url, aliases: [copy.url] }];
  assert.deepEqual(deduplicateReviews([copy, original], groups), [original]);
  assert.deepEqual(deduplicateReviews([copy], groups), [copy]);
  assert.deepEqual(deduplicateReviews([original, copy], groups), [original]);
});

test('complete text wins over a cached fragment and input data stays untouched', () => {
  const original = Object.freeze(card('https://example.test/same'));
  const fragment = Object.freeze({ ...original, text: '' });
  const inputs = Object.freeze([fragment, original]);
  const before = JSON.stringify(inputs);
  assert.deepEqual(deduplicateReviews(inputs, []), [original]);
  assert.equal(JSON.stringify(inputs), before);
});

test('homepage, doctor subjects and archive use the same content deduplication', () => {
  const yandex = card('https://yandex.ru/maps/org/metelitsa/1132881772/reviews/?reviews%5BpublicId%5D=publicauthor1234567890');
  const clinicCopy = card('https://spb.startsmile.ru/stomatologii/metelitsa-otzyvy.html#review900001');
  const doctorCopy = card('https://spb.startsmile.ru/stomatologi/khodykina_darya_aleksandrovna.html#review900002');
  const snapshot = { version: 2, sources: {
    'yandex:clinic': [yandex], 'yandex:hodykina': [yandex],
    'startsmile:clinic': [clinicCopy], 'startsmile:hodykina': [doctorCopy],
  } };
  const imported = readImportedReviews(snapshot);
  assert.equal(imported.get('clinic').length, 1);
  assert.equal(imported.get('hodykina').length, 1);
  assert.equal(allReviews(imported).length, 1);
  const html = updateHomepageReviews('<!-- imported-reviews:start -->\n<!-- imported-reviews:end -->', [yandex, clinicCopy]);
  assert.equal((html.match(/<article /g) ?? []).length, 1);
});
