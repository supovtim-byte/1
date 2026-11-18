(() => {
  const photo = document.querySelector(".hero > .hero-photo");
  if (!photo) return;

  const hero = photo.parentElement;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const protectedContent = hero.querySelectorAll("h1, .hero-aside, .rating-popover .popover-panel, .mobile-brand");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;z-index:-1";
  photo.after(canvas);

  const flakes = [];
  let width = 0;
  let height = 0;
  let pointer;
  let visible = false;
  let frame = 0;
  let previousTime = 0;
  let protectedAreas = [];

  function measure() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    if (width !== bounds.width || height !== bounds.height ||
        canvas.width !== Math.round(bounds.width * ratio) ||
        canvas.height !== Math.round(bounds.height * ratio)) {
      width = bounds.width;
      height = bounds.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.min(36, Math.max(8, Math.round(width * height / 33000)));
      flakes.length = Math.min(flakes.length, count);

      while (flakes.length < count) {
        flakes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 1.5 + Math.random() * 3,
          opacity: 0.2 + Math.random() * 0.34,
          speed: 9 + Math.random() * 12,
          phase: Math.random() * Math.PI * 2,
          vx: 0,
          vy: 0
        });
      }
    }

    protectedAreas = Array.from(protectedContent, element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || element.inert) return null;
      return {
        left: rect.left - bounds.left - 12,
        top: rect.top - bounds.top - 12,
        right: rect.right - bounds.left + 12,
        bottom: rect.bottom - bounds.top + 12
      };
    }).filter(Boolean);
  }

  function draw(time) {
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    context.clearRect(0, 0, width, height);
    const bounds = pointer && canvas.getBoundingClientRect();
    const damping = Math.exp(-4 * delta);

    for (const flake of flakes) {
      flake.vx *= damping;
      flake.vy *= damping;
      if (pointer) {
        const dx = flake.x - (pointer.x - bounds.left);
        const dy = flake.y - (pointer.y - bounds.top);
        const distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 68) {
          const force = (1 - distance / 68) * 220 * delta / distance;
          flake.vx += dx * force;
          flake.vy += dy * force;
        }
      }

      flake.phase += delta;
      flake.x += (Math.sin(flake.phase) * 5 + flake.vx) * delta;
      flake.y += (flake.speed + flake.vy) * delta;
      if (flake.y > height + 6) {
        flake.y = -6;
        flake.x = Math.random() * width;
      }
      if (flake.x > width + 6) flake.x = -6;
      if (flake.x < -6) flake.x = width + 6;

      if (protectedAreas.some(area => flake.x > area.left && flake.x < area.right &&
          flake.y > area.top && flake.y < area.bottom)) continue;

      context.globalAlpha = flake.opacity;
      context.fillStyle = context.strokeStyle = "#fff";
      context.beginPath();
      if (flake.radius < 2.6) {
        context.arc(flake.x, flake.y, flake.radius * 0.65, 0, Math.PI * 2);
        context.fill();
      } else {
        context.lineWidth = 0.85;
        for (let arm = 0; arm < 6; arm++) {
          const angle = arm * Math.PI / 3 + flake.phase * 0.1;
          context.moveTo(flake.x, flake.y);
          context.lineTo(flake.x + Math.cos(angle) * flake.radius,
            flake.y + Math.sin(angle) * flake.radius);
        }
        context.stroke();
      }
    }
    frame = requestAnimationFrame(draw);
  }

  function updatePlayback() {
    if (visible && !document.hidden && !reducedMotion.matches && photo.naturalWidth) {
      if (!frame) {
        measure();
        frame = requestAnimationFrame(draw);
      }
    } else {
      cancelAnimationFrame(frame);
      frame = previousTime = 0;
      pointer = undefined;
      context.clearRect(0, 0, width, height);
    }
  }

  hero.addEventListener("pointermove", event => {
    if (frame && event.pointerType !== "touch") pointer = { x: event.clientX, y: event.clientY };
  });
  hero.addEventListener("pointerleave", () => { pointer = undefined; });

  const resize = new ResizeObserver(() => { if (frame) measure(); });
  resize.observe(hero);
  protectedContent.forEach(element => resize.observe(element));

  const panel = hero.querySelector("#rating-panel");
  if (panel) {
    new MutationObserver(() => { if (frame) measure(); })
      .observe(panel, { attributes: true, attributeFilter: ["inert"] });
  }

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updatePlayback();
  }).observe(hero);
  photo.addEventListener("load", updatePlayback);
  reducedMotion.addEventListener("change", updatePlayback);
  document.addEventListener("visibilitychange", updatePlayback);
})();
