const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const mobileLayout = window.matchMedia("(max-width: 600px)");
const clinicPhone = "+7 931 399 05 80";
const header = document.querySelector(".site-header");

const compactMenu = header.querySelector("#compact-menu-panel");
for (const link of header.querySelectorAll(".primary-links a, #more-panel a")) {
  compactMenu.append(link.cloneNode(true));
}

const popovers = [...document.querySelectorAll("[data-popover]")].map(element => ({
  element,
  trigger: element.querySelector(".popover-trigger"),
  panel: element.querySelector(".popover-panel")
}));
let openPopover = null;
let pinned = false;
let popoverTimer;

function closePopover() {
  clearTimeout(popoverTimer);
  if (!openPopover) return;
  openPopover.trigger.setAttribute("aria-expanded", "false");
  openPopover.element.classList.remove("is-open");
  openPopover.panel.inert = true;
  openPopover = null;
  pinned = false;
}

function showPopover(popover, pin = false) {
  if (openPopover !== popover) closePopover();
  clearTimeout(popoverTimer);
  openPopover = popover;
  pinned = pin || pinned;
  popover.trigger.setAttribute("aria-expanded", "true");
  popover.element.classList.add("is-open");
  popover.panel.inert = false;
}

for (const popover of popovers) {
  const { element, trigger } = popover;
  element.addEventListener("pointerenter", event => {
    if (event.pointerType !== "touch") showPopover(popover);
  });
  element.addEventListener("pointerleave", () => {
    if (openPopover !== popover || pinned) return;
    if (element.contains(document.activeElement) && document.activeElement.matches(":focus-visible")) return;
    popoverTimer = setTimeout(closePopover, 110);
  });
  trigger.addEventListener("focus", () => {
    if (trigger.matches(":focus-visible")) showPopover(popover);
  });
  element.addEventListener("focusout", event => {
    if (openPopover === popover && !element.contains(event.relatedTarget) && !element.matches(":hover")) closePopover();
  });
  trigger.addEventListener("click", () => {
    if (openPopover === popover && pinned) closePopover();
    else showPopover(popover, true);
  });
  popover.panel.addEventListener("click", event => {
    if (event.target.closest("a")) closePopover();
  });
}

document.addEventListener("pointerdown", event => {
  if (openPopover && !openPopover.element.contains(event.target)) closePopover();
});
document.addEventListener("keydown", event => {
  if (event.key !== "Escape" || !openPopover) return;
  const { element, trigger } = openPopover;
  if (element.contains(document.activeElement)) trigger.focus({ preventScroll: true });
  closePopover();
});

const copyNumber = document.querySelector("[data-copy-phone]");
const copyStatus = document.querySelector("[data-copy-status]");
let copyTimer;
copyNumber.addEventListener("click", async () => {
  try {
    if (!navigator.clipboard) throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(clinicPhone);
  } catch {
    const field = document.createElement("textarea");
    field.value = clinicPhone;
    field.className = "sr-only";
    copyNumber.after(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    copyNumber.focus({ preventScroll: true });
    if (!copied) {
      copyStatus.textContent = "Номер: " + clinicPhone;
      copyNumber.textContent = clinicPhone;
      return;
    }
  }
  copyNumber.textContent = "Номер скопирован";
  copyStatus.textContent = "Номер скопирован";
  clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copyNumber.textContent = "Скопировать номер";
    copyStatus.textContent = "";
  }, 1800);
});

let previousY = Math.max(0, window.scrollY);
let headerTop = 0;
let headerHeight = header.getBoundingClientRect().height;

