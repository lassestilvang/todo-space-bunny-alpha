import { describe, expect, it } from 'vitest'
import type { Settings, Task } from '@/types'
import { adviseNow } from './advise'

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
  dueHasTime: false,
  scheduled: null,
  durationMin: 45,
  priority: 3,
  energy: 'deep',
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

const NOW = at(10)
const names = (advice: ReturnType<typeof adviseNow>) => advice.map((a) => a.task.title)

describe('what it will advise about', () => {
  it('work that is on the clock now or shortly', () => {
    const advice = adviseNow(
      [
        task({ title: 'Now', scheduled: { start: at(10), end: at(11) } }),
        task({ title: 'Soon', scheduled: { start: at(11), end: at(12) } }),
        task({ title: 'Tonight', scheduled: { start: at(17), end: at(18) } }),
      ],
      settings,
      NOW,
    )
    expect(names(advice)).toEqual(['Now', 'Soon'])
  })

  it('nothing at all when the plan is empty', () => {
    expect(adviseNow([task()], settings, NOW)).toHaveLength(0)
  })

  it('finished work, or work already over, is a fact rather than a choice', () => {
    expect(
      adviseNow([task({ completed: true, scheduled: { start: at(9), end: at(10) } })], settings, NOW),
    ).toHaveLength(0)
    expect(
      adviseNow([task({ scheduled: { start: at(8), end: at(9) } })], settings, NOW),
    ).toHaveLength(0)
  })

  it('says no more than it was asked for', () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      task({ title: `t${i}`, scheduled: { start: at(9 + i * 0.5), end: at(9.5 + i * 0.5) } }),
    )
    expect(adviseNow(tasks, settings, NOW, 3)).toHaveLength(3)
  })
})

describe('the judgement', () => {
  const pair = (overA: Partial<Task>, overB: Partial<Task>) => [
    task({ title: 'A', scheduled: { start: at(10), end: at(11) }, ...overA }),
    task({ title: 'B', scheduled: { start: at(10), end: at(11) }, ...overB }),
  ]

  it('puts the more urgent deadline first', () => {
    const advice = adviseNow(
      pair({ due: '2026-10-08' }, { due: DAY }),
      settings,
      NOW,
    )
    expect(names(advice)[0]).toBe('B')
  })

  it('respects priority', () => {
    const advice = adviseNow(pair({ priority: 1 }, { priority: 4 }), settings, NOW)
    expect(names(advice)[0]).toBe('A')
  })

  it('prefers work that has no date set less than work that is late', () => {
    const advice = adviseNow(
      pair({ due: '2026-09-28', priority: 1 }, { due: undefined, priority: 4 }),
      settings,
      NOW,
    )
    expect(names(advice)[0]).toBe('A')
  })

  it('favours a block the user placed themselves', () => {
    const advice = adviseNow(pair({ planLocked: false }, { planLocked: true }), settings, NOW)
    expect(names(advice)[0]).toBe('B')
  })

  it('changes its mind as the day does', () => {
    const morning = [
      task({ title: 'Deep', energy: 'deep', scheduled: { start: at(9), end: at(10) } }),
      task({ title: 'Admin', energy: 'admin', scheduled: { start: at(9), end: at(10) } }),
    ]
    const afternoon = [
      task({ title: 'Deep', energy: 'deep', scheduled: { start: at(16), end: at(17) } }),
      task({ title: 'Admin', energy: 'admin', scheduled: { start: at(16), end: at(17) } }),
    ]
    expect(names(adviseNow(morning, settings, at(9, 10)))[0]).toBe('Deep')
    expect(names(adviseNow(afternoon, settings, at(16, 10)))[0]).toBe('Admin')
  })

  it('works outside your hours, just less confidently', () => {
    const tasks = [
      task({ title: 'Deep', energy: 'deep', scheduled: { start: at(21), end: at(22) } }),
      task({ title: 'Admin', energy: 'admin', scheduled: { start: at(21), end: at(22) } }),
    ]
    const advice = adviseNow(tasks, settings, at(21))
    expect(advice).toHaveLength(2)
  })
})

describe('what it says', () => {
  it('leads with the reason that mattered most', () => {
    const advice = adviseNow(
      [task({ priority: 1, due: DAY, scheduled: { start: at(10), end: at(11) } })],
      settings,
      NOW,
    )
    expect(advice[0].why.length).toBeGreaterThan(0)
    expect(advice[0].why).toMatch(/due today|overdue|P1|suits this hour|you placed it/)
  })

  it('names when work has no date at all', () => {
    const advice = adviseNow(
      [task({ due: undefined, scheduled: { start: at(10), end: at(11) } })],
      settings,
      NOW,
    )
    expect(advice).toHaveLength(1)
  })
})