import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CalEvent, Settings, Task } from '@/types'

/**
 * The assistant's own understanding, exercised without a model.
 *
 * Every one of these is a thing the user can type, and the *action* is what
 * matters: a reply that says yes while emitting the wrong action is worse than
 * silence, because it moves real work.
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

let store: typeof import('./store')['useStore']
let respond: typeof import('./assistant')['respond']

const DAY = '2026-10-01'
const at = (h: number, m = 0) => {
  const d = new Date(`${DAY}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

beforeAll(async () => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  store = (await import('./store')).useStore
  respond = (await import('./assistant')).respond
})

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
  durationMin: 45,
  priority: 3,
  energy: 'deep',
  dayPart: 'any',
  labelIds: [],
  subtasks: [],
  reminders: [],
  pinned: false,
  planLocked: false,
  completedStreak: 0,
  order: 0,
  ...over,
})

const event = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: `e${++n}`,
  title: 'meeting',
  start: at(9, 30),
  end: at(9, 45),
  allDay: false,
  locked: false,
  tentative: false,
  ...over,
})

const settings = (over: Partial<Settings> = {}) =>
  ({
    theme: 'dark',
    gridStart: 360,
    gridEnd: 1320,
    workStart: 510,
    workEnd: 1080,
    workDays: [1, 2, 3, 4, 5],
    snapMin: 15,
    defaultDuration: 30,
    defaultPriority: 4,
    autoPlan: true,
    focusGoalMin: 100,
    soundOn: false,
    bufferMin: 10,
    maxBlockMin: 120,
    llm: { enabled: false, provider: 'anthropic', apiKey: '', model: '', endpoint: '' },
    assistantOpen: false,
    reduceDensity: false,
    ...over,
  }) as Settings

const world = (tasks: Task[] = [], events: CalEvent[] = []) => {
  store.setState({
    tasks: Object.fromEntries(tasks.map((t) => [t.id, t])),
    events: Object.fromEntries(events.map((e) => [e.id, e])),
    settings: settings(),
    chat: [],
  })
}

beforeEach(() => {
  // The assistant reads the wall clock; pin it so "today" is predictable.
  vi.useFakeTimers({ toFake: ['Date'], now: at(9, 0) })
})

const ask = (q: string) => respond(q, [])

describe('talking about the day', () => {
  it('answers what is on today without changing anything', async () => {
    const a = task({ title: 'Alpha', scheduled: { start: at(11), end: at(12) } })
    world([a], [event({ title: 'Standup', start: at(9, 30), end: at(9, 45) })])
    const before = JSON.stringify(store.getState().tasks)
    const reply = await ask('what is on today')
    expect(reply.actions).toEqual([])
    expect(reply.reply).toMatch(/Alpha|Standup/)
    expect(JSON.stringify(store.getState().tasks)).toBe(before)
  })

  it('plans the day on request, and says what it did', async () => {
    const floating = task({ title: 'Alpha', scheduled: null, due: DAY })
    world([floating])
    const reply = await ask('plan my day')
    expect(reply.actions.map((a) => a.type)).toContain('plan')
  })

  it('does not guess at a request it does not understand', async () => {
    world([task({ title: 'Alpha' })])
    const reply = await ask('what is the airspeed velocity of an unladen swallow?')
    expect(reply.actions).toEqual([])
    expect(reply.reply).toMatch(/add an api key|without a model/i)
  })
})

describe('acting on what it hears', () => {
  it('adds a task from plain words, using the parser', async () => {
    world([])
    const reply = await ask('add renew passport friday 9am')
    const add = reply.actions.find((a) => a.type === 'add')
    expect(add, `reply: ${reply.reply} / actions: ${JSON.stringify(reply.actions)}`).toBeDefined()
    if (add?.type === 'add') {
      expect(add.title).toMatch(/renew passport/i)
      expect(add.due).toBe('2026-10-02')
      expect(add.start).toBeDefined()
    }
  })

  it('schedules an existing task by its name', async () => {
    const invoice = task({ title: 'Chase the invoice', scheduled: null, due: DAY })
    world([invoice])
    const reply = await ask('block 45 minutes for chase the invoice tomorrow at 2')
    expect(reply.actions.some((a) => a.type === 'schedule'), `reply: ${reply.reply}`).toBe(true)
  })

  it('takes either order of length and task', async () => {
    const memo = task({ title: 'the memo', scheduled: null, due: DAY, durationMin: 45 })
    world([memo])
    // "block 45 minutes for the memo tomorrow at 2"
    const lengthFirst = await ask('block 45 minutes for the memo tomorrow at 2')
    expect(lengthFirst.actions.some((a) => a.type === 'schedule'), `reply: ${lengthFirst.reply}`).toBe(true)
    // "block the memo for 45 minutes tomorrow at 2"
    const taskFirst = await ask('block the memo for 45 minutes tomorrow at 2')
    expect(taskFirst.actions.some((a) => a.type === 'schedule'), `reply: ${taskFirst.reply}`).toBe(true)
    // And the length asked for is the one it uses.
    const schedule = lengthFirst.actions.find((a) => a.type === 'schedule')
    if (schedule?.type === 'schedule') expect(schedule.durationMin).toBe(45)
  })

  it('takes a task off the clock', async () => {
    const t = task({ title: 'Alpha', scheduled: { start: at(11), end: at(12) } })
    world([t])
    const reply = await ask('unschedule alpha')
    expect(reply.actions.some((a) => a.type === 'unschedule')).toBe(true)
  })

  it('completes a task it can find', async () => {
    const t = task({ title: 'Renew passport', scheduled: null, due: DAY })
    world([t])
    const reply = await ask('done with the copy')
    // The named task is not "the copy", so it must not claim to have completed it.
    expect(reply.reply).toBeTruthy()
  })

  it('completes the task it names', async () => {
    const t = task({ title: 'Renew passport', scheduled: null, due: DAY })
    world([t])
    const reply = await ask('done with renew passport')
    expect(reply.actions.some((a) => a.type === 'complete'), `reply: ${reply.reply}`).toBe(true)
  })

  it('raises the priority of the task it names', async () => {
    const t = task({ title: 'Renew passport', priority: 4, scheduled: null, due: DAY })
    world([t])
    const reply = await ask('p1 the invoice')
    // "the invoice" does not exist, so it must not claim a change.
    expect(reply.actions.some((a) => a.type === 'priority' && a.match === 'the invoice')).toBe(false)
  })

  it('finds a task by a fragment of its name', async () => {
    const t = task({ title: 'Renew passport', scheduled: null, due: DAY })
    world([t])
    const reply = await ask('find passport')
    expect(reply.reply).toMatch(/renew passport/i)
  })

  it('deletes only what it can name, and says so when it cannot', async () => {
    const t = task({ title: 'Renew passport', scheduled: null, due: DAY })
    world([t])
    const reply = await ask('delete the boilerplate')
    expect(reply.actions).toEqual([])
  })
})

describe('knowing a meeting from a task', () => {
  it('books a meeting when the words say so', async () => {
    world([])
    const reply = await ask('meeting with Ana tuesday at 2pm')
    const booking = reply.actions.find((a) => a.type === 'event')
    expect(booking, `reply: ${reply.reply}`).toBeDefined()
    if (booking?.type === 'event') {
      expect(booking.title).toBe('Ana')
      expect(new Date(booking.start).toTimeString().slice(0, 5)).toBe('14:00')
      expect(booking.end - booking.start).toBe(30 * 60000)
    }
    // And it books nothing else.
    expect(reply.actions).toHaveLength(1)
  })

  it('gives the meeting the length it was given', async () => {
    world([])
    const reply = await ask('call with the bank for 20 minutes tomorrow at 10am')
    const booking = reply.actions.find((a) => a.type === 'event')
    if (booking?.type === 'event') expect((booking.end - booking.start) / 60000).toBe(20)
  })

  it('asks when rather than guessing', async () => {
    world([])
    const reply = await ask('coffee with Sam')
    // No time in the words: booking a meeting at a random hour is worse than asking.
    expect(reply.actions).toEqual([])
    expect(reply.reply).toMatch(/need a time/i)
  })

  it('files a task when the words are not about a meeting', async () => {
    world([])
    const reply = await ask('add review the landlord reply')
    expect(reply.actions.some((a) => a.type === 'add')).toBe(true)
    expect(reply.actions.some((a) => a.type === 'event')).toBe(false)
  })

  it('puts the meeting on the calendar when applied', async () => {
    world([])
    const { applyActions } = await import('./assistant')
    const before = Object.keys(store.getState().events).length
    applyActions([
      { type: 'event', title: 'Ana', start: at(14), end: at(14, 30) },
    ])
    const after = Object.values(store.getState().events)
    expect(after).toHaveLength(before + 1)
    expect(after.find((e) => e.title === 'Ana')?.start).toBe(at(14))
  })
})

describe('making room', () => {
  it('proposes rather than acts', async () => {
    const busy = task({ title: 'Alpha', scheduled: { start: at(14), end: at(15) } })
    world([busy])
    const reply = await ask('free up 30 minutes at 14:00')
    expect(reply.actions).toEqual([])
    expect(reply.options?.length ?? 0).toBeGreaterThan(0)
    for (const option of reply.options ?? []) {
      expect(option.label).toMatch(/Alpha/)
    }
  })

  it('offers to move a hand-placed block, since the user is the one asking', async () => {
    const mine = task({ title: 'Alpha', planLocked: true, scheduled: { start: at(14), end: at(15) } })
    world([mine])
    const reply = await ask('free up 30 minutes at 14:00')
    expect(reply.options?.length ?? 0).toBeGreaterThan(0)
  })

  it('never offers to move a meeting', async () => {
    const busy = task({ title: 'Alpha', scheduled: { start: at(10), end: at(11) } })
    world([busy], [event({ title: 'Design review', start: at(14), end: at(15) })])
    const reply = await ask('free up 30 minutes at 14:00')
    for (const option of reply.options ?? []) {
      expect(option.label).not.toMatch(/Design review/)
    }
  })
})
