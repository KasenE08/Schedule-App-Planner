import { describe, expect, it } from 'vitest';
import { actions, emptyData, replan } from '../src/app/model';
import { filterTasks } from '../src/app/taskFilters';
import { BLOCKS, LOCATIONS, MON, TUE, FRI, T, task, PACKED } from './fixtures';

const NOW = T(MON, '15:00');
const setup = () => {
  let d = replan({ ...emptyData(), blocks: BLOCKS, locations: LOCATIONS, settings: PACKED }, NOW);
  d = actions.saveTask(d, task({ id: 'today', estimateMin: 30, formats: ['online'], due: T(TUE, '23:59') }), NOW);
  d = actions.saveTask(d, task({ id: 'late', estimateMin: 60, formats: ['paper'], due: T(MON, '16:00') }), NOW);
  d = actions.saveTask(d, task({ id: 'errand', estimateMin: 30, formats: [], due: T(FRI, '23:59') }), NOW);
  d = actions.saveTask(d, task({ id: 'missing', estimateMin: 30, formats: ['paper'], missing: true, due: null }), NOW);
  d = actions.saveTask(d, task({ id: 'far', estimateMin: 30, formats: ['online'], due: T(FRI, '23:59') + 20 * 86_400_000, pinDay: '2026-10-29' }), NOW);
  d = actions.saveTask(d, task({ id: 'done', estimateMin: 30 }), NOW);
  return actions.completeTask(d, 'done', NOW);
};
const ids = (view: Parameters<typeof filterTasks>[1], cats: Parameters<typeof filterTasks>[2] = []) =>
  filterTasks(setup(), view, cats, NOW).map((t) => t.id).sort();

describe('task filters', () => {
  it('All shows every unfinished task', () => {
    expect(ids('all')).toEqual(['errand', 'far', 'late', 'missing', 'today']);
  });
  it('Today shows what is planned today', () => {
    const all = setup();
    const todayIds = filterTasks(all, 'today', [], NOW).map((t) => t.id);
    expect(todayIds).toContain('today');
    expect(todayIds).not.toContain('far');
  });
  it('Upcoming shows the next 7 days after today, not further out', () => {
    const up = ids('upcoming');
    expect(up).not.toContain('far');
    expect(up.every((id) => !ids('today').includes(id))).toBe(true);
  });
  it('Late shows only work that cannot finish before it is due', () => {
    expect(ids('late')).toEqual(['late']);
  });
  it('Completed shows finished tasks', () => {
    expect(ids('done')).toEqual(['done']);
  });
  it('category chips narrow the list; several chips widen it', () => {
    expect(ids('all', ['other'])).toEqual(['errand']);
    expect(ids('all', ['missing'])).toEqual(['missing']);
    expect(ids('all', ['paper'])).toEqual(['late', 'missing']);
    expect(ids('all', ['online', 'other'])).toEqual(['errand', 'far', 'today']);
  });
});
