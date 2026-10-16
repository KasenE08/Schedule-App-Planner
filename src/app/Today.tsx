import { useState } from 'preact/hooks';
import type { BlockTag, DateKey, Ms, Task } from '../core/types';
import { addDays, at, dateKey } from '../core/time';
import { occurrencesOn } from '../core/availability';
import type { AppData } from './model';
import { actions } from './model';
import { commit, getData } from './store';
import { fixLateness, newlyLate } from './model';
import { useDrag, type DropTarget } from './drag';
import { MonthGrid, monthStart } from './MonthGrid';
import { CATEGORY_ICONS, Icon, TAG_STYLE } from './icons';
import { categoryRank } from '../core/priority';
import { choose } from './dialog';
import { useUI } from './ui';
import { category, fmtDay, fmtDue, fmtDur, fmtTime, inputToMin, minToInput, TAG_LABELS } from './format';

type Entry =
  | { kind: 'block'; start: Ms; end: Ms; title: string; sub: string; soft: boolean; tag: string; tagKey: BlockTag }
  | { kind: 'task'; start: Ms; end: Ms; task: Task; late: boolean; night?: boolean }
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
      tagKey: o.block.tag,
    });
  }
  for (const i of d.plan?.items ?? []) {
    const task = tasks.get(i.taskId);
    if (task && inDay(i.start)) out.push({ kind: 'task', start: i.start, end: i.end, task, late: i.late, night: i.night });
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
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [month, setMonth] = useState<DateKey>(monthStart(today));
  const ui = useUI();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, weekOffset * 7 + i));
  const entries = entriesFor(data, day, now);
  const school = occurrencesOn(day, data.blocks, data.locations).find((o) => o.block.tag === 'school');
  const tasks = new Map(data.tasks.map((t) => [t.id, t]));
  const onDrop = async (id: string, target: DropTarget) => {
    const cur = getData();
    const n = Date.now();
    let next: AppData;
    const notes: string[] = [];
    const movedTitle = cur.tasks.find((t) => t.id === id)?.title ?? 'this';
    if ('day' in target) {
      next = actions.moveToDay(cur, id, target.day, n);
      const slot = next.plan?.items.find((i) => i.taskId === id);
      if (slot && dateKey(slot.start) !== target.day) {
        notes.push(`No room on ${fmtDay(target.day)}, so it goes to ${fmtDue(slot.start)}.`);
      }
    } else {
      // Reorder this day's list: the dragged one takes the target's spot, the rest shift up or down.
      const ids = entries.filter((e): e is Extract<Entry, { kind: 'task' }> => e.kind === 'task' && e.task.status === 'todo').map((e) => e.task.id);
      const from = ids.indexOf(id);
      const to = ids.indexOf(target.task);
      if (from === -1 || to === -1) return;
      ids.splice(from, 1);
      ids.splice(to, 0, id);
      next = actions.reorderDay(cur, day, ids, n);
    }
    // If anything ends up late, offer the smallest help that gets it done on time.
    const fix = fixLateness(cur, next, id, n, 'day' in target ? target.day === dateKey(n) : day === dateKey(n));
    if (fix) {
      const allOnTime = fix.tasks.every((t) => !fix.data.plan!.items.some((i) => i.taskId === t.id && i.late));
      const how = fix.skipBreak && fix.night
        ? 'Skipping the break and working past midnight (until 2am)'
        : fix.skipBreak
          ? 'Skipping the 30-minute break'
          : 'Working past midnight (until 2am)';
      const pick = await choose(
        `Moving "${movedTitle}": ${fix.tasks.map((t) => `"${t.title}"`).join(', ')} would be late. ${how} gets ${allOnTime ? 'it' : 'more'} done on time.`,
        [fix.skipBreak && fix.night ? 'Skip break & work late' : fix.skipBreak ? 'Skip the break' : 'Work past midnight', 'Move anyway (late)', 'Cancel'],
      );
      if (pick === 0) commit(() => fix.data);
      else if (pick === 1) commit(() => next);
      return;
    }
    const late = newlyLate(cur, next);
    if (late.length) notes.push(`This makes ${late.map((t) => `"${t.title}"`).join(', ')} late.`);
    if (notes.length && !confirm(`Moving "${movedTitle}": ${notes.join(' ')} Move anyway?`)) return;
    commit(() => next);
  };
  const dnd = useDrag(onDrop);

  const countFor = (k: DateKey) =>
    (data.plan?.items ?? []).filter((i) => dateKey(i.start) === k && tasks.get(i.taskId)?.status !== 'done').length;

  return (
    <div>
      <header class="top">
        <div>
          <h1>{day === today ? 'Today' : fmtDay(day, { weekday: 'long' })}</h1>
          <div class="muted">{fmtDay(day, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div class="row">
          {day === today && hasOpenWork(data) && (
            <button class="btn small" onClick={behind}>
              Falling behind
            </button>
          )}
          <button class="btn small" onClick={() => ui.open({ kind: 'block', once: true })}>
            <Icon name="plus" size={16} /> Event
          </button>
        </div>
      </header>

      {data.push?.error && <div class="card small warn">Notifications: {data.push.error}</div>}

      <div class="segmented view-switch" role="tablist" aria-label="Calendar view">
        <button role="tab" aria-selected={mode === 'week'} class={mode === 'week' ? 'on' : ''} onClick={() => setMode('week')}>
          Week
        </button>
        <button
          role="tab"
          aria-selected={mode === 'month'}
          class={mode === 'month' ? 'on' : ''}
          onClick={() => {
            setMonth(monthStart(day));
            setMode('month');
          }}
        >
          Month
        </button>
      </div>

      {mode === 'month' && (
        <MonthGrid data={data} month={month} setMonth={setMonth} selected={day} today={today} onSelect={setDay} isOver={dnd.isOver} />
      )}

      {mode === 'week' && <div class="week">
        <button class="icon-btn" aria-label="Previous week" disabled={weekOffset === 0} onClick={() => setWeekOffset(weekOffset - 1)}>
          <Icon name="chevronLeft" />
        </button>
        {days.map((k) => (
          <button
            class={`day ${k === day ? 'on' : ''} ${k === today ? 'today' : ''} ${dnd.isOver({ day: k }) ? 'drop-over' : ''}`}
            data-drop-day={k}
            onClick={() => setDay(k)}
          >
            <span>{fmtDay(k, { weekday: 'narrow' })}</span>
            <strong>{fmtDay(k, { day: 'numeric' })}</strong>
            <i class={countFor(k) ? 'has' : ''} aria-label={countFor(k) ? `${countFor(k)} assignments` : undefined}>{countFor(k) || ''}</i>
          </button>
        ))}
        <button class="icon-btn" aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}>
          <Icon name="chevronRight" />
        </button>
      </div>}

      {mode === 'month' && <h3 class="day-heading">{fmtDay(day, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>}

      {school && day <= today && (
        <div class="card row arrival">
          {day === today && data.arrivals[day] === undefined && now >= school.end && (
            <button
              class="btn small primary"
              onClick={() => {
                const t = new Date();
                commit((d, n) => actions.setArrival(d, day, t.getHours() * 60 + t.getMinutes(), n));
              }}
            >
              I'm home now
            </button>
          )}
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
                <Icon name="bell" size={16} />
                <span class="time">{fmtTime(e.start)}</span>
                <span>{e.title}</span>
              </li>
            );
          if (e.kind === 'block') {
            const st = TAG_STYLE[e.tagKey];
            return (
              <li class={`entry block ${e.soft ? 'soft' : ''}`} style={{ '--cat': st.color }}>
                <span class="chip-icon"><Icon name={st.icon} /></span>
                <div class="body">
                  <div class="title">{e.title}</div>
                  <div class="meta">
                    {fmtTime(e.start)} – {fmtTime(e.end)}
                    {e.sub ? ` · ${e.sub}` : ''}
                  </div>
                </div>
              </li>
            );
          }
          return <TaskEntry e={e} dnd={dnd} />;
        })}
      </ol>
      {dnd.ghost}
      {dnd.drag && <div class="drag-hint">Drop on a date to move it there, or on another assignment to reorder</div>}
      {entries.filter((e) => e.kind === 'task').length === 0 && data.blocks.length > 0 && (
        <p class="muted center">No assignments scheduled this day.</p>
      )}
    </div>
  );
}

