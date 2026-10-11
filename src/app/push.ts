// Talks to the notification server: turning notifications on/off, test sends, and keeping
// the server's queue in step with the plan.
import { fromB64url } from '../push/b64';
import { encryptPayload } from '../push/webpush';
import { utf8, toB64url } from '../push/b64';
import { commit, getData, onChange } from './store';
import { encryptNotes, fingerprint, notifications } from './notify';
import type { PushState } from './model';

const clean = (url: string) => url.trim().replace(/\/+$/, '');

async function api(url: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${clean(url)}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
  return data;
}

export function pushSupported(): string | null {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'Notifications only work in the app opened from your home screen (iOS 16.4 or newer).';
  }
  return null;
}

export async function enablePush(url: string): Promise<void> {
  const unsupported = pushSupported();
  if (unsupported) throw new Error(unsupported);
  if (!/^https:\/\//.test(url.trim())) throw new Error('Paste the full server address, starting with https://');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in iPhone Settings → Notifications → Planner.');
  const { publicKey } = await api(url, 'GET', '/key');
  const reg = await navigator.serviceWorker.ready;
  const old = await reg.pushManager.getSubscription();
  if (old) await old.unsubscribe();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromB64url(publicKey) as Uint8Array<ArrayBuffer>,
  });
  const json = sub.toJSON();
  const { deviceId, secret } = await api(url, 'POST', '/register', { subscription: json });
  const push: PushState = {
    url: clean(url),
    deviceId,
    secret,
    p256dh: json.keys!.p256dh,
    auth: json.keys!.auth,
    uploaded: null,
    uploadedAt: null,
    error: null,
  };
  commit((d) => ({ ...d, push }));
  await uploadNow();
}

export async function disablePush(): Promise<void> {
  const p = getData().push;
  commit((d) => ({ ...d, push: null }));
  if (!p) return;
  try {
    await api(p.url, 'POST', '/unregister', { deviceId: p.deviceId, secret: p.secret });
    await (await navigator.serviceWorker.ready).pushManager.getSubscription().then((s) => s?.unsubscribe());
  } catch {
    // Already off on this phone; the server forgets it when the push service rejects it.
  }
}

export async function sendTest(): Promise<void> {
  const p = getData().push;
  if (!p) throw new Error('Notifications are off.');
  const body = await encryptPayload(
    utf8(JSON.stringify({ title: 'Planner', body: 'Notifications are working.', tag: 'test' })),
    fromB64url(p.p256dh),
    fromB64url(p.auth),
  );
  await api(p.url, 'POST', '/test', { deviceId: p.deviceId, secret: p.secret, body: toB64url(body) });
}

let running: Promise<void> | null = null;

/** Uploads the upcoming notifications if they changed since the last upload. */
export function uploadNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const d = getData();
    const p = d.push;
    if (!p) return;
    const now = Date.now();
    const notes = notifications(d, now);
    const fp = fingerprint(notes);
    if (fp === p.uploaded && !p.error) return;
    try {
      const items = await encryptNotes(notes, p, now);
      await api(p.url, 'PUT', '/queue', { deviceId: p.deviceId, secret: p.secret, items });
      commit((x) => (x.push ? { ...x, push: { ...x.push, uploaded: fp, uploadedAt: Date.now(), error: null } } : x));
    } catch (e) {
      const msg = navigator.onLine === false ? 'Offline: notifications will update when you are back online.' : (e as Error).message;
      commit((x) => (x.push ? { ...x, push: { ...x.push, error: msg } } : x));
    }
  })().finally(() => (running = null));
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Keeps the server in step: shortly after any change, when coming back online, and on open. */
export function startPushSync() {
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void uploadNow(), 1500);
  };
  onChange(soon);
  window.addEventListener('online', soon);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
  soon();
}
