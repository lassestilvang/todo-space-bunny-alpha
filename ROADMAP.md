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

**Interaction tests, and three fixes they forced** — `done`. Eighteen checks driven through a
real browser (`npm run verify:actions`), because jsdom would have to fake the layout the drag
arithmetic reads. Each one pins a bug this app actually had, and they found three more:

- A block resized from its bottom edge grew by fifteen extra minutes. My own refactor the
  night before had clamped an *edge* as if it were a *span*, biasing it by the minimum length.
- Dragging a block that displaced other work cost **two** undos, because the calendar's
  re-fitting pushed a history entry of its own — so the first undo appeared to do nothing. A
  refit is now recorded only when nothing else has, and folds into the change that caused it.
- The sample workspace shipped with a task colliding with a meeting, so the calendar quietly
  repaired itself on the first change and rearranged itself under the user. The sample is now
  collision-free apart from the deliberate tutorial block.

**The drag geometry, extracted and tested** — `done`. Every number a drag depends on now
lives in `src/lib/grid.ts` as plain arithmetic, and the component calls it. The function that
locates the pointer takes no scroll argument at all, which is the point: the original
scroll-double-count bug could not survive a signature that has nowhere to put a second
scroll. Fifteen tests cover it, including the invariant that matters most — a block travels
exactly as far as the pointer does *however the cascade has stacked it* — and they found one
real edge case, a zero snap step dividing by zero. Re-verified in the browser afterwards:
dragging one hour moves a block one hour, before and after scrolling the grid.

**Tests for the store and the calendar's arithmetic** — `done`. The pure functions were
covered first; this pass reached the two layers below them. Twenty-eight store tests over the
refit, series scopes, subtask resizing and folder deletion, plus fourteen date tests over
daylight-saving boundaries. They found two more real bugs: `addDays` added 24 *hours*, so
every weekly recurrence drifted an hour across a clock change twice a year, and a recurring
event created from scratch was issued as occurrences that shared no `seriesId` — which is
what "move just this one" and "delete the whole series" depend on.

**A test suite for the pure functions** — `done`. Ninety-seven tests over the planner, the
capture parser, the clock, saved filters, deadline risk, the focus accounting, the adviser
and the room proposals (`npm test`). They are not decoration: the first run found two real
parser bugs (an overnight range gaining twelve hours instead of a day, and "at 25:00"
wrapping to 01:00) and an off-by-one that made the adviser say "due in 8 days" for
something due in seven and "due tomorrow" for something due today. What the suite cannot
reach is the React layer, which is noted in Known gaps.

**Folders** — `done`. One level of grouping above a project, and deliberately no more: a
second entity type that nests would have to be understood by every filter, view and capture
rule, while a folder is just a label for a set of projects. The sidebar files projects under
their folder with anything unfiled under "Elsewhere"; right-click a project to move it, or
create a folder from the group's own button. Deleting a folder keeps its projects — it only
takes away their home. Saved filters compose with it: a `Folder` condition matched nine
tasks in the sample, all of them in the folder, and left the twelve unfiled ones out.

**"Free up an hour"** — `done`. "Free up an hour at 14:00" is a question about where to
give up time, not an instruction, so it is answered with proposals instead of a mutation.
`src/lib/room.ts` reads the requested length and window ("an hour", "90 minutes", "this
afternoon", "at 15:00"), finds the planner-owned blocks sitting in the way, and offers up
to three ways out — move the least important one to the first opening after the window,
take it off the clock entirely, or shorten it to what fits. Nothing is written until you
pick one; applying a choice is a single undoable step, and the transcript records what you
chose. When nothing is in the way it says so and names the largest opening instead of
inventing work.

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

## Known gaps

Not features — things that are wrong or missing and should not be forgotten.

- 143 unit tests (`npm test`) cover the logic, and eighteen interaction checks
  (`npm run verify:actions`) cover dragging, resizing, cross-day moves, the inline field,
  undo and the shortcuts in a real browser. Still uncovered: the detail panel's own forms,
  the filter editor's live count, and anything a keyboard-only user does to them.
- The assistant negotiates about *today* only. "Free up an hour tomorrow morning" is read
  as today, which is the wrong answer rather than a refusal — worth a day parameter before
  anyone relies on it.
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
- Folders are one level and carry no colour, order beyond their own row, or nested
  projects-of-projects. That was the point of stopping at one, but it does mean the
  sidebar cannot express "Studio / Deep Work" as a path.
- The sample workspace keeps one deliberate collision: the tutorial block sits under
  the Standup, because it is a hand-placed block and hand-placed blocks are never moved.
  That is the behaviour being demonstrated, but it does look like a mistake on first run.

---

## Deliberately not doing

- **Habit rewards, coins, badges.** Gamification turns a tool into a scoreboard. Streaks
  and honest counts already carry the signal.
- **Sharing, accounts, sync.** Tempo is local-first on purpose. Adding a backend
  changes the product, not just the feature set.
- **Natural-language *event* creation** ("meeting with Ana tuesday 2pm"). The parser now
  has tests behind it, so this is unblocked rather than forbidden — but it is a new entity
  type on the calendar and worth doing deliberately, not as a leftover.
- **A mobile layout.** The grid needs width to be legible. A phone-shaped Tempo would
  be a different app with a different name.
