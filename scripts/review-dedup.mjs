import fs from 'node:fs';
import assert from 'node:assert/strict';

const rules = JSON.parse(fs.readFileSync(new URL('../data/review-duplicates.json', import.meta.url), 'utf8'));
assert.equal(rules.version, 1, 'Unknown review duplicate rules version');

export function reviewKey(value) {
  const url = new URL(value);
  const author = url.searchParams.get('reviews[publicId]');
  const organization = url.pathname.match(/\/maps\/org\/[^/]+\/(\d+)\/reviews\/?$/)?.[1];
  if (/^yandex\.(ru|com|eu)$/.test(url.hostname) && organization && author) {
    return `yandex:${organization}:${author}`;
  }
  // A platform review anchor identifies the comment independently of tracking.
  if (/^#(?:review|comment_)[0-9]+$/.test(url.hash)) url.search = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(?:gclid|fbclid|yclid)$/.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href;
}

export const normalizeReviewText = value => String(value ?? '').normalize('NFKC')
  .toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function fingerprint(card) {
  // Full texts take precedence: shared introductory excerpts are not proof of duplication.
  const body = normalizeReviewText(card.text?.trim() || card.excerpt);
  const words = body.split(' ').filter(Boolean);
  if (body.length >= 160 && words.length >= 24) return `body:${body}`;
  const author = normalizeReviewText(card.author);
  const named = author.split(' ').filter(word => word.length > 1).length >= 2
    && !/(?:^| )(?:пациент|аноним|анонимно|пользователь|гость|anonymous)(?: |$)/.test(author)
    && author !== 'автор не указан';
  if (body.length >= 80 && words.length >= 10 && named && card.date) {
    return `named:${author}:${card.date}:${body}`;
  }
  return null;
}

export function deduplicateReviews(cards, groups = rules.groups) {
  const aliases = new Map();
  const canonical = new Set();
  for (const group of groups) {
    const target = reviewKey(group.canonical);
    canonical.add(target);
    for (const url of [group.canonical, ...group.aliases]) {
      const key = reviewKey(url);
      assert.ok(!aliases.has(key) || aliases.get(key) === target, 'Conflicting review duplicate rules');
      aliases.set(key, target);
    }
  }
  const clusters = [];
  for (const card of cards) {
    const url = reviewKey(card.url);
    const keys = new Set([`url:${url}`]);
    if (aliases.has(url)) keys.add(`reviewed:${aliases.get(url)}`);
    const content = fingerprint(card);
    if (content) keys.add(content);
    const matches = clusters.filter(cluster => [...keys].some(key => cluster.keys.has(key)));
    const target = matches[0] ?? { keys: new Set(), cards: [] };
    if (!matches.length) clusters.push(target);
    for (const other of matches.slice(1)) {
      other.keys.forEach(key => target.keys.add(key));
      target.cards.push(...other.cards);
      clusters.splice(clusters.indexOf(other), 1);
    }
    keys.forEach(key => target.keys.add(key));
    target.cards.push(card);
  }
  function quality(card) {
    return [Boolean(card.text?.trim()), canonical.has(reviewKey(card.url)), card.source === 'Яндекс',
      (card.text || '').length, Boolean(card.author?.trim())].map(Number);
  }
  function preferred(a, b) {
    const left = quality(a), right = quality(b);
    for (let index = 0; index < left.length; index++) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return (b.date ?? '').localeCompare(a.date ?? '') || a.url.localeCompare(b.url);
  }
  return clusters.map(cluster => [...cluster.cards].sort(preferred)[0])
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || a.url.localeCompare(b.url));
}
