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

**A widened filter says so** — `done`. The last thing here was a judgement call I had
written down as a gap: a filter that loses *every* condition becomes an empty filter, which
by design matches everything. "Studio work" quietly becoming "all your work" is too big a
change to leave for the user to notice, so the filter now remembers why. Deleting a project,
folder or label records what went on the filter; the sidebar row carries a warning triangle
and says why on hover; the filter's own view explains it in full and points at the editor;
and saving a condition clears it. A filter that lost only one of several conditions stays
quiet, because that is a narrower question rather than a different one.

Writing the tests for this turned up two more holes in the same corner: **editing a filter
recorded no history, and neither did deleting one** — so a named question could be renamed or
removed with no way back. Both are undoable now, with tests that undo and check the filter
comes back intact.

**References stay honest, and the filter list stays short** — `done`. The last item here was
the vague one — whether the parts that read the store stay correct as the *mix* of entities
changes — so it was made concrete: deleting something other things point at. Tasks were
already cleaned up, but **saved filters were not**, so a filter that asked for "Studio work"
kept its name and quietly matched nothing at all after the project was deleted, which reads
as a broken app rather than a stale question. Deleting a project, label or folder now drops
the clauses that pointed at it and keeps the rest, so the filter still means something and its
count shows the change. Deleting a label also records history now; it was the one destructive
action that could not be undone. The sidebar lists ten filters and offers the rest, so a long
list cannot push projects and labels off the screen.

**Three hundred filters, four hundred events and habits** — `done`. The last gap on this
list, and the environment harness grew two groups for it: three hundred saved filters, and
a workspace of two hundred events plus two hundred habits rather than tasks. Both hold —
a change still settles quickly with the filters in the sidebar, and the planner answers
promptly in a day crowded with immovable meetings and habit anchors. The habits and
meetings are the part that matters, since both feed the planner's busy calculation.

While measuring, one confusing behaviour turned up that was not a performance problem at
all: the Today badge counts what is **at risk**, not what is open, so finishing a task
left the number where it was and looked stuck. That was a deliberate choice from the
risk work, so the fix is to explain it — the row now says what its number means on hover.

**Narrow windows, other timezones, a thousand tasks** — `done`. The last three things
that could only break elsewhere, checked with a new harness (`npm run verify:env`, 44
assertions) because they need different setups rather than more assertions: viewport
sweeps, `timezoneId` contexts, and a seeded thousand-task workspace. It found one real
problem: the day rail is a fixed 292px, so at 760px the calendar — the product — had
**184px** and each week column 26px, wide enough for two characters. The rail now steps
aside below 960px, which gives the grid 476px and week columns 68px at 760px, and changes
nothing at 1024px or wider. The planner and the risk count stay reachable from the top bar
and the palette. Everything else held: no errors at any width, no sideways scroll, every
block under the right date header in Tokyo, New York and Sydney, and a thousand tasks
booting in under a second with the list view rendering all 860 open ones in 2.6 s.

**Tests that do not care what time it is** — `done`. The interaction suite was quietly
time-dependent: it only ever fully passed in the early morning, because the grid opens
scrolled to the current hour, so a block at 10:00 was on the window at nine and off it after
lunch, and two assistant checks asked for hours that had already gone by the time they ran.
The suite now pins the clock, blocks are scrolled into view before they are grabbed, and the
assistant is asked about a slot the test just created. Pinning it exposed four real bugs that
only exist at certain hours:

- Asking to free an hour **at 18:00 when the day ends at 18:00** was silently moved to 17:45,
  so the assistant answered about the wrong hour and reported the wrong thing.
- A window that runs off the end of the day was analysed as a fifteen-minute sliver, and the
  explanation of that was computed *after* the branch that returns, so it never appeared.
- A window already behind the clock was answered for "now" with no mention that the hour asked
  for had passed.
- A block the user had placed by hand was reported as "which I cannot move" — true of the
  planner, not of the user asking. It is now offered as a move, which is what was wanted.
  Meetings are still never proposed for a move: they belong to everyone's calendar.

The scripts also start the app themselves now, so a stopped dev server stops being a confusing
test failure, and vitest is pinned to this tree so an agent worktree's copies cannot inflate
the counts.

**The habit, note, planner and assistant surfaces** — `done`. Interaction coverage for the
last four untested surfaces, and one honesty fix they forced. Asked to "free up an hour at
14:00" while a meeting sat in that hour, the assistant replied "nothing is in the way" —
technically true, since it will not move a meeting, and misleading all the same. It now names
what is standing there and offers the nearest opening instead: "13:30–14:30 is Design review,
which I cannot move. The nearest opening is 14:30–16:00, 90 minutes." Also covered: a habit's
anchor is kept and its day-ticks log; a new note saves with its markdown; the planner sheet
previews before it applies and one undo reverses the lot; the assistant keeps a multi-turn
transcript and retires its proposals once one is chosen.

**The panels, and keyboard access to them** — `done`. Interaction tests for the detail
panel (rename, priority, steps, delete, Enter and Escape, arrow-key nudging) and for the
filter editor (a live count that changes as conditions change, create, delete). They
found a real defect: the edit affordance on a sidebar row was a `role="button"` span
*nested inside* the row's `<button>`, so it worked with a mouse and was unreachable
from the keyboard. Both row types are now a container with two sibling buttons, and
projects gained a "File" button that opens the same folder picker the right-click menu
used to, so filing a project no longer needs a mouse at all.

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

- 158 unit tests (`npm test`), 47 interaction checks (`npm run verify:actions`) and 55
  environment checks (`npm run verify:env`) cover the logic, every surface on a pinned
  clock, six window widths, three timezones, a thousand tasks, three hundred filters and
  four hundred events and habits.
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
- **Habit anchors are reserved on the clock but not drawn on it.** The planner will not
  place work over your 06:45 pages or 07:00 training, and the rail lists them, but the
  grid shows an unexplained gap. Drawing them as soft blocks would make the calendar
  tell the whole truth.
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
