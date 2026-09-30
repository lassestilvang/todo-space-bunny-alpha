# Tempo

An automatic day planner. Tasks that schedule themselves, a calendar you can drag, and a coach that plans with you.

Tempo is a local-first task and calendar app where the **clock is the primary workspace**. Capture a task in plain language, let the planner find a slot for it, then drag that slot around when reality changes. No account, no server, no sync — everything lives in `localStorage`.

![Tempo day view](docs/day.jpg)

## Quick start

Requires Node 20.19+ or 22.12+.

```bash
npm install
npm run dev -- --port 5180 --strictPort
```

First load seeds a small sample workspace (projects, tasks, meetings, habits) so every view has something to show. Settings → **Reset to sample**, or the command palette, puts it back.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server. Add `-- --port 5180 --strictPort` to match the smoke test. |
| `npm run build` | `tsc -b` then `vite build` into `dist/`. |
| `npm run preview` | Serve the production build. |
| `npm run lint` | oxlint. Zero errors and 40 warnings, mostly `react(purity)` for `new Date()` during render. |
| `node scripts/verify.mjs` | Headless visual smoke test: visits all 14 surfaces, screenshots them to `/tmp`, and fails loudly on console errors. |

`verify.mjs` reads `URL`, `OUT`, and `CHROME_PATH` from the environment. It defaults to `http://localhost:5180`, the `/tmp/tempo` prefix, and a Playwright-managed Chrome for Testing build.

## The one idea

Most task apps separate *what you want to do* from *when you will do it*, then leave you to reconcile the two by hand. Tempo keeps both on the same object:

- A task has a **`due`** date (a commitment) and an optional **`scheduled`** range (a promise about the clock).
- **Floating** tasks have a due date and no slot. They collect in the right rail and as dashed chips in the day header.
- **Scheduled** tasks have a slot. They are blocks on the grid.
- Dropping a floating task onto the grid gives it a time. Dragging a block moves it, and its `due` follows.
- The **planner** fills gaps: it respects working hours, existing meetings, buffer time, priority, estimated duration, energy type (`deep` / `shallow` / `admin`), preferred daypart, and habit anchors. It fills real openings rather than stacking things on top of each other.
- Anything you place by hand is marked `planLocked` and the planner will not move it again.

## Scheduling by hand

| Gesture | Result |
| --- | --- |
| Drag a block | Moves it in time; in week view it moves across days and the due date follows |
| Drag a block's top or bottom edge | Resizes, snapped to your step, never across days |
| Drag a floating chip or rail row onto the grid | Schedules it at the drop time, with a live ghost showing the exact range |
| Drag an all-day event onto the grid | Turns it into a timed block |
| Click an empty slot | Opens a title field there; drag instead to pick the length |
| Arrow keys on a focused block | Nudge by one step; `Shift` + arrows change length |
| Right-click a block | Move off the calendar, start a focus block, duplicate, delete |

![Dropping a floating task onto the grid](docs/drop.jpg)

## Everything else

- **Quick capture** parses `#project`, `@label`, `!1`–`!4`, `tomorrow`, `at 9:30`, `for 45m`, `every tue`, and shows a live reading of what it understood.
- **Views**: day, week, month, agenda (7/14/21 days), inbox/today/upcoming lists, Eisenhower matrix, project board, habits, notes, review.
- **Habits** with daily/weekdays/weekly/custom cadence, anchors, streaks, and honest counts.
- **Focus timer** with rounds and long breaks. Timer state lives outside React, so closing the panel never interrupts a run. Finished focus blocks are logged as store records; break sessions never pollute the numbers.
- **Assistant** works offline against a deterministic intent engine (add, schedule, unschedule, complete, delete, priority, plan). Supply an Anthropic or OpenAI key in Settings if you want model-written replies.
- **Review** reports where time actually went, counting completed sessions at their planned length and abandoned ones at zero.
- **Undo/redo** across 60 steps, including planner applications and drops.
- Markdown rendering builds React elements only — no HTML strings, links limited to `http`/`https`/`mailto`.

## Keyboard

Press `?` for this list in the app.

| Keys | Action |
| --- | --- |
| `C` | Jump to the capture bar |
| `Enter` / `Shift Enter` | Create the task / add a line |
| `T` `D` `W` `M` `A` | Today, day, week, month, agenda |
| `P` | Open the planner |
| `1`–`9` | Jump to a view by number |
| `G` then `I` / `T` / `U` / `D` / `W` | Inbox, today, upcoming, day, week |
| `Cmd K` | Command palette |
| `F` | Open the focus timer |
| `/` | Search |
| `Cmd Z` / `Shift Cmd Z` | Undo / redo |
| `S` | Toggle light and dark |
| `Esc` | Close whatever is open |

## Data and privacy

Everything is in `localStorage` under `tempo.v1` — tasks, events, habits, docs, projects, labels, focus sessions, chat, settings. There is no network call unless you explicitly enable and configure an LLM, in which case requests go straight from your browser to Anthropic or OpenAI and the key is stored only in that same `localStorage`. Nothing is sent anywhere else.

`localStorage.removeItem('tempo.v1')` resets to the sample workspace on next load.

## Architecture

```
src/
  types.ts              Entities, settings, view model
  lib/
    store.ts            Zustand store, undo history, persistence, seed
    planner.ts          Interval algebra: free/busy, first-fit placement
    nlp.ts              Capture-bar parser
    assistant.ts        Offline intents + optional LLM calls
    selectors.ts        Calendar projection and overlap packing
    drag.ts             Cross-component drag payload
    seed.ts             Sample workspace and default settings
    date.ts             Day keys, formatting, snapping
  components/
    calendar/           TimeGrid (drag/resize/create) and CalendarView
    views/              Month, agenda, matrix, board, habits, notes, review, lists
    ui.tsx              Buttons, inputs, modals, popovers, rings
```

State is a single Zustand store keyed by ID, so any view can render any entity. The calendar projection is deliberately separate from storage: `toItems()` flattens tasks and events into one list, and `layoutItems()` packs overlaps into lanes.

## Stack

React 19, TypeScript 6 (strict, `noUnusedLocals`), Vite 8, Tailwind CSS v4 via `@tailwindcss/vite`, Zustand 5, date-fns 4, lucide-react, clsx, oxlint, Playwright for the smoke test.

## Known limitations

- Chromium throttles `dragover` to roughly 350 ms, so a drop preview can lag the cursor by one snap step. The landing position is recomputed from the real `drop` event, so what you release onto is always correct.
- Recurring tasks generate the next occurrence when you complete one; editing or moving a recurring task edits that single occurrence.
- There are no unit tests yet. `scripts/verify.mjs` covers rendering and console cleanliness across every view.
- The notes markdown renderer covers headings, lists, checklists, quotes, code, links, and emphasis — no tables or fenced code blocks.