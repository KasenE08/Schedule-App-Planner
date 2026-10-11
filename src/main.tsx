import { render } from 'preact';
import { App } from './app/App';
import './app/styles.css';
import { startPushSync } from './app/push';

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('./sw.js');
}
startPushSync();
// Ask the browser not to evict saved data.
navigator.storage?.persist?.();
