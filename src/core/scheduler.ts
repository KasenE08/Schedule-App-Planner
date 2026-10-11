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

interface State {
  prev: Prev | null;
  floor: Ms;
  /** Parts of split tasks placed so far: group → part → end time. */
  parts: Map<string, Map<number, Ms>>;
  /** Ids placed so far. */
  placed: Set<string>;
}

interface Run {
  items: ScheduledItem[];
  warnings: Warning[];
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

/** Sorted union of intervals, joining ones that touch (so a task can run 11:30pm–12:30am). */
function merge(a: Interval[], b: Interval[]): Interval[] {
  const all = [...a, ...b].sort((x, y) => x.start - y.start);
  const out: Interval[] = [];
  for (const iv of all) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ ...iv });
  }
  return out;
}

function cut(iv: Interval, busy: Interval): Interval[] {
  if (busy.end <= iv.start || busy.start >= iv.end) return [iv];
  return [
    ...(busy.start > iv.start ? [{ start: iv.start, end: busy.start }] : []),
    ...(busy.end < iv.end ? [{ start: busy.end, end: iv.end }] : []),
  ];
}

const lateIds = (r: Run) => new Set(r.items.filter((i) => i.late).map((i) => i.taskId));

/**
 * Places every unfinished task into free time, in priority order (due date, then category).
 * A lower-priority task may fill a gap first only if doing so never delays the top task.
 * Missing work goes as soon as possible unless that would make a dated task late.
 * Parts of a split task go in order, one per day, unless that would make them late.
 * With a night extension, only tasks that would otherwise be late may use it.
 */
export function schedule(input: ScheduleInput): ScheduleResult {
  const plan = (allowNight: Set<string>) => run(input, allowNight);
  let result = plan(new Set());
  if (input.nightExtension) {
    const late = lateIds(result);
    if (late.size) {
      const extended = plan(late);
      if (lateIds(extended).size < late.size) result = extended;
    }
  }
  return { ...result, blockReminders: blockReminders(input) };
}

