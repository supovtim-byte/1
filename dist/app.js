'use strict';

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobile = window.matchMedia('(max-width: 767px)');
const motion = () => reducedMotion.matches ? 'instant' : 'smooth';
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const services = [
  {name:'Лечение под наркозом', image:'assets/service-sleep.jpg', description:'Бережный подход к лечению во сне. Врач обсудит с вами показания, подготовку и план лечения на предварительной консультации.'},
  {name:'Первый приём ребёнка', image:'assets/about-1.jpg', description:'Знакомимся, помогаем освоиться и превращаем первый визит в спокойный опыт. Объясняем всё понятным ребёнку языком.'},
  {name:'Терапия', image:'assets/service-therapy.jpg', description:'Диагностика и лечение зубов с вниманием к вашему комфорту. Обсуждаем каждый этап и составляем понятный план лечения.'},
  {name:'Протезирование', image:'assets/service-prosthetics.jpg', description:'Восстанавливаем функцию и эстетику улыбки. Выбираем подходящее решение после осмотра и диагностики.'},
  {name:'Исправление прикуса', image:'assets/service-braces.jpg', description:'Помогаем сделать улыбку здоровой и гармоничной. Вариант коррекции и срок лечения определяются индивидуально.'},
  {name:'Гигиена и профилактика', image:'assets/service-hygiene.jpg', description:'Профессиональная забота о здоровье зубов и дёсен. Помогаем подобрать домашний уход и сохранить результат.'}
];

// The header belongs to the hero; a full-width surface appears only on upward scroll.
const header = $('#header');
let lastScrollY = Math.max(0, window.scrollY);
let scrollReference = lastScrollY;
let scrollDirection = 0;
let scrollTicking = false;
function updateHeader() {
  const y = Math.max(0, window.scrollY);
  const direction = y > lastScrollY ? 1 : y < lastScrollY ? -1 : scrollDirection;
  if (direction !== scrollDirection) { scrollReference = lastScrollY; scrollDirection = direction; }
  if (mobile.matches || y === 0) {
    header.classList.add('is-parked');
    header.classList.remove('is-floating', 'is-hidden');
    scrollReference = y;
    scrollDirection = 0;
  } else if (!header.classList.contains('is-floating') && y > header.offsetHeight && direction > 0) {
    // Park it above the viewport before switching from absolute to fixed.
    header.classList.add('is-parked', 'is-floating', 'is-hidden');
  } else if (header.classList.contains('is-floating') && Math.abs(y - scrollReference) > 7) {
    if (direction < 0) header.classList.remove('is-parked', 'is-hidden');
    else { header.classList.add('is-hidden'); closePopovers(); }
  }
  lastScrollY = y;
  scrollTicking = false;
}
window.addEventListener('scroll', () => { if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(updateHeader); } }, {passive:true});
window.addEventListener('resize', updateHeader);

