import { useState } from 'preact/hooks';
import { useData, useNow } from './store';
import { UI, type Sheet } from './ui';
import { Today } from './Today';
import { TaskList } from './TaskList';
import { Settings } from './Settings';
import { TaskForm } from './TaskForm';
import { TaskDetail } from './TaskDetail';
import { BlockForm } from './BlockForm';

type Tab = 'today' | 'tasks' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Schedule' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const data = useData();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ui = { open: setSheet, close: () => setSheet(null) };

  return (
    <UI.Provider value={ui}>
      <main class="screen">
        {tab === 'today' && <Today data={data} now={now} />}
        {tab === 'tasks' && <TaskList data={data} now={now} />}
        {tab === 'settings' && <Settings data={data} />}
      </main>
      {tab !== 'settings' && (
        <button class="fab" aria-label="Add assignment" onClick={() => setSheet({ kind: 'task' })}>
          +
        </button>
      )}
      <nav class="tabbar">
        {TABS.map((t) => (
          <button class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {sheet?.kind === 'task' && <TaskForm data={data} task={sheet.task} />}
      {sheet?.kind === 'detail' && <TaskDetail data={data} id={sheet.id} />}
      {sheet?.kind === 'block' && <BlockForm data={data} block={sheet.block} once={sheet.once} />}
    </UI.Provider>
  );
}
