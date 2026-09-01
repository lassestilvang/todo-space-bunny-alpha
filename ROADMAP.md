# Roadmap

Where Tempo goes next, and why. Priorities are ordered; each item says what
"done" looks like so it can be picked up cold.

**Status vocabulary** — `todo` · `doing` · `done` · `dropped` (with a reason).
**Size** — S: one focused sitting. M: a few. L: a project of its own.

The premise: **Tempo is a calendar.** Everything else exists to feed the clock
and read back what happened there. Any feature that does not make the calendar
more truthful, more drivable, or more honest about time is out of scope.

---

## Now

**A 24-hour time field** — `done`. The native `input[type=time]` rendered in the browser's
locale, so the same build asked one person for "2:30 PM" and another for "14:30" while the
rest of Tempo insisted on 24-hour. There is now no native time input anywhere in the app:
`TimeField` always shows `HH:MM`, takes `9:30`, `09:30`, `0930` or `9`, nudges in 15-minute
steps from its buttons or the arrow keys, and reverts to the last good value rather than
guessing when the typing is nonsense. Used by the event start and end, a task's block
start, and the habit anchor.

**Subtasks count when planning** — `done`. A task's `durationMin` is the estimate for the
whole job, so a task with steps only needs clock time for the steps that are left: one
definition, `plannedMinutes`, in `src/lib/selectors.ts`, shared by the planner, the grid,
the saved-filter totals and the list headers. Ticking a step shortens the block in place —
the clock was holding time for work that is now done — and the panel says so plainly:
"2/3 · 30m left of 90m". With every step done the block keeps the five minutes needed to
close the job out rather than vanishing.

**Recurring events** — `done`. A meeting can repeat. Occurrences are stored as real rows
that share a `seriesId`, which is what the grid, the planner and the busy calculation
already understand, so moving or cancelling one occurrence is an ordinary edit to that row
and the rest of the series cannot be affected by accident. Changing the time or deleting
asks how far the change should reach: only this meeting, this and future, or the whole
series. A time change applied to the series shifts every occurrence by the same delta, so
a 09:00 standup stays a 09:00 standup.

**The drawn block takes a project** — `done`. The inline field on the calendar runs the
same parser as the capture bar, so drawing a block and typing `plan the week #Studio
@errand !2` gives you the project, the label and the priority, with the same live chips
underneath. A project you named that does not exist yet is created, exactly as typed
capture would. The drawn range stays the clock: your word about the hour never silently
overrides where you put the block. Both surfaces now share `chipList` and `metaFrom` in
`src/lib/capture.ts`, so they cannot describe the same text differently.

**Saved filters** — `done`. A named question about your tasks, kept so you can ask it
again. Conditions cover project, label, priority, due window, on-the-clock-or-not and
energy, combined with *and*; the editor shows a live count of what answers it as you
build it. Filters are stored entities, so they travel with the export, and they appear in
the sidebar with their own counts. One matcher in `src/lib/filters.ts` serves the list
view, the sidebar counts and the list's estimated total.

**Auto-prioritise "the one thing"** — `done`. The top bar names the one to three blocks
worth doing right now, scored by deadline pressure, priority, whether the kind of work
suits the hour, and whether you placed the block yourself. The scoring is a pure function
in `src/lib/advise.ts` that only ever reads: it advises, it never moves anything, and a
click on a name opens the task.

**Phase-change sound** — `done`. A short two-note tone when a block or a break ends:
low when a break begins, brighter when work resumes. Off by default, never heard while
the window is in the background, and the gain is fixed rather than boosted — the OS owns
the real volume. One oscillator per note, created lazily inside a user gesture.

**Focus goal and history** — `done`. The Focus view puts the honest session record
next to a target: a progress ring for today, a streak that counts days you *finished*
at the goal, and seven days of bars with the goal drawn across them. The accounting
lives in `src/lib/focus.ts` and Review now reads the same functions, so the two
surfaces cannot report different numbers for the same day.

