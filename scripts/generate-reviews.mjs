import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { readImportedReviews, renderImportedReview, escapeHtml } from './generate-doctors.mjs';
import { deduplicateReviews } from './review-dedup.mjs';

const root = path.resolve(import.meta.dirname, '..');

export function allReviews(imported) {
  return deduplicateReviews([...imported.values()].flat());
}

function localAsset(value, extensions) {
  assert.equal(typeof value, 'string');
  assert.match(value, new RegExp(`^assets/(?:[a-z0-9-]+/)*[a-zA-Z0-9_.-]+\\.(?:${extensions})$`));
  assert.ok(!value.split('/').some(part => part === '.' || part === '..'));
  assert.ok(fs.statSync(path.join(root, 'dist', value)).size > 0, `Missing video review asset: ${value}`);
  return escapeHtml(value);
}

export function renderVideoCard(item) {
  assert.match(item.id, /^video-review-[a-z0-9-]+$/);
  assert.ok(typeof item.title === 'string' && item.title.trim());
  const poster = localAsset(item.poster, 'png|jpe?g|webp');
  const video = item.video ? ` data-video-src="${localAsset(item.video, 'mp4|webm')}"` : '';
  return `<article class="video-review-card" id="${item.id}">
          <button class="video-review-open" type="button" data-video-review data-video-title="${escapeHtml(item.title)}"${video} aria-haspopup="dialog" aria-controls="video-review-dialog">
            <span class="video-review-preview"><img src="${poster}" width="800" height="500" alt="" loading="lazy" draggable="false"><span class="video-review-play" aria-hidden="true"><img src="assets/video-play.svg" width="20" height="24" alt=""></span>${item.video ? '' : '<span class="video-review-soon">Скоро</span>'}</span>
            <span class="video-review-title">${escapeHtml(item.title)}</span>
          </button>
        </article>`;
}

export function renderReviewsPage(template, cards, videos) {
  assert.equal(new Set(videos.map(item => item.id)).size, videos.length, 'Duplicate video IDs');
  const values = {
    VIDEO_CARDS: videos.map(renderVideoCard).join('\n        '),
    TEXT_CARDS: cards.length ? cards.map(renderImportedReview).join('\n        ')
      : '<p class="reviews-empty">Отзывы скоро появятся. Пока их можно прочитать <a class="text-link" href="https://yandex.ru/maps/org/metelitsa/1132881772/reviews/" target="_blank" rel="noopener">на Яндекс Картах</a>.</p>',
  };
  return template.replace(/\{\{(VIDEO_CARDS|TEXT_CARDS)\}\}/g, (_, key) => values[key]);
}

export function generateReviews({ check = false } = {}) {
  const snapshot = path.join(root, 'dist/reviews.json');
  const imported = readImportedReviews(fs.existsSync(snapshot) ? JSON.parse(fs.readFileSync(snapshot, 'utf8')) : null);
  const cards = allReviews(imported);
  const videos = JSON.parse(fs.readFileSync(path.join(root, 'data/video-reviews.json'), 'utf8'));
  const html = renderReviewsPage(fs.readFileSync(path.join(root, 'templates/reviews.html'), 'utf8'), cards, videos);
  const target = path.join(root, 'dist/reviews.html');
  if (check) {
    assert.equal(fs.readFileSync(target, 'utf8'), html, 'Regenerate reviews page: npm run build');
  } else {
    fs.writeFileSync(target, html);
  }
  console.log(`${check ? 'Verified' : 'Generated'} reviews page: ${cards.length} text reviews, ${videos.length} video cards.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'));
  generateReviews({ check: process.argv.includes('--check') });
}
