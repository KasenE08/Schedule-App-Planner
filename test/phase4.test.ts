import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/scheduler';
import { estimateMinutes, learnedRatio, splitMinutes, type DoneRecord } from '../src/core/estimate';
import { actions, emptyData, nightWindow, replan } from '../src/app/model';
import { BLOCKS, FRI, LOCATIONS, MON, TUE, WED, THU, SUN, T, fmt, input, task } from './fixtures';
import type { Task } from '../src/core/types';

const startOf = (r: { items: { taskId: string; start: number }[] }, id: string) => {
  const i = r.items.find((x) => x.taskId === id);
  return i ? fmt(i.start) : null;
};
const base = (now: number) => replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, now);
const NIGHT = { start: T(MON, '00:00') + 86_400_000, end: T(TUE, '02:00') }; // Mon 12am–Tue 2am

describe('falling behind', () => {
  it('the first assignment starts exactly 5 minutes after tapping (6:03 → 6:08)', () => {
    let d = actions.saveTask(base(T(MON, '15:00')), task({ id: 'a', estimateMin: 45 }), T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 30 }), T(MON, '15:00'));
    d = actions.fallingBehind(d, T(MON, '18:03'));
    expect(startOf(d.plan!, 'a')).toBe(`${MON} 18:08`);
    expect(startOf(d.plan!, 'b')).toBe(`${MON} 19:25`); // 18:53 + 30 min break, then the 5-minute grid
  });

  it('seconds on the clock are ignored (6:03:27 → 6:08)', () => {
    const d = actions.fallingBehind(actions.saveTask(base(T(MON, '15:00')), task({ id: 'a', estimateMin: 30 }), T(MON, '15:00')), T(MON, '18:03') + 27_000);
    expect(startOf(d.plan!, 'a')).toBe(`${MON} 18:08`);
  });

  it('what no longer fits today moves to the next free time, by priority', () => {
    let d = base(T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'soon', estimateMin: 60, due: T(TUE, '23:59') }), T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'later', estimateMin: 60, due: T(FRI, '23:59') }), T(MON, '15:00'));
    d = actions.fallingBehind(d, T(MON, '22:30'));
    expect(startOf(d.plan!, 'soon')).toBe(`${MON} 22:35`);
    expect(startOf(d.plan!, 'later')).toBe(`${TUE} 16:05`);
  });

  it('goes past 12am only for a task that would otherwise be late', () => {
    const tasks = [
      task({ id: 'a', estimateMin: 120, formats: ['paper'], due: T(TUE, '07:00') }),
      task({ id: 'b', estimateMin: 60, formats: ['paper'], due: T(TUE, '07:00') }),
      task({ id: 'c', estimateMin: 30, due: T(FRI, '23:59') }),
    ];
    const r = schedule(input(T(MON, '21:30'), tasks, { nightExtension: NIGHT }));
    expect(startOf(r, 'a')).toBe(`${MON} 21:30`);
    expect(startOf(r, 'b')).toBe(`${TUE} 00:00`);
    expect(r.items.find((i) => i.taskId === 'b')).toMatchObject({ late: false, night: true });
    expect(startOf(r, 'c')).toBe(`${TUE} 16:05`); // not urgent: never after midnight
    expect(r.warnings).toEqual([]);
  });

  it('uses the late hours for whichever tasks need them, even ones a reshuffle made late', () => {
    const due = T(TUE, '07:00');
    const tasks = [
      task({ id: 'p1', group: 'lab', part: 1, parts: 2, estimateMin: 60, formats: ['paper'], due }),
      task({ id: 'p2', group: 'lab', part: 2, parts: 2, estimateMin: 60, formats: ['paper'], due }),
      task({ id: 'r', estimateMin: 60, formats: ['paper'], due }),
    ];
    const r = schedule(input(T(MON, '21:20'), tasks, { nightExtension: NIGHT }));
    expect(r.warnings).toEqual([]);
    expect(r.items.every((i) => i.end <= T(TUE, '02:00'))).toBe(true);
  });

  it('if something will be late anyway, it goes right after tonight’s work, not the next afternoon', () => {
    const MON2 = '2026-10-19';
    const night = { start: T(MON2, '00:00'), end: T(MON2, '02:00') };
    const tasks = [
      task({ id: 'pinned', estimateMin: 35, due: T(MON2, '01:00'), pinDay: SUN }),
      task({ id: 'midnight', estimateMin: 35, due: T(MON2, '00:00') }),
    ];
    const r = schedule(input(T(SUN, '23:22'), tasks, { nightExtension: night }));
    expect(startOf(r, 'pinned')).toBe(`${SUN} 23:25`);
    expect(startOf(r, 'midnight')).toBe(`${MON2} 00:30`); // still late, but by 1 hour instead of 16
    expect(r.items.find((i) => i.taskId === 'midnight')!.late).toBe(true);
  });

  it('without falling-behind mode the same day stops at 12am and warns instead', () => {
    const tasks = [
      task({ id: 'a', estimateMin: 120, formats: ['paper'], due: T(TUE, '07:00') }),
      task({ id: 'b', estimateMin: 60, formats: ['paper'], due: T(TUE, '07:00') }),
    ];
    const r = schedule(input(T(MON, '21:30'), tasks));
    expect(r.warnings.map((w) => `${w.kind}:${w.taskId}`)).toEqual(['late:b']);
  });

  it('never runs past 2am; if even that is not enough it warns', () => {
    const tasks = [
      task({ id: 'a', estimateMin: 120, formats: ['paper'], due: T(TUE, '07:00') }),
      task({ id: 'b', estimateMin: 150, formats: ['paper'], due: T(TUE, '07:00') }),
    ];
    const r = schedule(input(T(MON, '21:30'), tasks, { nightExtension: NIGHT }));
    expect(r.items.every((i) => i.end <= T(TUE, '02:00') || i.start >= T(TUE, '08:00'))).toBe(true);
    expect(r.warnings.some((w) => w.kind === 'late' && w.taskId === 'b')).toBe(true);
  });

  it('tonight’s window is 12am–2am, also when tapped after midnight', () => {
    const d = emptyData();
    expect(nightWindow(d, T(MON, '21:00'))).toEqual({ start: T(TUE, '00:00'), end: T(TUE, '02:00') });
    expect(nightWindow(d, T(TUE, '00:30'))).toEqual({ start: T(TUE, '00:00'), end: T(TUE, '02:00') });
  });

  it('the extension expires: replanning after 2am no longer uses it', () => {
    let d = actions.fallingBehind(base(T(MON, '21:00')), T(MON, '21:00'));
    expect(d.night).not.toBeNull();
    d = replan(d, T(TUE, '07:00'));
    expect(d.night).toBeNull();
  });

  it('a started task keeps its slot when falling behind', () => {
    let d = actions.saveTask(base(T(MON, '15:00')), task({ id: 'a', estimateMin: 45 }), T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 30 }), T(MON, '15:00'));
    d = actions.startTask(d, 'a', T(MON, '17:50'));
    d = actions.fallingBehind(d, T(MON, '18:03'));
    expect(startOf(d.plan!, 'a')).toBe(`${MON} 17:50`);
    expect(startOf(d.plan!, 'b')).toBe(`${MON} 19:05`); // after a ends 18:35 + 30 min break (first start 18:08 is too soon)
  });
});

