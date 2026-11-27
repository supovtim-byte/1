const videoReviewDialog = document.querySelector('#video-review-dialog');
const videoReviewTitle = videoReviewDialog.querySelector('h2');
const videoReviewPlayer = videoReviewDialog.querySelector('video');
const videoReviewUnavailable = videoReviewDialog.querySelector('.video-review-unavailable');
let videoReviewOpener;

function showUnavailableVideo() {
  videoReviewPlayer.hidden = true;
  videoReviewUnavailable.hidden = false;
}

document.querySelectorAll('[data-video-review]').forEach(button => {
  button.addEventListener('click', () => {
    videoReviewOpener = button;
    videoReviewTitle.textContent = button.dataset.videoTitle;
    showUnavailableVideo();
    if (button.dataset.videoSrc) {
      videoReviewPlayer.src = button.dataset.videoSrc;
      videoReviewPlayer.hidden = false;
      videoReviewUnavailable.hidden = true;
    }
    videoReviewDialog.showModal();
    videoReviewTitle.focus({ preventScroll: true });
  });
});

videoReviewPlayer.addEventListener('error', () => {
  if (videoReviewDialog.open) showUnavailableVideo();
});
videoReviewDialog.addEventListener('close', () => {
  videoReviewPlayer.pause();
  videoReviewPlayer.removeAttribute('src');
  videoReviewPlayer.load();
  videoReviewOpener?.focus({ preventScroll: true });
});