function closePopovers() {
  $$('.popover-wrap.is-open').forEach(wrap => {
    wrap.classList.remove('is-open');
    $('.popover-toggle', wrap)?.setAttribute('aria-expanded', 'false');
  });
}
$$('.popover-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const wrap = button.closest('.popover-wrap');
    const open = !wrap.classList.contains('is-open');
    closePopovers();
    wrap.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => $('input', wrap)?.focus(), 100);
  });
});
document.addEventListener('click', event => { if (!event.target.closest('.popover-wrap')) closePopovers(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closePopovers(); });

// A five-second gallery, with a circular thumbnail for the selected photograph.
let aboutIndex = 0;
let aboutTimer;
const about = $('#about');
function selectAbout(index) {
  aboutIndex = index;
  $$('[data-about-photo]').forEach(photo => photo.classList.toggle('active', Number(photo.dataset.aboutPhoto) === index));
  $$('[data-about-select]').forEach(button => {
    const active = Number(button.dataset.aboutSelect) === index;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
function startAboutTimer() {
  clearInterval(aboutTimer);
  if (reducedMotion.matches) return;
  aboutTimer = setInterval(() => {
    const rect = about.getBoundingClientRect();
    if (document.hidden || about.matches(':hover') || about.contains(document.activeElement) || rect.bottom < 0 || rect.top > innerHeight) return;
    selectAbout((aboutIndex + 1) % 3);
  }, 5000);
}
$$('[data-about-select]').forEach(button => button.addEventListener('click', () => { selectAbout(Number(button.dataset.aboutSelect)); startAboutTimer(); }));
reducedMotion.addEventListener('change', startAboutTimer);
startAboutTimer();

let activeService = 0;
function selectService(index) {
  if (!services[index]) return;
  activeService = index;
  $$('[data-service]').forEach(button => {
    const active = Number(button.dataset.service) === index;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $$('[data-service-photo]').forEach(image => image.classList.toggle('active', Number(image.dataset.servicePhoto) === index));
}
$$('[data-service]').forEach(button => {
  ['mouseenter', 'focus', 'click'].forEach(name => button.addEventListener(name, () => selectService(Number(button.dataset.service))));
});
$$('[data-service-select]').forEach(link => link.addEventListener('click', () => selectService(Number(link.dataset.serviceSelect))));
$('#mobile-services').innerHTML = services.map((service, index) => `<button class="mobile-service-card" data-service-detail="${index}"><img src="${service.image}" width="213" height="189" loading="lazy" draggable="false" alt="${escapeHTML(service.name)}"><span>${escapeHTML(service.name)}</span></button>`).join('');

// Real overflow scrolling. Dragging never snaps; arrows use measured card boundaries.
function setupCarousel(track) {
  let drag = null;
  let suppressClickUntil = 0;
  const arrows = $$(`[data-carousel="${track.id}"]`);
  const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const positions = () => {
    const first = track.firstElementChild;
    if (!first) return [0];
    const points = [...track.children].map(card => Math.min(maxScroll(), card.offsetLeft - first.offsetLeft));
    return [...new Set([0, ...points, maxScroll()])].sort((a,b) => a-b);
  };
  const update = () => arrows.forEach(button => {
    button.disabled = Number(button.dataset.direction) < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= maxScroll() - 2;
  });
  const step = direction => {
    const x = track.scrollLeft;
    const points = positions();
    const target = direction > 0 ? points.find(p => p > x + 3) ?? maxScroll() : points.reverse().find(p => p < x - 3) ?? 0;
    track.scrollTo({left:target, behavior:motion()});
  };
  arrows.forEach(button => button.addEventListener('click', () => step(Number(button.dataset.direction))));
  track.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.target.closest('button, a, input')) return;
    drag = {id:event.pointerId, x:event.clientX, y:event.clientY, scroll:track.scrollLeft, moved:false};
  });
  track.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) > 5 && Math.abs(dx) >= Math.abs(dy)) {
      drag.moved = true;
      track.setPointerCapture(event.pointerId);
      track.classList.add('is-dragging');
    }
    if (drag.moved) { event.preventDefault(); track.scrollLeft = drag.scroll - dx; }
  });
  const endDrag = event => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
    if (drag.moved) suppressClickUntil = performance.now() + 300;
    if (track.hasPointerCapture(drag.id)) track.releasePointerCapture(drag.id);
    drag = null;
    track.classList.remove('is-dragging');
  };
  window.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  track.addEventListener('lostpointercapture', endDrag);
  track.addEventListener('click', event => { if (performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); } }, true);
  track.addEventListener('dragstart', event => event.preventDefault());
  track.addEventListener('keydown', event => {
    if (event.target !== track) return;
    if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      if (event.key === 'Home' || event.key === 'End') track.scrollTo({left:event.key === 'Home' ? 0 : maxScroll(), behavior:motion()});
      else step(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
  track.addEventListener('scroll', update, {passive:true});
  new ResizeObserver(update).observe(track);
  update();
}
$$('.carousel-track').forEach(setupCarousel);

const contentDialog = $('#content-dialog');
const mobileMenu = $('#mobile-menu');
const searchDialog = $('#search-dialog');
function closeDialog(dialog) {
  dialog.close();
  if (dialog === mobileMenu) $('#mobile-menu-toggle').setAttribute('aria-expanded', 'false');
}
function openDialog(dialog) {
  $$('dialog[open]').forEach(open => { if (open !== dialog) closeDialog(open); });
  closePopovers();
  if (!dialog.open) dialog.showModal();
}
function showContent(title, html) {
  $('#dialog-title').textContent = title;
  $('#dialog-content').innerHTML = html;
  contentDialog.setAttribute('aria-labelledby', 'dialog-title');
  openDialog(contentDialog);
}
$$('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target.closest('[data-close-dialog]')) closeDialog(dialog);
    else if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog(dialog);
    }
  });
  dialog.addEventListener('close', () => { if (dialog === mobileMenu) $('#mobile-menu-toggle').setAttribute('aria-expanded', 'false'); });
});
$('#mobile-menu-toggle').addEventListener('click', () => {
  if (mobileMenu.open) closeDialog(mobileMenu);
  else { openDialog(mobileMenu); $('#mobile-menu-toggle').setAttribute('aria-expanded', 'true'); }
});
function showService(index) {
  const service = services[index];
  if (!service) return;
  selectService(index);
  showContent(service.name, `<p>${escapeHTML(service.description)}</p><p>Стоимость и план лечения врач определит после консультации.</p><a class="button" href="#appointment">записаться на приём</a>`);
}
function showAllServices() {
  showContent('Услуги', services.map((service, index) => `<div class="service-dialog-item"><h3>${escapeHTML(service.name)}</h3><p>${escapeHTML(service.description)}</p><button class="text-link" data-service-detail="${index}">Подробнее ↗</button></div>`).join(''));
}
$$('[data-open-services]').forEach(button => button.addEventListener('click', showAllServices));
$$('[data-all-doctors]').forEach(button => button.addEventListener('click', () => {
  const cards = $$('.doctor-card').map(card => {
    const name = $('h3', card).textContent;
    return `<article><img src="${$('img', card).getAttribute('src')}" width="260" height="260" alt="${escapeHTML(name)}"><h3>${escapeHTML(name)}</h3><p>${escapeHTML($('.doctor-info p', card).textContent)}</p><a href="#appointment" data-doctor="${escapeHTML(name)}">записаться к врачу ↗</a></article>`;
  }).join('');
  showContent('Наши врачи', `<div class="all-doctors-grid">${cards}</div>`);
}));
const contactHTML = '<p>Мы на связи ежедневно с 9:00 до 21:00. Позвоните нам или напишите на почту — поможем выбрать врача и удобное время приёма.</p><a class="dialog-phone" href="tel:+79313990580">+7 931 399 05 80</a><p><a class="text-link" href="mailto:info@metelitsa-dent.ru">info@metelitsa-dent.ru</a></p>';
$$('[data-contact-channel]').forEach(button => button.addEventListener('click', () => showContent('Связаться с нами', contactHTML)));
const infoContent = {
  'Налоговый вычет':'Вы можете оформить социальный налоговый вычет за стоматологическое лечение. Свяжитесь с администратором, чтобы заказать справку и уточнить список необходимых документов.',
  'Документы и лицензия':'Актуальные документы и сведения о медицинской лицензии доступны на действующем сайте клиники. Администратор также предоставит информацию по вашему запросу.',
  'Контролирующие органы':'Сведения о контролирующих организациях можно уточнить у администратора или на действующем сайте клиники.',
  'Вакансии':'Хотите стать частью команды «Метелицы»? Отправьте резюме на info@metelitsa-dent.ru. Актуальные вакансии уточняйте у администратора.'
};
$$('[data-info]').forEach(button => button.addEventListener('click', () => {
  const title = button.dataset.info;
  showContent(title, `<p>${escapeHTML(infoContent[title])}</p><a class="text-link" href="https://metelitsa-dent.ru/" target="_blank" rel="noopener noreferrer">Действующий сайт клиники ↗</a>`);
}));
const privacyHTML = '<p>Это демонстрационная версия главной страницы клиники. Данные, введённые в форму, не отправляются и не сохраняются на сервере.</p><p>После подключения формы обработки заявок здесь должна быть размещена утверждённая политика обработки персональных данных с данными оператора, целями обработки, сроками хранения и порядком отзыва согласия.</p><p>Для записи сейчас можно связаться с клиникой по телефону <a class="text-link" href="tel:+79313990580">+7 931 399 05 80</a>.</p>';
$$('[data-privacy]').forEach(button => button.addEventListener('click', () => showContent('Персональные данные', privacyHTML)));

