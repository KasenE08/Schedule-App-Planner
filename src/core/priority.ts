import type { Task } from './types';

/**
 * 0 Online-Normal, 1 Online-Missing, 2 Paper-Normal, 3 Paper-Missing, 4 Other.
 * A task in several categories takes the highest (lowest number).
 */
export function categoryRank(t: Pick<Task, 'formats' | 'missing'>): number {
  if (t.formats.length === 0) return 4;
  return Math.min(...t.formats.map((f) => (f === 'online' ? 0 : 2) + (t.missing ? 1 : 0)));
}

export function isSchoolwork(t: Pick<Task, 'formats'>): boolean {
  return t.formats.length > 0;
}

/** Due date first (ASAP before any date), category breaks ties. */
export function comparePriority(a: Task, b: Task): number {
  const da = a.due ?? -Infinity;
  const db = b.due ?? -Infinity;
  if (da !== db) return da < db ? -1 : 1;
  return categoryRank(a) - categoryRank(b) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}
