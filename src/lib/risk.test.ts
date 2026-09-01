import { describe, expect, it } from 'vitest'
import type { Task } from '@/types'
import { dueBy, riskFor, riskReport, riskSentence, riskTitle } from './risk'

const DAY = '2026-10-01'
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
  createdAt: at(8),
  updatedAt: at(8),
  due: DAY,
  dueHasTime: false,
  scheduled: null,
  priority: 3,
  durationMin: 30,
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

const NOW = at(18)

describe('the deadline itself', () => {
  it('runs to the end of the local day', () => {
    expect(dueBy(DAY)).toBe(at(24))
  })
})

describe('what counts as at risk', () => {
  it('a block sitting on a day after the one it was due', () => {
    // Due yesterday, scheduled today: it can only finish late.
    const late = task({ due: '2026-09-30', scheduled: { start: at(9), end: at(11) } })
    expect(riskFor(late, NOW)).toBe('late')
  })

  it('a block that fits inside its deadline is fine', () => {
    const fine = task({ due: DAY, scheduled: { start: at(9), end: at(17) } })
    expect(riskFor(fine, NOW)).toBe(null)
  })

  it('work due now with no time on the clock', () => {
    expect(riskFor(task({ scheduled: null }), NOW)).toBe('unplaced')
    expect(riskFor(task({ scheduled: null, due: '2026-09-30' }), NOW)).toBe('unplaced')
  })

  it('work due later is not today\'s problem', () => {
    expect(riskFor(task({ scheduled: null, due: '2026-10-08' }), NOW)).toBe(null)
  })

  it('ignores finished work and work with no due date', () => {
    expect(riskFor(task({ completed: true, scheduled: null }), NOW)).toBe(null)
    expect(riskFor(task({ due: undefined, scheduled: null }), NOW)).toBe(null)
  })

  it('ignores work with no length to place', () => {
    expect(riskFor(task({ durationMin: 0, scheduled: null }), NOW)).toBe(null)
  })
})

describe('the report', () => {
  it('counts only the tasks due inside the window', () => {
    const nextDay = new Date(`${DAY}T00:00:00`)
    nextDay.setDate(nextDay.getDate() + 1)
    const tasks = [
      // Due inside the window, but sitting on the day after it.
      task({ due: DAY, scheduled: { start: nextDay.getTime() + 9 * 3_600_000, end: nextDay.getTime() + 11 * 3_600_000 } }),
      task({ scheduled: null }),
      task({ scheduled: null, due: '2026-11-01' }),
      task({ due: '2026-09-01', scheduled: null }),
      task({ scheduled: null, due: '2026-10-04' }),
    ]
    const report = riskReport(tasks, DAY, '2026-10-08', NOW)
    expect(report.late).toHaveLength(1)
    // Only work due today: the far-future, the out-of-window one, and the one
    // due next week are not this report's business.
    expect(report.unplaced).toHaveLength(1)
    expect(report.total).toBe(2)
  })

  it('reads back in a sentence', () => {
    const report = { late: [task({})], unplaced: [task({}), task({})], total: 3 }
    expect(riskSentence(report)).toBe('1 finishes after the due date · 2 have no time yet')
    expect(riskSentence({ late: [], unplaced: [], total: 0 })).toBe('')
  })

  it('explains itself on a flag', () => {
    expect(riskTitle(DAY)).toMatch(/after it was due/)
    expect(riskTitle(undefined)).toMatch(/after it was due/)
  })
})