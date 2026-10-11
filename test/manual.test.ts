import { describe, expect, it } from 'vitest';
import { actions, emptyData, newlyLate, replan } from '../src/app/model';
import { BLOCKS, LOCATIONS, MON, TUE, WED, THU, FRI, T, fmt, task } from './fixtures';

const NOW = T(MON, '15:00');
const setup = () => {
  let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
  d = actions.saveTask(d, task({ id: 'a', estimateMin: 45, due: T(TUE, '23:59') }), NOW);
  d = actions.saveTask(d, task({ id: 'b', estimateMin: 45, due: T(FRI, '23:59') }), NOW);
  return d;
};
const at = (d: ReturnType<typeof setup>, id: string) => fmt(d.plan!.items.find((i) => i.taskId === id)!.start);

describe('moving assignments by hand', () => {
  it('auto order first: earlier due date goes first', () => {
    const d = setup();
    expect(at(d, 'a')).toBe(`${MON} 17:45`);
    expect(at(d, 'b')).toBe(`${MON} 19:00`);
  });

  it('dragging onto a day schedules it that day', () => {
    const d = actions.moveToDay(setup(), 'b', WED, NOW);
    expect(at(d, 'b')).toBe(`${WED} 16:05`);
  });

  it('if that day has no room, it goes to the next day with room, never earlier', () => {
    const d = actions.moveToDay(actions.saveTask(setup(), task({ id: 'big', estimateMin: 200 }), NOW), 'big', WED, NOW);
    expect(at(d, 'big')).toBe(`${THU} 16:05`); // Wednesday's longest gap is 85 min
  });

  it('reordering a day puts them in the order arranged', () => {
    const d = actions.reorderDay(setup(), MON, ['b', 'a'], NOW);
    expect(at(d, 'b')).toBe(`${MON} 17:45`);
    expect(at(d, 'a')).toBe(`${MON} 19:00`);
  });

  it('hand moves stick when new assignments are added', () => {
    let d = actions.reorderDay(setup(), MON, ['b', 'a'], NOW);
    d = actions.saveTask(d, task({ id: 'c', estimateMin: 30, due: T(TUE, '12:00') }), NOW);
    const order = d.plan!.items.filter((i) => fmt(i.start).startsWith(MON)).map((i) => i.taskId);
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('"Let the app schedule it" undoes the move', () => {
    let d = actions.moveToDay(setup(), 'b', WED, NOW);
    d = actions.unpin(d, 'b', NOW);
    expect(at(d, 'b')).toBe(`${MON} 19:00`);
  });

  it('a pin to a day that has passed no longer applies', () => {
    const d = actions.moveToDay(setup(), 'b', MON, NOW);
    const next = replan(d, T(TUE, '15:00'));
    expect(at(next, 'b').startsWith(TUE)).toBe(true);
  });

  it('detects when a move would make something late, so the app can ask first', () => {
    const before = setup();
    const after = actions.moveToDay(before, 'a', WED, NOW); // a is due Tuesday
    expect(newlyLate(before, after).map((t) => t.id)).toEqual(['a']);
    expect(newlyLate(before, actions.moveToDay(before, 'b', WED, NOW))).toEqual([]);
  });
});
