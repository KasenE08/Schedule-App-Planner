import type { CutoffRule, Location, Settings } from './types';

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

/** Generic starting rules; every value is editable in Settings. Other tasks bypass all of them. */
export const DEFAULT_RULES: CutoffRule[] = [
  { id: 'after-school', kind: 'afterBlock', tag: 'school', minutes: 60, appliesTo: 'schoolwork' },
  { id: 'before-work', kind: 'beforeBlock', tag: 'work', minutes: 60, appliesTo: 'schoolwork' },
  { id: 'after-gym', kind: 'afterBlock', tag: 'gym', minutes: 30, appliesTo: 'schoolwork' },
  { id: 'weekend-morning', kind: 'window', weekdays: [0, 6], startMin: 0, endMin: 12 * 60, appliesTo: 'schoolwork' },
];

export const HOME: Location = { id: 'home', name: 'Home', fromHomeMin: 0, toHomeMin: 0 };
