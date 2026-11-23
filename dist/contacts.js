// Contacts has no booking section in its layout; use the shared dialog on desktop too.
(() => {
  const booking = document.querySelector('#mobile-booking');
  const appointment = document.querySelector('#appointment');
  const navigation = document.querySelector('#mobile-navigation');
  for (const link of document.querySelectorAll('[data-book]')) {
    link.addEventListener('click', event => {
      if (window.matchMedia('(max-width: 600px)').matches) return;
      event.preventDefault();
      if (navigation.open) navigation.close();
      booking.append(appointment);
      if (!booking.open) booking.showModal();
    });
  }
})();