function positionHeader() {
  const y = Math.max(0, window.scrollY);
  if (mobileLayout.matches) {
    previousY = y;
    return;
  }
  const wasPinned = header.classList.contains("is-pinned");
  const keyboardInHeader = header.contains(document.activeElement) && document.activeElement.matches(":focus-visible");

  if (y === 0) {
    headerTop = 0;
    header.style.removeProperty("--header-document-top");
    header.classList.remove("is-pinned");
  } else if (y < previousY && !wasPinned) {
    // Start an offscreen header at the viewport edge, then let the scroll reveal it.
    const revealTop = Math.max(headerTop, previousY - headerHeight);
    if (revealTop !== headerTop) {
      headerTop = revealTop;
      header.style.setProperty("--header-document-top", headerTop + "px");
    }
    if (y <= headerTop) header.classList.add("is-pinned");
  } else if (y > previousY && wasPinned) {
    // Let the page carry the header away from where it last sat in the viewport.
    headerTop = previousY;
    header.style.setProperty("--header-document-top", headerTop + "px");
    header.classList.remove("is-pinned");
  }

  if (y > previousY && !keyboardInHeader && openPopover && header.contains(openPopover.element)) {
    closePopover();
  }

  const offscreen = !header.classList.contains("is-pinned") && headerTop + headerHeight <= y;
  header.inert = !keyboardInHeader && offscreen;
  previousY = y;
}

window.addEventListener("scroll", positionHeader, { passive: true });
new ResizeObserver(() => {
  headerHeight = header.getBoundingClientRect().height;
  positionHeader();
}).observe(header);

const gallery = document.querySelector("[data-gallery]");
const galleryImages = [...gallery.querySelectorAll("[data-gallery-image]")];
const galleryButtons = [...gallery.querySelectorAll(".gallery-thumb")];
const galleryControls = gallery.querySelector(".gallery-thumbs");
let activePhoto = 0;
let galleryVisible = false;
let galleryTimer;

function showPhoto(index) {
  activePhoto = index;
  galleryImages.forEach((photo, i) => {
    photo.classList.toggle("is-current", i === index);
    if (i === index || mobileLayout.matches) photo.removeAttribute("aria-hidden");
    else photo.setAttribute("aria-hidden", "true");
  });
  galleryButtons.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
}

function scheduleGallery() {
  clearTimeout(galleryTimer);
  const usingControls = galleryControls.matches(":hover, :focus-within");
  if (mobileLayout.matches || !galleryVisible || usingControls || reduceMotion.matches || document.hidden) return;
  galleryTimer = setTimeout(() => {
    showPhoto((activePhoto + 1) % galleryImages.length);
    scheduleGallery();
  }, 5500);
}

galleryButtons.forEach((button, index) => {
  button.addEventListener("pointerenter", event => {
    if (event.pointerType === "touch") return;
    showPhoto(index);
    scheduleGallery();
  });
  button.addEventListener("click", () => {
    showPhoto(index);
    scheduleGallery();
  });
  button.addEventListener("focus", () => {
    if (button.matches(":focus-visible")) {
      showPhoto(index);
      scheduleGallery();
    }
  });
});
galleryControls.addEventListener("pointerleave", scheduleGallery);
galleryControls.addEventListener("focusout", () => requestAnimationFrame(scheduleGallery));
document.addEventListener("visibilitychange", scheduleGallery);
reduceMotion.addEventListener("change", scheduleGallery);
showPhoto(activePhoto);
new IntersectionObserver(([entry]) => {
  galleryVisible = entry.isIntersecting;
  scheduleGallery();
}, { threshold: .3 }).observe(gallery);

const serviceList = document.querySelector(".service-list");
const serviceOptions = [...serviceList.querySelectorAll("[data-service]")];
serviceList.style.setProperty("--service-count", serviceOptions.length);
const serviceImages = [...document.querySelectorAll("[data-service-image]")];
const serviceDialog = document.querySelector("#service-dialog");
const serviceDialogTitle = serviceDialog.querySelector("h2");
const serviceDialogImage = serviceDialog.querySelector("[data-dialog-image]");
const serviceDialogDescription = serviceDialog.querySelector("[data-dialog-description]");
const serviceDialogLink = serviceDialog.querySelector("[data-service-link]");
const serviceDialogBook = serviceDialog.querySelector("[data-service-book]");
const priceList = "https://metelitsa-dent.ru/files/price.pdf";
const services = {
  sleep: {
    description: "Клиника проводит лечение зубов в медикаментозном сне. Узнать, как подготовиться к визиту и как проходит приём, можно на сайте клиники.",
    link: "https://metelitsa-dent.ru/lechenie-zubov-pod-narkozom/",
    linkText: "О лечении во сне"
  },
  child: {
    description: "На первом приёме ребёнок знакомится с врачом, а стоматолог проводит осмотр и обсуждает с родителями дальнейшие шаги.",
    link: "https://metelitsa-dent.ru/about/pravila-zapisi-na-pervichnyy-priem-obsledovanie-konsultatsiyu/",
    linkText: "Как проходит первый приём"
  },
  therapy: { description: "Осмотр, диагностика и лечение кариеса и его осложнений. План лечения врач обсуждает на консультации." },
  prosthetics: { description: "Восстановление зубов с помощью коронок, вкладок и других ортопедических конструкций. Варианты подбирают после осмотра." },
  ortho: { description: "Консультация ортодонта и подбор способа коррекции прикуса для детей и взрослых." },
  hygiene: { description: "Профессиональная гигиена полости рта и рекомендации по домашнему уходу." }
};

