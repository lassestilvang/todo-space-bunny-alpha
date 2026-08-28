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

**Continuous re-plan** — `done`. The calendar keeps its own promises: when the
shape of a day changes, planner-owned blocks are re-fitted, hand-placed blocks
never move, and nothing new gets scheduled. See README → *Keeping the plan true*.

---

## Next up

### 1. Deadline risk surfacing — S

The refit moves blocks and quietly pushes work that no longer fits. Nothing tells
you that a task now has no time before its due date, which is the one thing a
planner must never hide.

- A day-summary line in the rail: "2 tasks due this week have no time yet".
- Blocks that the refit pushed to a later day than their due date get flagged in
  place, not only in a toast that has already faded.
- Risk is derived, never stored: compare each due task's scheduled end with its due date.

**Done when** a task due before its only block shows as at-risk in the day rail, in
the week grid, and in a list view, and the same rule drives a count on the Today row.

### 2. Focus mode — S

From AkiFlow. The timer works but lives in a sidebar pill; focus mode is what makes
a timer something you actually use.

- Full-bleed surface: the ring, the task title, the phase, the next phase.
- Everything else hidden — no sidebar, no rail, no grid. `Esc` or a click returns.
- Keeps running while hidden; the document title still counts down.
- The linked task is opened read-only, with "done" as the only action offered.

**Done when** `F` toggles it from anywhere, a running session survives entering and
leaving it, and a 25-minute session can be completed without touching the mouse.

### 3. Focus goal and history — S

Sessions are already logged honestly (completed count at planned length, abandoned
at zero). Nothing consumes that yet.

- A daily target in minutes, in Settings → Focus.
- A 7-day history with a per-day bar, reusing the same numbers as Review.
- A streak that counts days you hit the target, not days you opened the app.

**Done when** the Focus view shows goal, streak, and a week of bars, and the numbers
match the Review view exactly.

### 4. Phase-change sound — S

The ticker is silent, so a finished phase is only noticed by looking. A single
short tone, off by default, with a volume that respects the OS.

**Done when** a sound setting exists and fires on focus→break and break→focus,
never while the window is unfocused and muted.

---

## Worth doing

### 5. Auto-prioritise "the one thing" — M

From Motion. The data exists; the judgement does not.

- Score open blocks by deadline pressure, priority, energy fit for the current
  hour, and whether they are already `planLocked`.
- Surface the top one to three for *right now* in the top bar, not as a new view.
- Never moves anything on its own. It advises.

**Done when** the top bar names what to do next and the answer visibly changes when
the time of day, the priority, or a meeting moves.

### 6. Saved filters — M

From Todoist, and the largest gap on the task side. Today, Upcoming and Inbox are
hard-coded; there is no way to ask a question the app cannot answer.

- A filter of clauses: project, label, priority, due window, scheduled-or-not, energy.
- Named filters appear in the sidebar and take a number for `1`–`9` navigation.
- Filters are stored entities, exported with everything else.

**Done when** a saved filter is a first-class sidebar entry, shareable by export,
and that the same filter logic can drive a list view and the capture bar's default view.

### 7. The drawn block takes a project — S

A consequence of routing grid creation through the inline field: it commits the raw
title, so a block drawn on the calendar cannot pick up `#project`, `@label` or `!1`
the way typed capture does. The composer should run its text through the same parser.

**Done when** drawing a block and typing `plan the week #Studio !1` yields the project,
label and priority, with the same live chips the capture bar shows.

### 8. Recurring events — M

`recurrence` exists on `Task` only, so a standup cannot repeat. This is a
correctness gap rather than a missing feature.

- Series editing with a this/this-and-future/all choice, matching task behaviour.
- Exceptions on single occurrences, and a way to delete one without the series.

**Done when** a weekly meeting repeats, a single instance can be moved or cancelled,
and the series is left alone.

### 9. Subtasks count when planning — M

A task with three unfinished subtasks is planned as one block of its own duration.
The planner should either lengthen the block or schedule the subtasks.

**Done when** an incomplete subtask list changes the planned length, and completing
subtasks is reflected in the block that represents the task.

### 10. A 24-hour time field — S

Four native `<input type="time">` widgets (event start and end, habit anchor, and
working hours) render in the browser's locale format. Their values are 24-hour, but
the widget is not, which is inconsistent with the rest of the app.

- One small controlled field, used in all four places, with a 15-minute stepper.

**Done when** no native time input remains and every time in the app reads 24-hour.

---

## Bigger, later

### 11. "Free up an hour" — L

From Ellie. The assistant is seven intents deep: add, schedule, unschedule,
complete, delete, priority, plan. It can execute but cannot negotiate.

- Turn a request into a *plan diff* with two or three named options, not a
  single silent mutation.
- "Free up an hour this afternoon" should offer: move X to 16:00, drop Y, or
  shorten Z to 45 minutes — each previewed, each individually undoable.
- Reuses the planner rather than adding a second scheduler.

**Done when** a vague request returns options with previews, and applying one is a
single undoable step that shows exactly what moved.

### 12. Folders — M

From Todoist sections and TickTick lists. Projects are flat.

- One level of folder above project, so the sidebar can group without a second
  entity type everywhere.
- Should land *after* saved filters, which it composes with.

**Done when** a folder can contain projects, the sidebar groups by it, and a filter
can span a folder.

---

## Known gaps

Not features — things that are wrong or missing and should not be forgotten.

- The inline grid field does not parse `#project` / `@label` / `!1` (see item 7).
- Four native time inputs follow browser locale, not 24-hour (item 10).
- No unit tests. `scripts/verify.mjs` covers rendering and console cleanliness only.
  The planner and the NLP parser are pure functions and are the first things worth
  testing properly.
- A `planLocked` block can sit underneath a meeting, because the user is allowed to
  put it there. This is deliberate, but item 1 should make it visible.
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
