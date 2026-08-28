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

## Next up

### 1. The drawn block takes a project — S

A consequence of routing grid creation through the inline field: it commits the raw
title, so a block drawn on the calendar cannot pick up `#project`, `@label` or `!1`
the way typed capture does. The composer should run its text through the same parser.

**Done when** drawing a block and typing `plan the week #Studio !1` yields the project,
label and priority, with the same live chips the capture bar shows.

### 2. Recurring events — M

`recurrence` exists on `Task` only, so a standup cannot repeat. This is a
correctness gap rather than a missing feature.

- Series editing with a this/this-and-future/all choice, matching task behaviour.
- Exceptions on single occurrences, and a way to delete one without the series.

**Done when** a weekly meeting repeats, a single instance can be moved or cancelled,
and the series is left alone.

### 3. Subtasks count when planning — M

A task with three unfinished subtasks is planned as one block of its own duration.
The planner should either lengthen the block or schedule the subtasks.

**Done when** an incomplete subtask list changes the planned length, and completing
subtasks is reflected in the block that represents the task.

### 4. A 24-hour time field — S

Four native `<input type="time">` widgets (event start and end, habit anchor, and
working hours) render in the browser's locale format. Their values are 24-hour, but
the widget is not, which is inconsistent with the rest of the app.

- One small controlled field, used in all four places, with a 15-minute stepper.

**Done when** no native time input remains and every time in the app reads 24-hour.

---

## Bigger, later

### 5. "Free up an hour" — L

From Ellie. The assistant is seven intents deep: add, schedule, unschedule,
complete, delete, priority, plan. It can execute but cannot negotiate.

- Turn a request into a *plan diff* with two or three named options, not a
  single silent mutation.
- "Free up an hour this afternoon" should offer: move X to 16:00, drop Y, or
  shorten Z to 45 minutes — each previewed, each individually undoable.
- Reuses the planner rather than adding a second scheduler.

**Done when** a vague request returns options with previews, and applying one is a
single undoable step that shows exactly what moved.

### 6. Folders — M

From Todoist sections and TickTick lists. Projects are flat.

- One level of folder above project, so the sidebar can group without a second
  entity type everywhere.
- Should land *after* saved filters, which it composes with.

**Done when** a folder can contain projects, the sidebar groups by it, and a filter
can span a folder.

---

## Known gaps

Not features — things that are wrong or missing and should not be forgotten.

- The inline grid field does not parse `#project` / `@label` / `!1` (see item 1).
- Four native time inputs follow browser locale, not 24-hour (item 4).
- No unit tests. `scripts/verify.mjs` covers rendering and console cleanliness only
  (fifteen surfaces now, including Focus).
  The planner and the NLP parser are pure functions and are the first things worth
  testing properly.
- Saved filters cover project, label, priority, due window, on-the-clock and energy.
  The brief also mentioned driving "the capture bar's default view"; that clause is not
  implemented, because nothing in the capture flow wanted a saved filter and inventing one
  would have meant guessing.
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
