import type {
  BlockReminder, CutoffRule, DateKey, FixedBlock, Location, Ms, ScheduledItem, Settings, Task, Warning,
} from '../core/types';
import { DEFAULT_RULES, DEFAULT_SETTINGS, HOME } from '../core/defaults';
import { schedule } from '../core/scheduler';
import { addDays, at, dateKey, MIN } from '../core/time';
import { splitMinutes, type DoneRecord } from '../core/estimate';

export interface Plan {
  at: Ms;
  items: ScheduledItem[];
  warnings: Warning[];
  blockReminders: BlockReminder[];
}

export interface AppData {
  version: 1;
  tasks: Task[];
  blocks: FixedBlock[];
  locations: Location[];
  rules: CutoffRule[];
  settings: Settings;
  /** Actual time home from school, minutes after midnight, per date. */
  arrivals: Record<DateKey, number>;
  /** The saved plan. It only changes when something is added, edited or started, so times stay put. */
  plan: Plan | null;
  /** Notification setup for this phone; null when notifications are off. Never exported in backups. */
  push: PushState | null;
  /** Assignments timed with Start and Done, for learning real durations. */
  history: DoneRecord[];
  /** Late-night time unlocked by "Falling behind" for tonight. */
  night: { start: Ms; end: Ms } | null;
}

export interface PushState {
  /** Notification server URL, e.g. https://planner-push.name.workers.dev */
  url: string;
  deviceId: string;
  secret: string;
  /** This phone's push subscription keys, used to encrypt notifications before upload. */
  p256dh: string;
  auth: string;
  /** Fingerprint of the notifications last uploaded; differs when the server needs an update. */
  uploaded: string | null;
  uploadedAt: Ms | null;
  error: string | null;
}

export function emptyData(): AppData {
  return {
    version: 1,
    tasks: [],
    blocks: [],
    locations: [HOME],
    rules: DEFAULT_RULES,
    settings: DEFAULT_SETTINGS,
    arrivals: {},
    plan: null,
    push: null,
    history: [],
    night: null,
  };
}

/** Fills in anything missing from older saves or hand-edited backups. */
export function normalize(raw: Partial<AppData>): AppData {
  const base = emptyData();
  const { sync: _oldReminderSync, ...rest } = raw as Partial<AppData> & { sync?: unknown };
  return {
    ...base,
    ...rest,
    version: 1,
    settings: { ...base.settings, ...raw.settings },
    locations: raw.locations?.some((l) => l.id === HOME.id) ? raw.locations : [HOME, ...(raw.locations ?? [])],
    arrivals: raw.arrivals ?? {},
    plan: raw.plan ?? null,
    push: raw.push ?? null,
    history: raw.history ?? [],
    night: raw.night ?? null,
  };
}

export function replan(d: AppData, now: Ms, exactStart?: Ms): AppData {
  const night = d.night && d.night.end > now ? d.night : null;
  const r = schedule({
    exactStart,
    nightExtension: night ?? undefined,
    now,
    tasks: d.tasks,
    blocks: d.blocks,
    locations: d.locations,
    rules: d.rules,
    settings: d.settings,
    arrivals: d.arrivals,
  });
  return { ...d, night, plan: { at: now, ...r } };
}

const lateSet = (d: AppData) => {
  const ids = new Set(d.plan?.items.filter((i) => i.late).map((i) => i.taskId));
  for (const w of d.plan?.warnings ?? []) if (w.kind === 'unscheduled') ids.add(w.taskId);
  return ids;
};

export interface LateFix {
  data: AppData;
  skipBreak: boolean;
  night: boolean;
  /** The tasks this help is about: the moved one and any the move made late. */
  tasks: Task[];
}

/**
 * After a hand move, looks only at the moved task and tasks the move newly made late (work that was
 * already late beforehand is left to the overload banner). Finds the smallest help that gets more of
 * them on time: skip the 30-minute break before them, unlock tonight's late window (until 2am, only
 * when the move targets today), or both. Null when none of them is late or nothing helps.
 */
