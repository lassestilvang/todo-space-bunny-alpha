import { describe, expect, it } from 'vitest'
import type { CalEvent, Settings, Task } from '@/types'
import { listNames, parseRoomRequest, proposeRoom, roomReply } from './room'

const DAY = '2026-10-01'
const at = (h: number, m = 0) => {
  const d = new Date(`${DAY}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

const settings = {
  workStart: 8 * 60 + 30,
  workEnd: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
} as Settings

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
  priority: 3,
  durationMin: 45,
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

const meeting = (over: Partial<CalEvent> = {}): CalEvent => ({
  id: `e${++n}`,
  title: 'meeting',
  start: at(10),
  end: at(11),
  allDay: false,
  locked: false,
  tentative: false,
  ...over,
})

const NOTHING: never[] = []
const noHabits: never[] = []

const NOW = at(13)

describe('reading the request', () => {
  it('defaults to an hour from now', () => {
    const r = parseRoomRequest('free up some time', settings, NOW)
    expect(r.need).toBe(60)
    expect(r.from).toBe(13 * 60)
  })

  it('takes the length that was asked for', () => {
    expect(parseRoomRequest('free up 90 minutes', settings, NOW).need).toBe(90)
    expect(parseRoomRequest('block out an hour', settings, NOW).need).toBe(60)
    expect(parseRoomRequest('make room for 2 hours', settings, NOW).need).toBe(120)
    expect(parseRoomRequest('find me 15m', settings, NOW).need).toBe(15)
  })

  it('takes the window that was asked for', () => {
    expect(parseRoomRequest('free up time at 14:00', settings, NOW).from).toBe(14 * 60)
    expect(parseRoomRequest('clear the afternoon', settings, NOW).from).toBe(13 * 60)
    expect(parseRoomRequest('free up something this morning', settings, NOW).from).toBe(8 * 60 + 30)
  })

  it('does not quietly move a request that lands near the end of the day', () => {
    // Regression: the start was capped at "workEnd minus a step", so asking for
    // 18:00 when the day ends at 18:00 became 17:45 and the answer was about
    // the wrong hour.
    const r = parseRoomRequest('free up 30 minutes at 18:00', settings, at(16, 30))
    expect(r.from).toBe(18 * 60)
    expect(r.rolledForward).toBe(false)
  })

  it('says so when the day runs out before the requested length', () => {
    const r = proposeRoom(
      [task({ scheduled: { start: at(17), end: at(17, 45) } })],
      [],
      [],
      settings,
      at(16, 30),
      'free up 90 minutes at 17:00',
    )
    expect(r.window.end - r.window.start).toBeLessThan(90)
    expect(r.notes.join(' ')).toMatch(/working day ends/)
    // And it has to reach the reply, not just the report.
    expect(roomReply(r)).toMatch(/working day ends/)
  })

  it('never asks for more time than the day has', () => {
    expect(parseRoomRequest('free up 5 hours', settings, NOW).need).toBe(240)
  })

  it('does not read a clock as a length', () => {
    expect(parseRoomRequest('free up an hour at 3:00pm', settings, NOW)).toMatchObject({
      need: 60,
      from: 15 * 60,
    })
  })

  it('will not ask for a window that has already passed', () => {
    // It is 13:00, so a bare "3:00" cannot mean three in the morning.
    const r = parseRoomRequest('free up an hour at 3:00', settings, NOW)
    expect(r.from).toBe(13 * 60)
    expect(r.rolledForward).toBe(true)
  })
})

describe('when nothing is in the way', () => {
  it('says so and names the biggest opening instead of inventing work', () => {
    const report = proposeRoom([task({ scheduled: { start: at(8), end: at(9) } })], [], [], settings, NOW, 'free up 30 minutes at 15:00')
    expect(report.proposals).toHaveLength(0)
    expect(report.notes.join(' ')).toMatch(/Nothing is in the way/)
    expect(report.biggestGap).not.toBeNull()
  })
})

describe('when something is in the way', () => {
  const tasks = [
    task({ title: 'Important', priority: 1, durationMin: 30, scheduled: { start: at(14), end: at(14, 30) } }),
    task({ title: 'Chores', priority: 4, durationMin: 45, scheduled: { start: at(13, 45), end: at(14, 30) } }),
  ]
  const report = proposeRoom(tasks, [], [], settings, NOW, 'free up 30 minutes at 14:00')

  it('spends the least important block in the way first', () => {
    expect(report.proposals[0].label).toContain('Chores')
  })

  it('offers somewhere to move it to, after the window it is protecting', () => {
    const move = report.proposals.find((p) => p.id === 'move')
    expect(move).toBeDefined()
    const action = move!.action as { start: number; end: number }
    const start = new Date(action.start).toTimeString().slice(0, 5)
    // After the window it is protecting, not before it.
    expect(start >= '14:30').toBe(true)
    expect(action.end - action.start).toBe(45 * 60_000)
  })

  it('offers to take it off the clock entirely', () => {
    const drop = report.proposals.find((p) => p.id === 'drop')
    expect(drop?.action).toEqual({ type: 'unschedule', match: 'Chores' })
  })

  it('offers to shorten it when only part of it has to go', () => {
    // A window that eats into the block without covering it.
    const r = proposeRoom(
      [task({ title: 'Long', durationMin: 120, scheduled: { start: at(13, 30), end: at(15, 30) } })],
      [],
      [],
      settings,
      NOW,
      'free up 30 minutes at 15:00',
    )
    const shrink = r.proposals.find((p) => p.id === 'shrink')
    expect(shrink).toBeDefined()
    expect(shrink!.label).toContain('30 minutes')
  })

  it('mentions anything else standing in the way', () => {
    const r = proposeRoom(
      [
        // Both overlap the 14:00-14:45 window, so both are in the way.
        task({ title: 'One', durationMin: 45, scheduled: { start: at(13, 45), end: at(14, 30) } }),
        task({ title: 'Two', durationMin: 45, scheduled: { start: at(14), end: at(14, 45) } }),
      ],
      [],
      [],
      settings,
      NOW,
      'free up 45 minutes at 14:00',
    )
    expect(r.notes.join(' ')).toMatch(/Also in the way/)
  })

  it('says which window it was talking about', () => {
    expect(roomReply(report)).toMatch(/14:00–14:30/)
  })
})

describe('what it will not touch', () => {
  it('names what it cannot move instead of claiming the window is free', () => {
    // A meeting in the requested hour: the assistant cannot shift a meeting, and
    // saying "nothing is in the way" would be a lie.
    const r = proposeRoom(
      [task({ scheduled: { start: at(10), end: at(11) } })],
      [meeting({ title: 'Design review', start: at(14), end: at(15) })],
      [],
      settings,
      NOW,
      'free up 30 minutes at 14:00',
    )
    expect(r.proposals).toHaveLength(0)
    expect(r.notes.join(' ')).toMatch(/Design review/)
    expect(r.notes.join(' ')).toMatch(/cannot move/)
    // And it still offers the nearest alternative.
    expect(r.notes.join(' ')).toMatch(/nearest opening is/)
  })

  it('says so when the requested hour has already gone', () => {
    // Asked for a window that is behind us, the reply must not quietly pretend
    // it was answered at the time that was asked for.
    const r = proposeRoom([], [], [], settings, at(15, 54), 'free up an hour at 13:30')
    const reply = roomReply(r)
    expect(reply).toMatch(/passed/)
    expect(reply).toMatch(/looked from now/)
  })

  it('lists immovable things readably', () => {
    expect(listNames(['a'])).toBe('a')
    expect(listNames(['a', 'b'])).toBe('a and b')
    expect(listNames(['a', 'b', 'c'])).toBe('a, b and c')
  })

  it('offers to move a hand-placed block, because the user is the one asking', () => {
    // A block the user placed is off limits to the *planner*. Here the user is
    // asking for room, so shifting it is exactly what they want.
    const hand = task({ title: 'Mine', planLocked: true, scheduled: { start: at(14), end: at(15) } })
    const report = proposeRoom([hand], [], [], settings, NOW, 'free up 30 minutes at 14:00')
    expect(report.proposals.length).toBeGreaterThan(0)
    expect(report.proposals[0].label).toContain('Mine')
  })

  it('never offers to move a meeting', () => {
    const busy = [meeting({ title: 'Design review', start: at(14), end: at(15) })]
    const report = proposeRoom(
      [task({ scheduled: { start: at(10), end: at(11) } })],
      busy,
      [],
      settings,
      NOW,
      'free up 30 minutes at 14:00',
    )
    expect(report.proposals).toHaveLength(0)
    expect(report.notes.join(' ')).toMatch(/Design review/)
  })

  it('leaves meetings alone', () => {
    const busy: CalEvent[] = [meeting({ start: at(14), end: at(15) })]
    const report = proposeRoom([task({ scheduled: { start: at(10), end: at(11) } })], busy, [], settings, NOW, 'free up 30 minutes at 14:00')
    expect(report.proposals).toHaveLength(0)
  })
})

void NOTHING
void noHabits