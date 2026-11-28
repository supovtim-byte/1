import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escapeHtml as e } from './generate-doctors.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = value => assert.ok(typeof value === 'string' && value.trim(), 'Document text is required');

function renderOrganizationRows(organization, wrapRow) {
  return organization.fields.map(field => {
    text(field.label); text(field.value);
    const row = `<dt>${e(field.label)}</dt><dd>${e(field.value)}</dd>`;
    return wrapRow ? `<div>${row}</div>` : row;
  }).join('\n');
}

export function renderDocumentsPage(template, data, { documentRoot = path.join(root, 'dist') } = {}) {
  const ids = new Set();
  const links = new Set();
  const files = new Map();
  function external(value) {
    const url = new URL(value);
    assert.equal(url.protocol, 'https:', 'External document links must use HTTPS');
    assert.ok(!url.username && !url.password, 'Document URLs must not contain credentials');
    return e(value);
  }
  function documentLink(item) {
    text(item.href);
    if (!item.href.startsWith('assets/')) return external(item.href);
    const match = item.href.match(/^(assets\/documents\/[a-z0-9-]+\.(pdf|doc))(?:#page=([1-9]\d*))?$/);
    assert.ok(match, `Invalid local document path: ${item.href}`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/, 'Local documents require a checksum');
    let file = files.get(match[1]);
    if (!file) {
      const bytes = fs.readFileSync(path.join(documentRoot, match[1]));
      const magic = match[2] === 'pdf' ? Buffer.from('%PDF-') : Buffer.from('d0cf11e0a1b11ae1', 'hex');
      assert.ok(bytes.subarray(0, magic.length).equals(magic), `Invalid ${match[2]} document: ${item.href}`);
      file = { sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
      files.set(match[1], file);
    }
    assert.equal(file.sha256, item.sha256, `Document changed: ${item.href}`);
    return e(item.href);
  }
  function trackedLink(item) {
    assert.ok(!links.has(item.href), `Duplicate document link: ${item.href}`);
    links.add(item.href);
    return documentLink(item);
  }
  function renderNotice(notice) {
    text(notice.text);
    const source = notice.source ? ` <a class="text-link" href="${documentLink(notice.source)}" target="_blank" rel="noopener">${e(notice.source.title)}</a>` : '';
    return `<p class="documents-notice">${e(notice.text)}${source}</p>`;
  }
  function renderOrganization(organization) {
    const rows = renderOrganizationRows(organization, true);
    text(organization.sourceNote);
    return `<div class="organization-information"><dl class="organization-details">${rows}</dl><p class="document-source">${e(organization.sourceNote)}</p></div>`;
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
      const href = trackedLink(item);
      const size = files.get(item.href.split('#')[0])?.size || item.sizeBytes;
      const sizeLabel = size ? (size < 1048576 ? `${Math.ceil(size / 1024)} КБ` : `${(size / 1048576).toFixed(1).replace('.', ',')} МБ`) : '';
      const related = (item.relatedDocuments || []).map(document => {
        text(document.title);
        return `<a class="text-link" href="${trackedLink(document)}" target="_blank" rel="noopener">${e(document.title)}</a>`;
      });
      const note = item.description || related.length
        ? `<p class="document-note">${e(item.description || '')}${item.publicationUrl ? ` <a class="text-link" href="${external(item.publicationUrl)}" target="_blank" rel="noopener">Официальная публикация</a>` : ''}${related.length ? ` ${related.join(' ')}` : ''}</p>` : '';
      const fullTitle = item.shortTitle ? `<details class="document-full-title"><summary>Полное название<span class="sr-only">: ${e(item.shortTitle)}</span></summary><p>${e(item.title)}</p></details>` : '';
      return `<li><a class="documents-link" href="${href}" target="_blank" rel="noopener"><span>${e(item.shortTitle || item.title)}</span><span class="document-format">${e(item.format)}${sizeLabel ? `<span class="document-file-size">${sizeLabel}</span>` : ''}<span class="sr-only">, откроется в новой вкладке</span></span></a>${note}${fullTitle}</li>`;
    }).join('\n');
    const organization = group.id === 'license' && data.organization ? renderOrganization(data.organization) : '';
    const intro = group.description ? `<p class="documents-group-intro">${e(group.description)}</p>` : '';
    const notices = (group.notices || []).map(renderNotice).join('\n');
    return `<section class="documents-group" id="${e(group.id)}" aria-labelledby="${e(group.id)}-title"><h2 id="${e(group.id)}-title">${e(group.title)}</h2>${intro}${organization}<ul class="documents-list">\n${items}\n</ul>${notices}</section>`;
  }).join('\n');
  for (const item of data.groups.flatMap(group => group.documents)) {
    if (item.replaces) assert.ok(!links.has(item.replaces.href), 'Superseded documents must not be published as current');
  }
  const values = {
    NAVIGATION: data.groups.map(group => `<a href="#${e(group.id)}">${e(group.title)}</a>`).join('\n'),
    DOCUMENTS: groups,
  };
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    assert.ok(Object.hasOwn(values, key), `Unknown documents template key: ${key}`);
    return values[key];
  });
  assert.ok(!html.includes('{{'), 'Unfilled documents template');
  return html;
}

export function generateDocuments({ check = false } = {}) {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'data/documents.json'), 'utf8'));
  const template = fs.readFileSync(path.join(root, 'templates/documents.html'), 'utf8');
  const html = renderDocumentsPage(template, data);
  const target = path.join(root, 'dist/documents.html');
  if (check) assert.equal(fs.readFileSync(target, 'utf8'), html, 'Regenerate documents page: npm run build');
  else fs.writeFileSync(target, html);

  const contactsTarget = path.join(root, 'dist/contacts.html');
  const contacts = fs.readFileSync(contactsTarget, 'utf8');
  const slot = /(<!-- clinic-requisites:start -->)[\s\S]*?(<!-- clinic-requisites:end -->)/g;
  assert.equal([...contacts.matchAll(slot)].length, 1, 'Expected one contacts requisites slot');
  const rows = renderOrganizationRows(data.organization, false).replaceAll('\n', '\n        ');
  const updatedContacts = contacts.replace(slot, (_, start, end) => `${start}\n        ${rows}\n        ${end}`);
  if (check) assert.equal(contacts, updatedContacts, 'Regenerate contacts requisites: npm run build');
  else if (contacts !== updatedContacts) fs.writeFileSync(contactsTarget, updatedContacts);

  console.log(`${check ? 'Verified' : 'Generated'} documents page: ${data.groups.reduce((count, group) => count + group.documents.length, 0)} documents.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.ok(process.argv.slice(2).every(arg => arg === '--check'));
  generateDocuments({ check: process.argv.includes('--check') });
}
