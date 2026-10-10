import { commit, getData } from './store';
import { applyCompletions, buildPayload, markSent, parseSyncResult, SHORTCUT_NAME } from './sync';

/** Copies the plan to the clipboard and runs the "Planner Sync" shortcut. */
export async function sendToReminders() {
  const payload = buildPayload(getData(), Date.now());
  try {
    await navigator.clipboard.writeText(payload);
  } catch {
    alert('Could not copy to the clipboard. Try again, and allow pasting if iOS asks.');
    return;
  }
  commit((d, now) => markSent(d, payload, now));
  location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}`;
}

/** Reads the Shortcut's result from the clipboard and marks those tasks done. */
export async function pasteCheckoffs() {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    alert('iOS did not allow reading the clipboard. Tap Paste check-offs again and choose "Paste".');
    return;
  }
  const ids = parseSyncResult(text);
  if (ids === null) {
    alert("The clipboard doesn't have a sync result. Run the sync again and let the shortcut finish.");
    return;
  }
  let count = 0;
  commit((d, now) => {
    const r = applyCompletions(d, ids, now);
    count = r.count;
    return r.data;
  });
  alert(count ? `Marked ${count} done from Reminders.` : 'Synced. Nothing new was checked off.');
}
