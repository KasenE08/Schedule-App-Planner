import { SheetFrame } from './ui';
import { SHORTCUT_NAME } from './sync';

const C = (p: { children: string }) => <code>{p.children}</code>;

export function ShortcutGuide() {
  return (
    <SheetFrame title="Reminders sync setup">
      <div class="guide">
        <p class="muted small">
          One-time setup, about 10 minutes. Apple doesn't let web apps touch Reminders directly, so a shortcut does it.
          Each sync replaces everything in the Planner list with the current plan and reports back what you checked off.
        </p>

        <h3>1. Make the list</h3>
        <ol>
          <li>In <b>Reminders</b>, add a list named exactly <C>Planner</C>. Use it only for this app.</li>
        </ol>

        <h3>2. Build the shortcut</h3>
        <p class="small">
          In <b>Shortcuts</b>, tap <b>+</b> and name it exactly <C>{SHORTCUT_NAME}</C>. Add these actions in order (search by name):
        </p>
        <ol>
          <li><b>Get Clipboard</b></li>
          <li><b>Get Dictionary from Input</b> (input: Clipboard)</li>
          <li><b>Get Dictionary Value</b>: Value for key <C>items</C> in Dictionary</li>
          <li><b>Set Variable</b>: name <C>Items</C></li>
          <li><b>Find Reminders</b>: tap Add Filter, set <b>List</b> is <b>Planner</b></li>
          <li><b>Set Variable</b>: name <C>Old</C></li>
          <li>
            <b>Repeat with Each</b> item in <C>Old</C>. Inside the repeat:
            <ul class="sub">
              <li><b>If</b>: tap the variable and pick <b>Repeat Item</b>, tap it again and choose <b>Is Completed</b>, condition <b>is true</b></li>
              <li>Inside the If: <b>Match Text</b>, pattern <C>{'\\[planner:([^\\]]+)\\]'}</C>, in <b>Repeat Item</b> (tap it and choose <b>Notes</b>)</li>
              <li><b>Get Group from Matched Text</b>: group at index <C>1</C></li>
              <li><b>Add to Variable</b>: <C>Done</C></li>
            </ul>
          </li>
          <li><b>Remove Reminders</b>: <C>Old</C></li>
          <li><b>Combine Text</b>: <C>Done</C> with <b>Custom</b> separator <C>,</C></li>
          <li><b>Set Variable</b>: name <C>Done Text</C></li>
          <li>
            <b>Repeat with Each</b> item in <C>Items</C>. Inside the repeat:
            <ul class="sub">
              <li><b>Get Dictionary Value</b>: key <C>id</C> in <b>Repeat Item</b>, then <b>Set Variable</b> <C>ID</C></li>
              <li><b>If</b> <C>Done Text</C> <b>contains</b> <C>ID</C>: leave this part empty</li>
              <li>
                In the <b>Otherwise</b> part:
                <ul class="sub">
                  <li><b>Get Dictionary Value</b> key <C>title</C> in Repeat Item, then <b>Set Variable</b> <C>Title</C></li>
                  <li><b>Get Dictionary Value</b> key <C>remind</C> in Repeat Item, then <b>Set Variable</b> <C>Remind</C></li>
                  <li><b>Get Dictionary Value</b> key <C>notes</C> in Repeat Item, then <b>Set Variable</b> <C>Notes</C></li>
                  <li>
                    <b>New Reminder</b> (called <b>Add New Reminder</b> on older iOS): title <C>Title</C>, list <b>Planner</b>.
                    Set the reminder's date/time (<b>Due Date</b>, or <b>Remind Me → At Time</b>) to <C>Remind</C>. If there is also an
                    alert option, set it to alert at that time. Tap the arrow / <b>Show More</b> and set Notes to <C>Notes</C>.
                  </li>
                </ul>
              </li>
            </ul>
          </li>
          <li><b>Text</b>: type <C>planner-sync-done:</C> then insert the <C>Done Text</C> variable right after it (no space)</li>
          <li><b>Copy to Clipboard</b></li>
          <li>(Optional) <b>Show Notification</b>: <C>Planner synced</C></li>
        </ol>

        <h3>3. Permissions</h3>
        <ol>
          <li>The first run asks to access Reminders. Tap <b>Always Allow</b>.</li>
          <li>
            If it asks before removing reminders every time, open the shortcut's <b>ⓘ / Settings → Privacy</b> and allow deleting without asking.
          </li>
        </ol>

        <h3>4. Using it</h3>
        <ol>
          <li>In this app, tap <b>Sync</b> on the Schedule screen. The Sync button shows a dot when Reminders is out of date.</li>
          <li>The shortcut runs. When it's done, tap <b>◀ Planner</b> in the top-left corner (or switch back to the app).</li>
          <li>Tap <b>Paste check-offs</b>, then <b>Paste</b> when iOS asks. Anything you checked off in Reminders is marked done here.</li>
        </ol>
        <p class="muted small">
          Add notes in this app, not in Reminders. Each sync rewrites the reminders, so notes typed in Reminders are lost.
        </p>
      </div>
    </SheetFrame>
  );
}
