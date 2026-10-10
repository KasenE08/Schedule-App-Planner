import { describe, expect, it } from 'vitest';
import { schedule } from '../src/core/scheduler';
import { BLOCKS, FRI, MON, SAT, SUN, THU, TUE, T, fmt, input, task } from './fixtures';
import type { Task } from '../src/core/types';

const run = (now: number, tasks: Task[], extra = {}) => schedule(input(now, tasks, extra));
const startOf = (r: ReturnType<typeof schedule>, id: string) => {
  const it = r.items.find((i) => i.taskId === id);
  return it ? fmt(it.start) : null;
};

describe('scheduler: pacing', () => {
  it('30 minute break between assignments', () => {
    const r = run(T(MON, '15:00'), [task({ id: 'a', estimateMin: 45 }), task({ id: 'b', estimateMin: 45 })]);
    expect(startOf(r, 'a')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'b')).toBe(`${MON} 19:00`);
  });

  it('two short assignments pair with a 5 minute break; the next gets the full 30', () => {
    const r = run(T(MON, '15:00'), [
      task({ id: 'a', estimateMin: 20 }),
      task({ id: 'b', estimateMin: 20 }),
      task({ id: 'c', estimateMin: 20 }),
    ]);
    expect(startOf(r, 'a')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'b')).toBe(`${MON} 18:10`);
    expect(startOf(r, 'c')).toBe(`${MON} 19:00`);
  });

  it('a 21+ minute task is not short and does not pair', () => {
    const r = run(T(MON, '15:00'), [task({ id: 'a', estimateMin: 20 }), task({ id: 'b', estimateMin: 25 })]);
    expect(startOf(r, 'b')).toBe(`${MON} 18:35`);
  });

  it('no break needed next to a fixed event', () => {
    const r = run(T(MON, '15:00'), [task({ id: 'a', estimateMin: 135 }), task({ id: 'b', estimateMin: 30 })]);
    expect(startOf(r, 'a')).toBe(`${MON} 17:45`); // ends exactly 8:00pm when gym starts
    expect(startOf(r, 'b')).toBe(`${MON} 21:30`);
  });
});

describe('scheduler: cutoffs', () => {
  it('schoolwork starts an hour after arriving home; the arrival input overrides the default', () => {
    expect(startOf(run(T(THU, '15:00'), [task({ id: 'a', estimateMin: 30 })]), 'a')).toBe(`${THU} 16:05`);
    const r = run(T(THU, '15:00'), [task({ id: 'a', estimateMin: 30 })], { arrivals: { [THU]: 15 * 60 + 40 } });
    expect(startOf(r, 'a')).toBe(`${THU} 16:40`);
  });

  it('Other tasks may run in the hour after school', () => {
    const r = run(T(THU, '15:00'), [task({ id: 'a', estimateMin: 30, formats: [] })], { arrivals: { [THU]: 15 * 60 + 40 } });
    expect(startOf(r, 'a')).toBe(`${THU} 15:40`);
  });

  it('no tasks in the hour before a work shift (from shift start), Other included', () => {
    expect(startOf(run(T(SAT, '15:45'), [task({ id: 'a', estimateMin: 30 })]), 'a')).toBe(`${SAT} 23:10`);
    expect(startOf(run(T(SAT, '15:45'), [task({ id: 'a', estimateMin: 30, formats: [] })]), 'a')).toBe(`${SAT} 23:10`);
  });

  it('no tasks within 30 minutes after a workout, Other included', () => {
    expect(startOf(run(T(MON, '21:00'), [task({ id: 'a', estimateMin: 30 })]), 'a')).toBe(`${MON} 21:30`);
    expect(startOf(run(T(MON, '21:00'), [task({ id: 'a', estimateMin: 30, formats: [] })]), 'a')).toBe(`${MON} 21:30`);
  });

  it('no tasks on weekends before 12pm, Other included', () => {
    expect(startOf(run(T(SAT, '08:00'), [task({ id: 'a', estimateMin: 30 })]), 'a')).toBe(`${SAT} 12:00`);
    expect(startOf(run(T(SAT, '08:00'), [task({ id: 'a', estimateMin: 30, formats: [] })]), 'a')).toBe(`${SAT} 12:00`);
  });

  it('no tasks before school Mon–Thu', () => {
    expect(startOf(run(T(MON, '07:00'), [task({ id: 'a', estimateMin: 30, formats: [] })]), 'a')).toBe(`${MON} 15:05`);
  });

  it('Friday morning tasks must end an hour before leaving for school (by 9:28)', () => {
    expect(startOf(run(T(FRI, '07:00'), [task({ id: 'a', estimateMin: 85 })]), 'a')).toBe(`${FRI} 08:00`);
    expect(startOf(run(T(FRI, '07:00'), [task({ id: 'a', estimateMin: 90 })]), 'a')).toBe(`${FRI} 21:30`); // 16:05–17:30 too short before Archery
  });

  it('nothing runs past 12am; a task that would cross midnight moves to the next free slot', () => {
    const r = run(T(MON, '23:00'), [task({ id: 'a', estimateMin: 90 })]);
    expect(startOf(r, 'a')).toBe(`${TUE} 16:05`);
  });

  it('homework may run during laundry; laundry creates washer, dryer and take-out reminders', () => {
    const r = run(T(SUN, '15:00'), [task({ id: 'a', estimateMin: 30 })]);
    expect(startOf(r, 'a')).toBe(`${SUN} 15:10`);
    expect(r.blockReminders.slice(0, 3).map((b) => `${fmt(b.at).slice(11)} ${b.title}`)).toEqual([
      '15:30 Put laundry in washer',
      '16:30 Move laundry to dryer',
      '17:30 Take laundry out of dryer',
    ]);
  });

  it('a blocking block keeps tasks out of it', () => {
    const blocks = BLOCKS.map((b) => (b.id === 'laundry' ? { ...b, blocksScheduling: true } : b));
    expect(startOf(run(T(SUN, '15:10'), [task({ id: 'a', estimateMin: 30 })], { blocks }), 'a')).toBe(`${SUN} 17:30`);
  });
});

