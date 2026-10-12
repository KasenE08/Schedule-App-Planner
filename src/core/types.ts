/** Local calendar date, `YYYY-MM-DD`. */
export type DateKey = string;
/** Absolute instant in epoch milliseconds. */
export type Ms = number;

export interface Interval {
  start: Ms;
  end: Ms;
}

export type BlockTag = 'school' | 'work' | 'gym' | 'tutoring' | 'activity' | 'chore' | 'other';

export type Recurrence =
  | { kind: 'once'; date: DateKey }
  | { kind: 'daily' }
  /** weekdays: 0 = Sunday … 6 = Saturday */
  | { kind: 'weekly'; weekdays: number[] }
  /** Same date each month; days past month end fall on the last day. */
  | { kind: 'monthlyDate'; day: number }
  /** e.g. 2nd Tuesday. nth 1–5, or -1 for the last one in the month. */
  | { kind: 'monthlyNth'; weekday: number; nth: number };

/** A place with travel time from and back to Home. Home itself has 0/0. */
export interface Location {
  id: string;
  name: string;
  fromHomeMin: number;
  toHomeMin: number;
}

/** A reminder fired at an offset from a block's start (e.g. laundry: dryer at +60). */
export interface ReminderStep {
  offsetMin: number;
  title: string;
}

/** A pre-scheduled time or a one-off fixed event. Never moved by the scheduler. */
export interface FixedBlock {
  id: string;
  title: string;
  tag: BlockTag;
  locationId: string;
  /** Minutes after local midnight. endMin may exceed 1440 for overnight blocks. */
  startMin: number;
  endMin: number;
  recurrence: Recurrence;
  startDate?: DateKey;
  endDate?: DateKey;
  skipDates?: DateKey[];
  /** Default true. False = reminders only, tasks may run during it. */
  blocksScheduling?: boolean;
  steps?: ReminderStep[];
}

/** Which tasks a cutoff applies to: schoolwork only, or every task including Other. */
export type TaskScope = 'schoolwork' | 'all';

export type CutoffRule =
  /** No tasks for `minutes` after arriving home from a block with this tag. */
  | { id: string; kind: 'afterBlock'; tag: BlockTag; minutes: number; appliesTo: TaskScope }
  /**
   * No tasks for `minutes` before a block with this tag, counted from its start (default)
   * or from when you leave home. Optional weekday filter. minutes ≥ 1440 = the whole morning.
   */
  | {
      id: string;
      kind: 'beforeBlock';
      tag: BlockTag;
      minutes: number;
      appliesTo: TaskScope;
      from?: 'start' | 'leave';
      weekdays?: number[];
    }
  /** No tasks inside this daily window on the given weekdays. */
  | { id: string; kind: 'window'; weekdays: number[]; startMin: number; endMin: number; appliesTo: TaskScope };

export interface Settings {
  /** Earliest any task may start, minutes after midnight. */
  earliestStartMin: number;
  /** Latest any task may end, minutes after midnight (1440 = 12am). */
  dayEndMin: number;
  breakMin: number;
  shortTaskMaxMin: number;
  shortPairBreakMin: number;
  bigTaskMin: number;
  paddingPct: number;
  horizonDays: number;
  /** Start times snap up to this grid. */
  slotRoundMin: number;
  /** How many days of notifications to send to the notification server. */
  notifyDays: number;
  /** Falling behind may run until this time after midnight (120 = 2am), only to stay on time. */
  latestNightMin: number;
}

export type Format = 'online' | 'paper';

export type AssignmentType =
  | 'worksheet'
  | 'reading'
  | 'essay'
  | 'project'
  | 'quizStudy'
  | 'testStudy'
  | 'discussion'
  | 'onlineQuiz'
  | 'lab'
  | 'presentation'
  | 'errand'
  | 'other';

export type TaskStatus = 'todo' | 'inProgress' | 'done';

export interface Task {
  id: string;
  title: string;
  type: AssignmentType;
  /** Empty = Other category (not schoolwork). Both = counts as its highest category. */
  formats: Format[];
  missing: boolean;
  /** Actual due date/time. null = as soon as possible (missing work). */
  due: Ms | null;
  /** Padded estimate the scheduler plans with. */
  estimateMin: number;
  /** True when the user typed the estimate instead of using the automatic one. */
  estimateManual?: boolean;
  /** Unpadded, unlearned base minutes the estimate came from; learning compares real time against it. */
  baseMin?: number;
  /** Moved here by hand: schedule on this day (or the next with room), never earlier. */
  pinDay?: DateKey;
  /** Hand-set order among tasks pinned to the same day (0 = first). */
  pinOrder?: number;
  /** User chose to skip the break before this task so it finishes on time. */
  noBreakBefore?: boolean;
  /** Parts of a split big task share a group; part is 1-based. */
  group?: string;
  part?: number;
  parts?: number;
  notes?: string;
  status: TaskStatus;
  startedAt?: Ms;
  completedAt?: Ms;
  createdAt: Ms;
}

export interface ScheduleInput {
  now: Ms;
  tasks: Task[];
  blocks: FixedBlock[];
  locations: Location[];
  rules: CutoffRule[];
  settings: Settings;
  /** Actual time arrived home from school, minutes after midnight, per date. */
  arrivals?: Record<DateKey, number>;
  /** Falling-behind mode: the first task starts exactly here (no 5-minute snapping). */
  exactStart?: Ms;
  /** Extra late-night time (e.g. 12am–2am), usable only by tasks that would otherwise be late. */
  nightExtension?: Interval;
}

export interface ScheduledItem {
  taskId: string;
  start: Ms;
  end: Ms;
  late: boolean;
  /** Placed in the late-night extension to stay on time. */
  night?: boolean;
}

export interface BlockReminder {
  blockId: string;
  title: string;
  at: Ms;
}

export type Warning =
  | { kind: 'late'; taskId: string; due: Ms; end: Ms }
  | { kind: 'unscheduled'; taskId: string };

export interface ScheduleResult {
  items: ScheduledItem[];
  blockReminders: BlockReminder[];
  warnings: Warning[];
}
