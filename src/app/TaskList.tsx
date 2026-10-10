import { useState } from 'preact/hooks';
import type { Ms } from '../core/types';
import { comparePriority } from '../core/priority';
import type { AppData } from './model';
import { useUI } from './ui';
import { category, fmtDue, fmtDur } from './format';

export function TaskList({ data }: { data: AppData; now: Ms }) {
  const ui = useUI();
  const [showDone, setShowDone] = useState(false);
  const slots = new Map((data.plan?.items ?? []).map((i) => [i.taskId, i]));
  const open = data.tasks.filter((t) => t.status !== 'done').sort(comparePriority);
  const done = data.tasks
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
    .slice(0, 30);

  return (
    <div>
      <header class="top">
        <h1>Tasks</h1>
        <span class="muted">{open.length} to do</span>
      </header>
      {open.length === 0 && <p class="muted center">Nothing to do. Tap + to add an assignment.</p>}
      <ul class="list">
        {open.map((t) => {
          const slot = slots.get(t.id);
          return (
            <li class="list-item" style={{ '--cat': category(t).color }} onClick={() => ui.open({ kind: 'detail', id: t.id })}>
              <div class="title">
                {t.status === 'inProgress' && '▶ '}
                {t.title}
              </div>
              <div class="muted small">
                {category(t).label} · {fmtDur(t.estimateMin)} · {t.due === null ? 'missing, ASAP' : `due ${fmtDue(t.due)}`}
              </div>
              <div class={`small ${slot?.late ? 'warn' : ''}`}>{slot ? `Do: ${fmtDue(slot.start)}` : 'Not scheduled'}</div>
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <button class="link section-toggle" onClick={() => setShowDone(!showDone)}>
          {showDone ? 'Hide' : 'Show'} completed ({done.length})
        </button>
      )}
      {showDone && (
        <ul class="list">
          {done.map((t) => (
            <li class="list-item done" style={{ '--cat': category(t).color }} onClick={() => ui.open({ kind: 'detail', id: t.id })}>
              <div class="title">✓ {t.title}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
