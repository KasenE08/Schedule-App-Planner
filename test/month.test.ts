import { describe, expect, it } from 'vitest';
import { addMonths, monthCells, monthStart } from '../src/app/MonthGrid';

describe('month calendar grid', () => {
  it('starts on the Sunday on/before the 1st and covers whole weeks', () => {
    const cells = monthCells('2026-10-01'); // Oct 1 2026 is a Thursday
    expect(cells[0]).toBe('2026-09-27');
    expect(cells.length % 7).toBe(0);
    expect(cells).toContain('2026-10-31');
    expect(cells.at(-1)).toBe('2026-10-31'); // Oct 31 is a Saturday
  });
  it('February in a non-leap year fits 4 or 5 weeks', () => {
    expect(monthCells('2026-02-01').length).toBe(28); // Feb 1 2026 is a Sunday
  });
  it('moves between months and finds a month start', () => {
    expect(monthStart('2026-10-16')).toBe('2026-10-01');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
  });
});