function showService(id) {
  const activeIndex = serviceOptions.findIndex(option => option.dataset.service === id);
  if (activeIndex < 0) return;
  serviceList.style.setProperty("--service-index", activeIndex);
  serviceOptions.forEach((option, index) => option.classList.toggle("is-current", index === activeIndex));
  serviceImages.forEach(photo => photo.classList.toggle("is-current", photo.dataset.serviceImage === id));
}

serviceOptions.forEach(option => {
  const id = option.dataset.service;
  option.addEventListener("pointerenter", event => {
    if (!mobileLayout.matches && event.pointerType !== "touch") showService(id);
  });
  option.addEventListener("focus", () => showService(id));
  option.addEventListener("click", () => {
    showService(id);
    const title = option.textContent.trim();
    const service = services[id];
    serviceDialogTitle.textContent = title;
    serviceDialogDescription.textContent = service.description;
    serviceDialogImage.src = mobileLayout.matches
      ? option.querySelector(".service-card-photo").src
      : serviceImages.find(photo => photo.dataset.serviceImage === id).src;
    serviceDialogLink.href = service.link ?? priceList;
    serviceDialogLink.textContent = service.linkText ?? "Посмотреть цены";
    serviceDialogBook.dataset.book = title;
    serviceDialog.showModal();
  });
});

document.querySelectorAll("[data-show-service]").forEach(link => {
  link.addEventListener("click", () => showService(link.dataset.showService));
});

