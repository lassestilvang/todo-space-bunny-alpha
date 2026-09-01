import { describe, expect, it } from 'vitest'
import type { Recurrence } from '@/types'
import { addDays, atMinutes, daysBetween, fromKey, nextOccurrence, startOfWeek, toKey } from './date'

// Copenhagen switches its clocks on the last Sunday of October and March.
const BEFORE_CHANGE = new Date(2026, 9, 18) // a week before
const AFTER_CHANGE = new Date(2026, 9, 31) // a week after

describe('moving by days', () => {
  it('keeps the wall-clock time across a daylight-saving change', () => {
    // Regression: adding 24 hours crosses the change as 23 or 25 hours, so every
    // weekly recurrence drifted an hour twice a year.
    expect(addDays(BEFORE_CHANGE, 7).getHours()).toBe(BEFORE_CHANGE.getHours())
    expect(addDays(AFTER_CHANGE, 7).getHours()).toBe(AFTER_CHANGE.getHours())
  })

  it('crosses the boundary without skipping or repeating a day', () => {
    expect(toKey(addDays(new Date(2026, 9, 24), 1))).toBe('2026-10-25')
    expect(toKey(addDays(new Date(2026, 9, 25), 1))).toBe('2026-10-26')
    expect(toKey(addDays(new Date(2026, 9, 26), -1))).toBe('2026-10-25')
  })

  it('walks backwards too', () => {
    expect(toKey(addDays(new Date(2026, 9, 26), -1))).toBe('2026-10-25')
    expect(toKey(addDays(new Date(2026, 2, 2), -1))).toBe('2026-03-01')
  })
})

describe('a wall-clock time on a day', () => {
  it('is the same hour on either side of a change', () => {
    // Regression: local midnight plus N milliseconds is wrong on a 23- or
    // 25-hour day, which put 09:30 at 08:30 after the clocks went back.
    const nineThirty = 9 * 60 + 30
    expect(new Date(atMinutes(BEFORE_CHANGE, nineThirty)).getHours()).toBe(9)
    expect(new Date(atMinutes(AFTER_CHANGE, nineThirty)).getHours()).toBe(9)
  })

  it('handles the ends of the day', () => {
    expect(new Date(atMinutes(BEFORE_CHANGE, 0)).getHours()).toBe(0)
    const last = new Date(atMinutes(BEFORE_CHANGE, 24 * 60 - 1))
    expect(last.getHours()).toBe(23)
  })

  it('keeps a key and the clock on the same day', () => {
    const day = new Date(2026, 9, 31)
    const t = atMinutes(day, 9 * 60 + 30)
    expect(toKey(t)).toBe(toKey(day))
  })
})

describe('day keys', () => {
  it('round-trips through a Date', () => {
    for (const key of ['2026-10-01', '2026-01-31', '2026-12-31']) {
      expect(toKey(fromKey(key))).toBe(key)
    }
  })

  it('counts whole days between two moments', () => {
    expect(daysBetween(new Date(2026, 9, 1, 23), new Date(2026, 9, 2, 1))).toBe(1)
    expect(daysBetween(new Date(2026, 9, 1, 1), new Date(2026, 9, 1, 23))).toBe(0)
    expect(daysBetween(new Date(2026, 9, 2), new Date(2026, 9, 1))).toBe(-1)
  })

  it('counts a day once, whatever the hour', () => {
    // The adviser reads a due date as "how many days from today"; getting this
    // wrong made it say "due tomorrow" for something due today.
    const today = new Date(2026, 9, 1, 10)
    expect(daysBetween(today, fromKey('2026-10-01'))).toBe(0)
    expect(daysBetween(today, fromKey('2026-10-02'))).toBe(1)
    expect(daysBetween(today, fromKey('2026-10-08'))).toBe(7)
  })
})

describe('the week', () => {
  it('starts on Monday by default, or wherever asked', () => {
    // 2026-10-01 is a Thursday, so its Monday week began on the 28th.
    expect(toKey(startOfWeek(new Date(2026, 9, 1)))).toBe('2026-09-28')
    // 2026-10-04 is a Sunday, so a Sunday-start week begins on the day itself.
    expect(toKey(startOfWeek(new Date(2026, 9, 4), 0))).toBe('2026-10-04')
    expect(toKey(startOfWeek(new Date(2026, 9, 5), 0))).toBe('2026-10-04')
  })
})

describe('recurrences', () => {
  it('lands on the next day the rule matches', () => {
    const weekly = { freq: 'weekly' as const, interval: 1 }
    // The Wednesday after a Sunday.
    const wed = new Date(2026, 9, 14)
    expect(toKey(nextOccurrence(weekly, wed.getTime()))).toBe('2026-10-21')
  })

  it('keeps the hour of day it was asked for', () => {
    const weekly: Recurrence = { freq: 'weekly', interval: 1 }
    const seed = new Date(2026, 9, 18)
    const timeOfDay = 9 * 60 + 30
    // What the series does with the occurrence: add the seed's time of day.
    const next = nextOccurrence(weekly, seed.getTime())
    expect(new Date(atMinutes(next, timeOfDay)).getHours()).toBe(9)
  })

  it('respects an interval of more than one', () => {
    const fortnightly: Recurrence = { freq: 'weekly', interval: 2 }
    // From Wednesday 14 October the next fortnightly Wednesday is the 28th.
    expect(toKey(nextOccurrence(fortnightly, new Date(2026, 9, 14).getTime()))).toBe('2026-10-28')
  })

  it('stops at an end date', () => {
    const bounded: Recurrence = { freq: 'weekly', interval: 1, until: '2026-10-05' }
    const after = nextOccurrence(bounded, new Date(2026, 10, 6).getTime())
    expect(toKey(after) > '2026-10-05').toBe(true)
  })
})