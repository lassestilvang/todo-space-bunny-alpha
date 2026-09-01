import { describe, expect, it } from 'vitest'
import type { Habit, Settings, Task } from '@/types'
import { focusMinutesOf, focusMinutesOn, focusPerDay, focusStreak, goalProgress, isOpenSession } from './focus'

const DAY = '2026-10-01'
const at = (d: string, h: number, m = 0) => {
  const x = new Date(`${d}T00:00:00`)
  x.setHours(h, m, 0, 0)
  return x.getTime()
}

let n = 0
const session = (over: Partial<Parameters<typeof Object>[0]> = {}) =>
  ({
    id: `s${++n}`,
    taskId: undefined,
    label: 'Focus',
    minutes: 25,
    start: at(DAY, 9),
    completed: true,
    createdAt: at(DAY, 9),
    ...over,
  }) as never as Parameters<typeof focusMinutesOf>[0]

describe('what a session is worth', () => {
  const now = at(DAY, 12)

  it('counts a finished session at its planned length', () => {
    expect(focusMinutesOf(session({ completed: true, minutes: 45 }), now)).toBe(45)
  })

  it('counts a running one only for the time that has passed', () => {
    // Still inside its plan at noon: 11:15 + 45 minutes elapsed.
    const running = session({ completed: false, minutes: 60, start: at(DAY, 11, 15) })
    expect(focusMinutesOf(running, now)).toBe(45)
  })

  it('counts half of a running session that is still going', () => {
    const running = session({ completed: false, minutes: 60, start: at(DAY, 11, 30) })
    expect(focusMinutesOf(running, now)).toBe(30)
  })

  it('counts an abandoned session as nothing', () => {
    // Started at 08:00, planned until 09:00, and it is now 12:00.
    const abandoned = session({ completed: false, minutes: 60, start: at(DAY, 8) })
    expect(focusMinutesOf(abandoned, now)).toBe(0)
  })

  it('knows a session is still open', () => {
    // Planned past noon, so still running.
    expect(isOpenSession(session({ completed: false, minutes: 60, start: at(DAY, 11, 30) }), now)).toBe(true)
    expect(isOpenSession(session({ completed: true }), now)).toBe(false)
    // Planned to finish at eight this morning and never did: abandoned.
    expect(isOpenSession(session({ completed: false, minutes: 60, start: at(DAY, 8) }), now)).toBe(false)
  })
})

describe('per-day totals', () => {
  const now = at(DAY, 23)
  const sessions = [
    session({ start: at(DAY, 9), minutes: 25 }),
    session({ start: at(DAY, 11), minutes: 50 }),
    session({ start: at('2026-09-30', 9), minutes: 30 }),
  ]

  it('adds up the sessions that started on a day', () => {
    expect(focusMinutesOn(sessions, DAY, now)).toBe(75)
    expect(focusMinutesOn(sessions, '2026-09-30', now)).toBe(30)
    expect(focusMinutesOn(sessions, '2026-09-29', now)).toBe(0)
  })

  it('builds a window in order, oldest first', () => {
    const keys = ['2026-09-30', DAY]
    const perDay = focusPerDay(sessions, keys, now)
    expect(perDay.map((d) => d.key)).toEqual(keys)
    expect(perDay.map((d) => d.minutes)).toEqual([30, 75])
  })
})

describe('streaks', () => {
  // Formatted from local parts on purpose: `toISOString` would report the
  // previous day for a local midnight east of UTC.
  const day = (offset: number) => {
    const d = new Date(`${DAY}T00:00:00`)
    d.setDate(d.getDate() - offset)
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
  }
  const banked = (offset: number, minutes: number) =>
    session({ start: at(day(offset), 9), minutes })

  const now = at(DAY, 23)

  it('counts consecutive days that reached the goal', () => {
    const sessions = [banked(0, 100), banked(1, 120), banked(2, 100)]
    expect(focusStreak(sessions, 100, now)).toBe(3)
  })

  it('stops at the first day that missed', () => {
    const sessions = [banked(0, 100), banked(1, 20), banked(2, 100)]
    expect(focusStreak(sessions, 100, now)).toBe(1)
  })

  it('does not punish an unfinished today', () => {
    // Today is still in progress and has earned nothing yet; yesterday's run
    // should stand rather than resetting every morning.
    const sessions = [banked(0, 0), banked(1, 100), banked(2, 100)]
    expect(focusStreak(sessions, 100, now)).toBe(2)
  })

  it('counts nothing when the goal is switched off', () => {
    expect(focusStreak([banked(0, 100)], 0, now)).toBe(0)
  })
})

describe('progress towards the goal', () => {
  it('is clamped so the ring cannot overflow', () => {
    expect(goalProgress(50, 100)).toBe(0.5)
    expect(goalProgress(250, 100)).toBe(1)
    expect(goalProgress(-10, 100)).toBe(0)
    expect(goalProgress(50, 0)).toBe(0)
  })
})

void ({} as Task)
void ({} as Habit)
void ({} as Settings)