const searchItems = [
  {name:'О клинике — лечим с заботой с 2007 года', href:'#about'},
  ...services.map((service,index) => ({name:service.name,href:'#services',service:index})),
  ...$$('.doctor-card h3').map(node => ({name:node.textContent,href:'#doctors'})),
  {name:'Отзывы пациентов',href:'#reviews'},
  {name:'Частые вопросы, ДМС и налоговый вычет',href:'#faq'},
  {name:'Контакты, адрес и маршрут',href:'#contacts'},
  {name:'Записаться на приём',href:'#appointment'}
];
const normalize = value => value.toLocaleLowerCase('ru').replaceAll('ё','е').trim();
$$('.site-search').forEach(input => {
  input.addEventListener('input', () => {
    const results = $('.search-results', input.closest('.search-box'));
    const query = normalize(input.value);
    if (!query) { results.replaceChildren(); return; }
    const matches = searchItems.filter(item => query.split(/\s+/).every(word => normalize(item.name).includes(word))).slice(0,8);
    results.innerHTML = matches.length ? matches.map(item => `<a href="${item.href}"${item.service === undefined ? '' : ` data-service-select="${item.service}"`}>${escapeHTML(item.name)} <span aria-hidden="true">↗</span></a>`).join('') : '<p>Ничего не нашлось. Попробуйте другое слово или позвоните нам.</p>';
  });
});
$$('[data-open-search]').forEach(button => button.addEventListener('click', () => { openDialog(searchDialog); $('#dialog-search').focus(); }));
$$('[data-sitemap]').forEach(button => button.addEventListener('click', () => showContent('Карта сайта', '<nav class="modal-links">'+searchItems.filter(item => item.service === undefined).map(item => `<a href="${item.href}">${escapeHTML(item.name)}</a>`).join('')+'</nav>')));
const accessibilityToggle = $('#accessibility-toggle');
try { if (sessionStorage.getItem('metelitsa-accessible') === 'true') { document.body.classList.add('accessible'); accessibilityToggle.setAttribute('aria-pressed','true'); } } catch {}
accessibilityToggle.addEventListener('click', () => {
  const active = document.body.classList.toggle('accessible');
  accessibilityToggle.setAttribute('aria-pressed', String(active));
  accessibilityToggle.textContent = active ? 'Обычная версия сайта' : 'Версия для слабовидящих';
  try { sessionStorage.setItem('metelitsa-accessible', String(active)); } catch {}
});

