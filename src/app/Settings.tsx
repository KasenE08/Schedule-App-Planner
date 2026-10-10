import type { BlockTag, CutoffRule, Location, Settings as S, TaskScope } from '../core/types';
import { WHOLE_MORNING } from '../core/availability';
import { dateKey } from '../core/time';
import { actions, exportBackup, parseBackup, type AppData } from './model';
import { commit } from './store';
import { Chips, useUI } from './ui';
import { fmtMin, inputToMin, minToInput, recurrenceText, TAG_LABELS, uid, WEEKDAYS } from './format';

export function Settings({ data }: { data: AppData }) {
  const ui = useUI();
  const today = dateKey(Date.now());
  const locName = (id: string) => data.locations.find((l) => l.id === id)?.name ?? '?';
  const byStart = (a: { startMin: number }, b: { startMin: number }) => a.startMin - b.startMin;
  const recurring = data.blocks.filter((b) => b.recurrence.kind !== 'once').sort(byStart);
  const events = data.blocks
    .filter((b) => b.recurrence.kind === 'once' && b.recurrence.date >= today)
    .sort((a, b) => (a.recurrence as { date: string }).date.localeCompare((b.recurrence as { date: string }).date) || byStart(a, b));

  const blockRow = (b: (typeof data.blocks)[number]) => (
    <li class="list-item" onClick={() => ui.open({ kind: 'block', block: b })}>
      <div class="title">{b.title}</div>
      <div class="muted small">
        {recurrenceText(b.recurrence)} · {fmtMin(b.startMin)}–{fmtMin(b.endMin)} · {locName(b.locationId)}
        {b.blocksScheduling === false ? ' · assignments allowed' : ''}
      </div>
    </li>
  );

  return (
    <div>
      <header class="top">
        <h1>Settings</h1>
      </header>

      <section>
        <div class="section-head">
          <h3>Fixed schedule</h3>
          <button class="link" onClick={() => ui.open({ kind: 'block' })}>+ Add</button>
        </div>
        <ul class="list">{recurring.map(blockRow)}</ul>
        {recurring.length === 0 && <p class="muted small">None yet.</p>}
      </section>

      <section>
        <div class="section-head">
          <h3>Fixed events</h3>
          <button class="link" onClick={() => ui.open({ kind: 'block', once: true })}>+ Add</button>
        </div>
        <ul class="list">{events.map(blockRow)}</ul>
        {events.length === 0 && <p class="muted small">No upcoming one-time events.</p>}
      </section>

      <Locations data={data} />
      <Rules data={data} />
      <General settings={data.settings} />
      <section>
        <h3>Reminders sync</h3>
        <div class="card">
          <label class="set-row">
            <span>Days to put in Reminders</span>
            <span>
              <input type="number" inputMode="numeric" value={data.settings.syncDays} onChange={(e) => {
                const v = Math.min(28, Math.max(1, Number(e.currentTarget.value) || 7));
                commit((d) => ({ ...d, settings: { ...d.settings, syncDays: v } }));
              }} /> days
            </span>
          </label>
          <p class="muted small">
            Last sync: {data.sync.at ? new Date(data.sync.at).toLocaleString() : 'never'}. Syncing replaces everything in your
            "Planner" list, so keep that list for the app only.
          </p>
          <button class="btn" onClick={() => ui.open({ kind: 'guide' })}>Shortcut setup guide</button>
        </div>
      </section>

      <Backup data={data} />

      <p class="muted small center">
        Times follow your phone's timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
      </p>
    </div>
  );
}

