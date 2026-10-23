import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/scheduler';
import { DEFAULT_SETTINGS } from '../src/core/defaults';
import { actions, emptyData, replan } from '../src/app/model';
import { BLOCKS, LOCATIONS, MON, TUE, WED, THU, SUN, T, fmt, input, task } from './fixtures';
import type { Task } from '../src/core/types';

const NOW = T(MON, '15:00');
const run = (tasks: Task[], now = NOW) => schedule(input(now, tasks, { settings: DEFAULT_SETTINGS }));
const startOf = (r: ReturnType<typeof run>, id: string) => fmt(r.items.find((i) => i.taskId === id)!.start);
const dayOf = (r: ReturnType<typeof run>, id: string) => startOf(r, id).slice(0, 10);

describe('spreading work over the days', () => {
  it('spreads assignments over the days before they are due, each at the earliest time that day', () => {
    const due = T(THU, '23:59');
    const r = run(['a', 'b', 'c'].map((id) => task({ id, estimateMin: 45, due })));
    expect(startOf(r, 'a')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'b')).toBe(`${TUE} 16:05`);
    expect(startOf(r, 'c')).toBe(`${WED} 16:05`);
    expect(r.warnings).toEqual([]);
  });

  it('the least-loaded day wins: a long task makes the next ones go elsewhere', () => {
    const due = T(THU, '23:59');
    const r = run([task({ id: 'long', estimateMin: 120, due: T(MON, '23:59') }), task({ id: 'x', estimateMin: 30, due }), task({ id: 'y', estimateMin: 30, due })]);
    expect(dayOf(r, 'long')).toBe(MON);
    expect(dayOf(r, 'x')).toBe(TUE);
    expect(dayOf(r, 'y')).toBe(WED);
  });

  it('never spreads onto a day that would make it late', () => {
    // Tuesday only has 16:05–17:00 before this one is due: 60 min doesn't fit, so it stays on Monday.
    const r = run([task({ id: 'a', estimateMin: 45, due: T(MON, '23:59') }), task({ id: 'b', estimateMin: 60, due: T(TUE, '17:00') })]);
    expect(dayOf(r, 'b')).toBe(MON);
    expect(r.warnings).toEqual([]);
  });

  it('missing work still goes as soon as possible', () => {
    const r = run([task({ id: 'd1', estimateMin: 45, due: T(THU, '23:59') }), task({ id: 'm', estimateMin: 30, missing: true, due: null })]);
    expect(startOf(r, 'm')).toBe(`${MON} 17:45`);
    expect(dayOf(r, 'd1')).toBe(TUE);
  });

  it('split parts stay in order, one per day', () => {
    const parts = [1, 2, 3].map((part) => task({ id: `p${part}`, estimateMin: 60, due: T(SUN, '23:59'), group: 'g', part, parts: 3 }));
    const r = run(parts);
    const days = ['p1', 'p2', 'p3'].map((id) => dayOf(r, id));
    expect(days[0] < days[1] && days[1] < days[2]).toBe(true);
  });

  it('falling behind still starts the first one exactly 5 minutes from now', () => {
    let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
    d = actions.saveTask(d, task({ id: 'a', estimateMin: 30, due: T(MON, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 30, due: T(THU, '23:59') }), NOW);
    d = actions.fallingBehind(d, T(MON, '18:03'));
    expect(fmt(d.plan!.items.find((i) => i.taskId === 'a')!.start)).toBe(`${MON} 18:08`);
  });

  it('can be turned off to pack the earliest days again', () => {
    const due = T(THU, '23:59');
    const r = schedule(input(NOW, ['a', 'b'].map((id) => task({ id, estimateMin: 45, due })), { settings: { ...DEFAULT_SETTINGS, spreadWork: false } }));
    expect(dayOf(r, 'b')).toBe(MON);
  });
});