// Map movement stays inside its clipped frame.
const map = $('.map-mask');
map.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType === 'touch') return;
  const bounds = map.getBoundingClientRect();
  map.style.setProperty('--map-x', `${((event.clientX - bounds.left) / bounds.width - .5) * -3}%`);
  map.style.setProperty('--map-y', `${((event.clientY - bounds.top) / bounds.height - .5) * -3}%`);
});
map.addEventListener('pointerleave', () => { map.style.setProperty('--map-x','0%'); map.style.setProperty('--map-y','0%'); });

// Phone validation is local. No false claim that a draft form sent a request.
const form = $('#appointment-form');
const phoneInput = $('#appointment-phone');
phoneInput.addEventListener('input', () => phoneInput.setCustomValidity(''));
phoneInput.addEventListener('blur', () => {
  let digits = phoneInput.value.replace(/\D/g,'');
  if (digits.length === 10 && digits[0] === '9') digits = '7' + digits;
  if (digits.length === 11 && ['7','8'].includes(digits[0])) phoneInput.value = `+7 ${digits.slice(1,4)} ${digits.slice(4,7)} ${digits.slice(7,9)} ${digits.slice(9,11)}`;
});
const nameInput = $('#appointment-name');
const submitButton = $('button[type="submit"]', form);
function updateFormState() {
  const digits = phoneInput.value.replace(/\D/g, '');
  const phoneValid = digits.length >= 10 && digits.length <= 15 && phoneInput.validity.valid;
  const nameValid = nameInput.value.trim().length > 0;
  phoneInput.classList.toggle('is-valid', phoneValid);
  nameInput.classList.toggle('is-valid', nameValid);
  submitButton.disabled = !(phoneValid && nameValid);
}
[phoneInput, nameInput].forEach(input => {
  input.addEventListener('input', updateFormState);
  input.addEventListener('change', updateFormState);
  input.addEventListener('blur', updateFormState);
});
window.addEventListener('pageshow', updateFormState);
updateFormState();

// Keep the FAQ an accordion, including browsers without native details groups.
const questions = $$('.faq-list details');
questions.forEach(question => {
  question.name = 'clinic-faq';
  question.addEventListener('toggle', () => {
    if (question.open) questions.forEach(other => { if (other !== question) other.open = false; });
  });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const digits = phoneInput.value.replace(/\D/g,'');
  if (digits.length < 10 || digits.length > 15) { phoneInput.setCustomValidity('Введите номер телефона полностью'); phoneInput.reportValidity(); return; }
  if (!form.reportValidity()) return;
  const name = $('#appointment-name').value.trim();
  showContent(name ? `${name}, будем рады знакомству` : 'Будем рады знакомству', '<p>В этой демонстрационной версии онлайн-заявки пока не отправляются. Для записи свяжитесь с администратором: поможем выбрать врача и удобное время.</p>'+contactHTML);
});

document.addEventListener('click', event => {
  const serviceButton = event.target.closest('[data-service-detail]');
  if (serviceButton) showService(Number(serviceButton.dataset.serviceDetail));
  const serviceLink = event.target.closest('[data-service-select]');
  if (serviceLink) selectService(Number(serviceLink.dataset.serviceSelect));
  const doctorLink = event.target.closest('[data-doctor]');
  if (doctorLink) {
    const selected = $('#selected-doctor');
    selected.textContent = `Выбран врач: ${doctorLink.dataset.doctor}`;
    selected.hidden = false;
  }
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && anchor.getAttribute('href') !== '#') {
    const target = document.getElementById(anchor.getAttribute('href').slice(1));
    if (target) {
      $$('dialog[open]').forEach(closeDialog);
      closePopovers();
      // Removing focus also closes CSS focus-within popovers after navigation.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }
  }
});
updateHeader();