function run(input: ScheduleInput, allowNight: Set<string>): Run {
  const { now, settings: s } = input;
  const free = freeTime(input, dateKey(now), s.horizonDays);
  const night = input.nightExtension ? [input.nightExtension] : [];
  const isShort = (t: Task) => t.estimateMin <= s.shortTaskMaxMin;

  const fixed: ScheduledItem[] = [];
  let state: State = { prev: null, floor: input.exactStart ?? now, parts: new Map(), placed: new Set() };

  // A task already started holds its slot; it is the previous task for break purposes.
  for (const t of input.tasks.filter((t) => t.status === 'inProgress' && t.startedAt !== undefined)) {
    const end = Math.max(t.startedAt! + t.estimateMin * MIN, now + s.slotRoundMin * MIN);
    fixed.push({ taskId: t.id, start: t.startedAt!, end, late: t.due !== null && end > t.due });
    if (!state.prev || end > state.prev.end) state = { ...state, prev: { end, short: isShort(t), paired: false } };
    const busy = { start: t.startedAt!, end };
    free.all = free.all.flatMap((iv) => cut(iv, busy));
    free.schoolwork = free.schoolwork.flatMap((iv) => cut(iv, busy));
  }
  const nightFree = {
    all: merge(free.all, night),
    schoolwork: merge(free.schoolwork, night),
  };
  const freeFor = (t: Task) => {
    const scope = isSchoolwork(t) ? 'schoolwork' : 'all';
    return allowNight.has(t.id) ? nightFree[scope] : free[scope];
  };

  /** A part may be placed only after every earlier part is done, started or placed. */
  const finishedPart = (group: string, part: number) =>
    input.tasks.some((x) => x.group === group && x.part === part && x.status !== 'todo');
  // Hand moves: a pin to a past day no longer applies.
  const today = dateKey(now);
  const pinOf = (t: Task) => (t.pinDay && t.pinDay >= today ? t.pinDay : undefined);
  const pinnedBefore = (t: Task) =>
    pinOf(t) !== undefined && t.pinOrder !== undefined
      ? input.tasks.filter((x) => x.status === 'todo' && x.id !== t.id && pinOf(x) === pinOf(t) && x.pinOrder !== undefined && x.pinOrder < t.pinOrder!)
      : [];
  const ready = (t: Task, st: State) => {
    // Hand-ordered tasks on a day go in the order they were arranged.
    if (pinnedBefore(t).some((x) => !st.placed.has(x.id))) return false;
    if (!t.group || !t.part) return true;
    for (let p = 1; p < t.part; p++) if (!finishedPart(t.group, p) && !st.parts.get(t.group)?.has(p)) return false;
    return true;
  };

  const gap = (p: Prev | null, t: Task) => {
    if (!p) return 0;
    return p.short && !p.paired && isShort(t) ? s.shortPairBreakMin : s.breakMin;
  };
  const baseFrom = (t: Task, st: State) => (st.prev ? Math.max(st.floor, st.prev.end + gap(st.prev, t) * MIN) : st.floor);
  const startFor = (t: Task, st: State): Ms | null => {
    if (!ready(t, st)) return null;
    const pin = pinOf(t);
    const from = pin ? Math.max(baseFrom(t, st), at(pin, 0)) : baseFrom(t, st);
    const dur = t.estimateMin * MIN;
    // Falling behind: the first task may start exactly at the given minute; everything else snaps to the grid.
    const fit = (f: Ms) => {
      const x = input.exactStart;
      if (x !== undefined && f <= x && earliestFit(freeFor(t), x, dur, 1) === x) return x;
      return earliestFit(freeFor(t), f, dur, s.slotRoundMin);
    };
    const placed = t.group ? st.parts.get(t.group) : undefined;
    if (!placed?.size) return fit(from);
    // Spread parts: next part goes on a later day than the last placed one...
    const lastEnd = Math.max(...placed.values());
    const spread = fit(Math.max(from, at(addDays(dateKey(lastEnd), 1), 0)));
    if (spread !== null && (t.due === null || spread + dur <= t.due)) return spread;
    // ...unless that makes it late; then the same day is allowed.
    const sameDay = fit(from);
    return sameDay ?? spread;
  };
  const after = (t: Task, start: Ms, st: State): State => {
    const end = start + t.estimateMin * MIN;
    const paired = !!st.prev && isShort(t) && gap(st.prev, t) === s.shortPairBreakMin;
    let parts = st.parts;
    if (t.group && t.part) {
      parts = new Map(parts);
      parts.set(t.group, new Map(parts.get(t.group) ?? []).set(t.part, end));
    }
    return { prev: { end, short: isShort(t), paired }, floor: end, parts, placed: new Set(st.placed).add(t.id) };
  };

  /** Missing work may go first only if no dated task becomes late because of it. */
  const pickTop = (queue: Task[], st: State): number => {
    const first = queue.findIndex((t) => ready(t, st));
    if (first === -1 || queue[first].due !== null) return Math.max(first, 0);
    const firstDated = queue.findIndex((t) => t.due !== null && ready(t, st));
    if (firstDated === -1) return first;
    const start = startFor(queue[first], st);
    if (start === null) return first;
    const dated = queue.filter((t) => t.due !== null);
    const before = lateIds(greedy(dated, st, false));
    const withMissing = lateIds(greedy(dated, after(queue[first], start, st), false));
    return [...withMissing].some((id) => !before.has(id)) ? firstDated : first;
  };

  function greedy(tasks: Task[], st: State, checkMissing: boolean): Run {
    const items: ScheduledItem[] = [];
    const warnings: Warning[] = [];
    const queue = [...tasks];
    while (queue.length) {
      const topIdx = checkMissing ? pickTop(queue, st) : Math.max(0, queue.findIndex((t) => ready(t, st)));
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
        if (next.floor + gap(next.prev, top) * MIN <= topStart && ready(top, next)) {
          chosen = i;
          chosenStart = cs;
          break;
        }
      }
      const t = queue[chosen];
      const end = chosenStart + t.estimateMin * MIN;
      const late = t.due !== null && end > t.due;
      const inNight = night.some((n) => end > n.start && chosenStart < n.end);
      items.push({ taskId: t.id, start: chosenStart, end, late, ...(inNight ? { night: true } : {}) });
      if (late) warnings.push({ kind: 'late', taskId: t.id, due: t.due!, end });
      st = after(t, chosenStart, st);
      queue.splice(chosen, 1);
    }
    return { items, warnings };
  }

  const todo = input.tasks.filter((t) => t.status === 'todo').sort(comparePriority);
  const r = greedy(todo, state, true);
  return { items: [...fixed, ...r.items], warnings: r.warnings };
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