function enableCarousel(section) {
  const track = section.querySelector(".carousel");
  const previous = section.querySelector("[data-prev]");
  const next = section.querySelector("[data-next]");
  const cards = [...track.children];
  let gesture = null;
  let lastDragEnd = -Infinity;
  let glideFrame = 0;

  function refreshButtons() {
    previous.disabled = track.scrollLeft < 2;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }

  function stopGlide() {
    cancelAnimationFrame(glideFrame);
    glideFrame = 0;
  }

  function step(direction) {
    stopGlide();
    const viewport = track.getBoundingClientRect();
    const start = viewport.left + Number.parseFloat(getComputedStyle(track).paddingInlineStart);
    const boxes = cards.map(card => card.getBoundingClientRect());
    let target;
    if (direction > 0) {
      target = boxes.find(box => box.left > start + 1 && box.right > viewport.right + 1);
    } else {
      const preceding = boxes.filter(box => box.left < start - 1);
      const last = preceding.at(-1);
      if (last) {
        const earliestLeft = last.right - (viewport.right - start);
        target = preceding.find(box => box.left >= earliestLeft - 1) ?? last;
      }
    }
    if (!target) return;
    track.scrollTo({
      left: track.scrollLeft + target.left - start,
      behavior: reduceMotion.matches ? "instant" : "smooth"
    });
  }

  function coastAfterDrag(samples, releasedAt) {
    const first = samples.find(sample => sample.time >= releasedAt - 100);
    const last = samples.at(-1);
    if (!first || first === last || releasedAt - last.time > 55 || reduceMotion.matches) return;

    const speed = (last.left - first.left) / Math.max(16, releasedAt - first.time);
    if (Math.abs(speed) < 0.45) return;

    const start = track.scrollLeft;
    const limit = track.scrollWidth - track.clientWidth;
    const travel = Math.max(-120, Math.min(120, speed * 75));
    const end = Math.max(0, Math.min(limit, start + travel));
    if (Math.abs(end - start) < 2) return;

    const startedAt = performance.now();
    function animate(now) {
      const progress = Math.min(1, (now - startedAt) / 220);
      track.scrollLeft = start + (end - start) * (1 - (1 - progress) ** 3);
      glideFrame = progress < 1 ? requestAnimationFrame(animate) : 0;
    }
    glideFrame = requestAnimationFrame(animate);
  }

  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  track.addEventListener("scroll", refreshButtons, { passive: true });
  new ResizeObserver(refreshButtons).observe(track);
  refreshButtons();

  track.addEventListener("keydown", event => {
    if (event.target !== track) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
  });

  track.addEventListener("dragstart", event => event.preventDefault());
  track.addEventListener("wheel", stopGlide, { passive: true });
  track.addEventListener("pointerdown", event => {
    stopGlide();
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const start = track.scrollLeft;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      start,
      dragging: false,
      samples: [{ time: event.timeStamp, left: start }]
    };
    lastDragEnd = -Infinity;
  });
  track.addEventListener("pointermove", event => {
    if (gesture?.id !== event.pointerId || !event.buttons) return;
    const distance = event.clientX - gesture.x;
    if (!gesture.dragging) {
      if (Math.abs(distance) < 6) return;
      gesture.dragging = true;
      track.classList.add("is-dragging");
      track.setPointerCapture(event.pointerId);
    }
    track.scrollLeft = gesture.start - distance;
    gesture.samples = gesture.samples.filter(sample => sample.time >= event.timeStamp - 100);
    gesture.samples.push({ time: event.timeStamp, left: track.scrollLeft });
  });

  function finishDrag(event) {
    if (gesture?.id !== event.pointerId) return;
    if (gesture.dragging) {
      lastDragEnd = performance.now();
      track.classList.remove("is-dragging");
      if (event.type === "pointerup") coastAfterDrag(gesture.samples, event.timeStamp);
    }
    gesture = null;
  }

  document.addEventListener("pointerup", finishDrag);
  track.addEventListener("pointercancel", finishDrag);
  track.addEventListener("lostpointercapture", finishDrag);
  track.addEventListener("click", event => {
    if (event.detail && performance.now() - lastDragEnd < 120) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

const doctorTrack = document.querySelector("#doctors-track");
const originalDoctorCards = [...doctorTrack.children];
for (let copy = 0; copy < 2; copy++) {
  doctorTrack.append(...originalDoctorCards.map(card => card.cloneNode(true)));
}

document.querySelectorAll("[data-carousel]").forEach(enableCarousel);

if (!("name" in HTMLDetailsElement.prototype)) {
  const questions = [...document.querySelectorAll(".faq details")];
  for (const question of questions) {
    question.addEventListener("toggle", () => {
      if (!question.open) return;
      questions.filter(other => other !== question && other.open).forEach(other => { other.open = false; });
    });
  }
}

const selectedAppointment = document.querySelector("#appointment-selection");
const appointmentSection = document.querySelector("#appointment");
const appointmentHome = appointmentSection.parentElement;
const mobileBooking = document.querySelector("#mobile-booking");
const mobileMenu = document.querySelector("#mobile-navigation");

function openMobileBooking(event) {
  if (!mobileLayout.matches) return;
  event.preventDefault();
  if (mobileMenu.open) mobileMenu.close();
  mobileBooking.append(appointmentSection);
  mobileBooking.showModal();
}

mobileBooking.addEventListener("close", () => {
  if (!mobileBooking.open) appointmentHome.append(appointmentSection);
});

function selectAppointment(subject) {
  selectedAppointment.hidden = !subject;
  selectedAppointment.textContent = subject ? "Вы выбрали: " + subject : "";
}

document.querySelectorAll("[data-book]").forEach(link => {
  link.addEventListener("click", event => {
    selectAppointment(link.dataset.book);
    openMobileBooking(event);
  });
});
serviceDialogBook.addEventListener("click", event => {
  selectAppointment(serviceDialogBook.dataset.book);
  serviceDialog.close();
  openMobileBooking(event);
});

const phone = document.querySelector("#appointment-phone");
const phonePlaceholder = phone.placeholder;
const maskPrefix = document.querySelector("[data-mask-prefix]");
const maskTail = document.querySelector("[data-mask-tail]");

function parsePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (raw.trimStart().startsWith("+7") || (digits.length >= 11 && /^[78]/.test(digits))) return digits.slice(1);
  return digits;
}

function formatPhone(digits) {
  const number = digits.slice(0, 10);
  if (!number) return "";
  const groups = [number.slice(0, 3), number.slice(3, 6), number.slice(6, 8), number.slice(8, 10)];
  return "+7 " + groups.filter(Boolean).join(" ");
}

function drawPhoneMask() {
  maskPrefix.textContent = phone.value || phonePlaceholder;
  maskTail.textContent = phone.value ? phonePlaceholder.slice(phone.value.length) : "";
}

phone.addEventListener("input", () => {
  const caret = phone.selectionStart;
  const raw = phone.value;
  const digitsBeforeCaret = parsePhone(raw.slice(0, caret)).length;
  phone.value = formatPhone(parsePhone(raw));
  if (caret < raw.length && phone.value) {
    const position = formatPhone(parsePhone(raw).slice(0, digitsBeforeCaret)).length;
    phone.setSelectionRange(Math.max(3, position), Math.max(3, position));
  }
  phone.setCustomValidity("");
  drawPhoneMask();
});
phone.addEventListener("focus", drawPhoneMask);
phone.addEventListener("invalid", () => {
  phone.setCustomValidity(phone.value ? "Введите десять цифр после +7." : "Введите номер телефона.");
});
drawPhoneMask();

const appointmentForm = document.querySelector("#appointment-form");
const appointmentDialog = document.querySelector("#appointment-dialog");
appointmentForm.addEventListener("submit", event => {
  event.preventDefault();
  appointmentDialog.showModal();
});
appointmentForm.querySelector("[type=submit]").disabled = false;

document.querySelectorAll(".detail-dialog").forEach(dialog => {
  dialog.addEventListener("click", event => {
    const box = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) dialog.close();
  });
});

