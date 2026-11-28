import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { escapeHtml as e } from './generate-doctors.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/documents.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'templates/documents.html'), 'utf8');
const ids = new Set();
const links = new Set();
const text = value => assert.ok(typeof value === 'string' && value.trim(), 'Document text is required');
function link(value, local = true) {
  assert.equal(typeof value, 'string');
  if (local && /^assets\/documents\/[a-z0-9-]+\.pdf$/.test(value)) {
    assert.ok(fs.statSync(path.join(root, 'dist', value)).size > 0, `Missing document: ${value}`);
  } else {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:', 'External document links must use HTTPS');
  }
  return e(value);
}
const groups = data.groups.map(group => {
  assert.match(group.id, /^[a-z][a-z0-9-]*$/);
  assert.ok(!ids.has(group.id), 'Duplicate document group');
  ids.add(group.id);
  text(group.title);
  assert.ok(group.documents.length, 'Document groups must not be empty');
  const items = group.documents.map(item => {
    text(item.title);
    assert.ok(['PDF', 'DOC', 'Страница'].includes(item.format), 'Unknown document format');
    assert.ok(!links.has(item.href), 'Duplicate document link');
    links.add(item.href);
    let note = '';
    if (item.description) {
      text(item.description);
      note = `<p class="document-note">${e(item.description)}${item.publicationUrl ? ` <a class="text-link" href="${link(item.publicationUrl, false)}" target="_blank" rel="noopener">Официальная публикация</a>` : ''}</p>`;
    }
    return `<li><a class="documents-link" href="${link(item.href)}" target="_blank" rel="noopener"><span>${e(item.title)}</span><span class="document-format">${e(item.format)}<span class="sr-only">, откроется в новой вкладке</span></span></a>${note}</li>`;
  }).join('\n');
  return `<section class="documents-group" id="${e(group.id)}" aria-labelledby="${e(group.id)}-title"><h2 id="${e(group.id)}-title">${e(group.title)}</h2><ul class="documents-list">\n${items}\n</ul></section>`;
}).join('\n');

const rules = data.groups.flatMap(group => group.documents).find(item => item.replaces);
assert.ok(rules, 'Current paid-service rules are required');
assert.equal(rules.href, 'assets/documents/paid-medical-services-rules-659-2026.pdf');
assert.ok(!links.has(rules.replaces.href), 'Superseded paid-service rules must not be published');
const pdf = fs.readFileSync(path.join(root, 'dist', rules.href));
assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')), 'Rules must be a PDF');
assert.equal(createHash('sha256').update(pdf).digest('hex'), rules.sha256, 'The official PDF must remain unchanged');
const values = {
  NAVIGATION: data.groups.map(group => `<a href="#${e(group.id)}">${e(group.title)}</a>`).join('\n'),
  DOCUMENTS: groups,
};
const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
  assert.ok(Object.hasOwn(values, key), `Unknown documents template key: ${key}`);
  return values[key];
});
assert.ok(!html.includes('{{'), 'Unfilled documents template');
assert.ok(process.argv.slice(2).every(arg => arg === '--check'));
const target = path.join(root, 'dist/documents.html');
if (process.argv.includes('--check')) assert.equal(fs.readFileSync(target, 'utf8'), html, 'Regenerate documents page: npm run build');
else fs.writeFileSync(target, html);
console.log(`${process.argv.includes('--check') ? 'Verified' : 'Generated'} documents page: ${links.size} documents.`);
