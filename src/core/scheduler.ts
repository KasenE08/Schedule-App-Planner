import type { BlockReminder, Interval, Ms, ScheduleInput, ScheduleResult, ScheduledItem, Task, Warning } from './types';
import { addDays, at, ceilTo, dateKey, MIN } from './time';
import { freeTime, occurrencesOn } from './availability';
import { comparePriority, isSchoolwork } from './priority';

interface Prev {
  end: Ms;
  short: boolean;
  /** True once this short task has already been paired with the one before it. */
  paired: boolean;
}

/** Earliest grid-aligned start ≥ from where `dur` fits fully inside one free interval. */
function earliestFit(free: Interval[], from: Ms, dur: Ms, gridMin: number): Ms | null {
  for (const iv of free) {
    if (iv.end <= from) continue;
    const s = ceilTo(Math.max(iv.start, from), gridMin);
    if (s + dur <= iv.end) return s;
  }
  return null;
}

/**
 * Places every unfinished task into free time, in priority order (due date, then category).
 * A lower-priority task may fill a gap first only if doing so never delays the top task.
 * Tasks are placed in time order, so breaks are always measured from the previous task.
 */
export function schedule(input: ScheduleInput): ScheduleResult {
  const { now, settings: s } = input;
  const today = dateKey(now);
  const free = freeTime(input, today, s.horizonDays);
  const isShort = (t: Task) => t.estimateMin <= s.shortTaskMaxMin;

  const items: ScheduledItem[] = [];
  const warnings: Warning[] = [];
  let prev: Prev | null = null;
  let floor = now;

  // A task already started holds its slot; it is the previous task for break purposes.
  for (const t of input.tasks.filter((t) => t.status === 'inProgress' && t.startedAt !== undefined)) {
    const end = Math.max(t.startedAt! + t.estimateMin * MIN, now + s.slotRoundMin * MIN);
    items.push({ taskId: t.id, start: t.startedAt!, end, late: t.due !== null && end > t.due });
    if (!prev || end > prev.end) prev = { end, short: isShort(t), paired: false };
    const busy = { start: t.startedAt!, end };
    free.all = free.all.flatMap((iv) => cut(iv, busy));
    free.schoolwork = free.schoolwork.flatMap((iv) => cut(iv, busy));
  }

  const gap = (p: Prev | null, t: Task) => {
    if (!p) return 0;
    return p.short && !p.paired && isShort(t) ? s.shortPairBreakMin : s.breakMin;
  };
  const startFor = (t: Task, p: Prev | null) =>
    earliestFit(
      isSchoolwork(t) ? free.schoolwork : free.all,
      Math.max(floor, p ? p.end + gap(p, t) * MIN : floor),
      t.estimateMin * MIN,
      s.slotRoundMin,
    );
  const place = (t: Task, start: Ms) => {
    const end = start + t.estimateMin * MIN;
    const late = t.due !== null && end > t.due;
    items.push({ taskId: t.id, start, end, late });
    if (late) warnings.push({ kind: 'late', taskId: t.id, due: t.due!, end });
    prev = { end, short: isShort(t), paired: !!prev && gap(prev, t) === s.shortPairBreakMin && isShort(t) };
    floor = end;
  };

  const queue = input.tasks.filter((t) => t.status === 'todo').sort(comparePriority);
  while (queue.length) {
    const top = queue[0];
    const topStart = startFor(top, prev);
    if (topStart === null) {
      warnings.push({ kind: 'unscheduled', taskId: top.id });
      queue.shift();
      continue;
    }
    let chosen = 0;
    let chosenStart = topStart;
    for (let i = 1; i < queue.length; i++) {
      const c = queue[i];
      const cs = startFor(c, prev);
      if (cs === null) continue;
      const after: Prev = {
        end: cs + c.estimateMin * MIN,
        short: isShort(c),
        paired: !!prev && gap(prev, c) === s.shortPairBreakMin && isShort(c),
      };
      if (after.end + gap(after, top) * MIN <= topStart) {
        chosen = i;
        chosenStart = cs;
        break;
      }
    }
    place(queue[chosen], chosenStart);
    queue.splice(chosen, 1);
  }

  return { items, blockReminders: blockReminders(input), warnings };
}

function cut(iv: Interval, busy: Interval): Interval[] {
  if (busy.end <= iv.start || busy.start >= iv.end) return [iv];
  return [
    ...(busy.start > iv.start ? [{ start: iv.start, end: busy.start }] : []),
    ...(busy.end < iv.end ? [{ start: busy.end, end: iv.end }] : []),
  ];
}

/** Step reminders (e.g. laundry washer/dryer) for upcoming block occurrences. */
export function blockReminders(input: ScheduleInput): BlockReminder[] {
  const out: BlockReminder[] = [];
  const today = dateKey(input.now);
  for (let i = 0; i < input.settings.horizonDays; i++) {
    const key = addDays(today, i);
    for (const o of occurrencesOn(key, input.blocks, input.locations, input.arrivals)) {
      for (const step of o.block.steps ?? []) {
        const t = at(key, o.block.startMin + step.offsetMin);
        if (t >= input.now) out.push({ blockId: o.block.id, title: step.title, at: t });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
