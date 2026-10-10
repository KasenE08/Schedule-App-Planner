import type { AssignmentType, BlockTag, DateKey, Ms, Recurrence, Task } from '../core/types';
import { at } from '../core/time';
import { categoryRank } from '../core/priority';

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtTime(ms: Ms): string {
  const d = new Date(ms);
  const h = d.getHours();
  return `${h % 12 || 12}:${pad(d.getMinutes())}${h < 12 ? 'am' : 'pm'}`;
}

export const fmtMin = (min: number) => fmtTime(at('2000-01-01', min));

/** Minutes after midnight → 'HH:MM' for <input type="time">. */
export const minToInput = (min: number) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;

export function inputToMin(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDay(key: DateKey | Ms, opts: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const d = typeof key === 'string' ? new Date(at(key, 0)) : new Date(key);
  return d.toLocaleDateString(undefined, opts);
}

export const fmtDue = (ms: Ms) => `${fmtDay(ms)}, ${fmtTime(ms)}`;

export function fmtDur(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export const CATEGORIES = [
  { label: 'Online', color: 'var(--c-online)' },
  { label: 'Online · Missing', color: 'var(--c-online-missing)' },
  { label: 'Paper', color: 'var(--c-paper)' },
  { label: 'Paper · Missing', color: 'var(--c-paper-missing)' },
  { label: 'Other', color: 'var(--c-other)' },
];

export const category = (t: Task) => CATEGORIES[categoryRank(t)];

export const TYPE_LABELS: Record<AssignmentType, string> = {
  worksheet: 'Worksheet',
  reading: 'Reading',
  essay: 'Essay',
  project: 'Project',
  quizStudy: 'Quiz study',
  testStudy: 'Test study',
  discussion: 'Discussion post',
  onlineQuiz: 'Online quiz',
  lab: 'Lab',
  presentation: 'Presentation',
  errand: 'Errand',
  other: 'Other',
};

export const TAG_LABELS: Record<BlockTag, string> = {
  school: 'School',
  work: 'Work shift',
  gym: 'Workout',
  tutoring: 'Tutoring',
  activity: 'Activity',
  chore: 'Chore',
  other: 'Other',
};

/** e.g. [1,2,3,4] → 'Mon–Thu', [3,5] → 'Wed, Fri'. */
export function weekdaysText(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (s.length === 7) return 'Every day';
  const runs: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    runs.push(j - i >= 2 ? `${WEEKDAYS[s[i]]}–${WEEKDAYS[s[j]]}` : s.slice(i, j + 1).map((d) => WEEKDAYS[d]).join(', '));
    i = j + 1;
  }
  return runs.join(', ');
}

const ORD = ['', '1st', '2nd', '3rd', '4th', '5th'];

export function recurrenceText(r: Recurrence): string {
  switch (r.kind) {
    case 'once':
      return fmtDay(r.date);
    case 'daily':
      return 'Every day';
    case 'weekly':
      return weekdaysText(r.weekdays);
    case 'monthlyDate':
      return `Monthly on day ${r.day}`;
    case 'monthlyNth':
      return `${r.nth === -1 ? 'Last' : ORD[r.nth]} ${WEEKDAYS[r.weekday]} monthly`;
  }
}

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
