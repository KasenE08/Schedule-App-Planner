# Schedule App Planner

A free iPhone PWA (hosted on GitHub Pages) that schedules the owner's assignments around fixed commitments and notifies them when each one should start (Web Push through a free Cloudflare Worker). The user only enters what they have to do and its actual due date; the app estimates, schedules and notifies.

## Working rules
- Ask questions and show a plan before writing code. Build in phases; confirm with the user before each phase.
- Every scheduler rule has a unit test. Run `npm run check` (typecheck + tests in two timezones) after every change.
- Update the progress log below at the end of each phase, and give the user a plain-language summary.
- `main` is live: every push to `main` deploys the app (and the worker if it changed). Do new work on `dev` and merge to `main` only after the user approves.
- The repo is public: never commit the user's personal data (real place names, their schedule). Personal data lives only on the phone and in backup files.
- The user is on a limited plan: keep work token-efficient.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Scheduler rules (source of truth)
**Fixed blocks** (pre-scheduled times and one-off fixed events) are never moved unless the user asks. All of them are editable in Settings, never hardcoded. Repeats: once, daily, weekly (chosen weekdays), monthly by date (clamps to month end), or monthly by pattern (e.g. 2nd Tuesday, last Friday). Individual dates can be skipped. A block can be non-blocking (reminders only).

**Travel:** each location has a travel time from Home and back to Home. A block occupies `[start − travel there, end + travel back]`. Trips always start and end at Home.

