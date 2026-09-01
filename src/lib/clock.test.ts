import { describe, expect, it } from 'vitest'
import { clockText, parseClock } from './clock'

describe('printing a time', () => {
  it('is always 24-hour, with a leading zero', () => {
    expect(clockText(0)).toBe('00:00')
    expect(clockText(9 * 60)).toBe('09:00')
    expect(clockText(14 * 60 + 5)).toBe('14:05')
    expect(clockText(23 * 60 + 59)).toBe('23:59')
  })

  it('wraps rather than showing 25:00', () => {
    expect(clockText(24 * 60)).toBe('00:00')
    expect(clockText(26 * 60 + 30)).toBe('02:30')
    expect(clockText(-60)).toBe('23:00')
  })
})

describe('reading a time', () => {
  it('takes the shapes people actually type', () => {
    expect(parseClock('9:30')).toBe(9 * 60 + 30)
    expect(parseClock('09:30')).toBe(9 * 60 + 30)
    expect(parseClock('0930')).toBe(9 * 60 + 30)
    expect(parseClock('9')).toBe(9 * 60)
    expect(parseClock('  21:15 ')).toBe(21 * 60 + 15)
  })

  it('refuses anything it cannot read, so the field can revert', () => {
    expect(parseClock('')).toBeNull()
    expect(parseClock('half past two')).toBeNull()
    expect(parseClock('24:00')).toBeNull()
    expect(parseClock('12:60')).toBeNull()
    expect(parseClock('9:5')).toBeNull()
    expect(parseClock('9am')).toBeNull()
  })

  it('round-trips every quarter of the day', () => {
    for (let m = 0; m < 1440; m += 15) {
      expect(parseClock(clockText(m))).toBe(m)
    }
  })
})