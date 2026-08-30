const heading = document.querySelector('main h1');
const status = document.querySelector('.route-status');

function announceRoute() {
  if (!heading) return;
  heading.focus({ preventScroll: true });
  if (status) status.textContent = `${document.title} loaded`;
}

const navigation = performance.getEntriesByType('navigation')[0];
const arrivedFromThisSite = document.referrer.startsWith(location.origin);

if (arrivedFromThisSite || navigation?.type === 'back_forward') {
  requestAnimationFrame(announceRoute);
}

addEventListener('pageshow', (event) => {
  if (event.persisted) announceRoute();
});
