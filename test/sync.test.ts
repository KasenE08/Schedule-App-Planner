import { describe, expect, it } from 'vitest';
import { actions, emptyData, replan } from '../src/app/model';
import { applyCompletions, buildPayload, isOutOfDate, markSent, parseSyncResult, reminderItems, remindText } from '../src/app/sync';
import { BLOCKS, LOCATIONS, MON, SAT, TUE, T, task } from './fixtures';

const NOW = T(MON, '15:00');
const setup = () => {
  let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS }, NOW);
  d = actions.saveTask(d, task({ id: 'a', title: 'Chem worksheet', estimateMin: 35, due: T(TUE, '23:59'), notes: 'pages 4-6' }), NOW);
  d = actions.saveTask(d, task({ id: 'b', title: 'Old lab', estimateMin: 30, formats: ['paper'], missing: true, due: null }), NOW);
  return d;
};

describe('reminders sync', () => {
  it('each planned task becomes a reminder at its scheduled time, with the real due date in title and notes', () => {
    const items = reminderItems(setup(), NOW);
    const a = items.find((i) => i.id === 'a')!;
    expect(a.title).toMatch(/^Chem worksheet · due Tue, Oct 13, 11:59\s?PM$/i);
    // After the missing lab (5:45–6:15) plus a 30 min break.
    expect(a.remind).toBe(remindText(T(MON, '18:45')));
    expect(a.notes).toContain('pages 4-6');
    expect(a.notes).toContain('[planner:a]');
    expect(items.find((i) => i.id === 'b')!.title).toBe('Old lab · missing');
  });

  it('reminder times are written in a form the Shortcuts app reads as a date', () => {
    expect(remindText(T(MON, '17:45'))).toMatch(/^October 12, 2026(,| at) 5:45\s?PM$/);
  });

  it('laundry steps are included; finished tasks and days past the sync window are not', () => {
    let d = setup();
    d = actions.completeTask(d, 'a', NOW);
    const items = reminderItems(d, NOW);
    expect(items.some((i) => i.id === 'a')).toBe(false);
    expect(items.filter((i) => i.id.startsWith('step-')).map((i) => i.title)).toEqual([
      'Put laundry in washer',
      'Move laundry to dryer',
      'Take laundry out of dryer',
    ]);
    const short = reminderItems({ ...d, settings: { ...d.settings, syncDays: 5 } }, NOW);
    expect(short.some((i) => i.id.startsWith('step-'))).toBe(false); // Sunday is day 7
  });

  it('each laundry step reminder has its own id, so checking one off skips only that one', () => {
    const ids = reminderItems(setup(), NOW).filter((i) => i.id.startsWith('step-')).map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('reminders are in time order', () => {
    const items = reminderItems(setup(), NOW);
    expect(items.map((i) => i.id).slice(0, 2)).toEqual(['b', 'a']);
  });

  it('knows when Reminders is out of date', () => {
    let d = setup();
    expect(isOutOfDate(d, NOW)).toBe(true);
    d = markSent(d, buildPayload(d, NOW), NOW);
    expect(isOutOfDate(d, NOW)).toBe(false);
    d = actions.saveTask(d, task({ id: 'c', estimateMin: 20 }), NOW);
    expect(isOutOfDate(d, NOW)).toBe(true);
  });

  it('reads the Shortcut result and ignores anything else on the clipboard', () => {
    expect(parseSyncResult('planner-sync-done:a,b')).toEqual(['a', 'b']);
    expect(parseSyncResult('planner-sync-done:')).toEqual([]);
    expect(parseSyncResult('planner-sync-done:a,step-laundry-123,')).toEqual(['a']);
    expect(parseSyncResult('hello')).toBeNull();
  });

  it('checked-off reminders mark tasks done without moving anything, and Reminders stays in sync', () => {
    let d = setup();
    d = markSent(d, buildPayload(d, NOW), NOW);
    const { data, count } = applyCompletions(d, ['a', 'zzz'], T(MON, '19:30'));
    expect(count).toBe(1);
    expect(data.tasks.find((t) => t.id === 'a')).toMatchObject({ status: 'done', completedAt: T(MON, '19:30') });
    expect(data.plan).toBe(d.plan);
    expect(data.sync.pending).toBe(false);
    expect(isOutOfDate(data, NOW)).toBe(false);
  });

  it('no plan yet means nothing to sync', () => {
    expect(reminderItems(emptyData(), T(SAT, '12:00'))).toEqual([]);
  });
});
