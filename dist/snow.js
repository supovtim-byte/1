(() => {
  const photo = document.querySelector(".hero > .hero-photo");
  if (!photo) return;

  const hero = photo.parentElement;
  const mobileLayout = matchMedia("(max-width: 600px)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border-radius:inherit;pointer-events:none;z-index:-1";
  const shade = hero.querySelector(".hero-shade");
  (shade || photo).after(canvas);

  const sizeScale = 2;
  const edgePadding = 6 * sizeScale;
  const flakes = [];
  let width = 0;
  let height = 0;
  let pointer;
  let visible = false;
  let frame = 0;
  let previousTime = 0;

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
      const baseCount = Math.min(36, Math.max(8, Math.round(width * height / 33000)));
      const count = mobileLayout.matches ? Math.round(baseCount * 1.5) : baseCount;
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
      if (flake.y > height + edgePadding) {
        flake.y = -edgePadding;
        flake.x = Math.random() * width;
      }
      if (flake.x > width + edgePadding) flake.x = -edgePadding;
      if (flake.x < -edgePadding) flake.x = width + edgePadding;

      context.globalAlpha = flake.opacity;
      context.fillStyle = context.strokeStyle = "#fff";
      context.beginPath();
      if (flake.radius < 2.6) {
        context.arc(flake.x, flake.y, flake.radius * 0.65 * sizeScale, 0, Math.PI * 2);
        context.fill();
      } else {
        context.lineWidth = 0.85 * sizeScale;
        const radius = flake.radius * sizeScale;
        for (let arm = 0; arm < 6; arm++) {
          const angle = arm * Math.PI / 3 + flake.phase * 0.1;
          context.moveTo(flake.x, flake.y);
          context.lineTo(flake.x + Math.cos(angle) * radius,
            flake.y + Math.sin(angle) * radius);
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

  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updatePlayback();
  }).observe(hero);
  photo.addEventListener("load", updatePlayback);
  reducedMotion.addEventListener("change", updatePlayback);
  document.addEventListener("visibilitychange", updatePlayback);
})();
