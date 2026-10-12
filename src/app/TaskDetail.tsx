import type { Task } from '../core/types';
import { actions, type AppData } from './model';
import { commit } from './store';
import { Field, SheetFrame, useUI } from './ui';
import { category, fmtDay, fmtDue, fmtDur, fmtTime, TYPE_LABELS } from './format';

export function TaskDetail({ data, id }: { data: AppData; id: string }) {
  const ui = useUI();
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return null;
  const slot = data.plan?.items.find((i) => i.taskId === id);
  const warning = data.plan?.warnings.find((w) => w.taskId === id);
  const cat = category(t);
  const act = (fn: (d: AppData, id: string, now: number) => AppData) => commit((d, now) => fn(d, id, now));

  return (
    <SheetFrame title="Assignment">
      <div class="detail-head" style={{ '--cat': cat.color }}>
        <h2>{t.title}</h2>
        <div class="muted">
          {cat.label} · {TYPE_LABELS[t.type]} · {fmtDur(t.estimateMin)}
        </div>
      </div>
      <dl class="facts">
        <dt>Due</dt>
        <dd>{t.due === null ? 'Missing: as soon as possible' : fmtDue(t.due)}</dd>
        <dt>Do it</dt>
        <dd>{slot ? `${fmtDue(slot.start)} – ${fmtTime(slot.end)}` : 'Not scheduled'}</dd>
        <dt>Status</dt>
        <dd>{statusText(t)}</dd>
      </dl>
      {t.noBreakBefore && (
        <p class="small">
          Starts right after the one before it (break skipped).{' '}
          <button class="link" onClick={() => commit((d, now) => actions.setNoBreak(d, [id], false, now))}>
            Restore break
          </button>
        </p>
      )}
      {t.pinDay && (
        <p class="small">
          Moved by hand to {fmtDay(t.pinDay)}.{' '}
          <button class="link" onClick={() => act(actions.unpin)}>
            Let the app schedule it
          </button>
        </p>
      )}
      {warning && (
        <p class="warn">{warning.kind === 'late' ? "This can't be finished before it's due." : 'No free time fits this yet.'}</p>
      )}
      <Field label="Notes">
        <textarea
          rows={4}
          value={t.notes ?? ''}
          onChange={(e) => {
            const v = e.currentTarget.value;
            commit((d) => actions.setNotes(d, id, v));
          }}
        />
      </Field>
      <div class="actions">
        {t.status === 'todo' && (
          <button class="btn primary" onClick={() => act(actions.startTask)}>
            Start
          </button>
        )}
        {t.status !== 'done' && (
          <button class="btn primary" onClick={() => act(actions.completeTask)}>
            Done
          </button>
        )}
        {t.status !== 'todo' && (
          <button class="btn" onClick={() => act(actions.reopenTask)}>
            {t.status === 'done' ? 'Not done yet' : 'Stop (not started)'}
          </button>
        )}
        <button class="btn" onClick={() => ui.open({ kind: 'task', task: t })}>
          Edit
        </button>
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm(`Delete "${t.title}"?`)) return;
            act(actions.deleteTask);
            ui.close();
          }}
        >
          Delete
        </button>
      </div>
    </SheetFrame>
  );
}

function statusText(t: Task): string {
  if (t.status === 'done') return `Done ${t.completedAt ? fmtDue(t.completedAt) : ''}`;
  if (t.status === 'inProgress') return `Started ${t.startedAt ? fmtTime(t.startedAt) : ''}`;
  return 'Not started';
}