export function fixLateness(before: AppData, next: AppData, movedId: string, now: Ms, tonight: boolean): LateFix | null {
  const wasLate = lateSet(before);
  const relevant = [...lateSet(next)].filter((id) => id === movedId || !wasLate.has(id));
  if (!relevant.length) return null;
  const count = (d: AppData) => {
    const late = lateSet(d);
    return { relevant: relevant.filter((id) => late.has(id)).length, others: [...late].filter((id) => !wasLate.has(id) && !relevant.includes(id)).length };
  };
  const ids = [movedId, ...relevant];
  const night = nightWindow(next, now);
  const tries = [{ data: actions.setNoBreak(next, ids, true, now), skipBreak: true, night: false }];
  if (tonight) {
    tries.push({ data: replan({ ...next, night }, now), skipBreak: false, night: true });
    tries.push({ data: actions.setNoBreak({ ...next, night }, ids, true, now), skipBreak: true, night: true });
  }
  let best: (typeof tries)[number] | null = null;
  for (const t of tries) {
    const c = count(t.data);
    // Must help the relevant tasks without making anything else newly late.
    if (c.others === 0 && c.relevant < relevant.length && (!best || c.relevant < count(best.data).relevant)) best = t;
  }
  return best && { ...best, tasks: next.tasks.filter((t) => relevant.includes(t.id)) };
}

/** Tasks late in `after` that weren't late in `before`: what a move would newly make late. */
export function newlyLate(before: AppData, after: AppData): Task[] {
  const was = new Set(before.plan?.items.filter((i) => i.late).map((i) => i.taskId));
  const now = new Set(after.plan?.items.filter((i) => i.late).map((i) => i.taskId));
  for (const w of after.plan?.warnings ?? []) if (w.kind === 'unscheduled') now.add(w.taskId);
  return after.tasks.filter((t) => now.has(t.id) && !was.has(t.id));
}

/** Tonight's extra time: from the normal day end until the latest allowed (default 12am–2am). */
export function nightWindow(d: AppData, now: Ms): { start: Ms; end: Ms } {
  const today = dateKey(now);
  const { dayEndMin, latestNightMin } = d.settings;
  // Already past midnight: tonight's window is the one that started yesterday.
  if (now < at(today, latestNightMin)) return { start: at(addDays(today, -1), dayEndMin), end: at(today, latestNightMin) };
  return { start: at(today, dayEndMin), end: at(addDays(today, 1), latestNightMin) };
}

/** Replan when opening the app on a new day, so yesterday's leftovers move forward. */
export function refreshIfStale(d: AppData, now: Ms): AppData {
  return !d.plan || dateKey(d.plan.at) !== dateKey(now) ? replan(d, now) : d;
}

const patchTask = (d: AppData, id: string, patch: Partial<Task>): AppData => ({
  ...d,
  tasks: d.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
});

