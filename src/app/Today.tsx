import { useState } from 'preact/hooks';
import type { DateKey, Ms, Task } from '../core/types';
import { addDays, at, dateKey } from '../core/time';
import { occurrencesOn } from '../core/availability';
import type { AppData } from './model';
import { actions } from './model';
import { commit } from './store';
import { useUI } from './ui';
import { category, fmtDay, fmtDue, fmtDur, fmtTime, inputToMin, minToInput, TAG_LABELS } from './format';

type Entry =
  | { kind: 'block'; start: Ms; end: Ms; title: string; sub: string; soft: boolean; tag: string }
  | { kind: 'task'; start: Ms; end: Ms; task: Task; late: boolean }
  | { kind: 'reminder'; start: Ms; title: string }
  | { kind: 'now'; start: Ms };

function entriesFor(d: AppData, key: DateKey, now: Ms): Entry[] {
  const dayStart = at(key, 0);
  const dayEnd = at(addDays(key, 1), 0);
  const inDay = (t: Ms) => t >= dayStart && t < dayEnd;
  const locs = new Map(d.locations.map((l) => [l.id, l]));
  const tasks = new Map(d.tasks.map((t) => [t.id, t]));
  const out: Entry[] = [];

  for (const o of occurrencesOn(key, d.blocks, d.locations, d.arrivals)) {
    const loc = locs.get(o.block.locationId);
    const away = o.leave !== o.start || o.arrive !== o.end;
    out.push({
      kind: 'block',
      start: o.start,
      end: o.end,
      title: o.block.title,
      sub: [loc && loc.id !== 'home' ? loc.name : null, away ? `leave ${fmtTime(o.leave)} · home ${fmtTime(o.arrive)}` : null]
        .filter(Boolean)
        .join(' · '),
      soft: o.block.blocksScheduling === false,
      tag: TAG_LABELS[o.block.tag],
    });
  }
  for (const i of d.plan?.items ?? []) {
    const task = tasks.get(i.taskId);
    if (task && inDay(i.start)) out.push({ kind: 'task', start: i.start, end: i.end, task, late: i.late });
  }
  for (const r of d.plan?.blockReminders ?? []) {
    if (inDay(r.at)) out.push({ kind: 'reminder', start: r.at, title: r.title });
  }
  if (inDay(now)) out.push({ kind: 'now', start: now });
  return out.sort((a, b) => a.start - b.start || (a.kind === 'now' ? -1 : b.kind === 'now' ? 1 : 0));
}

