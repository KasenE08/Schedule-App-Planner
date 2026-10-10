# Schedule App Planner

A free iPhone PWA (hosted on GitHub Pages) that schedules the owner's assignments around fixed commitments and syncs them to the iOS Reminders list **Planner** through an Apple Shortcut. The user only enters what they have to do and its actual due date; the app estimates, schedules and creates every reminder.

## Working rules
- Ask questions and show a plan before writing code. Build in phases; confirm with the user before each phase.
- Every scheduler rule has a unit test. Run `npm run check` (typecheck + tests in two timezones) after every change.
- Update the progress log below at the end of each phase, and give the user a plain-language summary.
- Develop on the `dev` branch. GitHub Pages hosts from `dev` while building; switch to `main` after the user signs off.
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

### Coming in later phases
- **Falling behind:** reschedule the rest of today starting exactly now + 5 min. Overflow moves to later today or the next day by priority. Past 12am only if needed to meet deadlines, hard stop at 2am.
- **Big tasks** (> 90 min): split into chunks across days, after asking the user.
- **Learning:** Start/Done taps in the app record real durations to adjust estimates per type.
- Reminders sync via the Shortcut, check-off, notes, backups, dark UI.

## App behavior
- The plan is **saved**, not recalculated live. It is recalculated when a task is added, edited, deleted, started or reopened, when the arrival time or any setting changes, and automatically on the first open of a new day. Done and notes never move anything (finishing early = free time).
- Data is stored in localStorage on the phone. Backups are JSON files (`app: "schedule-app-planner"`) and can be exported and imported in Settings.
- Offline: `vite.config.ts` writes `sw.js`, which precaches every built file.

## Layout
- `src/core/` holds the pure scheduling logic with no UI: types, time, recurrence, availability, priority, estimate, scheduler, defaults.
- `src/app/` holds the Preact UI: `model.ts` (pure app state and actions, tested), `store.ts` (persistence), and the screens (Today, TaskList, Settings, TaskForm, TaskDetail, BlockForm).
- `test/` holds the Vitest suites; `fixtures.ts` is a sample week with generic place names.
- `.github/workflows/deploy.yml`: every push to `dev` runs the checks, builds, and publishes `dist/` to the `gh-pages` branch. Pages serves `gh-pages`.
- `scripts/make-icons.mjs` generates the app icons.

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
