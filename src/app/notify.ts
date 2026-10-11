import type { Ms } from '../core/types';
import { addDays, at, dateKey } from '../core/time';
import { encryptPayload } from '../push/webpush';
import { fromB64url, toB64url, utf8 } from '../push/b64';
import type { AppData, PushState } from './model';
import { fmtDue, fmtDur, fmtTime } from './format';

export interface Note {
  at: Ms;
  title: string;
  body: string;
  /** Task to open when the notification is tapped. */
  taskId?: string;
  tag: string;
}

/**
 * Notifications for every unfinished planned task (at its start time) and each step reminder,
 * from the start of today through `notifyDays`. Deterministic, so it doubles as the
 * "does the server need an update" fingerprint.
 */
export function notifications(d: AppData, now: Ms): Note[] {
  if (!d.plan) return [];
  const today = dateKey(now);
  const from = at(today, 0);
  const to = at(addDays(today, d.settings.notifyDays), 0);
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const out: Note[] = [];
  for (const i of d.plan.items) {
    const t = tasks.get(i.taskId);
    if (!t || t.status !== 'todo' || i.start < from || i.start >= to) continue;
    out.push({
      at: i.start,
      title: t.title,
      body: [
        `Start now · ${fmtTime(i.start)}–${fmtTime(i.end)} (${fmtDur(t.estimateMin)})`,
        t.due === null ? 'Missing: as soon as possible' : `Due ${fmtDue(t.due)}`,
        i.late ? "Can't finish before it's due" : null,
      ]
        .filter(Boolean)
        .join('\n'),
      taskId: t.id,
      tag: `task-${t.id}`,
    });
  }
  for (const r of d.plan.blockReminders) {
    if (r.at < from || r.at >= to) continue;
    const block = d.blocks.find((b) => b.id === r.blockId);
    out.push({ at: r.at, title: r.title, body: block?.title ?? '', tag: `step-${r.blockId}-${r.at}` });
  }
  return out.sort((a, b) => a.at - b.at);
}

export const fingerprint = (notes: Note[]) => JSON.stringify(notes);

/** Encrypts each upcoming notification for this phone. The server only ever sees times and ciphertext. */
export async function encryptNotes(notes: Note[], push: Pick<PushState, 'p256dh' | 'auth'>, now: Ms) {
  const ua = fromB64url(push.p256dh);
  const auth = fromB64url(push.auth);
  return Promise.all(
    notes
      .filter((n) => n.at > now)
      .map(async (n) => ({
        at: n.at,
        body: toB64url(await encryptPayload(utf8(JSON.stringify({ title: n.title, body: n.body, tag: n.tag, taskId: n.taskId })), ua, auth)),
      })),
  );
}