describe('scheduler: priority and placement', () => {
  it('earlier due date goes first; category breaks ties', () => {
    const due = T(TUE, '23:59');
    const r = run(T(MON, '15:00'), [
      task({ id: 'paper', estimateMin: 30, formats: ['paper'], due }),
      task({ id: 'online', estimateMin: 30, formats: ['online'], due }),
      task({ id: 'soon', estimateMin: 30, formats: ['paper'], due: T(MON, '23:59') }),
    ]);
    expect(r.items.map((i) => i.taskId)).toEqual(['soon', 'online', 'paper']);
  });

  it('a lower-priority task fills a gap only if it never delays the top task', () => {
    const r = run(T(MON, '15:00'), [
      task({ id: 'top', estimateMin: 60, due: T(TUE, '23:59') }),
      task({ id: 'errand', estimateMin: 20, formats: [], due: T(THU, '23:59') }),
      task({ id: 'later', estimateMin: 20, due: T(THU, '23:59') }),
    ]);
    expect(startOf(r, 'errand')).toBe(`${MON} 15:05`); // in the after-school hour schoolwork can't use
    expect(startOf(r, 'top')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'later')).toBe(`${MON} 19:15`); // would have delayed top at 17:45
  });

  it('missing work goes first when there is room before other due dates', () => {
    const r = run(T(MON, '15:00'), [
      task({ id: 'normal', estimateMin: 60, due: T(TUE, '23:59') }),
      task({ id: 'missing', estimateMin: 60, missing: true, due: null }),
    ]);
    expect(startOf(r, 'missing')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'normal')).toBe(`${MON} 21:30`);
    expect(r.warnings).toEqual([]);
  });

  it('a normal assignment goes before missing work if missing first would make it late', () => {
    const r = run(T(MON, '15:00'), [
      task({ id: 'normal', estimateMin: 60, due: T(MON, '19:00') }),
      task({ id: 'missing', estimateMin: 60, missing: true, due: null }),
    ]);
    expect(startOf(r, 'normal')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'missing')).toBe(`${MON} 21:30`);
    expect(r.warnings).toEqual([]);
  });

  it('first task snaps to the next 5 minute mark after now', () => {
    expect(startOf(run(T(MON, '17:47'), [task({ id: 'a', estimateMin: 30 })]), 'a')).toBe(`${MON} 17:50`);
  });

  it('finished tasks are ignored; a started task holds its slot and counts for the break', () => {
    const r = run(T(MON, '18:00'), [
      task({ id: 'done', estimateMin: 30, status: 'done' }),
      task({ id: 'going', estimateMin: 60, status: 'inProgress', startedAt: T(MON, '17:45') }),
      task({ id: 'next', estimateMin: 30 }),
    ]);
    expect(startOf(r, 'done')).toBeNull();
    expect(startOf(r, 'going')).toBe(`${MON} 17:45`);
    expect(startOf(r, 'next')).toBe(`${MON} 19:15`);
  });
});

describe('scheduler: overload warnings', () => {
  it('warns when a task cannot finish before its due date, but still schedules it', () => {
    const r = run(T(MON, '15:00'), [task({ id: 'a', estimateMin: 60, due: T(MON, '18:00') })]);
    expect(r.items[0]).toMatchObject({ taskId: 'a', late: true });
    expect(r.warnings).toEqual([{ kind: 'late', taskId: 'a', due: T(MON, '18:00'), end: T(MON, '18:45') }]);
  });

  it('warns when a task fits nowhere in the planning window', () => {
    const r = run(T(MON, '15:00'), [task({ id: 'a', estimateMin: 600 })]);
    expect(r.items).toEqual([]);
    expect(r.warnings).toEqual([{ kind: 'unscheduled', taskId: 'a' }]);
  });

  it('missing work never triggers a late warning', () => {
    const r = run(T(MON, '15:00'), [task({ id: 'a', estimateMin: 30, missing: true, due: null })]);
    expect(r.warnings).toEqual([]);
  });
});
