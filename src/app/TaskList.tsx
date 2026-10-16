import { useState } from 'preact/hooks';
import type { Ms, Task } from '../core/types';
import { comparePriority } from '../core/priority';
import { actions, type AppData } from './model';
import { commit } from './store';
import { useUI } from './ui';
import { category, fmtDue, fmtDur } from './format';
import { Icon } from './icons';

type Filter = 'todo' | 'done';

export function TaskList({ data }: { data: AppData; now: Ms }) {
  const ui = useUI();
  const [filter, setFilter] = useState<Filter>('todo');
  const slots = new Map((data.plan?.items ?? []).map((i) => [i.taskId, i]));
  const open = data.tasks.filter((t) => t.status !== 'done').sort(comparePriority);
  const done = data.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 30);
  const list = filter === 'todo' ? open : done;

  /** The round checkbox: finish an open task, or reopen a finished one. */
  const toggle = (t: Task) =>
    commit((d, n) => (t.status === 'done' ? actions.reopenTask(d, t.id, n) : actions.completeTask(d, t.id, n)));

  return (
    <div>
      <header class="top">
        <h1>Tasks</h1>
        <span class="count-pill">{open.length} to do</span>
      </header>
      <div class="segmented" role="tablist">
        <button role="tab" aria-selected={filter === 'todo'} class={filter === 'todo' ? 'on' : ''} onClick={() => setFilter('todo')}>
          To do
        </button>
        <button role="tab" aria-selected={filter === 'done'} class={filter === 'done' ? 'on' : ''} onClick={() => setFilter('done')}>
          Completed{done.length ? ` (${done.length})` : ''}
        </button>
      </div>
      {list.length === 0 && (
        <p class="empty">{filter === 'todo' ? 'Nothing to do. Tap + to add an assignment.' : 'Nothing completed yet.'}</p>
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
