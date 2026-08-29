import type {
  CalEvent,
  Doc,
  FocusSession,
  Habit,
  Label,
  Project,
  Settings,
  Task,
} from '@/types'
import { addDays, atMinutes, startOfDay, toKey } from './date'
import { uid } from './id'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  gridStart: 6 * 60,
  gridEnd: 23 * 60,
  workStart: 8 * 60 + 30,
  workEnd: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
  snapMin: 15,
  defaultDuration: 30,
  defaultPriority: 4,
  autoPlan: true,
  focusGoalMin: 100, // four 25-minute blocks
  soundOn: false,
  bufferMin: 10,
  maxBlockMin: 120,
  llm: { enabled: false, provider: 'anthropic', model: 'claude-sonnet-4-5', apiKey: '', endpoint: '' },
  assistantOpen: false,
  reduceDensity: false,
}

const PALETTE = [
  'c-iris',
  'c-aqua',
  'c-sand',
  'c-orchid',
  'c-mint',
  'c-ember',
  'c-sky',
  'c-saffron',
  'c-rose',
  'c-lime',
]

export const colorAt = (i: number) => PALETTE[i % PALETTE.length]

/* -------------------------------------------------------------------------- */

type T = Partial<Task> & { title: string }

function task(t: T, order: number): Task {
  const now = Date.now()
  return {
    id: t.id ?? uid('t'),
    title: t.title,
    notes: t.notes ?? '',
    completed: t.completed ?? false,
    completedAt: t.completed ? now - (t.completed ? 3_600_000 : 0) : undefined,
    createdAt: now,
    updatedAt: now,
    priority: t.priority ?? 4,
    projectId: t.projectId,
    labelIds: t.labelIds ?? [],
    due: t.due,
    dueHasTime: t.dueHasTime ?? false,
    scheduled: t.scheduled ?? null,
    durationMin: t.durationMin ?? 30,
    dayPart: t.dayPart ?? 'any',
    energy: t.energy ?? 'shallow',
    recurrence: t.recurrence,
    subtasks: t.subtasks ?? [],
    reminders: t.reminders ?? [],
    pinned: t.pinned ?? false,
    waitFor: t.waitFor,
    planLocked: t.planLocked ?? false,
    order,
    completedStreak: t.completedStreak ?? 0,
  }
}

function ev(e: Partial<CalEvent> & { title: string; start: number; end: number }): CalEvent {
  return {
    id: e.id ?? uid('e'),
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay ?? false,
    locked: e.locked ?? true,
    location: e.location,
    notes: e.notes,
    projectId: e.projectId,
    color: e.color,
    tentative: e.tentative ?? false,
  }
}

const block = (day: Date, from: number, minutes: number) => ({
  start: atMinutes(day, from),
  end: atMinutes(day, from + minutes),
})

/* -------------------------------------------------------------------------- */

