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
    assert.ok(section.includes(method.after));
    assert.match(section, /<ul><li>/);
    assert.match(section, /<ol><li>/);
    for (const step of method.steps) assert.ok(section.includes(step));
  }
  assert.equal((html.match(/data-video-review /g) || []).length, 3);
  assert.ok(html.indexOf('id="sleep"') < html.indexOf('id="reviews"'));
  assert.ok(html.indexOf('id="reviews"') < html.indexOf('id="appointment"'));
  assert.equal((html.match(/video-review-soon">Скоро/g) || []).length, 3);
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
