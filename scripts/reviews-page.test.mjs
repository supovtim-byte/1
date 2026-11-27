import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allReviews, renderReviewsPage } from './generate-reviews.mjs';

test('archive deduplicates clinic and doctor copies, keeps full text and sorts newest first', () => {
  const early = { url: 'https://example.test/first', date: '2025-01-01', excerpt: 'Фрагмент', text: '' };
  const recent = { url: 'https://example.test/second', date: '2026-11-27', excerpt: 'Новый отзыв', text: 'Полный текст' };
  const imported = new Map([
    ['clinic', [early, recent]],
    ['doctor', [{ ...early, text: 'Сохранился полный текст' }, recent]],
  ]);
  const cards = allReviews(imported);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].url, recent.url);
  assert.equal(cards[1].text, 'Сохранился полный текст');
});

test('archive uses the shared homepage card and does not invent video URLs', () => {
  const template = fs.readFileSync(new URL('../templates/reviews.html', import.meta.url), 'utf8');
  const videos = [{ id: 'video-review-test', title: 'Видео <отзыв>', poster: 'assets/appointment-room.jpg', video: null }];
  const card = { url: 'https://yandex.ru/maps/org/metelitsa/1132881772/reviews/', date: '2026-11-27', author: 'Анна', excerpt: 'Отзыв <script>', text: 'Полный текст', source: 'Яндекс' };
  const html = renderReviewsPage(template, [card], videos);
  assert.match(html, /review-card review-card--imported/);
  assert.match(html, /<template data-review-text>Полный текст<\/template>/);
  assert.match(html, /Отзыв &lt;script&gt;/);
  assert.match(html, /Видео &lt;отзыв&gt;/);
  assert.match(html, /Видео пока недоступно для просмотра/);
  assert.match(html, /video-review-soon">Скоро/);
  assert.doesNotMatch(html, /data-video-src|src="(?:undefined|null)"/);
  assert.ok(html.indexOf('id="video-reviews-title"') < html.indexOf('id="text-reviews-title"'));
});

test('missing or invalid future video assets fail the build instead of publishing a broken player', () => {
  const template = '{{VIDEO_CARDS}}{{TEXT_CARDS}}';
  assert.throws(() => renderReviewsPage(template, [], [
    { id: 'video-review-test', title: 'Отзыв', poster: 'assets/appointment-room.jpg', video: 'assets/videos/missing.mp4' },
  ]));
  const empty = renderReviewsPage(template, [], []);
  assert.match(empty, /Отзывы скоро появятся/);
  assert.doesNotMatch(empty, /review-card--imported/);
});
