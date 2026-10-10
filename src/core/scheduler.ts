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

interface State {
  prev: Prev | null;
  floor: Ms;
}

interface Run {
  items: ScheduledItem[];
  warnings: Warning[];
}

/**
 * Places every unfinished task into free time, in priority order (due date, then category).
 * A lower-priority task may fill a gap first only if doing so never delays the top task.
 * Missing work goes as soon as possible unless that would make a dated task late.
 * Tasks are placed in time order, so breaks are always measured from the previous task.
 */
export function schedule(input: ScheduleInput): ScheduleResult {
  const { now, settings: s } = input;
  const free = freeTime(input, dateKey(now), s.horizonDays);
  const isShort = (t: Task) => t.estimateMin <= s.shortTaskMaxMin;

  const fixed: ScheduledItem[] = [];
  let state: State = { prev: null, floor: now };

  // A task already started holds its slot; it is the previous task for break purposes.
  for (const t of input.tasks.filter((t) => t.status === 'inProgress' && t.startedAt !== undefined)) {
    const end = Math.max(t.startedAt! + t.estimateMin * MIN, now + s.slotRoundMin * MIN);
    fixed.push({ taskId: t.id, start: t.startedAt!, end, late: t.due !== null && end > t.due });
    if (!state.prev || end > state.prev.end) state = { ...state, prev: { end, short: isShort(t), paired: false } };
    const busy = { start: t.startedAt!, end };
    free.all = free.all.flatMap((iv) => cut(iv, busy));
    free.schoolwork = free.schoolwork.flatMap((iv) => cut(iv, busy));
  }

  const gap = (p: Prev | null, t: Task) => {
    if (!p) return 0;
    return p.short && !p.paired && isShort(t) ? s.shortPairBreakMin : s.breakMin;
  };
  const startFor = (t: Task, st: State) =>
    earliestFit(
      isSchoolwork(t) ? free.schoolwork : free.all,
      st.prev ? Math.max(st.floor, st.prev.end + gap(st.prev, t) * MIN) : st.floor,
      t.estimateMin * MIN,
      s.slotRoundMin,
    );
  const after = (t: Task, start: Ms, st: State): State => {
    const end = start + t.estimateMin * MIN;
    const paired = !!st.prev && isShort(t) && gap(st.prev, t) === s.shortPairBreakMin;
    return { prev: { end, short: isShort(t), paired }, floor: end };
  };
  const lateIds = (r: Run) => new Set(r.items.filter((i) => i.late).map((i) => i.taskId));

  /** Missing work may go first only if no dated task becomes late because of it. */
  const pickTop = (queue: Task[], st: State): number => {
    if (queue[0].due !== null) return 0;
    const firstDated = queue.findIndex((t) => t.due !== null);
    if (firstDated === -1) return 0;
    const start = startFor(queue[0], st);
    if (start === null) return 0;
    const dated = queue.filter((t) => t.due !== null);
    const before = lateIds(greedy(dated, st, false));
    const withMissing = lateIds(greedy(dated, after(queue[0], start, st), false));
    return [...withMissing].some((id) => !before.has(id)) ? firstDated : 0;
  };

  function greedy(tasks: Task[], st: State, checkMissing: boolean): Run {
    const items: ScheduledItem[] = [];
    const warnings: Warning[] = [];
    const queue = [...tasks];
    while (queue.length) {
      const topIdx = checkMissing ? pickTop(queue, st) : 0;
      const top = queue[topIdx];
      const topStart = startFor(top, st);
      if (topStart === null) {
        warnings.push({ kind: 'unscheduled', taskId: top.id });
        queue.splice(topIdx, 1);
        continue;
      }
      let chosen = topIdx;
      let chosenStart = topStart;
      for (let i = 0; i < queue.length; i++) {
        if (i === topIdx) continue;
        const cs = startFor(queue[i], st);
        if (cs === null) continue;
        const next = after(queue[i], cs, st);
        if (next.floor + gap(next.prev, top) * MIN <= topStart) {
          chosen = i;
          chosenStart = cs;
          break;
        }
      }
      const t = queue[chosen];
      const end = chosenStart + t.estimateMin * MIN;
      const late = t.due !== null && end > t.due;
      items.push({ taskId: t.id, start: chosenStart, end, late });
      if (late) warnings.push({ kind: 'late', taskId: t.id, due: t.due!, end });
      st = after(t, chosenStart, st);
      queue.splice(chosen, 1);
    }
    return { items, warnings };
  }

  const run = greedy(input.tasks.filter((t) => t.status === 'todo').sort(comparePriority), state, true);
  return { items: [...fixed, ...run.items], blockReminders: blockReminders(input), warnings: run.warnings };
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
