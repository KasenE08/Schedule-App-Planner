/**
 * Registers the service worker and reports when a new version is waiting.
 * The new version only takes over when `apply` is called (the Update button); then the page reloads into it.
 * Installed apps on iPhone stay open for days, so it also checks on return to the app and every hour.
 */
export function watchUpdates(onReady: (apply: () => void) => void) {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const sw = navigator.serviceWorker;
  // On the very first install there was nothing to update, so no reload.
  const hadController = !!sw.controller;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
  });
  sw.register('./sw.js').then((reg) => {
    const offer = (w: ServiceWorker) => {
      if (sw.controller) onReady(() => w.postMessage({ type: 'skip-waiting' }));
    };
    const track = (w: ServiceWorker | null) =>
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed') offer(w);
      });
    if (reg.waiting) offer(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    const check = () => {
      if (navigator.onLine) reg.update().catch(() => {});
    };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  });
}
