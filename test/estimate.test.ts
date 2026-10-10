import { describe, expect, it } from 'vitest';
import { estimateMinutes } from '../src/core/estimate';

describe('time estimates', () => {
  it('uses the assignment type default plus padding, rounded up to 5 minutes', () => {
    expect(estimateMinutes('worksheet', { paddingPct: 15 })).toBe(35); // 30 * 1.15 = 34.5
    expect(estimateMinutes('essay', { paddingPct: 15 })).toBe(105); // 103.5
    expect(estimateMinutes('discussion', { paddingPct: 0 })).toBe(20);
  });

  it('a user-entered base replaces the type default', () => {
    expect(estimateMinutes('essay', { paddingPct: 0, baseOverrideMin: 40 })).toBe(40);
  });

  it('applies the learned ratio, clamped between 0.5x and 2x', () => {
    expect(estimateMinutes('worksheet', { paddingPct: 0, learnedRatio: 0.8 })).toBe(25); // 24
    expect(estimateMinutes('worksheet', { paddingPct: 0, learnedRatio: 10 })).toBe(60);
    expect(estimateMinutes('worksheet', { paddingPct: 0, learnedRatio: 0.1 })).toBe(15);
  });

  it('exact multiples are not bumped up by float error', () => {
    expect(estimateMinutes('other', { paddingPct: 0, baseOverrideMin: 100, learnedRatio: 1.15 })).toBe(115);
  });
});