function Locations({ data }: { data: AppData }) {
  const set = (locations: Location[]) => commit((d, now) => actions.setLocations(d, locations, now));
  const patch = (id: string, p: Partial<Location>) => set(data.locations.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <section>
      <div class="section-head">
        <h3>Places & travel from Home</h3>
        <button class="link" onClick={() => set([...data.locations, { id: uid(), name: 'New place', fromHomeMin: 15, toHomeMin: 15 }])}>
          + Add
        </button>
      </div>
      <div class="card">
        <div class="loc-row muted small">
          <span>Place</span>
          <span>There</span>
          <span>Back</span>
          <span />
        </div>
        {data.locations.map((l) => (
          <div class="loc-row">
            <input value={l.name} disabled={l.id === 'home'} onChange={(e) => patch(l.id, { name: e.currentTarget.value })} />
            <input type="number" inputMode="numeric" disabled={l.id === 'home'} value={l.fromHomeMin}
              onChange={(e) => patch(l.id, { fromHomeMin: Number(e.currentTarget.value) || 0 })} />
            <input type="number" inputMode="numeric" disabled={l.id === 'home'} value={l.toHomeMin}
              onChange={(e) => patch(l.id, { toHomeMin: Number(e.currentTarget.value) || 0 })} />
            {l.id === 'home' ? <span /> : (
              <button class="link" aria-label={`Delete ${l.name}`} onClick={() => {
                const used = data.blocks.some((b) => b.locationId === l.id);
                if (confirm(used ? `${l.name} is used by fixed times; they will have no travel time. Delete?` : `Delete ${l.name}?`))
                  set(data.locations.filter((x) => x.id !== l.id));
              }}>✕</button>
            )}
          </div>
        ))}
        <p class="muted small">Minutes. "There" = Home → place, "Back" = place → Home.</p>
      </div>
    </section>
  );
}

const TAGS = Object.entries(TAG_LABELS) as [BlockTag, string][];

function Rules({ data }: { data: AppData }) {
  const set = (rules: CutoffRule[]) => commit((d, now) => actions.setRules(d, rules, now));
  const patch = (id: string, p: Partial<CutoffRule>) =>
    set(data.rules.map((r) => (r.id === id ? ({ ...r, ...p } as CutoffRule) : r)));
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const scope = (r: CutoffRule) => (
    <select value={r.appliesTo} onChange={(e) => patch(r.id, { appliesTo: e.currentTarget.value as TaskScope })}>
      <option value="schoolwork">schoolwork</option>
      <option value="all">any task</option>
    </select>
  );
  const tag = (r: CutoffRule & { tag: BlockTag }) => (
    <select value={r.tag} onChange={(e) => patch(r.id, { tag: e.currentTarget.value as BlockTag })}>
      {TAGS.map(([v, l]) => <option value={v}>{l.toLowerCase()}</option>)}
    </select>
  );
  /** Weekday chips; undefined means every day. */
  const days = (r: CutoffRule, value: number[] | undefined) => {
    const cur = value ?? [0, 1, 2, 3, 4, 5, 6];
    return (
      <Chips
        options={WEEKDAYS.map((l, i) => ({ value: i, label: l }))}
        selected={cur}
        onToggle={(d) => patch(r.id, { weekdays: cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d] })}
      />
    );
  };

  return (
    <section>
      <div class="section-head">
        <h3>Cutoff rules</h3>
        <select class="link" value="" onChange={(e) => {
          const k = e.currentTarget.value;
          const id = uid();
          if (k === 'after') set([...data.rules, { id, kind: 'afterBlock', tag: 'other', minutes: 30, appliesTo: 'all' }]);
          if (k === 'before') set([...data.rules, { id, kind: 'beforeBlock', tag: 'other', minutes: 30, appliesTo: 'all' }]);
          if (k === 'window') set([...data.rules, { id, kind: 'window', weekdays: [], startMin: 0, endMin: 60, appliesTo: 'all' }]);
          e.currentTarget.value = '';
        }}>
          <option value="">+ Add</option>
          <option value="after">After something</option>
          <option value="before">Before something</option>
          <option value="window">Time window</option>
        </select>
      </div>
      {data.rules.map((r) => (
        <div class="card rule">
          <div class="rule-text">
            No {scope(r)}
            {r.kind === 'afterBlock' && (
              <> for <input type="number" inputMode="numeric" value={r.minutes} onChange={(e) => patch(r.id, { minutes: num(e.currentTarget.value) })} /> min after getting home from {tag(r)}</>
            )}
            {r.kind === 'beforeBlock' && (
              <>
                {' '}
                {r.minutes >= WHOLE_MORNING ? (
                  <button class="chip on" onClick={() => patch(r.id, { minutes: 60 })}>all morning</button>
                ) : (
                  <> for <input type="number" inputMode="numeric" value={r.minutes} onChange={(e) => patch(r.id, { minutes: num(e.currentTarget.value) })} /> min</>
                )}{' '}
                before{' '}
                <select value={r.from ?? 'start'} onChange={(e) => patch(r.id, { from: e.currentTarget.value as 'start' | 'leave' })}>
                  <option value="start">the start of</option>
                  <option value="leave">leaving for</option>
                </select>{' '}
                {tag(r)}
                {r.minutes < WHOLE_MORNING && (
                  <button class="link small" onClick={() => patch(r.id, { minutes: WHOLE_MORNING })}>make it all morning</button>
                )}
              </>
            )}
            {r.kind === 'window' && (
              <> from <input type="time" value={minToInput(r.startMin)} onChange={(e) => patch(r.id, { startMin: inputToMin(e.currentTarget.value) })} /> to{' '}
                <input type="time" value={minToInput(r.endMin % 1440)} onChange={(e) => patch(r.id, { endMin: inputToMin(e.currentTarget.value) || 1440 })} /></>
            )}
          </div>
          {r.kind === 'window' && days(r, r.weekdays)}
          {r.kind === 'beforeBlock' && days(r, r.weekdays)}
          <button class="link danger small" onClick={() => confirm('Delete this rule?') && set(data.rules.filter((x) => x.id !== r.id))}>
            Delete rule
          </button>
        </div>
      ))}
    </section>
  );
}

