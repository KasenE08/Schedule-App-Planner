import type {
  BlockReminder, CutoffRule, DateKey, FixedBlock, Location, Ms, ScheduledItem, Settings, Task, Warning,
} from '../core/types';
import { DEFAULT_RULES, DEFAULT_SETTINGS, HOME } from '../core/defaults';
import { schedule } from '../core/scheduler';
import { dateKey } from '../core/time';

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
  };
}

/** Fills in anything missing from older saves or hand-edited backups. */
export function normalize(raw: Partial<AppData>): AppData {
  const base = emptyData();
  return {
    ...base,
    ...raw,
    version: 1,
    settings: { ...base.settings, ...raw.settings },
    locations: raw.locations?.some((l) => l.id === HOME.id) ? raw.locations : [HOME, ...(raw.locations ?? [])],
    arrivals: raw.arrivals ?? {},
    plan: raw.plan ?? null,
  };
}

export function replan(d: AppData, now: Ms): AppData {
  const r = schedule({
    now,
    tasks: d.tasks,
    blocks: d.blocks,
    locations: d.locations,
    rules: d.rules,
    settings: d.settings,
    arrivals: d.arrivals,
  });
  return { ...d, plan: { at: now, ...r } };
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
  /** Finishing early leaves free time: the plan is not recomputed. */
  completeTask(d: AppData, id: string, now: Ms): AppData {
    return patchTask(d, id, { status: 'done', completedAt: now });
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
  return JSON.stringify({ app: BACKUP_APP, version: 1, exportedAt: new Date(now).toISOString(), data: d }, null, 2);
}

/** Parses a backup file. Throws with a readable message if it isn't one. */
export function parseBackup(text: string, now: Ms): AppData {
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
  return replan(normalize(o.data), now);
}
