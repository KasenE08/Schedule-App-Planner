import type { DateKey, Interval, Ms } from './types';

export const MIN = 60_000;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(t: Ms | Date): DateKey {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parts(key: DateKey): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number);
  return [y, m - 1, d];
}

/** Local wall-clock time on `key`, `min` minutes after midnight (DST-safe; may roll into next day). */
export function at(key: DateKey, min: number): Ms {
  const [y, m, d] = parts(key);
  return new Date(y, m, d, Math.floor(min / 60), min % 60).getTime();
}

export function addDays(key: DateKey, n: number): DateKey {
  const [y, m, d] = parts(key);
  return dateKey(new Date(y, m, d + n));
}

export function weekday(key: DateKey): number {
  const [y, m, d] = parts(key);
  return new Date(y, m, d).getDay();
}

export function dayOfMonth(key: DateKey): number {
  return parts(key)[2];
}

export function daysInMonth(key: DateKey): number {
  const [y, m] = parts(key);
  return new Date(y, m + 1, 0).getDate();
}

export function ceilTo(t: Ms, gridMin: number): Ms {
  const g = gridMin * MIN;
  return Math.ceil(t / g) * g;
}

/** Remove `cuts` from `base`. Both may be unsorted; result is sorted and non-empty intervals only. */
export function subtract(base: Interval[], cuts: Interval[]): Interval[] {
  const sorted = [...cuts].filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const iv of [...base].sort((a, b) => a.start - b.start)) {
    let cur = iv.start;
    for (const c of sorted) {
      if (c.end <= cur || c.start >= iv.end) continue;
      if (c.start > cur) out.push({ start: cur, end: c.start });
      cur = Math.max(cur, c.end);
      if (cur >= iv.end) break;
    }
    if (cur < iv.end) out.push({ start: cur, end: iv.end });
  }
  return out;
}