**Cutoffs** (editable, each scoped to schoolwork only or to all tasks):
- No schoolwork within 60 min of arriving home from school. Arrival = the arrival-time input for that day, else school end + travel back. **This is the only cutoff Other tasks (errands like groceries or gas) skip.**
- No tasks before school Mon–Thu (whole morning, from that day's midnight).
- Get ready: no tasks within 60 min before leaving for school, so Friday tasks end by 9:28.
- No tasks within 60 min before a work shift, counted from shift start.
- No tasks within 30 min after a workout.
- No tasks on weekends before 12pm.
- No task after 12am (day end) or before the earliest start (8:00am).

**Priority:** due date first, category breaks ties:
Online-Normal → Online-Missing → Paper-Normal → Paper-Missing → Other. A task in several categories takes its highest.
Missing work has no due date and goes as soon as possible, **unless doing it first would make a dated assignment late**; then the normal assignment goes first.

**Placement:** tasks go in time order from now, starting at the next 5-minute mark. The top-priority task takes its earliest fitting slot. A lower-priority task may fill an earlier gap only if that never delays the top task. A task never crosses a cutoff or block.

**Pacing:** 30 min break between tasks. Two short tasks (≤ 20 min) pair with a 5 min break; the task after a pair gets 30 min. No break is needed between a task and a fixed block. Finishing early leaves free time (nothing is pulled earlier).

**Estimates:** a default per assignment type, or the user's own base, × learned ratio (clamped 0.5–2×) × padding (15%), rounded up to 5 min.

**Overload warnings:** a task that can only finish after its due date is still scheduled but flagged late. A task that fits nowhere in the 28-day window is flagged unscheduled.

**Laundry** (Sunday 3:30pm, 2 hours, non-blocking so homework may run during it): reminders at +0 (washer), +60 (dryer), +120 (take out).

**Falling behind** (button on today's schedule): reschedules everything not started so the first task begins **exactly now + 5 min** (6:03 → 6:08); later tasks keep the 5-minute grid. Started tasks keep their slot. Overflow moves to later today or the next days by priority. Tonight's window from the day end to `latestNightMin` (default 12am–2am) unlocks, **only for tasks that would otherwise be late**, and only if that reduces lateness. Tasks are allowed into the window in rounds (late ones first, then any a reshuffle made late), keeping the plan with the fewest late tasks (ties: least total lateness, so work that will be late anyway goes right after tonight's work rather than the next afternoon); split parts treat 12am–2am as the same night. It stays active for replans until 2am. On the schedule, work after midnight shows under its calendar date (the next day), by the user's choice. If even that isn't enough, the task is flagged late ("even working until 2am").

**Big tasks** (estimate > `bigTaskMin`, 90): on save the app asks before splitting into roughly hour-long parts ("Title (part 1 of 3)", same due date). Parts go in order, **one per day**; a part may share a day only if spreading would make it late. A part is never placed before an earlier one.

**Learning:** Start → Done in the app records the real minutes against the task's unpadded base (`baseMin`). Per type: the average ratio of the last 10 records (ignoring under 0.25× or over 4× mis-taps), applied after 3 records and clamped 0.5–2×, then padding on top. Typed (manual) estimates and Done without Start don't count. Learning affects new estimates, not existing tasks.

**Hand moves** (press and hold an assignment ~0.5 s, then drag; only the first finger's pointer counts, so a second touch can't hijack the drag, a real bug that once moved the wrong assignment): dropping on a date in the week strip pins it to that day (`pinDay`): it gets **first claim on that day's free time** (pinned tasks go before unpinned ones, by day then hand order), so others shift; only if the day truly has no slot long enough does it go to the next day with room, never earlier. Dropping on another assignment reorders that day: the dragged one takes the target's spot, the others shift, and every assignment on that day gets pinned in that order (`pinOrder`). Rules (cutoffs, breaks) still apply. Pins stick through replans until "Let the app schedule it" in the task, and a pin to a past day is ignored. If a move would make anything late (or lands on a later day), the app asks before applying it. When a drag leaves **the moved task** late (even if it was already late) or **newly** makes another task late, `fixLateness` tries (work that was already late beforehand is ignored and stays in the overload banner), smallest help first: skip the 30-min break before the moved and late tasks; unlock tonight's 12am–2am window (only when dropping onto today); or both. If one gets more done on time it offers **[that fix] / Move anyway (late) / Cancel**. A skipped break (`noBreakBefore`) sticks until "Restore break" in the task. Falling behind uses whole minutes (6:03:27 → 6:08).

## App behavior
- The plan is **saved**, not recalculated live. It is recalculated when a task is added, edited, deleted, started or reopened, when the arrival time or any setting changes, and automatically on the first open of a new day. Done and notes never move anything (finishing early = free time).
- On school days after school ends, the Schedule screen shows **I'm home now** until an arrival time is set; one tap sets the arrival to the current minute (the time box still allows any time). No arrival notification, by the user's choice.
- Data is stored in localStorage on the phone. Backups are JSON files (`app: "schedule-app-planner"`) and can be exported and imported in Settings.
- Offline: `vite.config.ts` writes `sw.js`, which precaches every built file (bypassing the HTTP cache), fetches the page with `no-cache` so page and assets match, and keeps a copy of any asset it fetches. Deploys keep old `assets/` on `gh-pages` so a phone mid-update never gets a missing stylesheet (that happened once after rapid deploys).

## Notifications (replaced the Reminders sync)
- The PWA can't schedule local notifications on iOS, so a free **Cloudflare Worker** (`worker/`) sends Web Push at each task's start time.
- The worker is one Durable Object (`PushHub`, SQLite-backed, free plan) holding the VAPID key, registered devices (endpoint + secret hash, max 5) and the queue. Its **alarm** fires at the next due item; items more than 30 min late are dropped, 5xx and network errors retry twice a minute apart, and a 404/410 forgets the device.
- **End-to-end encrypted:** the app encrypts every notification (RFC 8291 aes128gcm, `src/push/webpush.ts`, tested against the RFC vector) before upload. The server only sees times and ciphertext.
- The app uploads the queue (`PUT /queue`, items from now through `notifyDays`) about 1.5 s after any change, on foreground and when back online, but only when the notification fingerprint changed. Tapping a notification opens that task.
- Push setup (`AppData.push`) belongs to this phone: it is never exported in backups and is kept when importing one.
- Deploy: `.github/workflows/worker.yml` runs `wrangler deploy` when `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets exist, and prints the server URL in the run summary. The user pastes it into Settings → Notifications. The setup guide is in the app.

## Layout
- `src/core/` holds the pure scheduling logic with no UI: types, time, recurrence, availability, priority, estimate, scheduler, defaults.
- `src/app/` holds the Preact UI: `model.ts` (pure app state and actions, tested), `store.ts` (persistence), and the screens (Today, TaskList, Settings, TaskForm, TaskDetail, BlockForm).
- `src/push/` holds Web Push encryption and base64url helpers, shared by the app and the worker.
- `worker/` holds the notification server: `src/hub.ts` (logic, unit tested with fake storage and fetch) and `src/index.ts` (Cloudflare entry and the Durable Object).
- `test/` holds the Vitest suites; `fixtures.ts` is a sample week with generic place names.
- `.github/workflows/deploy.yml`: every push to `main` runs the checks, builds, and publishes `dist/` to the `gh-pages` branch. Pages serves `gh-pages`.
- `scripts/icon.svg` is the app icon (green calendar with a checklist); `scripts/make-icons.mjs` renders it to `public/icon-*.png` with Playwright.

## Commands
`npm run check` (typecheck + tests) · `npm run dev` · `npm run build`

## Progress log
### Phase 1: Scheduler core (done)
- Data model for fixed blocks, locations, cutoff rules, settings and tasks.
- Free-time calculation with travel, cutoffs, an arrival override and DST-safe local times.
- Priority ordering, the placement algorithm with breaks and short-task pairing, gap filling, late and unscheduled warnings, laundry step reminders, and time estimates.
- 41 tests, passing in America/Chicago and Asia/Tokyo.

### Phase 1 revisions (done)
- Added the get-ready hour and no-tasks-before-school (Mon–Thu) rules. Other tasks now skip only the after-school hour.
- Laundry is non-blocking. Missing work yields to dated work when it would cause lateness.
- 46 tests passing.

### Phase 2: App and install (done)
- Dark mobile UI: day timeline with a week strip, the arrival-time input, overload banner, task list, task detail (Start/Done/notes), and the add/edit assignment form with automatic estimates.
- Settings: fixed schedule and one-time events (once, daily, weekly, monthly by date or by pattern, skip dates, non-blocking, step reminders), places and travel, cutoff rules, pacing limits, backup export and import.
- PWA: manifest, icons, offline service worker. GitHub Actions deploys `dev` to `gh-pages`.
- The starter backup with the user's real schedule was handed over outside the repo.
- 53 tests passing. Smoke-tested in headless Chromium at iPhone size, including offline reload.

### Phase 3: Reminders sync (done, later replaced)
- Sync button (with a dot when out of date), clipboard payload, Shortcut launch, Paste check-offs banner, and the in-app Shortcut setup guide.
- 62 tests passing. Browser smoke test of the full send and paste-back flow. The Shortcut itself can only be tested on the iPhone.

### Phase 3b: Standalone notifications (done)
- At the user's request the Reminders/Shortcut sync was removed completely and replaced with Web Push from a free Cloudflare Worker.
- Phone-side encryption, server (Durable Object + alarm), Settings → Notifications (turn on, test, days ahead, turn off), setup guide, notification tap opens the task, and the worker deploy workflow.
- 74 tests passing (including the RFC 8291 vector and server tests). Worker bundled with `wrangler --dry-run` and run locally in workerd, which caught an "Illegal invocation" bug with the global fetch (fixed). Deployed by the user to `planner-push.<subdomain>.workers.dev`; the test notification was confirmed arriving on the iPhone.

### Phase 4: Smart features (done)
- Falling behind: exact +5 start, night extension (12am–2am) only for tasks that would be late, with a hard stop.
- Big-task splitting with confirmation, parts in order and one per day.
- Learned estimates from Start/Done timings (Settings → Learning shows progress per type).
- Clearer overload text and "past midnight" labels on the timeline.
- 90 tests passing; browser smoke test of split and falling behind (caught a stale-time bug in the prompt, fixed).

### Manual moves (done)
- Long-press drag: drop on a date to move, drop on an assignment to reorder; confirmation when a move makes something late or no room that day; "moved" label and undo in the task.
- The week strip is sticky so it's reachable while dragging.
- 98 tests passing; drag-and-drop smoke tested in the browser.

### Release
- The user signed off; `dev` was merged into `main`, and deploys (app and worker) now run from `main`.

### Late-drag help and full test pass (done)
- Bringing an assignment back to an earlier day (e.g. tonight) offers skipping the break and/or working until 2am when that makes the deadline.
- Fixed Falling behind ignoring seconds (6:10 instead of 6:08) and an unstyled load after rapid deploys (old assets now kept, service worker hardened).
- 107 unit tests; 14-step end-to-end browser test of styles, auto order, reorder, skip break, move to later/earlier day, restore break, tonight rescue and falling behind, all passing.
