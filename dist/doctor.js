// Reveal the sidebar only after the hero portrait has left the viewport.
const doctorPage = document.querySelector('.doctor-page');
const doctorMotion = window.matchMedia('(min-width: 901px)');
const heroSlot = document.querySelector('.doctor-hero-slot');
const doctorLayout = document.querySelector('.doctor-layout');

let portraitFrame = 0;
let portraitRevealAt = Infinity;
const portraitRevealGap = 32;

function measurePortrait() {
  portraitRevealAt = heroSlot.getBoundingClientRect().bottom + scrollY + portraitRevealGap;
  schedulePortrait();
}

function renderPortrait() {
  portraitFrame = 0;
  doctorPage.classList.toggle('doctor-motion-ready', doctorMotion.matches);
  doctorPage.classList.toggle('doctor-card-visible', doctorMotion.matches && scrollY >= portraitRevealAt);
}

function schedulePortrait() {
  if (!portraitFrame) portraitFrame = requestAnimationFrame(renderPortrait);
}

window.addEventListener('scroll', schedulePortrait, {passive: true});
window.addEventListener('resize', measurePortrait, {passive: true});
window.addEventListener('pageshow', measurePortrait);
doctorMotion.addEventListener('change', measurePortrait);
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