describe('big tasks', () => {
  it('splits into roughly hour-long parts rounded to 5 minutes', () => {
    expect(splitMinutes(150)).toEqual([50, 50, 50]);
    expect(splitMinutes(95)).toEqual([50, 50]);
    expect(splitMinutes(240)).toEqual([60, 60, 60, 60]);
  });

  it('parts are scheduled in order, one per day', () => {
    const big = task({ id: 'essay', title: 'Essay', type: 'essay', estimateMin: 150, due: T(FRI, '23:59') });
    const d = actions.splitTask(base(T(MON, '15:00')), big, T(MON, '15:00'));
    expect(d.tasks.map((t) => t.title)).toEqual(['Essay (part 1 of 3)', 'Essay (part 2 of 3)', 'Essay (part 3 of 3)']);
    const days = d.tasks.map((t) => fmt(d.plan!.items.find((i) => i.taskId === t.id)!.start).slice(0, 10));
    expect(days).toEqual([MON, TUE, WED]);
  });

  it('parts share a day only when spreading them out would make them late', () => {
    const big = task({ id: 'p', estimateMin: 120, due: T(MON, '23:59') });
    const d = actions.splitTask(base(T(MON, '15:00')), big, T(MON, '15:00'));
    const starts = d.tasks.map((t) => fmt(d.plan!.items.find((i) => i.taskId === t.id)!.start));
    expect(starts).toEqual([`${MON} 17:45`, `${MON} 21:30`]);
    expect(d.plan!.warnings).toEqual([]);
  });

  it('a later part never goes before an earlier one', () => {
    const parts: Task[] = [1, 2].map((p) => task({ id: `x${p}`, group: 'x', part: p, parts: 2, estimateMin: 60, due: T(THU, '23:59') }));
    const r = schedule(input(T(MON, '15:00'), [...parts].reverse()));
    expect(r.items.find((i) => i.taskId === 'x1')!.start).toBeLessThan(r.items.find((i) => i.taskId === 'x2')!.start);
  });
});

describe('learning', () => {
  const rec = (actualMin: number, type: DoneRecord['type'] = 'worksheet'): DoneRecord => ({ type, baseMin: 30, actualMin, at: 0 });

  it('needs 3 timed assignments of a type before adjusting', () => {
    expect(learnedRatio([rec(15), rec(15)], 'worksheet')).toEqual({ ratio: 1, samples: 2 });
    expect(learnedRatio([rec(15), rec(15), rec(24)], 'worksheet').ratio).toBeCloseTo(0.6);
  });

  it('ignores other types and obvious mis-taps (forgot to tap Done)', () => {
    const h = [rec(15), rec(15), rec(15), rec(600), rec(2), rec(90, 'essay')];
    expect(learnedRatio(h, 'worksheet')).toEqual({ ratio: 0.5, samples: 3 });
  });

  it('learned time feeds the estimate, padding still applied', () => {
    const { ratio } = learnedRatio([rec(24), rec(24), rec(24)], 'worksheet'); // 0.8
    expect(estimateMinutes('worksheet', { paddingPct: 15, learnedRatio: ratio })).toBe(30); // 30 × 0.8 × 1.15 = 27.6
  });

  it('Start then Done records the real time; Done without Start or a typed estimate does not', () => {
    let d = actions.saveTask(base(T(MON, '15:00')), task({ id: 'a', estimateMin: 35, baseMin: 30 }), T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'b', estimateMin: 35, baseMin: 30 }), T(MON, '15:00'));
    d = actions.saveTask(d, task({ id: 'c', estimateMin: 35, baseMin: 30, estimateManual: true }), T(MON, '15:00'));
    d = actions.startTask(d, 'a', T(MON, '17:45'));
    d = actions.completeTask(d, 'a', T(MON, '18:10'));
    d = actions.completeTask(d, 'b', T(MON, '19:00'));
    d = actions.startTask(d, 'c', T(MON, '19:00'));
    d = actions.completeTask(d, 'c', T(MON, '19:30'));
    expect(d.history).toEqual([{ type: 'worksheet', baseMin: 30, actualMin: 25, at: T(MON, '18:10') }]);
  });
});
