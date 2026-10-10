import { describe, expect, it } from 'vitest';
import { occursOn } from '../src/core/recurrence';
import type { FixedBlock, Recurrence } from '../src/core/types';

const block = (recurrence: Recurrence, extra: Partial<FixedBlock> = {}): FixedBlock => ({
  id: 'b', title: 'B', tag: 'other', locationId: 'home', startMin: 600, endMin: 660, recurrence, ...extra,
});

describe('recurrence', () => {
  it('once: only on its date', () => {
    const b = block({ kind: 'once', date: '2026-10-14' });
    expect(occursOn(b, '2026-10-14')).toBe(true);
    expect(occursOn(b, '2026-10-15')).toBe(false);
  });

  it('daily: every day', () => {
    expect(occursOn(block({ kind: 'daily' }), '2026-12-25')).toBe(true);
  });

  it('weekly: only on chosen weekdays', () => {
    const b = block({ kind: 'weekly', weekdays: [1, 3] }); // Mon, Wed
    expect(occursOn(b, '2026-10-12')).toBe(true); // Mon
    expect(occursOn(b, '2026-10-13')).toBe(false); // Tue
    expect(occursOn(b, '2026-10-14')).toBe(true); // Wed
  });

  it('monthly by date, clamping to the last day of short months', () => {
    const b = block({ kind: 'monthlyDate', day: 31 });
    expect(occursOn(b, '2026-10-31')).toBe(true);
    expect(occursOn(b, '2026-11-30')).toBe(true);
    expect(occursOn(b, '2026-11-29')).toBe(false);
    expect(occursOn(block({ kind: 'monthlyDate', day: 15 }), '2026-10-15')).toBe(true);
  });

  it('monthly by pattern: 2nd Tuesday and last Friday', () => {
    const second = block({ kind: 'monthlyNth', weekday: 2, nth: 2 });
    expect(occursOn(second, '2026-10-13')).toBe(true);
    expect(occursOn(second, '2026-10-06')).toBe(false);
    const last = block({ kind: 'monthlyNth', weekday: 5, nth: -1 });
    expect(occursOn(last, '2026-10-30')).toBe(true);
    expect(occursOn(last, '2026-10-23')).toBe(false);
  });

  it('skip dates, start and end dates', () => {
    const b = block({ kind: 'daily' }, { skipDates: ['2026-10-14'], startDate: '2026-10-10', endDate: '2026-10-20' });
    expect(occursOn(b, '2026-10-14')).toBe(false);
    expect(occursOn(b, '2026-10-09')).toBe(false);
    expect(occursOn(b, '2026-10-21')).toBe(false);
    expect(occursOn(b, '2026-10-15')).toBe(true);
  });
});
