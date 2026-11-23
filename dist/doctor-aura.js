// Pause the profile's two CSS animations when its portrait is outside the viewport.
const doctorAuraPortrait = document.querySelector('.doctor-hero-slot');
if (doctorAuraPortrait && 'IntersectionObserver' in window) {
  const doctorAuraObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      entry.target.classList.toggle('is-aura-visible', entry.isIntersecting);
    }
  });
  doctorAuraObserver.observe(doctorAuraPortrait);
} else {
  doctorAuraPortrait?.classList.add('is-aura-visible');
}