export function seedState() {
  const today = startOfDay(Date.now())
  const d = (n: number) => addDays(today, n)
  const key = (n: number) => toKey(d(n))

  const projects: Record<string, Project> = {}
  const P = (
    name: string,
    color: string,
    glyph: string,
    goal?: string,
    order = 0,
    archived = false,
  ): string => {
    const id = uid('p')
    projects[id] = { id, name, color, glyph, goal, archived, order, createdAt: Date.now() }
    return id
  }

  const deepWork = P('Deep Work', 'c-iris', '◈', 'Ship the time-blocking engine.', 0)
  const studio = P('Studio', 'c-aqua', '◆', 'Ship Tempo 1.0 to the world.', 1)
  const life = P('Life Admin', 'c-sand', '△', 'Keep the boring stuff from eating the day.', 2)
  const sideQuest = P('Side Quest', 'c-orchid', '✦', 'Things I said yes to on a good day.', 3)

  const labels: Record<string, Label> = {}
  const L = (name: string, color: string) => {
    const id = uid('l')
    labels[id] = { id, name, color }
    return id
  }
  const quickWin = L('quick win', 'c-mint')
  const waiting = L('waiting on', 'c-ember')
  const errand = L('errand', 'c-saffron')
  const reading = L('reading', 'c-sky')

  const tasks: Record<string, Task> = {}
  let order = 0
  const T = (t: T) => {
    const item = task(t, order++)
    tasks[item.id] = item
    return item.id
  }

  /* ---------------- scheduled across today, so the day reads like a day ---------------- */
  T({
    title: 'Drag-to-resize on the time grid',
    projectId: deepWork,
    priority: 1,
    due: key(0),
    // Two of three steps are done, so the block holds the remaining hour.
    scheduled: block(d(0), 9 * 60, 60),
    durationMin: 90,
    energy: 'deep',
    dayPart: 'morning',
    planLocked: true,
    notes:
      'Bottom edge handle snaps to 15m. Must survive a 45-minute block and a 3-hour block without jitter.',
    subtasks: [
      { id: uid('s'), title: 'Pointer capture on grab', done: true },
      { id: uid('s'), title: 'Snap to grid + live preview line', done: false },
      { id: uid('s'), title: 'Commit once on pointerup', done: false },
    ],
  })

  T({
    title: 'Rewrite the planner scoring weights',
    projectId: deepWork,
    priority: 2,
    due: key(0),
    scheduled: block(d(0), 11 * 60, 60),
    durationMin: 60,
    energy: 'deep',
    dayPart: 'morning',
  })

  T({
    title: 'Landing page copy pass',
    projectId: studio,
    priority: 2,
    due: key(0),
    scheduled: block(d(0), 14 * 60, 45),
    durationMin: 45,
    energy: 'shallow',
    pinned: true,
  })

  T({
    title: 'Reply to the three designers who asked about beta',
    projectId: studio,
    priority: 2,
    due: key(0),
    durationMin: 15,
    energy: 'admin',
    labelIds: [quickWin],
  })

  T({
    title: 'Renew passport',
    projectId: life,
    priority: 1,
    due: key(0),
    durationMin: 30,
    energy: 'admin',
    labelIds: [errand],
    notes: 'Photos are in the Drive folder. Needs the appointment booking too.',
  })

  T({
    title: 'Pick up the frames',
    projectId: life,
    due: key(2),
    durationMin: 10,
    labelIds: [errand],
  })

  T({
    title: 'Read "The Mom Test" chapter 4',
    projectId: sideQuest,
    due: key(0),
    durationMin: 40,
    energy: 'shallow',
    dayPart: 'evening',
    labelIds: [reading],
  })

  T({
    title: 'Decide on the co-founder conversation',
    projectId: sideQuest,
    priority: 3,
    due: key(1),
    durationMin: 60,
    energy: 'deep',
    labelIds: [waiting],
    notes: 'Prep three questions. Do not turn it into a pitch.',
  })

  T({
    title: 'Fix the flaky timezone test',
    projectId: deepWork,
    priority: 1,
    due: key(-1),
    durationMin: 25,
    energy: 'deep',
    subtasks: [
      { id: uid('s'), title: 'Reproduce in CI', done: true },
      { id: uid('s'), title: 'Pin the TZ env', done: false },
    ],
  })

  T({
    title: 'Outline the launch essay',
    projectId: studio,
    priority: 2,
    due: key(3),
    durationMin: 90,
    energy: 'deep',
    subtasks: [
      { id: uid('s'), title: 'The problem everyone recognises', done: true },
      { id: uid('s'), title: 'Why calendars fail at planning', done: false },
      { id: uid('s'), title: 'What we built instead', done: false },
    ],
  })

  T({
    title: 'Cancel the unused SaaS stack',
    projectId: life,
    priority: 3,
    due: key(1),
    durationMin: 20,
    energy: 'admin',
    labelIds: [quickWin],
  })

  T({
    title: 'Sketch the week view at 5 days',
    projectId: deepWork,
    due: key(4),
    durationMin: 45,
    energy: 'deep',
  })

  T({
    title: 'Book the tyre change',
    projectId: life,
    due: key(5),
    durationMin: 10,
    labelIds: [errand, quickWin],
  })

  T({
    title: 'Weekly review',
    projectId: life,
    priority: 2,
    due: key(6),
    scheduled: block(d(6), 16 * 60, 45),
    durationMin: 45,
    recurrence: { freq: 'weekly', interval: 1, weekdays: [0] },
    energy: 'admin',
  })

  T({
    title: 'Read "Four Thousand Weeks"',
    projectId: sideQuest,
    due: key(-2),
    durationMin: 30,
    completed: true,
    energy: 'shallow',
    labelIds: [reading],
  })

  T({
    title: 'Ship the icon set',
    projectId: studio,
    priority: 2,
    due: key(-1),
    durationMin: 60,
    completed: true,
    energy: 'shallow',
  })

  /* ---------------- tomorrow, pre-seeded so "tomorrow" is never empty ---------------- */
  T({ title: 'Draft the onboarding empty state', projectId: studio, priority: 2, due: key(1), durationMin: 90, energy: 'deep' })
  T({ title: 'Send the invoice', projectId: life, priority: 1, due: key(1), durationMin: 10, labelIds: [quickWin, errand] })
  T({ title: 'Long run — 8k', projectId: life, due: key(1), durationMin: 60, energy: 'shallow' })
  T({ title: 'Interview the second beta user', projectId: studio, priority: 2, due: key(1), durationMin: 45, energy: 'shallow' })

  /* ---------------- inbox ---------------- */
  T({ title: 'Look into that podcast about sleep debt', priority: 4 })
  T({ title: 'Ask Dan about the warehouse space', priority: 3, labelIds: [waiting] })
  T({ title: 'Replace the kitchen bulb', durationMin: 5, labelIds: [quickWin] })

  /* ---------------- calendar events ---------------- */
  const events: Record<string, CalEvent> = {}
  const E = (e: Partial<CalEvent> & { title: string; start: number; end: number }) => {
    const item = ev(e)
    events[item.id] = item
    return item.id
  }

  for (let i = -3; i <= 6; i++) {
    const day = d(i)
    const weekday = day.getDay()
    const isWeekday = weekday >= 1 && weekday <= 5
    if (!isWeekday) continue
    E({ title: 'Standup', start: atMinutes(day, 9 * 60 + 30), end: atMinutes(day, 9 * 60 + 45), projectId: deepWork })
    E({
      title: 'Design review',
      start: atMinutes(day, 13 * 60),
      end: atMinutes(day, 14 * 60),
      projectId: studio,
      location: 'Studio 2',
      notes: 'Bring the time-block prototype and the empty state.',
    })
  }
  E({
    title: '1:1 with Ana',
    start: atMinutes(d(0), 11 * 60),
    end: atMinutes(d(0), 11 * 60 + 30),
    notes: 'Career stuff. Ask about the design team lead opening.',
  })
  E({
    title: 'Lunch with Sam',
    start: atMinutes(d(0), 12 * 60 + 30),
    end: atMinutes(d(0), 13 * 60 + 30),
    locked: false,
  })
  E({
    title: 'Dentist',
    start: atMinutes(d(0), 16 * 60),
    end: atMinutes(d(0), 17 * 60),
    location: 'Bishopsgate',
    notes: 'Bring the referral letter.',
  })
  E({
    title: 'Flight to Lisbon',
    start: atMinutes(d(3), 6 * 60 + 40),
    end: atMinutes(d(3), 9 * 60 + 25),
    location: 'LHR T5',
    tentative: true,
  })
  E({ title: 'Trip · Lisbon', start: atMinutes(d(3), 0), end: atMinutes(d(7), 0), allDay: true, locked: false })
  E({
    title: 'Kickoff · Tempo 1.0',
    start: atMinutes(d(2), 10 * 60),
    end: atMinutes(d(2), 12 * 60),
    location: 'Zoom',
    notes: 'Agenda: scope, timeline, who owns what.',
  })

  /* ---------------- habits ---------------- */
  const habits: Record<string, Habit> = {}
  const H = (h: Partial<Habit> & { name: string; color: string; order: number }) => {
    const id = uid('h')
    habits[id] = {
      id,
      name: h.name,
      color: h.color,
      cadence: h.cadence ?? 'weekdays',
      weekdays: h.weekdays ?? [1, 2, 3, 4, 5],
      targetPerWeek: h.targetPerWeek ?? 5,
      anchorMin: h.anchorMin ?? null,
      durationMin: h.durationMin ?? 15,
      log: h.log ?? [],
      createdAt: Date.now(),
      archived: false,
      order: h.order,
    }
    return id
  }

  const log = (n: number, skip: number[] = []) => {
    const out: string[] = []
    for (let i = -n; i <= 0; i++) if (!skip.includes(i)) out.push(key(i))
    return out
  }

  H({ name: 'Strength training', color: 'c-ember', order: 0, anchorMin: 7 * 60, durationMin: 45, log: log(21, [0, -3, -8, -14]) })
  H({ name: 'Morning pages', color: 'c-saffron', order: 1, cadence: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], anchorMin: 6 * 60 + 45, durationMin: 15, log: log(21, [0, -2, -9]) })
  H({ name: 'Read 20 pages', color: 'c-sky', order: 2, anchorMin: 21 * 60 + 30, durationMin: 30, log: log(21, [0, -1, -4, -5, -11]) })
  H({ name: 'Walk 4km', color: 'c-mint', order: 3, cadence: 'weekly', weekdays: [1, 3, 5, 6], targetPerWeek: 4, durationMin: 40, log: log(21, [0, -1, -2, -7, -8]) })
  H({ name: 'No screens after 23:00', color: 'c-iris', order: 4, cadence: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], durationMin: 5, log: log(30, [0, -1, -3, -4, -5, -10, -11, -12]) })

  /* ---------------- docs ---------------- */
  const docs: Record<string, Doc> = {}
  const now = Date.now()
  const D = (title: string, body: string, projectId?: string, pinned = false) => {
    const id = uid('d')
    docs[id] = { id, title, body, projectId, createdAt: now, updatedAt: now, pinned }
    return id
  }

  D(
    'Why calendars fail at planning',
    `# Why calendars fail at planning

A calendar answers **when can I**. A planner answers **what should I**.

Every calendar on the market stopped at the first question. They got very good at
letting you *record* where you were going to be, and almost nothing at helping you
*decide* where you should go.

## The three failures

1. **The list and the clock live in different worlds.** TickTick bolted a calendar
   onto a list. The join is a button you have to press.
2. **Estimation is unbounded.** "30 minutes" and "the whole afternoon" live in the
   same field.
3. **Nobody respects your energy.** Deep work at 5pm is a lie you tell yourself.

## What we build instead

Tempo treats a task as a **durable object with a length, an energy profile and a
preferred part of day**. The planner then does the boring part: it places those
objects into the holes your calendar leaves, in an order your brain can actually
do, and it tells you what it did.

> The best plan is the one you can still execute at 4pm on a bad day.

- [ ] Turn the energy curve into something visible
- [ ] Let users push back once and learn from it
`,
    studio,
    true,
  )

  D(
    'Launch checklist',
    `- [x] Landing page draft
- [x] 12 beta invites sent
- [ ] 12 beta invites **accepted** (7 so far)
- [ ] Pricing page
- [ ] Demo video, 90 seconds, no music
- [ ] Support inbox ready
- [ ] Press kit

> Ship on a Tuesday. Never a Friday, never a Monday.`,
    studio,
  )

  D(
    'Reading list',
    `- **Four Thousand Weeks** — Oliveira
- **The Mom Test** — Fitzpatrick
- **Thinking in Systems** — Meadows
- **Shape Up** — Singer
- **How to Do Nothing** — Muñoz
- **A Pattern Language** — Alexander`,
    sideQuest,
  )

  D(
    'Household log',
    `Filter changed 14 Aug.
Tyre pressure check: 2.4 front / 2.5 rear.
Boiler service due Nov.`,
    life,
  )

  /* ---------------- focus history for the stats view ---------------- */
  const sessions: FocusSession[] = []
  for (let i = 0; i < 28; i++) {
    const day = d(-i)
    if (day.getDay() === 0 || day.getDay() === 6) continue
    const blocksToday = 1 + ((i * 7) % 3)
    for (let b = 0; b < blocksToday; b++) {
      const from = 9 * 60 + b * 95 + ((i * 13) % 4) * 15
      sessions.push({
        id: uid('s'),
        taskId: Object.values(tasks)[(i + b) % Math.max(1, Object.keys(tasks).length)]?.id,
        label: Object.values(tasks)[(i * 3 + b) % Math.max(1, Object.keys(tasks).length)]?.title ?? 'Focus',
        start: atMinutes(day, from),
        minutes: [25, 50, 50, 75][(i + b) % 4],
        completed: (i + b) % 7 !== 0,
      })
    }
  }

  return {
    tasks,
    events,
    habits,
    docs,
    projects,
    labels,
    filters: {},
    sessions,
    chat: [] as never[],
    settings: DEFAULT_SETTINGS,
  }
}

export type Seed = ReturnType<typeof seedState>
export const seedProjectIds = () => seedState().projects
export const palette = PALETTE