export const actions = {
  saveTask(d: AppData, task: Task, now: Ms): AppData {
    const exists = d.tasks.some((t) => t.id === task.id);
    return replan({ ...d, tasks: exists ? d.tasks.map((t) => (t.id === task.id ? task : t)) : [...d.tasks, task] }, now);
  },
  deleteTask(d: AppData, id: string, now: Ms): AppData {
    return replan({ ...d, tasks: d.tasks.filter((t) => t.id !== id) }, now);
  },
  startTask(d: AppData, id: string, now: Ms): AppData {
    return replan(patchTask(d, id, { status: 'inProgress', startedAt: now }), now);
  },
  /** Finishing early leaves free time: the plan is not recomputed. Timed automatic estimates feed learning. */
  completeTask(d: AppData, id: string, now: Ms): AppData {
    const t = d.tasks.find((x) => x.id === id);
    let history = d.history;
    if (t?.status === 'inProgress' && t.startedAt !== undefined && t.baseMin && !t.estimateManual) {
      history = [...history, { type: t.type, baseMin: t.baseMin, actualMin: Math.round((now - t.startedAt) / MIN), at: now }].slice(-200);
    }
    return { ...patchTask(d, id, { status: 'done', completedAt: now }), history };
  },
  /**
   * Falling behind: reschedules everything not started so the first one begins exactly 5 minutes
   * from now. Tonight may run past the day end (until 2am) but only for tasks that would otherwise be late.
   */
  fallingBehind(d: AppData, now: Ms): AppData {
    // Whole minutes: tapping at 6:03:27 starts the first task at 6:08, not 6:10.
    return replan({ ...d, night: nightWindow(d, now) }, now, Math.floor(now / MIN) * MIN + 5 * MIN);
  },
  /** Dragged onto a day: schedule it that day (or the next with room) and keep it there until undone. */
  moveToDay(d: AppData, id: string, day: DateKey, now: Ms): AppData {
    return replan(patchTask(d, id, { pinDay: day, pinOrder: undefined }), now);
  },
  /** Reordered by hand: every listed task is kept on `day` in this order. */
  reorderDay(d: AppData, day: DateKey, orderedIds: string[], now: Ms): AppData {
    const pos = new Map(orderedIds.map((id, i) => [id, i]));
    const tasks = d.tasks.map((t) => (pos.has(t.id) ? { ...t, pinDay: day, pinOrder: pos.get(t.id) } : t));
    return replan({ ...d, tasks }, now);
  },
  /** Skip (or restore) the break before these tasks. */
  setNoBreak(d: AppData, ids: string[], on: boolean, now: Ms): AppData {
    const set = new Set(ids);
    return replan({ ...d, tasks: d.tasks.map((t) => (set.has(t.id) ? { ...t, noBreakBefore: on || undefined } : t)) }, now);
  },
  /** "Let the app schedule it": drops a hand move. */
  unpin(d: AppData, id: string, now: Ms): AppData {
    return replan(patchTask(d, id, { pinDay: undefined, pinOrder: undefined }), now);
  },
  /** Replaces a big task with parts spread over several days. */
  splitTask(d: AppData, task: Task, now: Ms): AppData {
    const mins = splitMinutes(task.estimateMin);
    const group = task.group ?? task.id;
    const parts: Task[] = mins.map((m, i) => ({
      ...task,
      id: `${task.id}-p${i + 1}`,
      title: `${task.title} (part ${i + 1} of ${mins.length})`,
      estimateMin: m,
      baseMin: task.baseMin ? Math.max(5, Math.round(task.baseMin / mins.length)) : undefined,
      group,
      part: i + 1,
      parts: mins.length,
      createdAt: task.createdAt + i,
    }));
    return replan({ ...d, tasks: [...d.tasks.filter((t) => t.id !== task.id), ...parts] }, now);
  },
  reopenTask(d: AppData, id: string, now: Ms): AppData {
    return replan(patchTask(d, id, { status: 'todo', startedAt: undefined, completedAt: undefined }), now);
  },
  /** Notes never move anything. */
  setNotes(d: AppData, id: string, notes: string): AppData {
    return patchTask(d, id, { notes });
  },
  setArrival(d: AppData, key: DateKey, min: number | null, now: Ms): AppData {
    const arrivals = { ...d.arrivals };
    if (min === null) delete arrivals[key];
    else arrivals[key] = min;
    return replan({ ...d, arrivals }, now);
  },
  saveBlock(d: AppData, block: FixedBlock, now: Ms): AppData {
    const exists = d.blocks.some((b) => b.id === block.id);
    return replan({ ...d, blocks: exists ? d.blocks.map((b) => (b.id === block.id ? block : b)) : [...d.blocks, block] }, now);
  },
  deleteBlock(d: AppData, id: string, now: Ms): AppData {
    return replan({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }, now);
  },
  setLocations(d: AppData, locations: Location[], now: Ms): AppData {
    return replan({ ...d, locations }, now);
  },
  setRules(d: AppData, rules: CutoffRule[], now: Ms): AppData {
    return replan({ ...d, rules }, now);
  },
  setSettings(d: AppData, settings: Settings, now: Ms): AppData {
    return replan({ ...d, settings }, now);
  },
};

const BACKUP_APP = 'schedule-app-planner';

export function exportBackup(d: AppData, now: Ms): string {
  const data: AppData = { ...d, push: null }; // notification keys belong to this phone only
  return JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date(now).toISOString(), data }, null, 2);
}

/** Parses a backup file, keeping this phone's notification setup. Throws with a readable message if it isn't one. */
export function parseBackup(text: string, now: Ms, current: AppData | null = null): AppData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That file is not a backup (not valid JSON).');
  }
  const o = json as { app?: string; data?: Partial<AppData> };
  if (o?.app !== BACKUP_APP || typeof o.data !== 'object' || o.data === null) {
    throw new Error('That file is not a Schedule Planner backup.');
  }
  for (const key of ['tasks', 'blocks', 'locations', 'rules'] as const) {
    if (o.data[key] !== undefined && !Array.isArray(o.data[key])) throw new Error(`Backup is damaged: "${key}" is not a list.`);
  }
  return replan({ ...normalize(o.data), push: current?.push ?? null }, now);
}
