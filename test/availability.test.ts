import { describe, expect, it } from 'vitest';
import { freeTime, occurrencesOn } from '../src/core/availability';
import { at } from '../src/core/time';
import { BLOCKS, LOCATIONS, MON, SAT, SUN, T, fmt, input } from './fixtures';

const show = (ivs: { start: number; end: number }[]) => ivs.map((i) => `${fmt(i.start)}–${fmt(i.end).slice(11)}`);

describe('availability', () => {
  it('fixed blocks include travel time there and back', () => {
    const school = occurrencesOn(MON, BLOCKS, LOCATIONS).find((o) => o.block.id === 'school')!;
    expect(fmt(school.leave)).toBe(`${MON} 08:40`);
    expect(fmt(school.arrive)).toBe(`${MON} 15:02`);
  });

  it('Monday: schoolwork waits an hour after school, avoids ACT and the 30 min after gym', () => {
    const free = freeTime(input(T(MON, '00:00'), []), MON, 1);
    expect(show(free.schoolwork)).toEqual([
      `${MON} 08:00–08:40`,
      `${MON} 16:02–16:05`,
      `${MON} 17:45–20:00`,
      `${MON} 21:30–00:00`,
    ]);
  });

  it('Other tasks bypass the schoolwork cutoffs but not fixed blocks', () => {
    const free = freeTime(input(T(MON, '00:00'), []), MON, 1);
    expect(show(free.all)).toEqual([
      `${MON} 08:00–08:40`,
      `${MON} 15:02–16:05`,
      `${MON} 17:45–20:00`,
      `${MON} 21:00–00:00`,
    ]);
  });

  it('arrival time input moves the after-school hour', () => {
    const free = freeTime(input(T(MON, '00:00'), [], { arrivals: { [MON]: 15 * 60 + 40 } }), MON, 1);
    expect(free.all.some((i) => fmt(i.start) === `${MON} 15:40`)).toBe(true);
    expect(free.schoolwork.every((i) => i.start >= T(MON, '16:40') || i.end <= T(MON, '08:40'))).toBe(true);
  });

  it('Saturday: schoolwork only from 12pm, stops an hour before the shift starts', () => {
    const free = freeTime(input(T(SAT, '00:00'), []), SAT, 1);
    expect(show(free.schoolwork)).toEqual([`${SAT} 12:00–16:00`, `${SAT} 23:10–00:00`]);
    expect(show(free.all)).toEqual([`${SAT} 08:00–16:45`, `${SAT} 23:10–00:00`]);
  });

  it('Sunday: work, then laundry blocks 3:30–5:30', () => {
    const free = freeTime(input(T(SUN, '00:00'), []), SUN, 1);
    expect(show(free.schoolwork)).toEqual([`${SUN} 15:10–15:30`, `${SUN} 17:30–00:00`]);
  });

  it('a block marked non-blocking leaves its time free', () => {
    const blocks = BLOCKS.map((b) => (b.id === 'laundry' ? { ...b, blocksScheduling: false } : b));
    const free = freeTime(input(T(SUN, '00:00'), [], { blocks }), SUN, 1);
    expect(show(free.schoolwork)).toEqual([`${SUN} 15:10–00:00`]);
  });

  it('wall-clock times hold across a daylight-saving change', () => {
    // Nov 1 2026 is the US fall-back date; blocks stay at their local times in any timezone.
    expect(new Date(at('2026-11-01', 20 * 60)).getHours()).toBe(20);
    expect(new Date(at('2026-03-08', 20 * 60)).getHours()).toBe(20);
  });
});
