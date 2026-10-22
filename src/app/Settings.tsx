import type { BlockTag, CutoffRule, Location, Settings as S, TaskScope } from '../core/types';
import { WHOLE_MORNING } from '../core/availability';
import { dateKey } from '../core/time';
import { actions, exportBackup, parseBackup, type AppData } from './model';
import { commit } from './store';
import { Chips, useUI } from './ui';
import { Icon, TAG_STYLE, type IconName } from './icons';
import { useState } from 'preact/hooks';
import { disablePush, enablePush, pushSupported, sendTest, uploadNow } from './push';
import { fmtMin, inputToMin, minToInput, recurrenceText, ruleText, TAG_LABELS, TYPE_LABELS, uid, WEEKDAYS } from './format';
import { learnedRatio } from '../core/estimate';
import type { AssignmentType } from '../core/types';

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
    <li class="list-item settings-row" style={{ '--cat': TAG_STYLE[b.tag].color }} onClick={() => ui.open({ kind: 'block', block: b })}>
      <span class="chip-icon"><Icon name={TAG_STYLE[b.tag].icon} /></span>
      <div class="body">
        <div class="title">{b.title}</div>
        <div class="meta">
          {recurrenceText(b.recurrence)} · {fmtMin(b.startMin)}–{fmtMin(b.endMin)} · {locName(b.locationId)}
          {b.blocksScheduling === false ? ' · assignments allowed' : ''}
        </div>
      </div>
      <span class="chev"><Icon name="chevronRight" size={18} /></span>
    </li>
  );

  const [page, setPage] = useState<Page | null>(null);
  const go = (p: Page | null) => {
    setPage(p);
    scrollTo(0, 0);
  };
  const add = (onClick: () => void) => <button class="link" onClick={onClick}>+ Add</button>;

  if (page) {
    const sub = (title: string, body: preact.ComponentChildren, action?: preact.ComponentChildren) => (
      <div>
        <button class="link back" onClick={() => go(null)}>
          <Icon name="chevronLeft" size={18} /> Settings
        </button>
        <header class="top">
          <h1>{title}</h1>
          {action}
        </header>
        {body}
      </div>
    );
    if (page === 'schedule')
      return sub('Fixed schedule', <>
        <ul class="list">{recurring.map(blockRow)}</ul>
        {recurring.length === 0 && <p class="muted small">None yet.</p>}
      </>, add(() => ui.open({ kind: 'block' })));
    if (page === 'events')
      return sub('One-time events', <>
        <ul class="list">{events.map(blockRow)}</ul>
        {events.length === 0 && <p class="muted small">No upcoming one-time events.</p>}
      </>, add(() => ui.open({ kind: 'block', once: true })));
    if (page === 'places') return sub('Places & travel', <Locations data={data} />);
    if (page === 'rules') return sub('Cutoff rules', <Rules data={data} />);
    if (page === 'pacing') return sub('Pacing & limits', <General settings={data.settings} />);
    if (page === 'learning') return sub('Learning', <Learning data={data} />);
    if (page === 'notify') return sub('Notifications', <Notifications data={data} />);
    return sub('Backup', <Backup data={data} />);
  }

  const s = data.settings;
  const learned = (Object.keys(TYPE_LABELS) as AssignmentType[]).filter((t) => learnedRatio(data.history, t).samples > 0).length;
  const places = data.locations.filter((l) => l.id !== 'home').length;
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const row = (p: Page, icon: IconName, title: string, sub: preact.ComponentChildren) => (
    <button class="hub-row" onClick={() => go(p)}>
      <span class="hub-icon"><Icon name={icon} size={18} /></span>
      <span class="body">
        <span class="title">{title}</span>
        <span class="meta">{sub}</span>
      </span>
      <span class="chev"><Icon name="chevronRight" size={18} /></span>
    </button>
  );
  return (
    <div>
      <header class="top">
        <h1>Settings</h1>
      </header>
      <section>
        <h3>Your week</h3>
        <div class="hub">
          {row('schedule', 'calendar', 'Fixed schedule', recurring.length ? plural(recurring.length, 'repeating time') : 'None yet')}
          {row('events', 'flag', 'One-time events', events.length ? `${events.length} coming up` : 'None coming up')}
          {row('places', 'pin', 'Places & travel', places ? plural(places, 'place') : 'Only Home')}
        </div>
      </section>
      <section>
        <h3>How planning works</h3>
        <div class="hub">
          {row('rules', 'ban', 'Cutoff rules', plural(data.rules.length, 'rule'))}
          {row('pacing', 'gauge', 'Pacing & limits', `${s.breakMin} min breaks · ${fmtMin(s.earliestStartMin)}–${fmtMin(s.dayEndMin)}`)}
          {row('learning', 'sparkle', 'Learning', learned ? `${plural(learned, 'type')} timed` : 'Nothing timed yet')}
        </div>
      </section>
      <section>
        <h3>App</h3>
        <div class="hub">
          {row('notify', 'bell', 'Notifications', data.push ? (data.push.error ? <span class="warn">Needs attention</span> : <><span class="on-dot" />On</>) : 'Off')}
          {row('backup', 'download', 'Backup', 'Export or import')}
        </div>
      </section>
      <p class="muted small center">
        Times follow your phone's timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}).
      </p>
    </div>
  );
}

type Page = 'schedule' | 'events' | 'places' | 'rules' | 'pacing' | 'learning' | 'notify' | 'backup';

