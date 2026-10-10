# Schedule App Planner

A free iPhone PWA (hosted on GitHub Pages) that schedules the owner's assignments around fixed commitments and syncs them to the iOS Reminders list **Planner** through an Apple Shortcut. The user only enters what they have to do and its actual due date; the app estimates, schedules and creates every reminder.

## Working rules
- Ask questions and show a plan before writing code. Build in phases; confirm with the user before each phase.
- Every scheduler rule has a unit test. Run `npm run check` (typecheck + tests in two timezones) after every change.
- Update the progress log below at the end of each phase, and give the user a plain-language summary.
- Develop on the `dev` branch. `main` deploys to GitHub Pages; merge only after the user reviews.
- The repo is public: never commit the user's personal data (real place names, their schedule). Personal data lives only on the phone and in backup files.
- The user is on a limited plan: keep work token-efficient.
- Commit messages end with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Scheduler rules (source of truth)
**Fixed blocks** (pre-scheduled times and one-off fixed events) are never moved unless the user asks. All of them are editable in Settings, never hardcoded. Repeats: once, daily, weekly (chosen weekdays), monthly by date (clamps to month end), or monthly by pattern (e.g. 2nd Tuesday, last Friday). Individual dates can be skipped. A block can be non-blocking (reminders only).

**Travel:** each location has a travel time from Home and back to Home. A block occupies `[start − travel there, end + travel back]`. Trips always start and end at Home.

**Cutoffs** (editable, each scoped to schoolwork only or to all tasks):
- No schoolwork within 60 min of arriving home from school. Arrival = the arrival-time input for that day, else school end + travel back.
- No schoolwork within 60 min before a work shift, counted from shift start.
- No schoolwork within 30 min after a workout.
- No schoolwork on weekends before 12pm.
- No task after 12am (day end). No task before the earliest start (default 8:00am).
- Other tasks (errands like groceries or gas) bypass the four schoolwork cutoffs but never overlap fixed blocks.

**Priority:** due date first (missing work = as soon as possible, so it comes before any dated task), category breaks ties:
Online-Normal → Online-Missing → Paper-Normal → Paper-Missing → Other. A task in several categories takes its highest.

**Placement:** tasks go in time order from now, starting at the next 5-minute mark. The top-priority task takes its earliest fitting slot. A lower-priority task may fill an earlier gap only if that never delays the top task. A task never crosses a cutoff or block.

**Pacing:** 30 min break between tasks. Two short tasks (≤ 20 min) pair with a 5 min break; the task after a pair gets 30 min. No break is needed between a task and a fixed block. Finishing early leaves free time (nothing is pulled earlier).

**Estimates:** a default per assignment type, or the user's own base, × learned ratio (clamped 0.5–2×) × padding (15%), rounded up to 5 min.

**Overload warnings:** a task that can only finish after its due date is still scheduled but flagged late. A task that fits nowhere in the 28-day window is flagged unscheduled.

**Laundry** (Sunday 3:30pm, 2 hours, blocks scheduling): reminders at +0 (washer), +60 (dryer), +120 (take out).

### Coming in later phases
- **Falling behind:** reschedule the rest of today starting exactly now + 5 min. Overflow moves to later today or the next day by priority. Past 12am only if needed to meet deadlines, hard stop at 2am.
- **Big tasks** (> 90 min): split into chunks across days, after asking the user.
- **Learning:** Start/Done taps in the app record real durations to adjust estimates per type.
- Reminders sync via the Shortcut, check-off, notes, backups, dark UI.

## Layout
- `src/core/` holds the pure scheduling logic with no UI: types, time, recurrence, availability, priority, estimate, scheduler, defaults.
- `test/` holds the Vitest suites; `fixtures.ts` is a sample week with generic place names.

## Progress log
### Phase 1: Scheduler core (done)
- Data model for fixed blocks, locations, cutoff rules, settings and tasks.
- Free-time calculation with travel, cutoffs, an arrival override and DST-safe local times.
- Priority ordering, the placement algorithm with breaks and short-task pairing, gap filling, late and unscheduled warnings, laundry step reminders, and time estimates.
- 41 tests, passing in America/Chicago and Asia/Tokyo.