function General({ settings }: { settings: S }) {
  const set = (p: Partial<S>) => commit((d, now) => actions.setSettings(d, { ...d.settings, ...p }, now));
  const numRow = (label: string, key: keyof S, unit = 'min') => (
    <label class="set-row">
      <span>{label}</span>
      <span>
        <input type="number" inputMode="numeric" value={settings[key]} onChange={(e) => set({ [key]: Math.max(0, Number(e.currentTarget.value) || 0) })} /> {unit}
      </span>
    </label>
  );
  return (
    <section>
      <h3>Pacing & limits</h3>
      <div class="card">
        <label class="set-row">
          <span>Earliest start</span>
          <input type="time" value={minToInput(settings.earliestStartMin)} onChange={(e) => set({ earliestStartMin: inputToMin(e.currentTarget.value) })} />
        </label>
        <label class="set-row">
          <span>No work after</span>
          <input type="time" value={minToInput(settings.dayEndMin % 1440)} onChange={(e) => set({ dayEndMin: inputToMin(e.currentTarget.value) || 1440 })} />
        </label>
        {numRow('Break between assignments', 'breakMin')}
        {numRow('Short assignment is at most', 'shortTaskMaxMin')}
        {numRow('Break between 2 short ones', 'shortPairBreakMin')}
        {numRow('Big task is over', 'bigTaskMin')}
        {numRow('Estimate padding', 'paddingPct', '%')}
        {numRow('Plan ahead', 'horizonDays', 'days')}
      </div>
    </section>
  );
}

function Backup({ data }: { data: AppData }) {
  const exportFile = async () => {
    const name = `planner-backup-${dateKey(Date.now())}.json`;
    const file = new File([exportBackup(data, Date.now())], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const text = await f.text();
      const next = parseBackup(text, Date.now());
      if (!confirm(`Replace everything with this backup (${next.tasks.length} tasks, ${next.blocks.length} fixed times)?`)) return;
      commit(() => next);
      alert('Backup restored.');
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <section>
      <h3>Backup</h3>
      <div class="card">
        <p class="muted small">Your data lives only on this phone. Export a backup now and then (save it to Files).</p>
        <div class="actions">
          <button class="btn" onClick={exportFile}>Export backup</button>
          <label class="btn">
            Import backup
            <input type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.currentTarget.files?.[0])} />
          </label>
        </div>
      </div>
    </section>
  );
}