const accessibilityButtons = document.querySelectorAll("[data-accessibility]");
accessibilityButtons.forEach(button => {
  button.addEventListener("click", () => {
    const enabled = document.documentElement.classList.toggle("high-contrast");
    accessibilityButtons.forEach(control => control.setAttribute("aria-pressed", String(enabled)));
  });
});

const largeTextButton = mobileMenu.querySelector("[data-large-text]");
largeTextButton.addEventListener("click", () => {
  const enabled = document.documentElement.classList.toggle("mobile-large-text");
  largeTextButton.setAttribute("aria-pressed", String(enabled));
});

const mobileMenuButton = document.querySelector("[data-mobile-menu]");
const menuClose = mobileMenu.querySelector(".mobile-action-close");
const menuHandle = mobileMenu.querySelector(".mobile-menu-handle");
const searchForm = mobileMenu.querySelector(".mobile-search");
const searchField = searchForm.querySelector("input");
const searchCancel = searchForm.querySelector(".mobile-search-cancel");
const searchResults = mobileMenu.querySelector(".mobile-search-results");
const searchStatus = searchResults.querySelector("[role=status]");
const searchList = searchResults.querySelector("ul");
const visualViewport = window.visualViewport;
let pressedMenuBackdrop = false;
let menuSwipe = null;
let menuDismissTimer;
const searchCatalog = [
  ...[...mobileMenu.querySelectorAll(".mobile-menu-links a")].map(link => ({
    title: link.textContent.trim(),
    href: link.getAttribute("href"),
    service: link.dataset.showService
  })),
  ...serviceOptions.map(option => ({ title: option.textContent.trim(), href: "#" + option.id, service: option.dataset.service })),
  { title: "Частые вопросы", href: "#faq" }
];

function normalizeSearch(value) {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function renderSearch() {
  const query = normalizeSearch(searchField.value);
  const terms = query.split(/\s+/);
  const matches = query ? searchCatalog.filter(entry => {
    const title = normalizeSearch(entry.title);
    return terms.every(term => title.includes(term));
  }) : [];

  searchResults.hidden = !query;
  searchStatus.textContent = query && !matches.length ? "Ничего не найдено" : "";
  searchList.replaceChildren(...matches.map(entry => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = entry.href;
    link.textContent = entry.title;
    if (entry.service) link.dataset.showService = entry.service;
    item.append(link);
    return item;
  }));
}