**Focus mode** — `done`. `F` steps the whole app aside: one ring, the task you
promised yourself, the phase, and what comes next. `Space` runs the session, `Esc`
or a click away leaves, and the session keeps running while you are gone, so
nothing about the timer depends on the surface being open.

**Deadline risk surfacing** — `done`. A task that finishes after the day it was
due, or is due now with no time on the clock, is flagged everywhere: an amber
triangle on the block itself, a marker on the list row, a sentence in the day rail,
and a warn-coloured count on the Today row. The rule lives in `src/lib/risk.ts` and
is derived on the spot, so the four surfaces cannot disagree.

**Continuous re-plan** — `done`. The calendar keeps its own promises: when the
shape of a day changes, planner-owned blocks are re-fitted, hand-placed blocks
never move, and nothing new gets scheduled. See README → *Keeping the plan true*.

---

## Bigger, later

### 1. "Free up an hour" — L

From Ellie. The assistant is seven intents deep: add, schedule, unschedule,
complete, delete, priority, plan. It can execute but cannot negotiate.

- Turn a request into a *plan diff* with two or three named options, not a
  single silent mutation.
- "Free up an hour this afternoon" should offer: move X to 16:00, drop Y, or
  shorten Z to 45 minutes — each previewed, each individually undoable.
- Reuses the planner rather than adding a second scheduler.

**Done when** a vague request returns options with previews, and applying one is a
single undoable step that shows exactly what moved.

### 2. Folders — M

From Todoist sections and TickTick lists. Projects are flat.

- One level of folder above project, so the sidebar can group without a second
  entity type everywhere.
- Should land *after* saved filters, which it composes with.

**Done when** a folder can contain projects, the sidebar groups by it, and a filter
can span a folder.

---

## Known gaps

Not features — things that are wrong or missing and should not be forgotten.

- No unit tests. `scripts/verify.mjs` covers rendering and console cleanliness only
  (fifteen surfaces now, including Focus). Time formatting and the clock parser are now
  pure functions in `src/lib/clock.ts`, which makes them easy to cover.
  The planner and the NLP parser are pure functions and are the first things worth
  testing properly.
- Saved filters cover project, label, priority, due window, on-the-clock and energy.
  The brief also mentioned driving "the capture bar's default view"; that clause is not
  implemented, because nothing in the capture flow wanted a saved filter and inventing one
  would have meant guessing.
- A repeating meeting is issued as 26 real occurrences and is not extended past that, so
  a weekly series runs about six months. Re-issuing it is one edit in the event panel.
- Editing an occurrence's *title* or notes applies to that occurrence only, even inside a
  series; only time and deletion offer the wider scopes. This is deliberate but it does
  mean a renamed occurrence quietly diverges from its siblings.
- A `planLocked` block can sit underneath a meeting, because the user is allowed to
  put it there. This is deliberate, and deadline risk surfacing now makes the
  schedule itself honest, but the overlap is still only visible on the block.
- The seed workspace ships with three overlaps on the first day: the tutorial block
  sits under the Standup, a planner block sits against the 1:1 with Ana, and Lunch
  with Sam runs into Design review. The refit repairs the second kind on the first
  change and leaves the first alone because it is a hand-placed block; the third is
  two events, and neither is the app's to move. Worth tidying so the sample workspace
  does not teach bad habits.

---

## Deliberately not doing

- **Habit rewards, coins, badges.** Gamification turns a tool into a scoreboard. Streaks
  and honest counts already carry the signal.
- **Sharing, accounts, sync.** Tempo is local-first on purpose. Adding a backend
  changes the product, not just the feature set.
- **Natural-language *event* creation** ("meeting with Ana tuesday 2pm") until the
  parser is covered by tests. Capture already handles it; events do not, and a
  half-working parser that creates the wrong meeting is worse than none.
- **A mobile layout.** The grid needs width to be legible. A phone-shaped Tempo would
  be a different app with a different name.
