import type { DateKey } from '../core/types';
import { addDays, dateKey, daysInMonth, weekday } from '../core/time';
import type { AppData } from './model';
import { category, fmtDay, WEEKDAYS } from './format';
import { Icon } from './icons';

/** First day of the month containing `key`. */
export const monthStart = (key: DateKey): DateKey => `${key.slice(0, 8)}01`;

/** Same day-of-month `n` months later (clamped to 1st). */
export function addMonths(first: DateKey, n: number): DateKey {
  const [y, m] = first.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return dateKey(d);
}

/** Every cell of the month grid, Sunday first, padded to whole weeks. */
export function monthCells(first: DateKey): DateKey[] {
  const start = addDays(first, -weekday(first));
  const total = Math.ceil((weekday(first) + daysInMonth(first)) / 7) * 7;
  return Array.from({ length: total }, (_, i) => addDays(start, i));
}

export function MonthGrid(p: {
  data: AppData;
  month: DateKey;
  setMonth: (k: DateKey) => void;
  selected: DateKey;
  today: DateKey;
  onSelect: (k: DateKey) => void;
  isOver: (t: { day: string }) => boolean;
}) {
  const tasks = new Map(p.data.tasks.map((t) => [t.id, t]));
  // Category colors of each day's unfinished assignments, for the dots.
  const dots = new Map<DateKey, string[]>();
  for (const i of p.data.plan?.items ?? []) {
    const t = tasks.get(i.taskId);
    if (!t || t.status === 'done') continue;
    const k = dateKey(i.start);
    dots.set(k, [...(dots.get(k) ?? []), category(t).color]);
  }
  const month = p.month.slice(0, 7);

  return (
    <div class="month">
      <div class="month-head">
        <h2>{fmtDay(p.month, { month: 'long', year: 'numeric' })}</h2>
        <div class="row">
          <button class="icon-btn" aria-label="Previous month" onClick={() => p.setMonth(addMonths(p.month, -1))}>
            <Icon name="chevronLeft" />
          </button>
          <button class="icon-btn" aria-label="Next month" onClick={() => p.setMonth(addMonths(p.month, 1))}>
            <Icon name="chevronRight" />
          </button>
        </div>
      </div>
      <div class="month-grid">
        {WEEKDAYS.map((w) => (
          <span class="wd">{w[0]}</span>
        ))}
        {monthCells(p.month).map((k) => {
          const d = dots.get(k) ?? [];
          return (
            <button
              class={`mday ${k.slice(0, 7) !== month ? 'out' : ''} ${k === p.today ? 'today' : ''} ${k === p.selected ? 'on' : ''} ${p.isOver({ day: k }) ? 'drop-over' : ''}`}
              data-drop-day={k}
              aria-label={`${fmtDay(k, { weekday: 'long', month: 'long', day: 'numeric' })}${d.length ? `, ${d.length} assignments` : ''}`}
              onClick={() => p.onSelect(k)}
            >
              <strong>{Number(k.slice(8))}</strong>
              <span class="mdots">
                {d.slice(0, 3).map((c) => (
                  <i style={{ background: c }} />
                ))}
                {d.length > 3 && <em>+{d.length - 3}</em>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
