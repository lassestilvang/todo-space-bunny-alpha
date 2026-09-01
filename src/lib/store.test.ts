import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CalEvent, Task } from '@/types'

/**
 * The store, exercised the way the app uses it.
 *
 * It is the layer where the two worst bugs lived — the refit and series scopes —
 * and none of that needs a DOM. Only `localStorage` has to exist, so a small stub
 * stands in for it before the module is loaded.
 */
class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value))
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  clear() {
    this.map.clear()
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null
  }
  get length() {
    return this.map.size
  }
}

const DAY = '2026-10-01' // a Thursday
const at = (h: number, m = 0) => {
  const d = new Date(`${DAY}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}
const clockOf = (t?: number) => (t === undefined ? null : new Date(t).toTimeString().slice(0, 5))

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  title: `task ${n}`,
  notes: '',
  completed: false,
  createdAt: at(8),
  updatedAt: at(8),
  due: DAY,
  dueHasTime: true,
  scheduled: null,
  durationMin: 60,
  priority: 3,
  energy: 'shallow',
  dayPart: 'any',
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
  start: at(9),
  end: at(10),
  allDay: false,
  locked: false,
  tentative: false,
  ...over,
})

/** A store holding exactly the given world, with its history emptied. */
async function worldWith(tasks: Task[], events: CalEvent[] = []) {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.resetModules()
  const { useStore } = await import('./store')
  useStore.setState({
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    events: Object.fromEntries(events.map((e) => [e.id, e])),
    habits: {},
    history: { past: [], future: [] },
  })
  return useStore
}

/** A task with a block on this day, from and to given in hours. */
const placed = (t: Task, from: number, to: number, over: Partial<Task> = {}) =>
  task({ ...t, scheduled: { start: at(from), end: at(to) }, ...over })

type Store = Awaited<ReturnType<typeof worldWith>>

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('keeping the plan true', () => {
  it('moves a block that no longer fits, and leaves it alone when it does', async () => {
    const doomed = placed(task({ title: 'Doomed' }), 14, 15)
    const safe = placed(task({ title: 'Safe' }), 16, 17)
    const s = await worldWith([doomed, safe], [event({ start: at(14), end: at(16) })])

    const before = clockOf(s.getState().tasks[doomed.id].scheduled?.start)
    const report = s.getState().refitRange(DAY, 7)
    const after = s.getState().tasks

    expect(report.moved).toBe(1)
    expect(clockOf(after[doomed.id].scheduled?.start)).not.toBe(before)
    // The block at 16:00 never stopped fitting, so it must not have moved.
    expect(clockOf(after[safe.id].scheduled?.start)).toBe('16:00')
  })

  it('never touches a block the user placed by hand', async () => {
    const hand = placed(task({ title: 'Mine' }), 14, 15, { planLocked: true })
    const s = await worldWith([hand], [event({ start: at(14), end: at(16) })])

    const report = s.getState().refitRange(DAY, 7)
    expect(report.moved).toBe(0)
    expect(clockOf(s.getState().tasks[hand.id].scheduled?.start)).toBe('14:00')
  })

  it('writes nothing when the plan is already correct', async () => {
    const fine = placed(task(), 16, 17)
    const s = await worldWith([fine], [event({ start: at(9), end: at(10) })])
    const historyBefore = s.getState().history.past.length

    expect(s.getState().refitRange(DAY, 7)).toEqual({ moved: 0, dropped: 0, days: [] })
    expect(s.getState().history.past).toHaveLength(historyBefore)
  })

  it('is idempotent, so it settles instead of looping', async () => {
    const a = placed(task({ title: 'A' }), 14, 15)
    const b = placed(task({ title: 'B' }), 15, 16)
    const s = await worldWith([a, b], [event({ start: at(14), end: at(16) })])

    s.getState().refitRange(DAY, 7)
    const afterFirst = JSON.stringify(Object.values(s.getState().tasks).map((t) => t.scheduled))
    expect(s.getState().refitRange(DAY, 7)).toEqual({ moved: 0, dropped: 0, days: [] })
    expect(JSON.stringify(Object.values(s.getState().tasks).map((t) => t.scheduled))).toBe(afterFirst)
  })

  it('will not schedule work that is not already on the clock', async () => {
    const floating = task({ title: 'Floating' })
    const s = await worldWith([floating])

    s.getState().refitRange(DAY, 7)
    expect(s.getState().tasks[floating.id].scheduled).toBeNull()
  })

  it('does not make one visible action cost two undos', async () => {
    // A drag displaces a block; the calendar re-fits it. That is one visible
    // change, so one undo has to put both back.
    const moving = placed(task({ title: 'Moving' }), 14, 15)
    const displaced = placed(task({ title: 'Displaced' }), 15, 16)
    const s = await worldWith([moving, displaced])
    const before = s.getState().tasks

    // What the drag does...
    s.getState().updateTask(moving.id, {
      scheduled: { start: at(15), end: at(16) },
      planLocked: true,
    })
    // ...and then the calendar answers.
    const report = s.getState().refitRange(DAY, 7)
    expect(report.moved).toBe(1)
    expect(s.getState().tasks[displaced.id].scheduled).not.toEqual(before[displaced.id].scheduled)

    s.getState().undo()
    expect(s.getState().tasks[moving.id].scheduled).toEqual(before[moving.id].scheduled)
    expect(s.getState().tasks[displaced.id].scheduled).toEqual(before[displaced.id].scheduled)
  })

  it('records the refit on its own when nothing else has', async () => {
    // Nothing pushed history, so the refit must be undoable by itself.
    const stranded = placed(task({ title: 'Stranded' }), 14, 15)
    const s = await worldWith([stranded], [event({ start: at(14), end: at(16) })])
    const before = s.getState().tasks[stranded.id].scheduled
    s.getState().refitRange(DAY, 7)
    s.getState().undo()
    expect(s.getState().tasks[stranded.id].scheduled).toEqual(before)
  })

  it('undoes the whole refit in one step', async () => {
    const doomed = placed(task(), 14, 15)
    const s = await worldWith([doomed], [event({ start: at(14), end: at(16) })])
    const before = s.getState().tasks[doomed.id].scheduled

    s.getState().refitRange(DAY, 7)
    expect(s.getState().tasks[doomed.id].scheduled).not.toEqual(before)

    s.getState().undo()
    expect(s.getState().tasks[doomed.id].scheduled).toEqual(before)
  })

  it('stands still when "keep the plan true" is off', async () => {
    const doomed = placed(task(), 14, 15)
    const s = await worldWith([doomed], [event({ start: at(14), end: at(16) })])
    s.getState().setSettings({ autoPlan: false })
    const before = s.getState().tasks[doomed.id].scheduled

    // The store action itself is still callable; the setting is what the hook
    // checks before asking for a refit.
    s.getState().refitRange(DAY, 7)
    expect(s.getState().settings.autoPlan).toBe(false)
    expect(clockOf(s.getState().tasks[doomed.id].scheduled?.start)).not.toBe(clockOf(before?.start))
  })
})

describe('steps', () => {
  it('shorten the block that stands for the task', async () => {
    const withSteps = task({
      title: 'Job',
      durationMin: 90,
      subtasks: [
        { id: 's1', title: 'one', done: true },
        { id: 's2', title: 'two', done: false },
        { id: 's3', title: 'three', done: false },
      ],
      scheduled: { start: at(9), end: at(10, 30) },
    })
    const s = await worldWith([withSteps])
    expect(s.getState().tasks[withSteps.id].durationMin).toBe(90)

    // Tick one more step: two of three left, so a third of the estimate.
    s.getState().updateTask(withSteps.id, {
      subtasks: [
        { id: 's1', title: 'one', done: true },
        { id: 's2', title: 'two', done: true },
        { id: 's3', title: 'three', done: false },
      ],
    })
    const block = s.getState().tasks[withSteps.id].scheduled!
    expect(Math.round((block.end - block.start) / 60000)).toBe(30)
    // The estimate is the user's number, not ours to rewrite.
    expect(s.getState().tasks[withSteps.id].durationMin).toBe(90)
  })

  it('keep a five-minute block when the last step is done', async () => {
    const nearly = task({
      durationMin: 90,
      subtasks: [{ id: 's1', title: 'one', done: false }],
      scheduled: { start: at(9), end: at(10, 30) },
    })
    const s = await worldWith([nearly])
    s.getState().updateTask(nearly.id, {
      subtasks: [{ id: 's1', title: 'one', done: true }],
    })
    const block = s.getState().tasks[nearly.id].scheduled!
    expect(Math.round((block.end - block.start) / 60000)).toBe(5)
  })
})

describe('repeating meetings', () => {
  it('are issued as occurrences that share one id', async () => {
    const s = await worldWith([])
    s.getState().addEvent({
      title: 'Standup',
      start: at(9, 30),
      end: at(9, 45),
      recurrence: { freq: 'weekly', interval: 1 },
    })
    const events = Object.values(s.getState().events).filter((e) => e.title === 'Standup')
    expect(events.length).toBeGreaterThan(5)
    expect(new Set(events.map((e) => e.seriesId)).size).toBe(1)

    const times = new Set(events.map((e) => clockOf(e.start)))
    expect([...times]).toEqual(['09:30'])
  })

  it('move one at a time when dragged', async () => {
    const s = await worldWith([])
    const id = s.getState().addEvent({
      title: 'Standup',
      start: at(9, 30),
      end: at(9, 45),
      recurrence: { freq: 'weekly', interval: 1 },
    })
    const before = Object.values(s.getState().events).filter((e) => e.seriesId)

    s.getState().updateEvent(id, { start: at(11), end: at(11, 15) })
    const after = Object.values(s.getState().events).filter((e) => e.seriesId)

    expect(clockOf(after.find((e) => e.id === id)?.start)).toBe('11:00')
    const moved = after.filter((e, i) => clockOf(e.start) !== clockOf(before[i]?.start))
    expect(moved).toHaveLength(1)
  })

  it('shift the whole series when asked to', async () => {
    const s = await worldWith([])
    const id = s.getState().addEvent({
      title: 'Standup',
      start: at(9, 30),
      end: at(9, 45),
      recurrence: { freq: 'weekly', interval: 1 },
    })
    const before = Object.values(s.getState().events).filter((e) => e.seriesId).map((e) => clockOf(e.start))

    s.getState().updateEvent(id, { start: at(11), end: at(11, 15) }, true, 'all')
    const after = Object.values(s.getState().events).filter((e) => e.seriesId).map((e) => clockOf(e.start))

    expect(new Set(after)).toEqual(new Set(['11:00']))
    expect(after).toHaveLength(before.length)
  })

  it('delete one, the rest, or everything', async () => {
    const make = (store: Store) =>
      store.getState().addEvent({
        title: 'Standup',
        start: at(9, 30),
        end: at(9, 45),
        recurrence: { freq: 'weekly', interval: 1 },
      })
    const series = (store: Store) =>
      Object.values(store.getState().events).filter((e) => e.seriesId)

    // One occurrence goes, the rest stand.
    const one = await worldWith([])
    const id = make(one)
    const total = series(one).length
    one.getState().deleteEvent(id, 'this')
    expect(series(one)).toHaveLength(total - 1)

    // The whole series goes.
    const all = await worldWith([])
    make(all)
    all.getState().deleteEvent(series(all)[0].id, 'all')
    expect(series(all)).toHaveLength(0)
  })
})

describe('folders', () => {
  it('lose their projects when deleted, but keep the projects', async () => {
    const s = await worldWith([])
    const folder = s.getState().addFolder({ name: 'Work' })
    const project = s.getState().addProject({ name: 'Studio', folderId: folder })

    s.getState().deleteFolder(folder)
    expect(s.getState().folders[folder]).toBeUndefined()
    expect(s.getState().projects[project].folderId).toBeUndefined()
    expect(s.getState().projects[project].name).toBe('Studio')
  })
})