export function Today({ data, now }: { data: AppData; now: Ms }) {
  const today = dateKey(now);
  const [day, setDay] = useState<DateKey>(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const ui = useUI();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, weekOffset * 7 + i));
  const entries = entriesFor(data, day, now);
  const school = occurrencesOn(day, data.blocks, data.locations).find((o) => o.block.tag === 'school');
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const countFor = (k: DateKey) =>
    (data.plan?.items ?? []).filter((i) => dateKey(i.start) === k && tasks.get(i.taskId)?.status !== 'done').length;

  return (
    <div>
      <header class="top">
        <div>
          <h1>{day === today ? 'Today' : fmtDay(day, { weekday: 'long' })}</h1>
          <div class="muted">{fmtDay(day, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <button class="btn small" onClick={() => ui.open({ kind: 'block', once: true })}>
          + Event
        </button>
      </header>

      {data.push?.error && <div class="card small warn">Notifications: {data.push.error}</div>}

      <div class="week">
        <button class="link" aria-label="Previous week" disabled={weekOffset === 0} onClick={() => setWeekOffset(weekOffset - 1)}>
          ‹
        </button>
        {days.map((k) => (
          <button class={`day ${k === day ? 'on' : ''} ${k === today ? 'today' : ''}`} onClick={() => setDay(k)}>
            <span>{fmtDay(k, { weekday: 'narrow' })}</span>
            <strong>{fmtDay(k, { day: 'numeric' })}</strong>
            <i>{countFor(k) || ''}</i>
          </button>
        ))}
        <button class="link" aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}>
          ›
        </button>
      </div>

      {school && day <= today && (
        <div class="card row arrival">
          <span>Home from school</span>
          <input
            type="time"
            value={data.arrivals[day] !== undefined ? minToInput(data.arrivals[day]) : ''}
            onChange={(e) => {
              const v = e.currentTarget.value;
              commit((d, n) => actions.setArrival(d, day, v ? inputToMin(v) : null, n));
            }}
          />
          <span class="muted small">{data.arrivals[day] === undefined ? `default ${fmtTime(school.arrive)}` : ''}</span>
        </div>
      )}

      {day === today && <Warnings data={data} />}

      {data.blocks.length === 0 && (
        <div class="card muted">No fixed schedule yet. Import your starter backup in Settings → Backup, or add times in Settings.</div>
      )}

      <ol class="timeline">
        {entries.map((e) => {
          if (e.kind === 'now') return <li class="now-line"><span>{fmtTime(e.start)}</span></li>;
          if (e.kind === 'reminder')
            return (
              <li class="entry reminder">
                <time>{fmtTime(e.start)}</time>
                <div class="body">⏰ {e.title}</div>
              </li>
            );
          if (e.kind === 'block')
            return (
              <li class={`entry block ${e.soft ? 'soft' : ''}`}>
                <time>
                  {fmtTime(e.start)}
                  <br />
                  <span class="muted">{fmtTime(e.end)}</span>
                </time>
                <div class="body">
                  <div class="title">{e.title}</div>
                  <div class="muted small">{[e.tag, e.sub].filter(Boolean).join(' · ')}</div>
                </div>
              </li>
            );
          return <TaskEntry e={e} />;
        })}
      </ol>
      {entries.filter((e) => e.kind === 'task').length === 0 && data.blocks.length > 0 && (
        <p class="muted center">No assignments scheduled this day.</p>
      )}
    </div>
  );
}

function TaskEntry({ e }: { e: Extract<Entry, { kind: 'task' }> }) {
  const ui = useUI();
  const t = e.task;
  const cat = category(t);
  return (
    <li
      class={`entry task ${t.status} ${e.late ? 'late' : ''}`}
      style={{ '--cat': cat.color }}
      onClick={() => ui.open({ kind: 'detail', id: t.id })}
    >
      <time>
        {fmtTime(e.start)}
        <br />
        <span class="muted">{fmtTime(e.end)}</span>
      </time>
      <div class="body">
        <div class="title">
          {t.status === 'done' && '✓ '}
          {t.title}
        </div>
        <div class="muted small">
          {cat.label} · {fmtDur(t.estimateMin)} · {t.due === null ? 'missing, ASAP' : `due ${fmtDue(t.due)}`}
        </div>
        {e.late && <div class="warn small">Can't finish before it's due</div>}
      </div>
      {t.status !== 'done' && (
        <button
          class="btn small"
          onClick={(ev) => {
            ev.stopPropagation();
            commit((d, n) => (t.status === 'todo' ? actions.startTask(d, t.id, n) : actions.completeTask(d, t.id, n)));
          }}
        >
          {t.status === 'todo' ? 'Start' : 'Done'}
        </button>
      )}
    </li>
  );
}

function Warnings({ data }: { data: AppData }) {
  const ui = useUI();
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const list = (data.plan?.warnings ?? []).filter((w) => tasks.get(w.taskId)?.status !== 'done');
  if (!list.length) return null;
  return (
    <div class="card overload">
      <strong>Overload</strong>
      {list.map((w) => {
        const t = tasks.get(w.taskId)!;
        return (
          <button class="link warn-row" onClick={() => ui.open({ kind: 'detail', id: t.id })}>
            {w.kind === 'late'
              ? `${t.title}: finishes ${fmtDue(w.end)}, due ${fmtDue(w.due)}`
              : `${t.title}: no time fits in the next ${data.settings.horizonDays} days`}
          </button>
        );
      })}
    </div>
  );
}
