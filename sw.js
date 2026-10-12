const CACHE = 'planner-mv4p17mq';
const FILES = ["./","./assets/index-DSuywd5R.css","./assets/index-BGukC2qb.js","./manifest.webmanifest","./icon-180.png","./icon-192.png","./icon-512.png"];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    // Network first so updates arrive; cached copy when offline.
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
self.addEventListener('push', (e) => {
  let n = {};
  try { n = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(n.title || 'Planner', {
    body: n.body || '', tag: n.tag, icon: './icon-192.png', data: { taskId: n.taskId },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId = e.notification.data && e.notification.data.taskId;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list[0];
    if (open) {
      if (taskId) open.postMessage({ type: 'open-task', taskId });
      return open.focus();
    }
    return self.clients.openWindow(taskId ? './#task=' + encodeURIComponent(taskId) : './');
  }));
});
