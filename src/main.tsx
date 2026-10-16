import { render } from 'preact';
import { App } from './app/App';
import './app/styles.css';
import { startPushSync } from './app/push';

render(<App />, document.getElementById('app')!);

startPushSync();
// Ask the browser not to evict saved data.
navigator.storage?.persist?.();
