import { useState } from 'preact/hooks';
import type { AssignmentType, Format, Task } from '../core/types';
import { BASE_ESTIMATES, estimateMinutes, learnedRatio } from '../core/estimate';
import { dateKey } from '../core/time';
import { actions, type AppData } from './model';
import { commit } from './store';
import { Chips, Field, SheetFrame, useUI } from './ui';
import { fmtDur, TYPE_LABELS, uid } from './format';
import { splitMinutes } from '../core/estimate';

const TYPES = Object.keys(TYPE_LABELS) as AssignmentType[];

export function TaskForm({ data, task }: { data: AppData; task?: Task }) {
  const ui = useUI();
  const due = task?.due ? new Date(task.due) : null;
  const [title, setTitle] = useState(task?.title ?? '');
  const [type, setType] = useState<AssignmentType>(task?.type ?? 'worksheet');
  const [formats, setFormats] = useState<Format[]>(task?.formats ?? ['online']);
  const [missing, setMissing] = useState(task?.missing ?? false);
  const [dueDate, setDueDate] = useState(due ? dateKey(due) : '');
  const [dueTime, setDueTime] = useState(due ? due.toTimeString().slice(0, 5) : '23:59');
  const [manual, setManual] = useState<number | null>(task?.estimateManual ? task.estimateMin : null);
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [error, setError] = useState('');

  const learned = learnedRatio(data.history, type);
  const auto = estimateMinutes(type, { paddingPct: data.settings.paddingPct, learnedRatio: learned.ratio });
  const estimate = manual ?? auto;

  const save = () => {
    if (!title.trim()) return setError('Give it a title.');
    if (!missing && !dueDate) return setError('Enter the actual due date.');
    if (!(estimate > 0)) return setError('Estimate must be at least 1 minute.');
    const [y, m, d] = dueDate.split('-').map(Number);
    const [hh, mm] = dueTime.split(':').map(Number);
    const next: Task = {
      id: task?.id ?? uid(),
      title: title.trim(),
      type,
      formats,
      missing,
      due: missing ? null : new Date(y, m - 1, d, hh, mm).getTime(),
      estimateMin: estimate,
      estimateManual: manual !== null,
      baseMin: manual !== null ? task?.baseMin : task?.group ? task.baseMin : BASE_ESTIMATES[type],
      notes: notes.trim() || undefined,
      status: task?.status ?? 'todo',
      startedAt: task?.startedAt,
      completedAt: task?.completedAt,
      createdAt: task?.createdAt ?? Date.now(),
    };
    const big = estimate > data.settings.bigTaskMin && !next.group;
    const split =
      big && confirm(`This will take about ${fmtDur(estimate)}. Split it into ${splitMinutes(estimate).length} parts on different days?`);
    commit((d0, now) => (split ? actions.splitTask(d0, next, now) : actions.saveTask(d0, next, now)));
    ui.close();
  };

  return (
    <SheetFrame title={task ? 'Edit assignment' : 'New assignment'} onSave={save}>
      <Field label="What do you have to do?">
        <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. Chem worksheet 4.2" />
      </Field>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.currentTarget.value as AssignmentType)}>
          {TYPES.map((t) => (
            <option value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </Field>
      <Field label="Category" hint={formats.length === 0 ? 'No format selected = Other (errands, chores).' : undefined}>
        <Chips
          options={[
            { value: 'online' as Format, label: 'Online' },
            { value: 'paper' as Format, label: 'Paper' },
          ]}
          selected={formats}
          onToggle={(f) => setFormats(formats.includes(f) ? formats.filter((x) => x !== f) : [...formats, f])}
        />
      </Field>
      {formats.length > 0 && (
        <label class="toggle">
          <input type="checkbox" checked={missing} onChange={(e) => setMissing(e.currentTarget.checked)} />
          Missing assignment (do as soon as possible)
        </label>
      )}
      {!missing && (
        <div class="row2">
          <Field label="Actual due date">
            <input type="date" value={dueDate} onInput={(e) => setDueDate(e.currentTarget.value)} />
          </Field>
          <Field label="Due time">
            <input type="time" value={dueTime} onInput={(e) => setDueTime(e.currentTarget.value)} />
          </Field>
        </div>
      )}
      <Field label="Time estimate (minutes)" hint={
          manual !== null
            ? 'Your own estimate.'
            : learned.samples >= 3
              ? `Automatic, adjusted from your last ${learned.samples} ${TYPE_LABELS[type].toLowerCase()} times, includes padding.`
              : `Automatic for ${TYPE_LABELS[type].toLowerCase()}, includes padding.`
        }>
        <div class="row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={estimate}
            onInput={(e) => setManual(Number(e.currentTarget.value))}
          />
          {manual !== null && (
            <button type="button" class="link" onClick={() => setManual(null)}>
              Use automatic ({auto})
            </button>
          )}
        </div>
      </Field>
      <Field label="Notes">
        <textarea rows={3} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
      </Field>
      {error && <p class="warn">{error}</p>}
    </SheetFrame>
  );
}
