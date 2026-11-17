import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '../dist');
const pages = new Map(fs.readdirSync(root).filter(file => file.endsWith('.html'))
  .map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
const html = pages.get('index.html');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'site.js'), 'utf8');
const allHtml = [...pages.values()].join('\n');
const references = [...new Set([...`${allHtml}\n${css}\n${js}`.matchAll(/assets\/[a-z0-9-]+\.(?:svg|png|jpg|ttf)/g)].map(match => match[0]))];
for (const reference of references) assert.ok(fs.statSync(path.join(root,reference)).size > 0, `Missing or empty resource: ${reference}`);
assert.ok(!/figma\.com\/api\/mcp\/asset/.test(allHtml+css+js), 'Temporary Figma URLs must never ship');
const pageIds = new Map([...pages].map(([file, content]) => [file,
  [...content.matchAll(/\bid="([^"]+)"/g)].map(match => match[1])
]));
for (const [file, content] of pages) {
  for (const pattern of content.matchAll(/pattern="([^"]+)"/g)) new RegExp(pattern[1], 'v');
  const ids = pageIds.get(file);
  assert.equal(ids.length, new Set(ids).size, `${file}: IDs must be unique`);
  for (const [, targets] of content.matchAll(/\b(?:aria-describedby|aria-labelledby|aria-controls|popovertarget)="([^"]+)"/g)) {
    for (const target of targets.split(/\s+/)) {
      assert.ok(ids.includes(target), `${file}: missing accessible target ${target}`);
    }
  }
  for (const [, reference] of content.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(reference, `https://local.test/${file}`);
    if (url.origin !== 'https://local.test') continue;
    const target = decodeURIComponent(url.pathname.slice(1));
    const targetPath = path.join(root, target);
    assert.ok(fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0, `${file}: missing resource ${reference}`);
    if (url.hash && pageIds.has(target)) {
      assert.ok(pageIds.get(target).includes(decodeURIComponent(url.hash.slice(1))), `${file}: broken anchor ${reference}`);
    }
  }
}
const faqs = [...html.matchAll(/<details\b[^>]*\bname="clinic-faq"[^>]*>/g)];
assert.equal(faqs.length, 5, 'Expected five FAQs');
for (const [faq] of faqs) assert.doesNotMatch(faq, /\sopen(?:[\s=>])/, 'All FAQs must start collapsed');
const firstDoctor = html.indexOf('>Сизонец Александра<');
const secondDoctor = html.indexOf('>Маслёнок Ольга<');
assert.ok(firstDoctor !== -1 && secondDoctor > firstDoctor, 'Alexandra must appear first');
console.log(`Verified ${pages.size} pages, ${references.length} nonempty local resources, unique IDs, cross-page links, anchors, FAQ defaults and doctor order.`);
