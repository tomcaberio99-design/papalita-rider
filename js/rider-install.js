(() => {
  'use strict';

  const displayMode = matchMedia('(display-mode: standalone)');
  const launchedFromRider = new URLSearchParams(location.search).get('launch') === 'rider';
  const ua = navigator.userAgent;
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger|; wv\)/i.test(ua);
  const android = /Android/i.test(ua);
  const androidChrome = android && /Chrome\//.test(ua) && !inApp && !/EdgA|OPR|SamsungBrowser/i.test(ua);
  let offer, installing = false, installed = false;
  const isStandalone = () => displayMode.matches || navigator.standalone === true;
  const isRiderInstalled = () => installed || launchedFromRider && isStandalone();
  const update = () => {
    document.documentElement.classList.toggle('pr-rider-installed', isRiderInstalled());
    document.documentElement.classList.toggle('pr-rider-install-ready', !!offer && !installing);
    document.documentElement.classList.toggle('pr-rider-install-pending', androidChrome && !offer && !isRiderInstalled());
  };
  update();
  displayMode.addEventListener?.('change', update);

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    offer = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    installed = true;
    update();
  });

  function instructions() {
    const appleMobile = /iPhone|iPad|iPod/i.test(ua) || /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    if (appleMobile) return 'Open this page in Safari. Tap Share, then Add to Home Screen. Turn on Open as Web App if shown, then tap Add.';
    if (isStandalone() || inApp) return 'Open the Rider Portal in a new Chrome tab. In Chrome’s three-dot menu, choose Install or Add to Home screen.';
    if (android) return 'In Chrome, tap the three-dot menu, then Add to Home screen. Choose Install if offered, or Create shortcut for one-tap access.';
    return 'Open the browser menu and look for Install page as app. If you already installed Papalita Rider, open it from your apps.';
  }

  async function open(showHelp) {
    if (isRiderInstalled() || installing) return;
    if (!offer) {
      if (!androidChrome) showHelp(instructions());
      return;
    }
    installing = true;
    const event = offer;
    offer = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch {
      showHelp(instructions());
    } finally {
      installing = false;
      update();
    }
  }

  window.PapalitaRiderInstall = { open };
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./rider-sw.js', { scope: './' })
      .catch(error => console.warn('Rider app worker could not register', error));
  }
})();
