import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { escapeHtml as e } from './generate-doctors.mjs';
import { renderVideoCard } from './generate-reviews.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const list = (items, tag) => `<${tag}>${items.map(text => `<li>${e(text)}</li>`).join('')}</${tag}>`;

export function renderCalmPage(template, data, videos) {
  assert.deepEqual(data.methods.map(method => method.id), ['sedation', 'sleep']);
  assert.equal(data.videoReviewIds.length, 3);
  assert.equal(new Set(data.videoReviewIds).size, 3);
  const selectedVideos = data.videoReviewIds.map(id => {
    const video = videos.find(item => item.id === id);
    assert.ok(video, `Unknown video review: ${id}`);
    return video;
  });
  const values = {
    TITLE: e(data.title),
    LEAD: e(data.lead),
    INDICATIONS: data.indications.map(item => `<article class="calm-indication"><h3>${e(item.title)}</h3><p>${e(item.text)}</p></article>`).join('\n'),
    CHOICES: data.methods.map(method => `<a class="calm-choice" href="#${method.id}"><img class="calm-choice-photo" src="assets/calm-method.png" width="255" height="255" alt="" loading="lazy"><div><h3>${e(method.shortTitle)}</h3><p>${e(method.summary)}</p><img class="calm-choice-arrow" src="assets/calm-method-link.svg" width="16" height="16" alt=""></div></a>`).join('\n'),
    METHODS: data.methods.map(method => `<section class="calm-section calm-method" id="${method.id}" aria-labelledby="${method.id}-title">
        <h2 id="${method.id}-title">${e(method.title)}</h2>
        <div class="calm-method-intro">
          <div class="calm-description">${method.description.map(text => `<p>${e(text)}</p>`).join('\n')}</div>
          <img class="calm-method-photo" src="assets/calm-treatment.png" width="715" height="546" alt="Стоматологическое лечение ребёнка" loading="lazy">
        </div>
        <div class="calm-method-details">
          <div class="calm-detail"><h3>В каких случаях применяется</h3>${list(method.indications, 'ul')}</div>
          <div class="calm-detail"><h3>Как проходит лечение</h3>${list(method.steps, 'ol')}</div>
        </div>
        <div class="calm-detail calm-after"><h3>После лечения</h3><p>${e(method.after)}</p></div>
      </section>`).join('\n'),
    VIDEO_CARDS: selectedVideos.map(renderVideoCard).join('\n'),
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    assert.ok(Object.hasOwn(values, key), `Unknown template key: ${key}`);
    return values[key];
  });
  assert.ok(!html.includes('{{'), 'Unfilled calm page template');
  return html;
}

export function generateCalm({ check = false } = {}) {
  const html = renderCalmPage(read('templates/calm-treatment.html'), JSON.parse(read('data/calm-treatment.json')), JSON.parse(read('data/video-reviews.json')));
  for (const name of ['lechenie-vo-sne.html', 'sedatsiya-i-narkoz.html']) {
    const file = path.join(root, 'dist', name);
    if (check) assert.equal(fs.readFileSync(file, 'utf8'), html, `Regenerate ${name}: npm run build`);
    else fs.writeFileSync(file, html);
  }
  console.log(`${check ? 'Verified' : 'Generated'} treatment and sedation page with three video reviews.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'));
  generateCalm({ check: process.argv.includes('--check') });
}
