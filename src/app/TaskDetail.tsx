import type { Task } from '../core/types';
import { actions, type AppData } from './model';
import { commit } from './store';
import { Field, SheetFrame, useUI } from './ui';
import { category, fmtDay, fmtDue, fmtDur, fmtTime, TYPE_LABELS } from './format';
import { CATEGORY_ICONS, Icon } from './icons';
import { categoryRank } from '../core/priority';

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
        <span class="chip-icon lg"><Icon name={CATEGORY_ICONS[categoryRank(t)]} size={26} /></span>
        <h2>{t.title}</h2>
        <div class="meta">
          {cat.label} · {TYPE_LABELS[t.type]} · {fmtDur(t.estimateMin)}
        </div>
      </div>
      <div class="info-list">
        <div class="info-row">
          <Icon name="flag" />
          <span class="info-label">Due</span>
          <span>{t.due === null ? 'Missing: as soon as possible' : fmtDue(t.due)}</span>
        </div>
        <div class="info-row">
          <Icon name="clock" />
          <span class="info-label">Do it</span>
          <span>{slot ? `${fmtDue(slot.start)} – ${fmtTime(slot.end)}` : 'Not scheduled'}</span>
        </div>
        <div class="info-row">
          <Icon name="play" />
          <span class="info-label">Status</span>
          <span>{statusText(t)}</span>
        </div>
      </div>
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
        <p class="callout warn">
          <Icon name="alert" size={16} />
          {warning.kind === 'late' ? "This can't be finished before it's due." : 'No free time fits this yet.'}
        </p>
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
          <Icon name="edit" size={16} /> Edit
        </button>
        <button
          class="btn danger"
          onClick={() => {
            if (!confirm(`Delete "${t.title}"?`)) return;
            act(actions.deleteTask);
            ui.close();
          }}
        >
          <Icon name="trash" size={16} /> Delete
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
