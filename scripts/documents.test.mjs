import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { renderDocumentsPage } from './generate-documents.mjs';

const template = '<main>{{NAVIGATION}}{{DOCUMENTS}}</main>';
const web = (title, href) => ({ title, href, format: 'Страница' });
const data = documents => ({ groups: [{ id: 'license', title: 'Документы', documents }] });
function fixture(t, extension = 'pdf') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metelitsa-documents-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets/documents'), { recursive: true });
  const content = extension === 'pdf' ? Buffer.from('%PDF-1.4\nfixture') : Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.from('fixture')]);
  const href = `assets/documents/example.${extension}`;
  fs.writeFileSync(path.join(root, href), content);
  return { root, item: { title: 'Документ', href, format: extension.toUpperCase(), sha256: createHash('sha256').update(content).digest('hex') } };
}

test('local PDF and DOC copies must retain their source checksums', t => {
  for (const extension of ['pdf', 'doc']) {
    const f = fixture(t, extension);
    assert.match(renderDocumentsPage(template, data([f.item]), { documentRoot: f.root }), /documents-link/);
    fs.appendFileSync(path.join(f.root, f.item.href), 'changed');
    assert.throws(() => renderDocumentsPage(template, data([f.item]), { documentRoot: f.root }), /Document changed/);
  }
});

test('PDF page links work without allowing traversal or arbitrary fragments', t => {
  const f = fixture(t);
  const render = href => renderDocumentsPage(template, data([{ ...f.item, href }]), { documentRoot: f.root });
  assert.match(render(f.item.href + '#page=155'), /#page=155/);
  for (const href of ['assets/documents/../../secret.pdf', f.item.href + '#page=0', f.item.href + '#script=1']) {
    assert.throws(() => render(href), /Invalid local document path/);
  }
});

test('HTML disguised as a document is rejected even with a matching checksum', t => {
  const f = fixture(t);
  const content = Buffer.from('<html>server error</html>');
  fs.writeFileSync(path.join(f.root, f.item.href), content);
  f.item.sha256 = createHash('sha256').update(content).digest('hex');
  assert.throws(() => renderDocumentsPage(template, data([f.item]), { documentRoot: f.root }), /Invalid pdf document/);
});

test('short labels preserve full names and escape document and organization text', () => {
  const d = data([{ ...web('Полное <название>', 'https://example.org/file'), shortTitle: 'Короткое название' }]);
  d.organization = { fields: [{ label: 'Название', value: '<script>alert(1)</script>' }], sourceNote: 'Источник' };
  const html = renderDocumentsPage(template, d);
  assert.match(html, /Короткое название/);
  assert.match(html, /Полное &lt;название&gt;/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /<details class="document-full-title">/);
});

test('unsafe external links and superseded documents cannot be published as current', () => {
  assert.throws(() => renderDocumentsPage(template, data([web('Документ', 'javascript:alert(1)')])), /HTTPS/);
  const old = web('Старый документ', 'https://example.org/old');
  const current = { ...web('Действующий документ', 'https://example.org/current'), replaces: { href: old.href } };
  assert.throws(() => renderDocumentsPage(template, data([current, old])), /Superseded documents/);
});
