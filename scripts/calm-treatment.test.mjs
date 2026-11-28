import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderCalmPage } from './generate-calm.mjs';

const data = JSON.parse(fs.readFileSync(new URL('../data/calm-treatment.json', import.meta.url), 'utf8'));
const videos = JSON.parse(fs.readFileSync(new URL('../data/video-reviews.json', import.meta.url), 'utf8')).map(video => ({ ...video, video: null }));
const template = fs.readFileSync(new URL('../templates/calm-treatment.html', import.meta.url), 'utf8');

test('each method has its own indications, ordered steps and recovery; three shared video cards follow sleep treatment', () => {
  const html = renderCalmPage(template, data, videos);
  for (const method of data.methods) {
    const section = html.match(new RegExp(`<section[^>]+id="${method.id}"[\\s\\S]*?</section>`))[0];
    assert.match(section, /<ul><li>/);
    assert.match(section, /<ol><li>/);
    for (const step of method.steps) assert.ok(section.includes(step));
    const steps = section.match(/<ol>([\s\S]*?)<\/ol>/)[1];
    assert.equal((steps.match(/<li>/g) || []).length, 5);
    assert.ok(steps.endsWith(`${method.steps[4]}</li>`));
    assert.doesNotMatch(section, /calm-after/);
  }
  assert.equal((html.match(/data-video-review /g) || []).length, 3);
  assert.ok(html.indexOf('id="sleep"') < html.indexOf('id="reviews"'));
  assert.ok(html.indexOf('id="reviews"') < html.indexOf('id="appointment"'));
  assert.ok(html.indexOf('id="reviews"') < html.indexOf('id="safety"'));
  assert.ok(html.indexOf('id="safety"') < html.indexOf('id="recovery"'));
  assert.ok(html.includes(data.recovery.image));
  assert.doesNotMatch(html, /class="video-review-title"|class="video-review-soon"/);
  assert.equal((html.match(/class="video-review-play"/g) || []).length, 3);
  assert.equal((html.match(/aria-label="Видеоотзыв \d — видео пока недоступно"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-video-src=/);
});

test('content stays escaped and invalid review references fail instead of silently dropping a card', () => {
  const changed = structuredClone(data);
  changed.methods[0].description[0] = 'Текст <script>alert(1)</script>';
  const html = renderCalmPage(template, changed, videos);
  assert.match(html, /Текст &lt;script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  changed.videoReviewIds[2] = 'video-review-missing';
  assert.throws(() => renderCalmPage(template, changed, videos), /Unknown video review/);
});
