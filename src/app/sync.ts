import type { Ms } from '../core/types';
import { addDays, at, dateKey } from '../core/time';
import type { AppData } from './model';
import { category, fmtDue, fmtDur, fmtTime } from './format';

export const SHORTCUT_NAME = 'Planner Sync';
export const RESULT_PREFIX = 'planner-sync-done:';
const TAG = (id: string) => `[planner:${id}]`;

export interface ReminderItem {
  /** App task id, or `step-…` (unique per occurrence) for fixed-block step reminders like laundry. */
  id: string;
  title: string;
  /** Reminder time as text the Shortcuts app reads as a date, e.g. "October 12, 2026 at 5:45 PM". */
  remind: string;
  notes: string;
}

/** Shortcuts parses this English form reliably on any device. */
export const remindText = (t: Ms) =>
  new Date(t).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Reminders for every unfinished planned task and step reminder from the start of today
 * through `syncDays` days ahead, in time order. Deterministic, so it doubles as the
 * "is Reminders out of date" fingerprint.
 */
export function reminderItems(d: AppData, now: Ms): ReminderItem[] {
  if (!d.plan) return [];
  const today = dateKey(now);
  const from = at(today, 0);
  const to = at(addDays(today, d.settings.syncDays), 0);
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const out: (ReminderItem & { at: Ms })[] = [];

  for (const i of d.plan.items) {
    const t = tasks.get(i.taskId);
    if (!t || t.status === 'done' || i.start < from || i.start >= to) continue;
    const due = t.due === null ? 'missing' : `due ${fmtDue(t.due)}`;
    out.push({
      at: i.start,
      id: t.id,
      title: `${t.title} · ${due}`,
      remind: remindText(i.start),
      notes: [
        `Do: ${fmtTime(i.start)}–${fmtTime(i.end)} (${fmtDur(t.estimateMin)})`,
        t.due === null ? 'Missing: as soon as possible' : `Due: ${fmtDue(t.due)}`,
        `Category: ${category(t).label}`,
        i.late ? "Warning: can't finish before it's due" : null,
        t.notes ? `\n${t.notes}` : null,
        `\n${TAG(t.id)}`,
      ]
        .filter((x) => x !== null)
        .join('\n'),
    });
  }
  for (const r of d.plan.blockReminders) {
    if (r.at < from || r.at >= to) continue;
    const id = `step-${r.blockId}-${r.at}`;
    out.push({ at: r.at, id, title: r.title, remind: remindText(r.at), notes: TAG(id) });
  }
  return out.sort((a, b) => a.at - b.at).map(({ at: _, ...item }) => item);
}

export function buildPayload(d: AppData, now: Ms): string {
  return JSON.stringify({ app: 'schedule-app-planner', items: reminderItems(d, now) });
}

export const isOutOfDate = (d: AppData, now: Ms) => d.sync.payload !== buildPayload(d, now);

export function markSent(d: AppData, payload: string, now: Ms): AppData {
  return { ...d, sync: { payload, at: now, pending: true } };
}

/** Task ids the Shortcut reported as checked off, or null if the text isn't a sync result. */
export function parseSyncResult(text: string): string[] | null {
  const s = text.trim();
  if (!s.startsWith(RESULT_PREFIX)) return null;
  return s
    .slice(RESULT_PREFIX.length)
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter((x) => x && !x.startsWith('step-'));
}

/** Marks reported tasks done (no replan: finishing leaves free time) and clears the pending flag. */
export function applyCompletions(d: AppData, ids: string[], now: Ms): { data: AppData; count: number } {
  const set = new Set(ids);
  let count = 0;
  const tasks = d.tasks.map((t) => {
    if (!set.has(t.id) || t.status === 'done') return t;
    count++;
    return { ...t, status: 'done' as const, completedAt: now };
  });
  return { data: { ...d, tasks, sync: { ...d.sync, payload: withoutIds(d.sync.payload, set), pending: false } }, count };
}

/** What Reminders holds after the Shortcut skipped the checked-off tasks. */
function withoutIds(payload: string | null, ids: Set<string>): string | null {
  if (!payload) return payload;
  try {
    const p = JSON.parse(payload) as { app: string; items: ReminderItem[] };
    return JSON.stringify({ app: p.app, items: p.items.filter((i) => !ids.has(i.id)) });
  } catch {
    return null;
  }
}
