// The production page uses the shrinking portrait. ?preview=motion exposes both options.
const doctorPage = document.querySelector('.doctor-page');
const motionQuery = new URLSearchParams(location.search);
const doctorMotion = window.matchMedia('(min-width: 901px)');
const doctorReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const heroSlot = document.querySelector('.doctor-hero-slot');
const portraitTarget = document.querySelector('.doctor-portrait-target');
const doctorLayout = document.querySelector('.doctor-layout');
const motionPreview = document.querySelector('.doctor-motion-preview');
const motionRadios = [...motionPreview.querySelectorAll('input')];
const previewMode = motionQuery.get('motion') === 'fade' ? 'fade' : 'shrink';
doctorPage.dataset.doctorMotion = previewMode;
motionRadios.forEach(radio => { radio.checked = radio.value === previewMode; });
motionPreview.hidden = motionQuery.get('preview') !== 'motion';

let portraitFrame = 0;
let portraitGeometry;
const clampProgress = value => Math.max(0, Math.min(1, value));

function measurePortrait() {
  const slot = heroSlot.getBoundingClientRect();
  const stickyTop = Number.parseFloat(getComputedStyle(portraitTarget.parentElement).top);
  portraitGeometry = {
    left: slot.left, top: slot.top + scrollY, width: slot.width, height: slot.height,
    end: Math.max(1, doctorLayout.getBoundingClientRect().top + scrollY - stickyTop),
    startRadius: Number.parseFloat(getComputedStyle(heroSlot).borderTopLeftRadius),
    endRadius: Number.parseFloat(getComputedStyle(portraitTarget).borderTopLeftRadius)
  };
  schedulePortrait();
}

function renderPortrait() {
  portraitFrame = 0;
  const enabled = doctorMotion.matches && !doctorReducedMotion.matches;
  doctorPage.classList.toggle('doctor-motion-ready', enabled);
  if (!enabled || !portraitGeometry) return;
  const target = portraitTarget.getBoundingClientRect();
  const progress = clampProgress(scrollY / portraitGeometry.end);
  doctorPage.classList.toggle('doctor-card-visible', progress > .72);
  if (doctorPage.dataset.doctorMotion !== 'shrink') return;
  const mix = (from, to) => from + (to - from) * progress;
  const values = {
    x: mix(portraitGeometry.left, target.left),
    y: mix(portraitGeometry.top - scrollY, target.top),
    width: mix(portraitGeometry.width, target.width),
    height: mix(portraitGeometry.height, target.height),
    radius: mix(portraitGeometry.startRadius, portraitGeometry.endRadius)
  };
  for (const [key, value] of Object.entries(values)) doctorPage.style.setProperty('--portrait-' + key, value + 'px');
  doctorPage.style.setProperty('--portrait-caption', clampProgress((progress - .7) / .3));
}

function schedulePortrait() {
  if (!portraitFrame) portraitFrame = requestAnimationFrame(renderPortrait);
}

motionRadios.forEach(radio => radio.addEventListener('change', () => {
  doctorPage.dataset.doctorMotion = radio.value;
  const url = new URL(location.href);
  url.searchParams.set('motion', radio.value);
  history.replaceState(null, '', url);
  measurePortrait();
}));
document.querySelector('[data-replay-motion]').addEventListener('click', () => {
  window.scrollTo({top: 0, behavior: 'instant'});
  schedulePortrait();
});
window.addEventListener('scroll', schedulePortrait, {passive: true});
window.addEventListener('resize', measurePortrait, {passive: true});
window.addEventListener('pageshow', measurePortrait);
doctorMotion.addEventListener('change', measurePortrait);
doctorReducedMotion.addEventListener('change', measurePortrait);
new ResizeObserver(measurePortrait).observe(doctorLayout);
document.fonts.ready.then(measurePortrait);
measurePortrait();

// Round each partially visible card at the actual viewport boundary, on either edge.
const doctorReviews = document.querySelector('.doctor-reviews .carousel');
const doctorReviewCards = [...doctorReviews.children];
let reviewFrame = 0;
function roundReviewEdges() {
  reviewFrame = 0;
  const viewport = doctorReviews.getBoundingClientRect();
  for (const card of doctorReviewCards) {
    const box = card.getBoundingClientRect();
    const left = Math.max(0, Math.min(box.width, viewport.left - box.left));
    const right = Math.max(0, Math.min(box.width, box.right - viewport.right));
    const radius = Number.parseFloat(getComputedStyle(card).borderTopLeftRadius);
    const leftRadius = left > .5 ? Math.min(15, radius) : radius;
    const rightRadius = right > .5 ? Math.min(15, radius) : radius;
    card.style.setProperty('--review-clip-left', left + 'px');
    card.style.setProperty('--review-clip-right', right + 'px');
    card.style.setProperty('--review-radius-tl', leftRadius + 'px');
    card.style.setProperty('--review-radius-bl', leftRadius + 'px');
    card.style.setProperty('--review-radius-tr', rightRadius + 'px');
    card.style.setProperty('--review-radius-br', rightRadius + 'px');
  }
}
function scheduleReviewEdges() {
  if (!reviewFrame) reviewFrame = requestAnimationFrame(roundReviewEdges);
}
doctorReviews.addEventListener('scroll', scheduleReviewEdges, {passive: true});
new ResizeObserver(scheduleReviewEdges).observe(doctorReviews);
scheduleReviewEdges();