function Locations({ data }: { data: AppData }) {
  const set = (locations: Location[]) => commit((d, now) => actions.setLocations(d, locations, now));
  const patch = (id: string, p: Partial<Location>) => set(data.locations.map((l) => (l.id === id ? { ...l, ...p } : l)));
  return (
    <section>
      <p class="muted small hint">Travel minutes from Home to each place and back.</p>
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
        <button class="link" onClick={() => set([...data.locations, { id: uid(), name: 'New place', fromHomeMin: 15, toHomeMin: 15 }])}>
          + Add place
        </button>
        <p class="muted small">Minutes. "There" = Home → place, "Back" = place → Home.</p>
      </div>
    </section>
  );
}

const TAGS = Object.entries(TAG_LABELS) as [BlockTag, string][];

function Rules({ data }: { data: AppData }) {
  const [open, setOpen] = useState<string | null>(null);
  const set = (rules: CutoffRule[]) => commit((d, now) => actions.setRules(d, rules, now));
  /** A new rule opens right away so it can be set up. */
  const addRule = (r: CutoffRule) => {
    set([...data.rules, r]);
    setOpen(r.id);
  };
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
      <p class="muted small hint">Times the app won't schedule work. Tap a rule to change it.</p>
      {data.rules.map((r) => open !== r.id ? (
        <button class="card rule-line" onClick={() => setOpen(r.id)}>
          <span>{ruleText(r)}</span>
          <span class="chev"><Icon name="chevronRight" size={18} /></span>
        </button>
      ) : (
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
          <div class="rule-actions">
            <button class="link danger small" onClick={() => confirm('Delete this rule?') && set(data.rules.filter((x) => x.id !== r.id))}>
              Delete rule
            </button>
            <button class="btn small primary" onClick={() => setOpen(null)}>Done</button>
          </div>
        </div>
      ))}
      <select class="add-rule" value="" onChange={(e) => {
        const k = e.currentTarget.value;
        const id = uid();
        if (k === 'after') addRule({ id, kind: 'afterBlock', tag: 'other', minutes: 30, appliesTo: 'all' });
        if (k === 'before') addRule({ id, kind: 'beforeBlock', tag: 'other', minutes: 30, appliesTo: 'all' });
        if (k === 'window') addRule({ id, kind: 'window', weekdays: [], startMin: 0, endMin: 60, appliesTo: 'all' });
        e.currentTarget.value = '';
      }}>
        <option value="">+ Add rule</option>
        <option value="after">After something</option>
        <option value="before">Before something</option>
        <option value="window">Time window</option>
      </select>
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
        <label class="set-row">
          <span>Falling behind: latest</span>
          <input type="time" value={minToInput(settings.latestNightMin)} onChange={(e) => set({ latestNightMin: inputToMin(e.currentTarget.value) })} />
        </label>
      </div>
    </section>
  );
}

function Learning({ data }: { data: AppData }) {
  const rows = (Object.keys(TYPE_LABELS) as AssignmentType[])
    .map((t) => ({ t, ...learnedRatio(data.history, t) }))
    .filter((r) => r.samples > 0);
  return (
    <section>
      <div class="card">
        <p class="muted small">
          Tap Start and Done on assignments and estimates adjust to how long you really take (after 3 of a type). Finishing early leaves free time.
        </p>
        {rows.map((r) => (
          <div class="set-row">
            <span>{TYPE_LABELS[r.t]}</span>
            <span class="small">{r.samples < 3 ? `${r.samples} of 3 timed` : `${Math.round(r.ratio * 100)}% of the usual time`}</span>
          </div>
        ))}
        {rows.length === 0 && <p class="muted small">Nothing timed yet.</p>}
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
      const next = parseBackup(text, Date.now(), data);
      if (!confirm(`Replace everything with this backup (${next.tasks.length} tasks, ${next.blocks.length} fixed times)?`)) return;
      commit(() => next);
      alert('Backup restored.');
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <section>
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

function Notifications({ data }: { data: AppData }) {
  const ui = useUI();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const p = data.push;
  const run = async (fn: () => Promise<void>, done?: string) => {
    setBusy(true);
    try {
      await fn();
      if (done) alert(done);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const unsupported = pushSupported();
  return (
    <section>
      <div class="card">
        {!p ? (
          <>
            <p class="muted small">
              Get a notification when it's time to start each assignment, plus laundry steps. Needs your free notification server
              (one-time setup).
            </p>
            {unsupported && <p class="warn small">{unsupported}</p>}
            <label class="field">
              <span class="field-label">Notification server address</span>
              <input type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://planner-push.yourname.workers.dev"
                value={url} onInput={(e) => setUrl(e.currentTarget.value)} />
            </label>
            <div class="actions">
              <button class="btn primary" disabled={busy || !url} onClick={() => run(() => enablePush(url), 'Notifications are on.')}>
                Turn on notifications
              </button>
              <button class="btn" onClick={() => ui.open({ kind: 'notifyGuide' })}>Setup guide</button>
            </div>
          </>
        ) : (
          <>
            <p class="small">
              On · {p.error ? <span class="warn">{p.error}</span> : p.uploadedAt ? `updated ${new Date(p.uploadedAt).toLocaleString()}` : 'updating…'}
            </p>
            <label class="set-row">
              <span>Days ahead</span>
              <span>
                <input type="number" inputMode="numeric" value={data.settings.notifyDays} onChange={(e) => {
                  const v = Math.min(28, Math.max(1, Number(e.currentTarget.value) || 7));
                  commit((d) => ({ ...d, settings: { ...d.settings, notifyDays: v } }));
                }} /> days
              </span>
            </label>
            <div class="actions">
              <button class="btn" disabled={busy} onClick={() => run(sendTest, 'Test sent. It should arrive in a few seconds.')}>Send test</button>
              {p.error && <button class="btn" disabled={busy} onClick={() => run(uploadNow)}>Retry</button>}
              <button class="btn danger" disabled={busy} onClick={() => confirm('Turn off notifications?') && run(disablePush)}>Turn off</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
