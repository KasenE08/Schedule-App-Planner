import { useState } from 'preact/hooks';
import { useData, useNow } from './store';
import { UI, type Sheet } from './ui';
import { Today } from './Today';
import { TaskList } from './TaskList';
import { Settings } from './Settings';
import { TaskForm } from './TaskForm';
import { TaskDetail } from './TaskDetail';
import { BlockForm } from './BlockForm';
import { NotifyGuide } from './NotifyGuide';
import { useEffect } from 'preact/hooks';
import { Icon, type IconName } from './icons';

type Tab = 'today' | 'tasks' | 'settings';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Schedule', icon: 'calendar' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function App() {
  const data = useData();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('today');
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const ui = { open: setSheet, close: () => setSheet(null) };

  // Tapping a notification opens its task: via the URL when the app was closed, via a message when open.
  useEffect(() => {
    const openTask = (id: string | null | undefined) => id && data.tasks.some((t) => t.id === id) && setSheet({ kind: 'detail', id });
    const m = location.hash.match(/^#task=(.+)$/);
    if (m) {
      openTask(decodeURIComponent(m[1]));
      history.replaceState(null, '', location.pathname);
    }
    const onMsg = (e: MessageEvent) => e.data?.type === 'open-task' && openTask(e.data.taskId);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  return (
    <UI.Provider value={ui}>
      <main class="screen">
        {tab === 'today' && <Today data={data} now={now} />}
        {tab === 'tasks' && <TaskList data={data} now={now} />}
        {tab === 'settings' && <Settings data={data} />}
      </main>
      <nav class="tabbar">
        {TABS.slice(0, 2).map((t) => (
          <button class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
        <button class="fab" aria-label="Add assignment" onClick={() => setSheet({ kind: 'task' })}>
          <Icon name="plus" size={26} />
        </button>
        {TABS.slice(2).map((t) => (
          <button class={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {sheet?.kind === 'task' && <TaskForm data={data} task={sheet.task} />}
      {sheet?.kind === 'detail' && <TaskDetail data={data} id={sheet.id} />}
      {sheet?.kind === 'block' && <BlockForm data={data} block={sheet.block} once={sheet.once} />}
      {sheet?.kind === 'notifyGuide' && <NotifyGuide />}
    </UI.Provider>
  );
}
