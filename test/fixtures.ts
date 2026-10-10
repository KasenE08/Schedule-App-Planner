import type { FixedBlock, Location, ScheduleInput, Task } from '../src/core/types';
import { DEFAULT_RULES, DEFAULT_SETTINGS, HOME } from '../src/core/defaults';
import { at, dateKey } from '../src/core/time';

// A sample week shaped like the real one, with generic place names.
export const MON = '2026-10-12';
export const TUE = '2026-10-13';
export const WED = '2026-10-14';
export const THU = '2026-10-15';
export const FRI = '2026-10-16';
export const SAT = '2026-10-17';
export const SUN = '2026-10-18';

export const LOCATIONS: Location[] = [
  HOME,
  { id: 'school', name: 'School', fromHomeMin: 20, toHomeMin: 15 },
  { id: 'library', name: 'Library', fromHomeMin: 25, toHomeMin: 15 },
  { id: 'work', name: 'Work', fromHomeMin: 15, toHomeMin: 10 },
  { id: 'range', name: 'Archery Range', fromHomeMin: 30, toHomeMin: 15 },
];

const hm = (h: number, m = 0) => h * 60 + m;
const weekly = (...weekdays: number[]) => ({ kind: 'weekly' as const, weekdays });

export const BLOCKS: FixedBlock[] = [
  { id: 'school', title: 'School', tag: 'school', locationId: 'school', startMin: hm(9), endMin: hm(14, 47), recurrence: weekly(1, 2, 3, 4) },
  { id: 'school-fri', title: 'School', tag: 'school', locationId: 'school', startMin: hm(10, 48), endMin: hm(14, 47), recurrence: weekly(5) },
  { id: 'gym', title: 'Gym', tag: 'gym', locationId: 'home', startMin: hm(20), endMin: hm(21), recurrence: weekly(1, 2, 3, 4, 5) },
  { id: 'act', title: 'ACT Tutoring', tag: 'tutoring', locationId: 'library', startMin: hm(16, 30), endMin: hm(17, 30), recurrence: weekly(1) },
  { id: 'precalc', title: 'Pre-Calculus Tutoring', tag: 'tutoring', locationId: 'library', startMin: hm(18), endMin: hm(19), recurrence: weekly(2) },
  { id: 'archery', title: 'Archery', tag: 'activity', locationId: 'range', startMin: hm(18), endMin: hm(19), recurrence: weekly(3, 5) },
  { id: 'work-sat', title: 'Work', tag: 'work', locationId: 'work', startMin: hm(17), endMin: hm(23), recurrence: weekly(6) },
  { id: 'work-sun', title: 'Work', tag: 'work', locationId: 'work', startMin: hm(10, 30), endMin: hm(15), recurrence: weekly(0) },
  {
    id: 'laundry', title: 'Laundry', tag: 'chore', locationId: 'home', startMin: hm(15, 30), endMin: hm(17, 30), recurrence: weekly(0),
    steps: [
      { offsetMin: 0, title: 'Put laundry in washer' },
      { offsetMin: 60, title: 'Move laundry to dryer' },
      { offsetMin: 120, title: 'Take laundry out of dryer' },
    ],
  },
];

/** Local time on a date from 'HH:MM'. */
export const T = (key: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return at(key, h * 60 + m);
};

/** Formats an instant as 'YYYY-MM-DD HH:MM' local. */
export const fmt = (ms: number) => {
  const d = new Date(ms);
  return `${dateKey(ms)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

let seq = 0;
export function task(p: Partial<Task> & { estimateMin: number }): Task {
  seq++;
  return {
    id: p.id ?? `t${seq}`,
    title: p.title ?? `Task ${seq}`,
    type: 'worksheet',
    formats: ['online'],
    missing: false,
    due: T(SUN, '23:59') + 14 * 86_400_000,
    status: 'todo',
    createdAt: seq,
    ...p,
  };
}

export function input(now: number, tasks: Task[], extra: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    now,
    tasks,
    blocks: BLOCKS,
    locations: LOCATIONS,
    rules: DEFAULT_RULES,
    settings: DEFAULT_SETTINGS,
    ...extra,
  };
}
