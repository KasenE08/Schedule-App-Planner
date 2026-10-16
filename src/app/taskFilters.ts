import type { Ms, Task } from '../core/types';
import { addDays, dateKey } from '../core/time';
import { comparePriority } from '../core/priority';
import type { AppData } from './model';

export type View = 'all' | 'today' | 'upcoming' | 'late' | 'done';
export type Cat = 'online' | 'paper' | 'missing' | 'other';

export const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'late', label: 'Late' },
  { id: 'done', label: 'Completed' },
];

export const CATS: { id: Cat; label: string }[] = [
  { id: 'online', label: 'Online' },
  { id: 'paper', label: 'Paper' },
  { id: 'missing', label: 'Missing' },
  { id: 'other', label: 'Other' },
];

const inCat = (t: Task, c: Cat) =>
  c === 'online' ? t.formats.includes('online') : c === 'paper' ? t.formats.includes('paper') : c === 'missing' ? t.missing : t.formats.length === 0;

/**
 * Tasks for a Tasks-screen view. Today = planned today or in progress; Upcoming = planned in the
 * 7 days after today; Late = can't finish before it's due (or fits nowhere); Completed = done,
 * newest first. Category chips narrow the list (any selected category matches; none = all).
 */
export function filterTasks(d: AppData, view: View, cats: Cat[], now: Ms): Task[] {
  const today = dateKey(now);
  const weekEnd = addDays(today, 7);
  const slot = new Map((d.plan?.items ?? []).map((i) => [i.taskId, i]));
  const late = new Set([
    ...(d.plan?.items ?? []).filter((i) => i.late).map((i) => i.taskId),
    ...(d.plan?.warnings ?? []).filter((w) => w.kind === 'unscheduled').map((w) => w.taskId),
  ]);
  const byCat = (t: Task) => !cats.length || cats.some((c) => inCat(t, c));

  if (view === 'done') {
    return d.tasks
      .filter((t) => t.status === 'done' && byCat(t))
      .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .slice(0, 50);
  }
  const open = d.tasks.filter((t) => t.status !== 'done' && byCat(t));
  const day = (t: Task) => {
    const s = slot.get(t.id);
    return s ? dateKey(s.start) : null;
  };
  const pick =
    view === 'today'
      ? open.filter((t) => t.status === 'inProgress' || day(t) === today)
      : view === 'upcoming'
        ? open.filter((t) => {
            const k = day(t);
            return k !== null && k > today && k <= weekEnd;
          })
        : view === 'late'
          ? open.filter((t) => late.has(t.id))
          : open;
  return pick.sort(comparePriority);
}
