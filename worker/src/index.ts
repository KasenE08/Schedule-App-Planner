// Cloudflare Worker entry: CORS + routing into a single Durable Object that holds the queue
// and uses its alarm to send each notification on time.
import { Hub, type Storage } from './hub';

interface Env {
  PUSH: { idFromName(name: string): unknown; get(id: unknown): { fetch(req: Request): Promise<Response> } };
  VAPID_SUBJECT: string;
}

interface DurableState {
  storage: Storage;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const res = await env.PUSH.get(env.PUSH.idFromName('main')).fetch(req);
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  },
};

export class PushHub {
  private hub: Hub;
  constructor(state: DurableState, env: Env) {
    this.hub = new Hub(state.storage, env.VAPID_SUBJECT);
  }
  fetch(req: Request) {
    return this.hub.handle(req);
  }
  alarm() {
    return this.hub.alarm();
  }
}
