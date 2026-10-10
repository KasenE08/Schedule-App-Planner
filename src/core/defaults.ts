import type { CutoffRule, Location, Settings } from './types';
import { WHOLE_MORNING } from './availability';

export const DEFAULT_SETTINGS: Settings = {
  earliestStartMin: 8 * 60,
  dayEndMin: 24 * 60,
  breakMin: 30,
  shortTaskMaxMin: 20,
  shortPairBreakMin: 5,
  bigTaskMin: 90,
  paddingPct: 15,
  horizonDays: 28,
  slotRoundMin: 5,
};

/** Generic starting rules; every value is editable in Settings. Other tasks bypass only the after-school hour. */
export const DEFAULT_RULES: CutoffRule[] = [
  { id: 'after-school', kind: 'afterBlock', tag: 'school', minutes: 60, appliesTo: 'schoolwork' },
  { id: 'get-ready', kind: 'beforeBlock', tag: 'school', minutes: 60, from: 'leave', appliesTo: 'all' },
  { id: 'no-school-mornings', kind: 'beforeBlock', tag: 'school', minutes: WHOLE_MORNING, from: 'leave', weekdays: [1, 2, 3, 4], appliesTo: 'all' },
  { id: 'before-work', kind: 'beforeBlock', tag: 'work', minutes: 60, appliesTo: 'all' },
  { id: 'after-gym', kind: 'afterBlock', tag: 'gym', minutes: 30, appliesTo: 'all' },
  { id: 'weekend-morning', kind: 'window', weekdays: [0, 6], startMin: 0, endMin: 12 * 60, appliesTo: 'all' },
];

export const HOME: Location = { id: 'home', name: 'Home', fromHomeMin: 0, toHomeMin: 0 };
