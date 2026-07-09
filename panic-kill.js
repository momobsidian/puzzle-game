const DEV_MODE = false;
let isSelectingFile = false; // set to true when picking a file

function triggerPanicLogout() {
  if (DEV_MODE) return;
  if (isSelectingFile) return;

  // Instant Obliteration
  document.documentElement.style.backgroundColor = '#000000';
  document.documentElement.style.display = 'none';
  document.body.innerHTML = '';

  // Redirection
  setTimeout(() => {
    window.location.href = 'about:blank';
  }, 300);
}

window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !isSelectingFile) triggerPanicLogout();
});

window.addEventListener('blur', () => {
  if (!isSelectingFile) triggerPanicLogout();
});

window.addEventListener('pagehide', () => {
  if (!isSelectingFile) triggerPanicLogout();
});

window.addEventListener('beforeunload', () => {
  if (!isSelectingFile) triggerPanicLogout();
});
