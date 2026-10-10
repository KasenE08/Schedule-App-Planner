import { describe, expect, it } from 'vitest';
import { freeTime, occurrencesOn } from '../src/core/availability';
import { at } from '../src/core/time';
import { BLOCKS, FRI, LOCATIONS, MON, SAT, SUN, T, fmt, input } from './fixtures';

const show = (ivs: { start: number; end: number }[]) => ivs.map((i) => `${fmt(i.start)}–${fmt(i.end).slice(11)}`);

describe('availability', () => {
  it('fixed blocks include travel time there and back', () => {
    const school = occurrencesOn(MON, BLOCKS, LOCATIONS).find((o) => o.block.id === 'school')!;
    expect(fmt(school.leave)).toBe(`${MON} 08:40`);
    expect(fmt(school.arrive)).toBe(`${MON} 15:02`);
  });

  it('Monday: nothing before school, schoolwork waits an hour after school, avoids ACT and the 30 min after gym', () => {
    const free = freeTime(input(T(MON, '00:00'), []), MON, 1);
    expect(show(free.schoolwork)).toEqual([
      `${MON} 16:02–16:05`,
      `${MON} 17:45–20:00`,
      `${MON} 21:30–00:00`,
    ]);
  });

  it('Other tasks bypass only the hour after school', () => {
    const free = freeTime(input(T(MON, '00:00'), []), MON, 1);
    expect(show(free.all)).toEqual([`${MON} 15:02–16:05`, `${MON} 17:45–20:00`, `${MON} 21:30–00:00`]);
  });

  it('Friday: morning tasks allowed until an hour before leaving for school (9:28)', () => {
    const free = freeTime(input(T(FRI, '00:00'), []), FRI, 1);
    expect(show(free.schoolwork)).toEqual([
      `${FRI} 08:00–09:28`,
      `${FRI} 16:02–17:30`,
      `${FRI} 19:15–20:00`,
      `${FRI} 21:30–00:00`,
    ]);
  });

  it('arrival time input moves the after-school hour', () => {
    const free = freeTime(input(T(MON, '00:00'), [], { arrivals: { [MON]: 15 * 60 + 40 } }), MON, 1);
    expect(free.all.some((i) => fmt(i.start) === `${MON} 15:40`)).toBe(true);
    expect(free.schoolwork.every((i) => i.start >= T(MON, '16:40'))).toBe(true);
  });

  it('Saturday: all tasks only from 12pm, stopping an hour before the shift starts', () => {
    const free = freeTime(input(T(SAT, '00:00'), []), SAT, 1);
    expect(show(free.schoolwork)).toEqual([`${SAT} 12:00–16:00`, `${SAT} 23:10–00:00`]);
    expect(show(free.all)).toEqual(show(free.schoolwork));
  });

  it('Sunday: free after work; homework allowed during laundry', () => {
    const free = freeTime(input(T(SUN, '00:00'), []), SUN, 1);
    expect(show(free.schoolwork)).toEqual([`${SUN} 15:10–00:00`]);
  });

  it('a block marked blocking takes its time away', () => {
    const blocks = BLOCKS.map((b) => (b.id === 'laundry' ? { ...b, blocksScheduling: true } : b));
    const free = freeTime(input(T(SUN, '00:00'), [], { blocks }), SUN, 1);
    expect(show(free.schoolwork)).toEqual([`${SUN} 15:10–15:30`, `${SUN} 17:30–00:00`]);
  });

  it('wall-clock times hold across a daylight-saving change', () => {
    // Nov 1 2026 is the US fall-back date; blocks stay at their local times in any timezone.
    expect(new Date(at('2026-11-01', 20 * 60)).getHours()).toBe(20);
    expect(new Date(at('2026-03-08', 20 * 60)).getHours()).toBe(20);
  });
});