function TaskEntry({ e, dnd }: { e: Extract<Entry, { kind: 'task' }>; dnd: ReturnType<typeof useDrag> }) {
  const ui = useUI();
  const t = e.task;
  const cat = category(t);
  const drag = t.status === 'todo' ? dnd.bind(t.id, t.title) : null;
  const open = () => ui.open({ kind: 'detail', id: t.id });
  return (
    <li
      class={`entry task ${t.status} ${e.late ? 'late' : ''} ${dnd.drag?.id === t.id ? 'dragging' : ''} ${dnd.isOver({ task: t.id }) ? 'drop-over' : ''}`}
      style={{ '--cat': cat.color }}
      data-drop-task={t.status === 'todo' ? t.id : undefined}
      onPointerDown={drag?.onPointerDown}
      onContextMenu={drag?.onContextMenu}
      onClick={drag ? drag.guard(open) : open}
    >
      <span class="chip-icon">
        <Icon name={t.status === 'done' ? 'check' : CATEGORY_ICONS[categoryRank(t)]} />
      </span>
      <div class="body">
        <div class="title">{t.title}</div>
        <div class="meta">
          {fmtTime(e.start)} – {fmtTime(e.end)} · {cat.label} · {fmtDur(t.estimateMin)}
        </div>
        <div class="meta">
          {t.due === null ? 'Missing, ASAP' : `Due ${fmtDue(t.due)}`}
          {t.pinDay ? ' · moved' : ''}
          {t.noBreakBefore ? ' · no break' : ''}
        </div>
        {e.late && <div class="warn small">Can't finish before it's due</div>}
        {e.night && !e.late && <div class="small night">Past midnight to finish on time</div>}
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
      <strong><Icon name="alert" size={16} /> Overload</strong>
      {list.map((w) => {
        const t = tasks.get(w.taskId)!;
        return (
          <button class="link warn-row" onClick={() => ui.open({ kind: 'detail', id: t.id })}>
            {w.kind === 'late'
              ? `${t.title}: finishes ${fmtDue(w.end)}, due ${fmtDue(w.due)}${data.night ? ' (even working until ' + fmtTime(data.night.end) + ')' : ''}`
              : `${t.title}: no time fits in the next ${data.settings.horizonDays} days`}
          </button>
        );
      })}
    </div>
  );
}

const hasOpenWork = (d: AppData) => d.tasks.some((t) => t.status === 'todo');

function behind() {
  const first = Date.now() + 5 * 60_000;
  if (!confirm(`Reschedule everything you haven't started, beginning at ${fmtTime(first)}?`)) return;
  let msg = '';
  commit((d, n) => {
    const next = actions.fallingBehind(d, n);
    const items = next.plan?.items.filter((i) => next.tasks.find((t) => t.id === i.taskId)?.status === 'todo') ?? [];
    const parts = [items.length ? `Rescheduled. First assignment at ${fmtTime(Math.min(...items.map((i) => i.start)))}.` : 'Nothing left to reschedule.'];
    if (items.some((i) => i.night)) parts.push('Some work runs past midnight to finish on time.');
    if (next.plan?.warnings.length) parts.push("Some assignments still can't be done on time. See Overload.");
    msg = parts.join(' ');
    return next;
  });
  alert(msg);
}
