import { describe, expect, it } from 'vitest';
import { categoryRank, comparePriority } from '../src/core/priority';
import { task, T, MON, TUE } from './fixtures';

describe('priority', () => {
  it('category order: Online-Normal, Online-Missing, Paper-Normal, Paper-Missing, Other', () => {
    expect(categoryRank({ formats: ['online'], missing: false })).toBe(0);
    expect(categoryRank({ formats: ['online'], missing: true })).toBe(1);
    expect(categoryRank({ formats: ['paper'], missing: false })).toBe(2);
    expect(categoryRank({ formats: ['paper'], missing: true })).toBe(3);
    expect(categoryRank({ formats: [], missing: false })).toBe(4);
  });

  it('a task in several categories takes the highest one', () => {
    expect(categoryRank({ formats: ['paper', 'online'], missing: false })).toBe(0);
  });

  it('due date first, category only breaks ties', () => {
    const due = T(TUE, '23:59');
    const paperSoon = task({ estimateMin: 30, formats: ['paper'], due: T(MON, '23:59') });
    const onlineLater = task({ estimateMin: 30, formats: ['online'], due });
    const otherSame = task({ estimateMin: 30, formats: [], due });
    const paperSame = task({ estimateMin: 30, formats: ['paper'], due });
    const sorted = [otherSame, onlineLater, paperSame, paperSoon].sort(comparePriority);
    expect(sorted).toEqual([paperSoon, onlineLater, paperSame, otherSame]);
  });

  it('missing work (no due date) is as soon as possible, ahead of any dated task', () => {
    const missing = task({ estimateMin: 30, formats: ['paper'], missing: true, due: null });
    const dated = task({ estimateMin: 30, formats: ['online'], due: T(MON, '10:00') });
    expect([dated, missing].sort(comparePriority)).toEqual([missing, dated]);
  });
});
