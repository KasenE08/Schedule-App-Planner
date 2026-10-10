import { useState } from 'preact/hooks';
import type { BlockTag, FixedBlock, Recurrence, ReminderStep } from '../core/types';
import { dateKey } from '../core/time';
import { actions, type AppData } from './model';
import { commit } from './store';
import { Chips, Field, SheetFrame, useUI } from './ui';
import { fmtDay, inputToMin, minToInput, TAG_LABELS, uid, WEEKDAYS } from './format';

type Kind = Recurrence['kind'];
const KINDS: { value: Kind; label: string }[] = [
  { value: 'once', label: 'One time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthlyDate', label: 'Monthly (same date)' },
  { value: 'monthlyNth', label: 'Monthly (e.g. 2nd Tuesday)' },
];

export function BlockForm({ data, block, once }: { data: AppData; block?: FixedBlock; once?: boolean }) {
  const ui = useUI();
  const today = dateKey(Date.now());
  const r = block?.recurrence;
  const [title, setTitle] = useState(block?.title ?? '');
  const [tag, setTag] = useState<BlockTag>(block?.tag ?? 'other');
  const [locationId, setLocationId] = useState(block?.locationId ?? 'home');
  const [start, setStart] = useState(minToInput(block?.startMin ?? 18 * 60));
  const [end, setEnd] = useState(minToInput(block?.endMin ?? 19 * 60));
  const [kind, setKind] = useState<Kind>(r?.kind ?? (once ? 'once' : 'weekly'));
  const [date, setDate] = useState(r?.kind === 'once' ? r.date : today);
  const [weekdays, setWeekdays] = useState<number[]>(r?.kind === 'weekly' ? r.weekdays : []);
  const [monthDay, setMonthDay] = useState(r?.kind === 'monthlyDate' ? r.day : 1);
  const [nth, setNth] = useState(r?.kind === 'monthlyNth' ? r.nth : 1);
  const [nthDay, setNthDay] = useState(r?.kind === 'monthlyNth' ? r.weekday : 1);
  const [startDate, setStartDate] = useState(block?.startDate ?? '');
  const [endDate, setEndDate] = useState(block?.endDate ?? '');
  const [skips, setSkips] = useState<string[]>(block?.skipDates ?? []);
  const [blocks, setBlocks] = useState(block?.blocksScheduling !== false);
  const [steps, setSteps] = useState<ReminderStep[]>(block?.steps ?? []);
  const [error, setError] = useState('');

  const recurrence = (): Recurrence => {
    switch (kind) {
      case 'once': return { kind, date };
      case 'daily': return { kind };
      case 'weekly': return { kind, weekdays };
      case 'monthlyDate': return { kind, day: monthDay };
      case 'monthlyNth': return { kind, weekday: nthDay, nth };
    }
  };

  const save = () => {
    if (!title.trim()) return setError('Give it a name.');
    if (kind === 'weekly' && weekdays.length === 0) return setError('Pick at least one day.');
    const s = inputToMin(start);
    let e = inputToMin(end);
    if (e <= s) e += 24 * 60; // ends after midnight
    const next: FixedBlock = {
      id: block?.id ?? uid(),
      title: title.trim(),
      tag,
      locationId,
      startMin: s,
      endMin: e,
      recurrence: recurrence(),
      startDate: kind !== 'once' && startDate ? startDate : undefined,
      endDate: kind !== 'once' && endDate ? endDate : undefined,
      skipDates: kind !== 'once' && skips.length ? skips : undefined,
      blocksScheduling: blocks ? undefined : false,
      steps: steps.length ? steps.filter((x) => x.title.trim()) : undefined,
    };
    commit((d, now) => actions.saveBlock(d, next, now));
    ui.close();
  };

  return (
    <SheetFrame title={block ? 'Edit fixed time' : kind === 'once' ? 'New fixed event' : 'New fixed time'} onSave={save}>
      <Field label="Name">
        <input value={title} onInput={(e) => setTitle(e.currentTarget.value)} placeholder="e.g. Dentist" />
      </Field>
      <div class="row2">
        <Field label="Kind" hint="Cutoff rules use this.">
          <select value={tag} onChange={(e) => setTag(e.currentTarget.value as BlockTag)}>
            {Object.entries(TAG_LABELS).map(([v, l]) => (
              <option value={v}>{l}</option>
            ))}
          </select>
        </Field>
        <Field label="Where">
          <select value={locationId} onChange={(e) => setLocationId(e.currentTarget.value)}>
            {data.locations.map((l) => (
              <option value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div class="row2">
        <Field label="Starts">
          <input type="time" value={start} onInput={(e) => setStart(e.currentTarget.value)} />
        </Field>
        <Field label="Ends">
          <input type="time" value={end} onInput={(e) => setEnd(e.currentTarget.value)} />
        </Field>
      </div>
      <Field label="Repeats">
        <select value={kind} onChange={(e) => setKind(e.currentTarget.value as Kind)}>
          {KINDS.map((k) => (
            <option value={k.value}>{k.label}</option>
          ))}
        </select>
      </Field>
      {kind === 'once' && (
        <Field label="Date">
          <input type="date" value={date} onInput={(e) => setDate(e.currentTarget.value)} />
        </Field>
      )}
      {kind === 'weekly' && (
        <Chips
          options={WEEKDAYS.map((l, i) => ({ value: i, label: l }))}
          selected={weekdays}
          onToggle={(d) => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
        />
      )}
      {kind === 'monthlyDate' && (
        <Field label="Day of month">
          <input type="number" min={1} max={31} value={monthDay} onInput={(e) => setMonthDay(Number(e.currentTarget.value))} />
        </Field>
      )}
      {kind === 'monthlyNth' && (
        <div class="row2">
          <Field label="Which">
            <select value={nth} onChange={(e) => setNth(Number(e.currentTarget.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option value={n}>{['1st', '2nd', '3rd', '4th', '5th'][n - 1]}</option>
              ))}
              <option value={-1}>Last</option>
            </select>
          </Field>
          <Field label="Day">
            <select value={nthDay} onChange={(e) => setNthDay(Number(e.currentTarget.value))}>
              {WEEKDAYS.map((l, i) => (
                <option value={i}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {kind !== 'once' && (
        <>
          <div class="row2">
            <Field label="From (optional)">
              <input type="date" value={startDate} onInput={(e) => setStartDate(e.currentTarget.value)} />
            </Field>
            <Field label="Until (optional)">
              <input type="date" value={endDate} onInput={(e) => setEndDate(e.currentTarget.value)} />
            </Field>
          </div>
          <Field label="Skip dates" hint="Holidays, cancelled shifts.">
            <input
              type="date"
              value=""
              onChange={(e) => {
                const v = e.currentTarget.value;
                if (v && !skips.includes(v)) setSkips([...skips, v].sort());
                e.currentTarget.value = '';
              }}
            />
          </Field>
          <div class="chips">
            {skips.map((k) => (
              <button type="button" class="chip on" onClick={() => setSkips(skips.filter((x) => x !== k))}>
                {fmtDay(k)} ✕
              </button>
            ))}
          </div>
        </>
      )}
      <label class="toggle">
        <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.currentTarget.checked)} />
        No assignments during this
      </label>
      <Field label="Reminders during this" hint="Minutes after it starts, e.g. laundry: 0 washer, 60 dryer, 120 take out.">
        {steps.map((st, i) => (
          <div class="row step">
            <input
              type="number"
              inputMode="numeric"
              value={st.offsetMin}
              onInput={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, offsetMin: Number(e.currentTarget.value) } : x)))}
            />
            <input
              value={st.title}
              placeholder="Reminder"
              onInput={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, title: e.currentTarget.value } : x)))}
            />
            <button type="button" class="link" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" class="link" onClick={() => setSteps([...steps, { offsetMin: 0, title: '' }])}>
          + Add reminder
        </button>
      </Field>
      {error && <p class="warn">{error}</p>}
      {block && (
        <button
          class="btn danger wide"
          onClick={() => {
            if (!confirm(`Delete "${block.title}"?`)) return;
            commit((d, now) => actions.deleteBlock(d, block.id, now));
            ui.close();
          }}
        >
          Delete
        </button>
      )}
    </SheetFrame>
  );
}
