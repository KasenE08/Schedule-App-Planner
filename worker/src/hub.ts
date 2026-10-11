// The notification server's logic, kept free of Cloudflare-specific types so it can be unit tested.
// It stores already-encrypted notifications and forwards each one to the phone's push service on time.
import { fromB64url, toB64url, utf8 } from '../../src/push/b64';

export interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  setAlarm(at: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

export interface Subscription {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
}

interface Device {
  secretHash: string;
  sub: Subscription;
}

export interface QueueItem {
  device: string;
  at: number;
  /** base64url Web Push body, encrypted on the phone. */
  body: string;
  tries?: number;
}

interface Vapid {
  privateJwk: JsonWebKey;
  publicKey: string;
}

export const MAX_DEVICES = 5;
const MAX_ITEMS = 500;
/** Notifications more than this late are dropped instead of sent. */
const STALE_MS = 30 * 60_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

async function sha256(s: string): Promise<string> {
  return toB64url(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(s))));
}

const randomId = (n = 24) => toB64url(crypto.getRandomValues(new Uint8Array(n)));

export class Hub {
  constructor(
    private storage: Storage,
    private subject: string,
    // Wrapped: calling the global fetch as a method throws "Illegal invocation" on Cloudflare.
    private fetchFn: typeof fetch = (input, init) => fetch(input, init),
    private now: () => number = Date.now,
  ) {}

  async handle(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/\/+$/, '');
    try {
      if (req.method === 'GET' && path === '/key') return json({ publicKey: (await this.vapid()).publicKey });
      if (req.method === 'POST' && path === '/register') return await this.register(await req.json());
      if (req.method === 'PUT' && path === '/queue') return await this.setQueue(await req.json());
      if (req.method === 'POST' && path === '/test') return await this.test(await req.json());
      if (req.method === 'POST' && path === '/unregister') return await this.unregister(await req.json());
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
  }

  private async vapid(): Promise<Vapid> {
    const saved = await this.storage.get<Vapid>('vapid');
    if (saved) return saved;
    const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
    const v: Vapid = {
      privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
      publicKey: toB64url(new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey))),
    };
    await this.storage.put('vapid', v);
    return v;
  }

  private async devices(): Promise<Record<string, Device>> {
    return (await this.storage.get<Record<string, Device>>('devices')) ?? {};
  }

  private async queue(): Promise<QueueItem[]> {
    return (await this.storage.get<QueueItem[]>('queue')) ?? [];
  }

  private async auth(body: { deviceId?: string; secret?: string }): Promise<string> {
    const devices = await this.devices();
    const d = body.deviceId ? devices[body.deviceId] : undefined;
    if (!d || !body.secret || d.secretHash !== (await sha256(body.secret))) throw new Error('unknown device');
    return body.deviceId!;
  }

  private async register(body: { subscription?: Subscription }): Promise<Response> {
    const sub = body.subscription;
    if (!sub?.endpoint?.startsWith('https://')) return json({ error: 'bad subscription' }, 400);
    const devices = await this.devices();
    // Re-subscribing from the same phone replaces its old entry.
    for (const [id, d] of Object.entries(devices)) if (d.sub.endpoint === sub.endpoint) delete devices[id];
    if (Object.keys(devices).length >= MAX_DEVICES) return json({ error: 'too many devices' }, 403);
    const deviceId = randomId(12);
    const secret = randomId();
    devices[deviceId] = { secretHash: await sha256(secret), sub: { endpoint: sub.endpoint } };
    await this.storage.put('devices', devices);
    return json({ deviceId, secret });
  }

  private async unregister(body: { deviceId?: string; secret?: string }): Promise<Response> {
    const id = await this.auth(body);
    const devices = await this.devices();
    delete devices[id];
    await this.storage.put('devices', devices);
    await this.saveQueue((await this.queue()).filter((q) => q.device !== id));
    return json({ ok: true });
  }

  /** Replaces this device's upcoming notifications. */
  private async setQueue(body: { deviceId?: string; secret?: string; items?: { at: number; body: string }[] }): Promise<Response> {
    const id = await this.auth(body);
    const items = (body.items ?? []).slice(0, MAX_ITEMS);
    if (!items.every((i) => Number.isFinite(i.at) && typeof i.body === 'string' && i.body.length < 6000)) {
      return json({ error: 'bad items' }, 400);
    }
    const others = (await this.queue()).filter((q) => q.device !== id);
    await this.saveQueue([...others, ...items.map((i) => ({ device: id, at: i.at, body: i.body }))]);
    return json({ ok: true, count: items.length });
  }

  private async test(body: { deviceId?: string; secret?: string; body?: string }): Promise<Response> {
    const id = await this.auth(body);
    if (typeof body.body !== 'string') return json({ error: 'bad body' }, 400);
    const status = await this.send(id, body.body);
    return json({ ok: status < 300, status }, status < 300 ? 200 : 502);
  }

  private async saveQueue(q: QueueItem[]) {
    q.sort((a, b) => a.at - b.at);
    await this.storage.put('queue', q);
    if (q.length) await this.storage.setAlarm(Math.max(q[0].at, this.now()));
    else await this.storage.deleteAlarm();
  }

  /** Runs when the alarm fires: sends everything due, keeps the rest, re-arms for the next one. */
  async alarm(): Promise<void> {
    const now = this.now();
    const keep: QueueItem[] = [];
    for (const item of await this.queue()) {
      if (item.at > now) keep.push(item);
      else if (item.at >= now - STALE_MS) {
        const status = await this.send(item.device, item.body);
        if (status >= 500 && (item.tries ?? 0) < 2) keep.push({ ...item, at: now + 60_000, tries: (item.tries ?? 0) + 1 });
      }
    }
    await this.saveQueue(keep);
  }

  /** Delivers one encrypted message. Returns the push service's HTTP status (0 = unknown device). */
  private async send(deviceId: string, body: string): Promise<number> {
    const devices = await this.devices();
    const d = devices[deviceId];
    if (!d) return 0;
    const endpoint = new URL(d.sub.endpoint);
    const v = await this.vapid();
    let res: Response;
    try {
      res = await this.fetchFn(d.sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${await this.jwt(endpoint.origin, v)}, k=${v.publicKey}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '1800',
        Urgency: 'high',
      },
      body: fromB64url(body) as Uint8Array<ArrayBuffer>,
      });
    } catch {
      return 599; // network failure: treated like a server error, so it is retried
    }
    if (res.status === 404 || res.status === 410) {
      // The phone dropped this subscription; forget the device.
      delete devices[deviceId];
      await this.storage.put('devices', devices);
    }
    return res.status;
  }

  /** VAPID JWT (ES256) proving this server is the one the phone subscribed with. */
  async jwt(aud: string, v: Vapid): Promise<string> {
    const enc = (o: object) => toB64url(utf8(JSON.stringify(o)));
    const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({
      aud,
      exp: Math.floor(this.now() / 1000) + 3600,
      sub: this.subject,
    })}`;
    const key = await crypto.subtle.importKey('jwk', v.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(unsigned)));
    return `${unsigned}.${toB64url(sig)}`;
  }
}

