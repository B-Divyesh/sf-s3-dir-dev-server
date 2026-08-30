const toast = document.querySelector('#toast');
const reset = document.querySelector('#reset-demo');
const copy = document.querySelector('#copy-demo');

function announce(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2200);
}

reset?.addEventListener('click', () => {
  document.querySelector('#terminal-output').scrollTop = 0;
  announce('Sample reset. Run the command to create a new temporary directory.');
});

copy?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(copy.dataset.copy);
    copy.textContent = 'Copied';
    announce('Demo command copied to the clipboard.');
    window.setTimeout(() => { copy.textContent = 'Copy demo command'; }, 2200);
  } catch {
    announce('Select the command in the terminal to copy it.');
  }
});
