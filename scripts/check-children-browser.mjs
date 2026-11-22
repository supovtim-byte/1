import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright-core';

const root = path.resolve(import.meta.dirname, '../dist');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const server = http.createServer(async (request, response) => {
  try {
    const filename = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
    if (!filename.startsWith(root + path.sep)) throw new Error('Invalid path');
    const content = await fs.readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = process.env.CHECK_BASE_URL || `http://127.0.0.1:${server.address().port}`;
const screenshots = process.env.CHECK_CHILDREN_SCREENSHOTS;
if (screenshots) await fs.mkdir(screenshots, { recursive: true });
let browser;
const errors = [];
const report = [];

async function openPage(viewport, options = {}) {
  const page = await browser.newPage({ viewport, reducedMotion: 'reduce', hasTouch: viewport.width <= 1366, ...options });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(`${origin}/detyam.html`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function checkGeometry(page, label) {
  const result = await page.evaluate(() => {
    const box = element => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    };
    const visible = element => element.getBoundingClientRect().height > 0 && getComputedStyle(element).visibility !== 'hidden';
    const size = selector => parseFloat(getComputedStyle(document.querySelector(selector)).fontSize);
    const textOverflow = [...document.querySelectorAll('main h1, main h2, main h3, main p, main summary, main .button')]
      .filter(e => visible(e) && e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1)
      .map(e => e.textContent.trim().slice(0, 65));
    const splits = [...document.querySelectorAll('.children-split')].map(section => ({
      section: box(section), photo: box(section.querySelector('.children-photo')), copy: box(section.querySelector('.children-copy'))
    }));
    const sleep = [...document.querySelectorAll('.children-sleep-card')].map(card => ({
      card: box(card), image: box(card.querySelector('picture')), copy: box(card.querySelector('div'))
    }));
    const sections = [...document.querySelectorAll('main > section')].filter(visible).map(box);
    const option = document.querySelector('.service-option');
    const route = document.querySelector('.mobile-routes');
    const routeHeader = document.querySelector('#how-to-get > .section-heading');
    return {
      width: innerWidth, height: innerHeight, coarse: matchMedia('(pointer: coarse)').matches, mainFont: size('main'), titleFont: size('#children-comfort-title'), copyFont: size('.children-benefits p'),
      overflow: document.documentElement.scrollWidth > innerWidth + 1, textOverflow, splits, sleep, sections,
      hero: box(document.querySelector('.hero')), heroTitle: box(document.querySelector('.hero h1')),
      serviceCards: getComputedStyle(option).flexDirection === 'column' && getComputedStyle(option.querySelector('img')).display !== 'none',
      routeVisible: visible(route), routeHeaderVisible: visible(routeHeader),
      routeGap: route.getBoundingClientRect().top - document.querySelector('#contacts').getBoundingClientRect().bottom
    };
  });
  assert.equal(result.overflow, false, `${label}: page overflow`);
  assert.deepEqual(result.textOverflow, [], `${label}: clipped text`);
  for (const split of result.splits) {
    assert.ok(split.photo.right <= split.copy.x + 1 || split.photo.bottom <= split.copy.y + 1, `${label}: photo overlaps text`);
    assert.ok(split.photo.right <= split.section.right + 1, `${label}: photo escapes grid`);
    if (result.width >= 961) assert.ok(split.copy.height <= split.photo.height + 1, `${label}: text is taller than its photo`);
    if (result.width >= 601 && result.width <= 960) {
      assert.ok(split.photo.bottom <= split.copy.y, `${label}: stacked tablet photo`);
      assert.ok(Math.abs(split.photo.height - split.photo.width * 75 / 127) < 1, `${label}: tablet photo must be 25% shorter`);
    }
  }
  for (let i = 1; i < result.sections.length; i++) {
    assert.ok(result.sections[i].y >= result.sections[i - 1].bottom - 1, `${label}: adjacent sections overlap`);
  }
  assert.ok(result.heroTitle.x >= result.hero.x && result.heroTitle.right <= result.hero.right + 1, `${label}: hero text width`);
  assert.ok(result.heroTitle.bottom <= result.hero.bottom + 1, `${label}: hero text height`);
  assert.ok(result.mainFont >= 16, `${label}: body text is too small`);
  if (result.width >= 601 && (result.width <= 1200 || (result.coarse && result.width <= 1366))) {
    assert.ok(Math.abs(result.sleep[0].card.y - result.sleep[1].card.y) < 1, `${label}: tablet treatment cards must share a row`);
    for (const card of result.sleep) assert.ok(card.image.bottom <= card.copy.y + 1, `${label}: treatment photo must be above text`);
  }
  if (result.width >= 601 && (result.width <= 1080 || (result.coarse && result.width <= 1366))) {
    assert.equal(result.routeVisible, true, `${label}: tablet routes must be accordions`);
    assert.equal(result.routeHeaderVisible, false, `${label}: tablet route heading must be hidden`);
    assert.ok(result.routeGap >= -1 && result.routeGap <= 20, `${label}: routes must follow address directly`);
  }
  return result;
}

async function openMobileMenu(page) {
  await page.locator('.mobile-dock [data-mobile-menu]').click();
  await page.waitForFunction(() => document.querySelector('#mobile-navigation').open);
}
async function closeMobileMenu(page) {
  await page.locator('#mobile-navigation .mobile-action-close').click();
  await page.waitForFunction(() => !document.querySelector('#mobile-navigation').open);
}
async function checkDisclosures(page, selector) {
  const details = page.locator(selector);
  for (let i = 0; i < await details.count(); i++) {
    const item = details.nth(i);
    await item.locator('summary').click();
    assert.equal(await item.evaluate(e => e.open), true, `${selector}: open`);
    await item.locator('summary').click();
    assert.equal(await item.evaluate(e => e.open), false, `${selector}: close`);
  }
}

try {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const widths = [320, 390, 599, 600, 601, 622, 744, 768, 780, 781, 834, 960, 961, 1000, 1024, 1080, 1081, 1100, 1122, 1133, 1200, 1280, 1366, 1440, 1441, 1654, 1920, 2560];
  for (const width of widths) {
    const page = await openPage({ width, height: width < 1000 ? 1000 : 800 });
    const result = await checkGeometry(page, `${width}px`);
    assert.equal(result.serviceCards, width <= 1366, `${width}px: touch cards / desktop list`);
    if (width === 744) {
      const images = await page.locator('img').evaluateAll(async images => {
        for (const image of images) image.loading = 'eager';
        return Promise.all(images.map(async image => { try { await image.decode(); return image.naturalWidth > 0; } catch { return false; } }));
      });
      assert.ok(images.every(Boolean), 'Every local page image must load');
    }
    if (screenshots && [390, 744, 834, 1122, 1440, 1654].includes(width)) {
      for (const selector of ['#top', '#children-comfort', '#first-visit', '#sleep', '#contacts', '#how-to-get']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        await page.locator(selector + ' img').evaluateAll(images => Promise.all(images.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); })));
        await page.locator(selector).screenshot({ path: path.join(screenshots, `${width}-${selector.slice(1)}.png`) });
      }
    }
    if (width >= 601) assert.ok(Math.abs(result.copyFont - Math.max(16, Math.min(26, 26 * width / 1920))) < .05, `${width}px: proportional copy scale`);
    report.push(result);
    await page.close();
  }
  for (const [a, b] of [[599, 600], [600, 601], [780, 781], [1080, 1081]]) {
    const first = report.find(r => r.width === a), next = report.find(r => r.width === b);
    assert.ok(Math.abs(first.mainFont - next.mainFont) < .1, `${a}/${b}: body font discontinuity`);
    assert.ok(Math.abs(first.titleFont - next.titleFont) < .1, `${a}/${b}: heading font discontinuity`);
    assert.ok(Math.abs(first.copyFont - next.copyFont) < .1, `${a}/${b}: introductory font discontinuity`);
  }

  console.log(`Layout and typography passed at ${widths.length} widths.`);

  for (const [width, height] of [[600, 320], [744, 480], [844, 390], [1080, 480]]) {
    const page = await openPage({ width, height });
    await checkGeometry(page, `${width}x${height} landscape`);
    await page.close();
  }

  // Desktop hover, keyboard selection, review navigation and a real form validation flow.
  const desktop = await openPage({ width: 1440, height: 1000 }, { hasTouch: false });
  await desktop.locator('button[aria-controls="more-panel"]').click();
  assert.equal(await desktop.locator('#more-panel').evaluate(e => e.inert), false);
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.locator('#more-panel').evaluate(e => e.inert), true);
  const options = desktop.locator('[data-service]');
  for (let i = 0; i < await options.count(); i++) {
    const option = options.nth(i), id = await option.getAttribute('data-service');
    await option.hover();
    assert.equal(await desktop.locator(`[data-service-image="${id}"]`).evaluate(e => e.classList.contains('is-current')), true);
    await option.focus();
    assert.equal(await desktop.locator('.service-media .is-current').count(), 1);
  }
  const reviewTrack = desktop.locator('#reviews-track');
  await reviewTrack.focus(); await reviewTrack.press('End');
  await desktop.waitForFunction(() => { const e = document.querySelector('#reviews-track'); return e.scrollLeft + e.clientWidth >= e.scrollWidth - 2; });
  await reviewTrack.press('Home');
  await desktop.waitForFunction(() => document.querySelector('#reviews-track').scrollLeft < 1);
  await reviewTrack.press('ArrowRight');
  await desktop.waitForFunction(() => document.querySelector('#reviews-track').scrollLeft > 1);
  await checkDisclosures(desktop, '.faq details');
  await desktop.locator('#first-visit [data-book]').click();
  assert.match(await desktop.locator('#appointment-selection').textContent(), /Первый приём/);
  const form = desktop.locator('#appointment-form'), submit = form.locator('button[type="submit"]');
  assert.equal(await submit.isDisabled(), true);
  await form.locator('input[type="tel"]').fill('89991234567');
  assert.equal(await form.locator('input[type="tel"]').inputValue(), '+7 999 123 45 67');
  await submit.click();
  assert.equal(await desktop.locator('#appointment-dialog').evaluate(e => e.open), false, 'Consent must be required');
  await form.locator('input[type="checkbox"]').check(); await submit.click();
  assert.equal(await desktop.locator('#appointment-dialog').evaluate(e => e.open), true);
  await desktop.keyboard.press('Escape'); await desktop.close();

  console.log('Desktop menu, service selection, reviews, FAQ and form validation passed.');
  const tablet = await openPage({ width: 834, height: 1112 });
  await tablet.locator('button[aria-controls="compact-menu-panel"]').click();
  assert.equal(await tablet.locator('#compact-menu-panel').evaluate(e => e.inert), false);
  await tablet.keyboard.press('Escape');
  await checkDisclosures(tablet, '.mobile-routes details');
  await tablet.emulateMedia({ reducedMotion: 'no-preference' });
  await tablet.locator('.mobile-routes details').first().locator('summary').click();
  await tablet.waitForFunction(() => { const e = document.querySelector('.mobile-routes details'); return e.open && e.getAnimations().length === 0; });
  const routeHeights = await tablet.locator('.mobile-routes details').first().evaluate(e => ({ open: e.clientHeight, summary: e.querySelector('summary').clientHeight }));
  assert.ok(routeHeights.open > routeHeights.summary + 20, 'Animated route content must be visible');
  await tablet.locator('.mobile-routes details').first().locator('summary').click();
  await tablet.waitForFunction(() => !document.querySelector('.mobile-routes details').open);
  await tablet.close();

  console.log('Tablet menu and route accordions passed.');

  // The phone search must find the two child-specific appointments.
  const phone = await openPage({ width: 390, height: 844 });
  for (const [query, target] of [['первый приём', '#first-visit'], ['седация', '#sleep']]) {
    await openMobileMenu(phone);
    await phone.locator('.mobile-search input').fill(query);
    const result = phone.locator(`.mobile-search-results a[href="${target}"]`);
    assert.equal(await result.count(), 1, `Search: ${query}`);
    await result.click();
    await phone.waitForFunction(() => !document.querySelector('#mobile-navigation').open);
    assert.ok(phone.url().endsWith(target));
  }
  await phone.locator('#first-visit [data-book]').click();
  assert.equal(await phone.locator('#mobile-booking').evaluate(e => e.open), true);
  assert.equal(await phone.locator('#mobile-booking #appointment').count(), 1);
  await phone.keyboard.press('Escape');
  await phone.waitForFunction(() => document.querySelector('#appointment').parentElement.tagName === 'MAIN');
  await checkDisclosures(phone, '.mobile-routes details');
  await openMobileMenu(phone);
  await phone.locator('.mobile-accessibility summary').click();
  await phone.locator('[data-large-text]').click();
  await phone.locator('#mobile-navigation [data-accessibility]').click();
  await closeMobileMenu(phone);
  assert.equal(await phone.locator('html').evaluate(e => e.classList.contains('high-contrast') && e.classList.contains('mobile-large-text')), true);
  await checkGeometry(phone, '390px large text + high contrast');
  await phone.setViewportSize({ width: 320, height: 568 });
  await checkGeometry(phone, '320px large text + high contrast');
  await phone.close();

  // A width change refreshes the stable hero height; keyboard-only height changes do not.
  const rotation = await openPage({ width: 844, height: 390 });
  await rotation.setViewportSize({ width: 390, height: 844 });
  await rotation.waitForFunction(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--initial-viewport-height')) === 844);
  const heroHeight = await rotation.locator('.hero').evaluate(e => e.getBoundingClientRect().height);
  assert.ok(heroHeight >= 844);
  await rotation.setViewportSize({ width: 390, height: 600 });
  assert.equal(await rotation.locator('.hero').evaluate(e => e.getBoundingClientRect().height), heroHeight);
  await rotation.close();

  assert.deepEqual(errors, [], 'Browser errors / missing resources');
  if (process.env.CHECK_CHILDREN_REPORT) await fs.writeFile(process.env.CHECK_CHILDREN_REPORT, JSON.stringify(report, null, 2));
  console.log(`Verified children page at ${widths.length} widths: layout, typography continuity, tablet cards, image heights, routes, assets, menu, hover/focus, reviews, search, required consent, mobile booking, large text, contrast and rotation.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
