import type { DateKey, FixedBlock, Recurrence } from './types';
import { dayOfMonth, daysInMonth, weekday } from './time';

function matches(rec: Recurrence, key: DateKey): boolean {
  switch (rec.kind) {
    case 'once':
      return rec.date === key;
    case 'daily':
      return true;
    case 'weekly':
      return rec.weekdays.includes(weekday(key));
    case 'monthlyDate':
      return dayOfMonth(key) === Math.min(rec.day, daysInMonth(key));
    case 'monthlyNth': {
      if (weekday(key) !== rec.weekday) return false;
      const d = dayOfMonth(key);
      if (rec.nth === -1) return d + 7 > daysInMonth(key);
      return Math.ceil(d / 7) === rec.nth;
    }
  }
}

export function occursOn(block: FixedBlock, key: DateKey): boolean {
  if (block.startDate && key < block.startDate) return false;
  if (block.endDate && key > block.endDate) return false;
  if (block.skipDates?.includes(key)) return false;
  return matches(block.recurrence, key);
}
