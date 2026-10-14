import { describe, expect, it } from 'vitest';
import { actions, emptyData, fixLateness, newlyLate, nightWindow, replan } from '../src/app/model';
import { BLOCKS, LOCATIONS, MON, TUE, WED, THU, FRI, SUN, T, fmt, task } from './fixtures';

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

  it('dragging onto a full earlier day gives it first claim on that day; others shift', () => {
    let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
    d = actions.saveTask(d, task({ id: 'x1', estimateMin: 135, due: T(TUE, '23:59') }), NOW); // fills 5:45–8:00pm
    d = actions.saveTask(d, task({ id: 'x2', estimateMin: 145, due: T(TUE, '23:59') }), NOW); // fills 9:30–11:55pm
    d = actions.saveTask(d, task({ id: 'w', estimateMin: 60, due: T(WED, '23:59') }), NOW);
    expect(at(d, 'w').startsWith(TUE)).toBe(true); // Monday is full
    d = actions.moveToDay(d, 'w', MON, NOW);
    expect(at(d, 'w')).toBe(`${MON} 17:45`);
    expect(d.plan!.warnings).toEqual([]); // the others still fit before they're due
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

  it('skipping the break lets a task start right after the one before it', () => {
    let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
    d = actions.saveTask(d, task({ id: 'x', estimateMin: 60, due: T(MON, '23:59') }), NOW);
    d = actions.saveTask(d, task({ id: 'y', estimateMin: 60, due: T(MON, '20:00') }), NOW);
    d = actions.reorderDay(d, MON, ['x', 'y'], NOW); // y now after x, needs the 30 min break
    expect(d.plan!.items.find((i) => i.taskId === 'y')!.late).toBe(true);
    d = actions.setNoBreak(d, ['y'], true, NOW);
    expect(at(d, 'y')).toBe(`${MON} 18:45`);
    expect(d.plan!.warnings).toEqual([]);
    d = actions.setNoBreak(d, ['y'], false, NOW); // restore break
    expect(d.plan!.items.find((i) => i.taskId === 'y')!.late).toBe(true);
  });

  describe('bringing an assignment back to tonight so it makes its deadline', () => {
    // Sunday 11:30pm, two 35-minute Packet Tracers both due Monday 1:00am (like the real case).
    const MON2 = '2026-10-19';
    const LATE_NOW = T(SUN, '23:30');
    const due = T(MON2, '01:00');
    const tonight = (withNight: boolean) => {
      let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, LATE_NOW);
      if (withNight) d = { ...d, night: nightWindow(d, LATE_NOW) };
      d = actions.saveTask(d, task({ id: 'a', title: '10.3.4', estimateMin: 35, due, pinDay: SUN }), LATE_NOW);
      d = actions.saveTask(d, task({ id: 'b', title: '10.4.3', estimateMin: 35, due }), LATE_NOW);
      return d;
    };

    it('with tonight already unlocked, skipping the break gets it in on time', () => {
      const next = actions.moveToDay(tonight(true), 'b', SUN, LATE_NOW);
      expect(next.plan!.items.find((i) => i.taskId === 'b')!.late).toBe(true); // 12:45–1:20am with the break
      const fix = fixLateness(tonight(true), next, 'b', LATE_NOW, true)!;
      expect(fix).toMatchObject({ skipBreak: true, night: false });
      expect(at(fix.data, 'a')).toBe(`${SUN} 23:30`);
      expect(at(fix.data, 'b')).toBe(`${MON2} 00:05`); // right after a, done 12:40am
      expect(fix.data.plan!.warnings).toEqual([]);
    });

    it('without tonight unlocked, it offers skipping the break and working past midnight', () => {
      const next = actions.moveToDay(tonight(false), 'b', SUN, LATE_NOW);
      const fix = fixLateness(tonight(false), next, 'b', LATE_NOW, true)!;
      expect(fix.night).toBe(true);
      expect(fix.data.plan!.warnings).toEqual([]);
      expect(fix.data.plan!.items.every((i) => i.end <= T(MON2, '02:00'))).toBe(true);
    });

    it('never offers past midnight when the move is not onto today', () => {
      const next = actions.moveToDay(tonight(false), 'b', SUN, LATE_NOW);
      expect(fixLateness(tonight(false), next, 'b', LATE_NOW, false)?.night ?? false).toBe(false);
    });

    it('offers nothing when nothing is late, or when nothing can help', () => {
      const ok = actions.moveToDay(setup(), 'b', WED, NOW);
      expect(fixLateness(setup(), ok, 'b', NOW, false)).toBeNull();
      let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
      d = actions.saveTask(d, task({ id: 'z', estimateMin: 60, due: T(MON, '16:00') }), NOW); // no free time before 4pm
      expect(fixLateness(d, d, 'z', NOW, true)).toBeNull();
    });

    it('ignores a different assignment that was already late before the move', () => {
      // The real case: moving "Activity List" to Thursday while "Counselor transcript" is already late today.
      let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
      d = actions.saveTask(d, task({ id: 'transcript', title: 'Send counselor transcript', estimateMin: 30, due: T(MON, '16:00') }), NOW);
      d = actions.saveTask(d, task({ id: 'activity', title: 'Activity list descriptions', estimateMin: 45, due: T(FRI, '23:59') }), NOW);
      expect(d.plan!.items.find((i) => i.taskId === 'transcript')!.late).toBe(true); // already late
      const next = actions.moveToDay(d, 'activity', THU, NOW);
      expect(newlyLate(d, next)).toEqual([]);
      expect(fixLateness(d, next, 'activity', NOW, false)).toBeNull();
    });
  });
});
