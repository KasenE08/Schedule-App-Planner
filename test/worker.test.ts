import { describe, expect, it } from 'vitest';
import { Hub, MAX_DEVICES, type Storage } from '../worker/src/hub';
import { fromB64url, toB64url, utf8 } from '../src/push/b64';

function memoryStorage() {
  const map = new Map<string, unknown>();
  const s = {
    alarm: null as number | null,
    map,
    async get<T>(k: string) {
      return structuredClone(map.get(k)) as T | undefined;
    },
    async put(k: string, v: unknown) {
      map.set(k, structuredClone(v));
    },
    async setAlarm(at: number) {
      s.alarm = at;
    },
    async deleteAlarm() {
      s.alarm = null;
    },
  };
  return s satisfies Storage;
}

function setup(status = 201) {
  const storage = memoryStorage();
  const sent: { url: string; init: RequestInit }[] = [];
  let now = 1_000_000;
  const fetchFn = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  const hub = new Hub(storage, 'https://example.com/app/', fetchFn, () => now);
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await hub.handle(new Request(`https://w.dev${path}`, { method, body: body ? JSON.stringify(body) : undefined }));
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  };
  return { hub, storage, sent, call, setNow: (t: number) => (now = t) };
}

const SUB = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'x', auth: 'y' } };
const item = (at: number, body = toB64url(utf8('cipher'))) => ({ at, body });

describe('notification server', () => {
  it('creates and keeps one VAPID key', async () => {
    const { call } = setup();
    const a = await call('GET', '/key');
    const b = await call('GET', '/key');
    expect(fromB64url(a.data.publicKey)).toHaveLength(65);
    expect(b.data.publicKey).toBe(a.data.publicKey);
  });

  it('registers a phone and requires its secret for everything else', async () => {
    const { call } = setup();
    const { data } = await call('POST', '/register', { subscription: SUB });
    expect(data.deviceId).toBeTruthy();
    expect((await call('PUT', '/queue', { deviceId: data.deviceId, secret: 'wrong', items: [] })).status).toBe(400);
    expect((await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [] })).status).toBe(200);
  });

  it('stores only the endpoint, never the encryption keys', async () => {
    const { call, storage } = setup();
    await call('POST', '/register', { subscription: SUB });
    expect(JSON.stringify(storage.map.get('devices'))).not.toContain('p256dh');
  });

  it('limits how many phones can register; re-registering the same phone replaces it', async () => {
    const { call } = setup();
    for (let i = 0; i < MAX_DEVICES; i++) await call('POST', '/register', { subscription: { endpoint: `https://p/${i}` } });
    expect((await call('POST', '/register', { subscription: { endpoint: 'https://p/new' } })).status).toBe(403);
    expect((await call('POST', '/register', { subscription: { endpoint: 'https://p/0' } })).status).toBe(200);
  });

  it('sends each notification when its alarm fires, with VAPID and encryption headers', async () => {
    const { call, hub, storage, sent, setNow } = setup();
    const { data } = await call('POST', '/register', { subscription: SUB });
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(2_000_000), item(1_500_000)] });
    expect(storage.alarm).toBe(1_500_000);

    setNow(1_500_000);
    await hub.alarm();
    expect(sent).toHaveLength(1);
    const h = sent[0].init.headers as Record<string, string>;
    expect(sent[0].url).toBe(SUB.endpoint);
    expect(h['Content-Encoding']).toBe('aes128gcm');
    expect(h.TTL).toBeTruthy();
    expect(h.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
    expect(storage.alarm).toBe(2_000_000);
  });

  it('the VAPID token is signed by the key the phone subscribed with, for the push service origin', async () => {
    const { call, hub, sent, setNow } = setup();
    const { data } = await call('POST', '/register', { subscription: SUB });
    const { data: key } = await call('GET', '/key');
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(1_000_000)] });
    setNow(1_000_000);
    await hub.alarm();
    const token = (sent[0].init.headers as Record<string, string>).Authorization.match(/t=([^,]+)/)![1];
    const [h, p, s] = token.split('.');
    const pub = await crypto.subtle.importKey('raw', fromB64url(key.publicKey) as Uint8Array<ArrayBuffer>, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(s) as Uint8Array<ArrayBuffer>, utf8(`${h}.${p}`));
    expect(ok).toBe(true);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(p)));
    expect(claims).toMatchObject({ aud: 'https://web.push.apple.com', sub: 'https://example.com/app/' });
  });

  it('a new upload replaces that phone’s old queue', async () => {
    const { call, storage } = setup();
    const { data } = await call('POST', '/register', { subscription: SUB });
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(5), item(6)] });
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(7)] });
    expect((storage.map.get('queue') as unknown[]).length).toBe(1);
  });

  it('drops notifications more than 30 minutes late instead of sending them', async () => {
    const { call, hub, sent, setNow } = setup();
    const { data } = await call('POST', '/register', { subscription: SUB });
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(1_000_000)] });
    setNow(1_000_000 + 31 * 60_000);
    await hub.alarm();
    expect(sent).toHaveLength(0);
  });

  it('forgets a phone whose subscription is gone (410)', async () => {
    const { call, hub, storage, setNow } = setup(410);
    const { data } = await call('POST', '/register', { subscription: SUB });
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(1_000_000)] });
    setNow(1_000_000);
    await hub.alarm();
    expect(storage.map.get('devices')).toEqual({});
  });

  it('retries a failed send a couple of times, a minute apart', async () => {
    const { call, hub, storage, sent, setNow } = setup(503);
    const { data } = await call('POST', '/register', { subscription: SUB });
    await call('PUT', '/queue', { deviceId: data.deviceId, secret: data.secret, items: [item(1_000_000)] });
    for (let t = 1_000_000; sent.length < 5 && storage.alarm !== null; t += 60_000) {
      setNow(t);
      await hub.alarm();
    }
    expect(sent).toHaveLength(3);
    expect(storage.alarm).toBeNull();
  });

  it('a network failure is retried instead of crashing the alarm', async () => {
    const storage = memoryStorage();
    const failing = (async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    const hub = new Hub(storage, 'https://example.com/', failing, () => 1_000_000);
    const reg = await hub.handle(new Request('https://w.dev/register', { method: 'POST', body: JSON.stringify({ subscription: SUB }) }));
    const { deviceId, secret } = (await reg.json()) as Record<string, string>;
    await hub.handle(new Request('https://w.dev/queue', { method: 'PUT', body: JSON.stringify({ deviceId, secret, items: [item(1_000_000)] }) }));
    await expect(hub.alarm()).resolves.toBeUndefined();
    expect(storage.alarm).toBe(1_060_000);
  });

  it('test sends immediately', async () => {
    const { call, sent } = setup();
    const { data } = await call('POST', '/register', { subscription: SUB });
    const r = await call('POST', '/test', { deviceId: data.deviceId, secret: data.secret, body: toB64url(utf8('x')) });
    expect(r.data.ok).toBe(true);
    expect(sent).toHaveLength(1);
  });
});
