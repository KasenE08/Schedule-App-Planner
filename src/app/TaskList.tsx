import { useState } from 'preact/hooks';
import type { Ms, Task } from '../core/types';
import { actions, type AppData } from './model';
import { commit } from './store';
import { useUI } from './ui';
import { category, fmtDue, fmtDur } from './format';
import { Icon } from './icons';
import { CATS, filterTasks, VIEWS, type Cat, type View } from './taskFilters';

export function TaskList({ data, now }: { data: AppData; now: Ms }) {
  const ui = useUI();
  const [view, setView] = useState<View>('all');
  const [cats, setCats] = useState<Cat[]>([]);
  const slots = new Map((data.plan?.items ?? []).map((i) => [i.taskId, i]));
  const open = data.tasks.filter((t) => t.status !== 'done');
  const list = filterTasks(data, view, cats, now);
  const counts = Object.fromEntries(VIEWS.map((v) => [v.id, filterTasks(data, v.id, cats, now).length])) as Record<View, number>;

  /** The round checkbox: finish an open task, or reopen a finished one. */
  const toggle = (t: Task) =>
    commit((d, n) => (t.status === 'done' ? actions.reopenTask(d, t.id, n) : actions.completeTask(d, t.id, n)));

  return (
    <div>
      <header class="top">
        <h1>Tasks</h1>
        <span class="count-pill">{open.length} to do</span>
      </header>
      <div class="filter-row" role="tablist" aria-label="Show">
        {VIEWS.map((v) => (
          <button role="tab" aria-selected={view === v.id} class={`filter ${view === v.id ? 'on' : ''} ${v.id === 'late' && counts.late ? 'alert' : ''}`} onClick={() => setView(v.id)}>
            {v.label}
            <span class="n">{counts[v.id]}</span>
          </button>
        ))}
      </div>
      <div class="filter-row cats" aria-label="Category">
        {CATS.map((c) => (
          <button
            class={`cat-chip ${c.id} ${cats.includes(c.id) ? 'on' : ''}`}
            aria-pressed={cats.includes(c.id)}
            onClick={() => setCats(cats.includes(c.id) ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
          >
            <span class="dot" />
            {c.label}
          </button>
        ))}
      </div>
      {list.length === 0 && (
        <p class="empty">
          {view === 'done' ? 'Nothing completed yet.' : view === 'all' && !cats.length ? 'Nothing to do. Tap + to add an assignment.' : 'Nothing here.'}
        </p>
      )}
      <ul class="task-rows">
        {list.map((t) => {
          const slot = slots.get(t.id);
          const cat = category(t);
          return (
            <li class={`task-row ${t.status}`} style={{ '--cat': cat.color }}>
              <button
                class={`check ${t.status === 'done' ? 'on' : ''}`}
                aria-label={t.status === 'done' ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
                onClick={() => toggle(t)}
              >
                {t.status === 'done' && <Icon name="check" size={14} />}
              </button>
              <button class="task-row-body" onClick={() => ui.open({ kind: 'detail', id: t.id })}>
                <span class="title">
                  {t.status === 'inProgress' && <span class="badge">In progress</span>}
                  {t.title}
                </span>
                <span class="meta">
                  <span class="dot" />
                  {cat.label} · {fmtDur(t.estimateMin)} · {t.due === null ? 'missing, ASAP' : `due ${fmtDue(t.due)}`}
                </span>
                {t.status !== 'done' && (
                  <span class={`meta ${slot?.late ? 'warn' : ''}`}>{slot ? `Do: ${fmtDue(slot.start)}` : 'Not scheduled'}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