function positionSearch() {
  if (!visualViewport || !mobileMenu.classList.contains("is-searching")) return;
  mobileMenu.style.setProperty("--search-top", visualViewport.offsetTop + "px");
  mobileMenu.style.setProperty("--search-height", visualViewport.height + "px");
}

function resetSearch() {
  searchField.value = "";
  renderSearch();
  searchCancel.hidden = true;
  mobileMenu.classList.remove("is-searching");
  mobileMenu.style.removeProperty("--search-top");
  mobileMenu.style.removeProperty("--search-height");
}

mobileMenuButton.addEventListener("click", () => {
  mobileMenu.classList.add("is-opening");
  mobileMenu.showModal();
  mobileMenuButton.setAttribute("aria-expanded", "true");
});
mobileMenu.addEventListener("close", () => {
  if (mobileMenu.open) return;
  clearTimeout(menuDismissTimer);
  menuDismissTimer = undefined;
  menuSwipe = null;
  pressedMenuBackdrop = false;
  mobileMenu.classList.remove("is-opening", "is-dragging");
  mobileMenu.style.removeProperty("--menu-drag-y");
  mobileMenuButton.setAttribute("aria-expanded", "false");
  resetSearch();
});
mobileMenu.addEventListener("pointerdown", event => {
  const bounds = mobileMenu.getBoundingClientRect();
  pressedMenuBackdrop = event.target === mobileMenu && (event.clientY < bounds.top || event.clientY > bounds.bottom);
});
mobileMenu.addEventListener("click", event => {
  const link = event.target.closest("a");
  if (link && (link.closest("nav") || link.closest(".mobile-search-results"))) {
    mobileMenu.close();
    const service = serviceOptions.find(option => option.dataset.service === link.dataset.showService);
    if (service) {
      event.preventDefault();
      service.click();
    }
    return;
  }
  if (pressedMenuBackdrop && event.target === mobileMenu) mobileMenu.close();
  pressedMenuBackdrop = false;
});

menuHandle.addEventListener("pointerdown", event => {
  if (!event.isPrimary || event.button !== 0 || menuDismissTimer) return;
  menuSwipe = { pointerId: event.pointerId, startY: event.clientY };
  menuHandle.setPointerCapture(event.pointerId);
  mobileMenu.classList.remove("is-opening");
  mobileMenu.classList.add("is-dragging");
});
menuHandle.addEventListener("pointermove", event => {
  if (event.pointerId !== menuSwipe?.pointerId) return;
  const distance = Math.max(0, event.clientY - menuSwipe.startY);
  mobileMenu.style.setProperty("--menu-drag-y", distance + "px");
});
function finishMenuSwipe(event) {
  if (event.pointerId !== menuSwipe?.pointerId) return;
  const shouldDismiss = event.type === "pointerup" && event.clientY - menuSwipe.startY >= 60;
  menuSwipe = null;
  mobileMenu.classList.remove("is-dragging");
  if (!shouldDismiss) {
    mobileMenu.style.removeProperty("--menu-drag-y");
  } else if (reduceMotion.matches) {
    mobileMenu.close();
  } else {
    mobileMenu.style.setProperty("--menu-drag-y", mobileMenu.offsetHeight + "px");
    menuDismissTimer = setTimeout(() => mobileMenu.close(), 180);
  }
}
menuHandle.addEventListener("pointerup", finishMenuSwipe);
menuHandle.addEventListener("lostpointercapture", finishMenuSwipe);

searchField.addEventListener("focus", () => {
  mobileMenu.classList.remove("is-opening");
  mobileMenu.classList.add("is-searching");
  searchCancel.hidden = false;
  positionSearch();
});
searchField.addEventListener("input", renderSearch);
searchForm.addEventListener("submit", event => {
  event.preventDefault();
  searchField.blur();
});
searchCancel.addEventListener("click", () => {
  resetSearch();
  menuClose.focus({ preventScroll: true });
});
visualViewport?.addEventListener("resize", positionSearch);
visualViewport?.addEventListener("scroll", positionSearch);
mobileLayout.addEventListener("change", () => {
  showPhoto(activePhoto);
  scheduleGallery();
  if (!mobileLayout.matches) {
    mobileMenu.close();
    mobileBooking.close();
  }
});
