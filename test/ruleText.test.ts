import { describe, expect, it } from 'vitest';
import { ruleText } from '../src/app/format';

describe('rules as plain sentences', () => {
  it('reads each kind of rule', () => {
    expect(ruleText({ id: '1', kind: 'afterBlock', tag: 'school', minutes: 60, appliesTo: 'schoolwork' })).toBe(
      'No schoolwork for 60 min after getting home from school',
    );
    expect(ruleText({ id: '2', kind: 'beforeBlock', tag: 'school', minutes: 60, appliesTo: 'all', from: 'leave' })).toBe(
      'No tasks for 60 min before leaving for school',
    );
    expect(ruleText({ id: '3', kind: 'beforeBlock', tag: 'school', minutes: 1440, appliesTo: 'all', from: 'leave', weekdays: [1, 2, 3, 4] })).toBe(
      'No tasks all morning before leaving for school · Mon–Thu',
    );
    expect(ruleText({ id: '4', kind: 'beforeBlock', tag: 'work', minutes: 60, appliesTo: 'all' })).toBe('No tasks for 60 min before the start of a work shift');
    expect(ruleText({ id: '5', kind: 'window', weekdays: [0, 6], startMin: 0, endMin: 720, appliesTo: 'all' })).toBe(
      'No tasks from 12:00am to 12:00pm · Sun, Sat',
    );
  });
});
