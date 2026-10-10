import type { DateKey, FixedBlock, Interval, Location, Ms, ScheduleInput, TaskScope } from './types';
import { addDays, at, MIN, subtract, weekday } from './time';
import { occursOn } from './recurrence';

export interface Occurrence {
  block: FixedBlock;
  date: DateKey;
  start: Ms;
  end: Ms;
  /** When you leave home to get there. */
  leave: Ms;
  /** When you are back home. */
  arrive: Ms;
}

export function occurrencesOn(
  key: DateKey,
  blocks: FixedBlock[],
  locations: Location[],
  arrivals: Record<DateKey, number> = {},
): Occurrence[] {
  const locs = new Map(locations.map((l) => [l.id, l]));
  return blocks
    .filter((b) => occursOn(b, key))
    .map((block) => {
      const loc = locs.get(block.locationId);
      const start = at(key, block.startMin);
      const end = at(key, block.endMin);
      const override = block.tag === 'school' ? arrivals[key] : undefined;
      return {
        block,
        date: key,
        start,
        end,
        leave: start - (loc?.fromHomeMin ?? 0) * MIN,
        arrive: override !== undefined ? at(key, override) : end + (loc?.toHomeMin ?? 0) * MIN,
      };
    })
    .sort((a, b) => a.start - b.start);
}

export type FreeTime = Record<TaskScope, Interval[]>;

/**
 * Free time for schoolwork and for Other tasks over `days` days from `from`:
 * the daily window minus fixed blocks (with travel) minus cutoff rules.
 * Cutoffs scoped to 'schoolwork' do not restrict Other tasks.
 */
export function freeTime(input: ScheduleInput, from: DateKey, days: number): FreeTime {
  const { settings, rules, blocks, locations, arrivals } = input;
  const window: Interval[] = [];
  const hard: Interval[] = [];
  const cuts: Record<TaskScope, Interval[]> = { schoolwork: [], all: [] };

  // Include the day before so overnight blocks and their cutoffs carry over.
  for (let i = -1; i < days; i++) {
    const key = addDays(from, i);
    if (i >= 0) window.push({ start: at(key, settings.earliestStartMin), end: at(key, settings.dayEndMin) });

    const occ = occurrencesOn(key, blocks, locations, arrivals);
    for (const o of occ) {
      if (o.block.blocksScheduling !== false) hard.push({ start: o.leave, end: o.arrive });
    }
    for (const r of rules) {
      const into = cuts[r.appliesTo];
      if (r.kind === 'window') {
        if (r.weekdays.includes(weekday(key))) into.push({ start: at(key, r.startMin), end: at(key, r.endMin) });
        continue;
      }
      for (const o of occ) {
        if (o.block.tag !== r.tag) continue;
        if (r.kind === 'afterBlock') into.push({ start: o.arrive, end: o.arrive + r.minutes * MIN });
        else into.push({ start: o.start - r.minutes * MIN, end: o.start });
      }
    }
  }

  const base = subtract(window, hard);
  const other = subtract(base, cuts.all);
  return { all: other, schoolwork: subtract(other, cuts.schoolwork) };
}
