// A light "profile" screen: friendly stats worked out from the data already on this phone.
import type { Ms } from '../core/types';
import { addDays, dateKey } from '../core/time';
import type { AppData } from './model';
import { fmtDay } from './format';
import { Icon } from './icons';

export function Profile({ data, now }: { data: AppData; now: Ms }) {
  const done = data.tasks.filter((t) => t.status === 'done');
  const open = data.tasks.filter((t) => t.status !== 'done');
  const today = dateKey(now);
  const weekEnd = addDays(today, 7);
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const plannedMin = (data.plan?.items ?? [])
    .filter((i) => tasks.get(i.taskId)?.status !== 'done' && dateKey(i.start) >= today && dateKey(i.start) < weekEnd)
    .reduce((m, i) => m + (i.end - i.start) / 60_000, 0);
  const doneThisWeek = done.filter((t) => t.completedAt && dateKey(t.completedAt) > addDays(today, -7)).length;
  const timedMin = data.history.reduce((m, h) => m + h.actualMin, 0);
  const since = data.tasks.length ? Math.min(...data.tasks.map((t) => t.createdAt)) : now;
  const hours = (min: number) => (min >= 60 ? `${Math.round((min / 60) * 10) / 10}h` : `${Math.round(min)}m`);

  const stats: [string, string][] = [
    ['Completed', String(done.length)],
    ['Done this week', String(doneThisWeek)],
    ['To do', String(open.length)],
    ['Planned next 7 days', hours(plannedMin)],
    ['Time tracked', hours(timedMin)],
    ['Fixed times', String(data.blocks.length)],
  ];

  return (
    <div>
      <header class="top">
        <h1>Profile</h1>
      </header>
      <div class="profile-card">
        <span class="avatar"><Icon name="user" size={30} /></span>
        <div>
          <h2>You</h2>
          <div class="meta">Planning since {fmtDay(since, { month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <h3 class="profile-h">Stats</h3>
      <div class="stat-grid">
        {stats.map(([label, value]) => (
          <div class="stat">
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p class="empty small">Everything here is worked out from the data on this phone.</p>
    </div>
  );
}
