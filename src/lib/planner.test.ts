import { describe, expect, it } from 'vitest'
import type { CalEvent, Habit, Settings, Task } from '@/types'
import { fixedBusy, mergeIntervals, planRange, subtract, type Interval } from './planner'

const DAY = '2026-10-01' // a Thursday
const H = 3_600_000

const settings: Settings = {
  theme: 'dark',
  gridStart: 6 * 60,
  gridEnd: 22 * 60,
  snapMin: 15,
  bufferMin: 10,
  maxBlockMin: 120,
  workStart: 8 * 60 + 30,
  workEnd: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
  defaultDuration: 30,
  autoPlan: true,
  focusGoalMin: 100,
  soundOn: false,
  assistantOpen: false,
}

const at = (h: number, m = 0) => {
  const d = new Date(`${DAY}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  title: `task ${n}`,
  notes: '',
  completed: false,
  createdAt: at(7),
  updatedAt: at(7),
  due: DAY,
  dueHasTime: false,
  scheduled: null,
  durationMin: 60,
  energy: 'deep',
  labelIds: [],
  subtasks: [],
  reminders: [],
  pinned: false,
  order: 0,
  planLocked: false,
  completedStreak: 0,
  ...over,
})

const event = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: `e${++n}`,
  title: 'meeting',
  start: at(10),
  end: at(11),
  allDay: false,
  locked: false,
  tentative: false,
  ...over,
})

const habit = (anchorMin: number, durationMin = 30): Habit => ({
  id: `h${++n}`,
  name: 'habit',
  color: 'c-sky',
  cadence: 'weekdays',
  weekdays: [],
  targetPerWeek: 5,
  anchorMin,
  durationMin,
  log: [],
  archived: false,
  createdAt: at(7),
})

const input = (tasks: Task[], events: CalEvent[] = [], habits: Habit[] = []) => ({
  tasks,
  events,
  habits,
  settings,
})

describe('interval arithmetic', () => {
  it('merges touching and overlapping spans', () => {
    expect(
      mergeIntervals([
        { start: 0, end: 30 },
        { start: 30, end: 60 },
        { start: 90, end: 120 },
      ]),
    ).toEqual([
      { start: 0, end: 60 },
      { start: 90, end: 120 },
    ])
  })

  it('subtracts busy time from a window', () => {
    expect(subtract([{ start: 0, end: 120 }], [{ start: 30, end: 60 }])).toEqual([
      { start: 0, end: 30 },
      { start: 60, end: 120 },
    ])
  })

  it('leaves nothing when the busy time covers the window', () => {
    expect(subtract([{ start: 0, end: 60 }], [{ start: 0, end: 60 }])).toEqual([])
  })
})

describe('placing work', () => {
  it('keeps a block inside working hours', () => {
    const report = planRange(input([task({ durationMin: 90 })]), DAY, 1, { float: false })
    const [block] = report.placements
    expect(block.start).toBeGreaterThanOrEqual(settings.workStart)
    expect(block.end).toBeLessThanOrEqual(settings.workEnd)
  })

  it('never stacks work on top of a meeting', () => {
    const report = planRange(input([task({ durationMin: 60 })], [event({ start: at(10), end: at(11) })]), DAY, 1, {
      float: false,
    })
    for (const p of report.placements) {
      const clash = p.start < 11 * 60 && p.end > 10 * 60
      expect(clash).toBe(false)
    }
  })

  it('leaves a hand-placed block alone, rather than moving it', () => {
    const hand = task({
      scheduled: { start: at(16), end: at(17) },
      planLocked: true,
      durationMin: 60,
    })
    const report = planRange(input([hand, task({ durationMin: 30 })]), DAY, 1, { float: false })
    // A block the user placed is never a candidate, so nothing may be scheduled
    // across it either.
    expect(report.placements.some((x) => x.taskId === hand.id)).toBe(false)
    expect(report.placements.some((x) => x.start < 17 * 60 && x.end > 16 * 60)).toBe(false)
  })

  it('respects a habit anchor as busy time', () => {
    const report = planRange(
      input([task({ durationMin: 120 })], [], [habit(9 * 60, 60)]),
      DAY,
      1,
      { float: false },
    )
    for (const p of report.placements) {
      expect(p.start < 10 * 60 && p.end > 9 * 60).toBe(false)
    }
  })

  it('splits a block longer than the maximum it is allowed', () => {
    const report = planRange(input([task({ durationMin: 180 })]), DAY, 1, { float: false })
    for (const p of report.placements) expect(p.end - p.start).toBeLessThanOrEqual(settings.maxBlockMin)
  })

  it('does not pull work forward past its own due date', () => {
    const later = task({ due: '2026-10-03', durationMin: 60 })
    const report = planRange(input([later]), DAY, 1, { float: false })
    expect(report.placements.every((p) => p.day === '2026-10-03')).toBe(true)
  })

  it('will not schedule a task that is waiting on something else', () => {
    const blocker = task({ title: 'blocker' })
    const waiter = task({ title: 'waiter', waitFor: blocker.id })
    const report = planRange(input([blocker, waiter]), DAY, 1, { float: false })
    expect(report.placements.some((p) => p.taskId === waiter.id)).toBe(false)
  })

  it('reports work that could not be placed, with a reason', () => {
    // Far more than a day can hold, so something has to be left out.
    const hungry = Array.from({ length: 12 }, () => task({ durationMin: 300 }))
    const report = planRange(input(hungry), DAY, 1, { float: false })
    const placedIds = new Set(report.placements.map((p) => p.taskId))
    expect(report.unplaced.length).toBeGreaterThan(0)
    expect(report.unplaced.every((u) => !placedIds.has(u.taskId))).toBe(true)
    expect(report.unplaced[0].reason).toBeTruthy()
  })

  it('skips a weekend unless asked to plan into it', () => {
    const saturday = '2026-10-03'
    const report = planRange(input([task()]), saturday, 1, { float: false })
    expect(report.placements).toHaveLength(0)
  })

  it('ignores completed work', () => {
    const done = task({ completed: true, durationMin: 60 })
    expect(planRange(input([done]), DAY, 1, { float: false }).placements).toHaveLength(0)
  })
})

describe('what counts as immovable', () => {
  it('treats meetings, habit anchors and hand-placed blocks as fixed', () => {
    const busy = fixedBusy(
      input(
        [task({ scheduled: { start: at(16), end: at(17) }, planLocked: true })],
        [event({ start: at(10), end: at(11) })],
        [habit(9 * 60, 60)],
      ),
      new Date(`${DAY}T00:00:00`),
    )
    // The habit anchor and the meeting touch, so they arrive as one span.
    expect(busy).toEqual([
      { start: 9 * 60, end: 11 * 60 },
      { start: 16 * 60, end: 17 * 60 },
    ])
  })

  it('leaves the planner its own blocks out of that set', () => {
    const own = task({ scheduled: { start: at(14), end: at(15) }, planLocked: false })
    const busy = fixedBusy(input([own]), new Date(`${DAY}T00:00:00`))
    expect(busy).toEqual([])
  })
})

describe('a refit', () => {
  it('re-fits the planner own blocks and leaves hand-placed ones', () => {
    const hand = task({ scheduled: { start: at(15), end: at(16) }, planLocked: true })
    const own = task({ scheduled: { start: at(11), end: at(12) }, planLocked: false })
    const report = planRange(input([hand, own]), DAY, 1, { refit: true })
    expect(report.placements.map((p) => p.taskId)).toEqual([own.id])
    expect(report.placements.some((p) => p.start < 16 * 60 && p.end > 15 * 60)).toBe(false)
  })

  it('will not schedule anything that is not already on the clock', () => {
    const report = planRange(input([task({ durationMin: 60 })]), DAY, 1, { refit: true })
    expect(report.placements).toHaveLength(0)
  })
})

describe('a day is never double-booked', () => {
  it('across every block it places', () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      task({ durationMin: 45 + i * 15, energy: 'shallow' as const }),
    )
    const report = planRange(input(tasks), DAY, 1, { float: false })
    const spans: Interval[] = report.placements
      .filter((p) => p.day === DAY)
      .map((p) => ({ start: p.start, end: p.end }))
      .sort((a, b) => a.start - b.start)
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end)
    }
  })

  it('when a day is already fully booked', () => {
    const busy: CalEvent[] = []
    for (let h = 8; h < 18; h++) busy.push(event({ start: at(h), end: at(h, 59) }))
    const report = planRange(input([task({ durationMin: 30 })], busy), DAY, 1, { float: false })
    expect(report.placements).toHaveLength(0)
  })
})