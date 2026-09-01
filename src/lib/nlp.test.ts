import { describe, expect, it } from 'vitest'
import { parseInput, splitEntries } from './nlp'

/** 2026-10-01 is a Thursday, which the date expectations depend on. */
const NOW = new Date(2026, 9, 1, 9, 0)

const at = (h: number, m = 0) => {
  const d = new Date(2026, 9, 1)
  d.setHours(h, m, 0, 0)
  return d
}
const clockOf = (t: number | undefined) =>
  t === undefined ? null : new Date(t).toTimeString().slice(0, 5)

describe('tokens are consumed whole', () => {
  it('does not re-read the inside of a token it already took', () => {
    // Regression: a rule handler advanced one character, so "09:00–11:00" was
    // re-parsed as "00–11" and became a fifteen-hour block.
    const p = parseInput('standup 09:00–11:00', NOW)
    expect(p.title).toBe('standup')
    expect(p.scheduledStart).toBeDefined()
    expect(p.durationMin).toBe(120)
  })

  it('strips the syntax it understood out of the title', () => {
    const p = parseInput('renew passport #Life friday', NOW)
    expect(p.title).toBe('renew passport')
    expect(p.projects).toEqual(['Life'])
    expect(p.due).toBe('2026-10-02')
  })

  it('leaves a bare number in the title when it is not a time', () => {
    // Regression: "at 25:00" wrapped to 01:00 and silently scheduled nonsense.
    expect(parseInput('meet at 25:00', NOW).scheduledStart).toBeUndefined()
  })
})

describe('clock ranges', () => {
  it('reads a range as its start and its length', () => {
    const p = parseInput('design review 09:30–10:30', NOW)
    expect(clockOf(p.scheduledStart)).toBe('09:30')
    expect(clockOf(p.scheduledEnd)).toBe('10:30')
    expect(p.durationMin).toBe(60)
  })

  it('rolls an end that is not after the start over to the next day', () => {
    const p = parseInput('call 23:30–00:30', NOW)
    expect(clockOf(p.scheduledStart)).toBe('23:30')
    expect(clockOf(p.scheduledEnd)).toBe('00:30')
    expect(p.durationMin).toBe(60)
  })

  it('reads a duration range as hours, not as a clock', () => {
    expect(parseInput('workshop 2-4pm', NOW).durationMin).toBe(120)
    expect(parseInput('for 45m please', NOW).durationMin).toBe(45)
  })

  it('reads a bare 12-hour time', () => {
    expect(clockOf(parseInput('gym at 8pm', NOW).scheduledStart)).toBe('20:00')
    expect(clockOf(parseInput('gym at 7:15am', NOW).scheduledStart)).toBe('07:15')
  })
})

describe('dates', () => {
  it('understands the words people actually use', () => {
    expect(parseInput('ship it today', NOW).due).toBe('2026-10-01')
    expect(parseInput('ship it tomorrow', NOW).due).toBe('2026-10-02')
    expect(parseInput('ship it next week', NOW).due).toBe('2026-10-08')
    expect(parseInput('in 3 days', NOW).due).toBe('2026-10-04')
  })

  it('will not pull a task forward past its own due date', () => {
    // 09:30 is in the past by the time the planner runs at 09:00+; the due date wins.
    const p = parseInput('report friday at 14:00', NOW)
    expect(p.due).toBe('2026-10-02')
    expect(clockOf(p.scheduledStart)).toBe('14:00')
  })
})

describe('metadata', () => {
  it('reads project, label and priority together', () => {
    const p = parseInput('plan the week #Studio @errand !2', NOW)
    expect(p.title).toBe('plan the week')
    expect(p.projects).toEqual(['Studio'])
    expect(p.labels).toEqual(['errand'])
    expect(p.priority).toBe(2)
  })

  it('reads the energy a phrase implies', () => {
    expect(parseInput('sketch the ideas this morning', NOW).dayPart).toBe('morning')
    expect(parseInput('clear the inbox this evening', NOW).dayPart).toBe('evening')
  })

  it('reads a recurrence', () => {
    expect(parseInput('standup every tue', NOW).recurrence).toMatchObject({ freq: 'weekly' })
    expect(parseInput('water the plants every 2 days', NOW).recurrence).toMatchObject({ freq: 'daily', interval: 2 })
  })
})

describe('entries', () => {
  it('splits a line of several tasks without losing their order', () => {
    expect(splitEntries('buy milk; call the bank')).toEqual(['buy milk', 'call the bank'])
  })

  it('treats a semicolon as a separator', () => {
    expect(splitEntries('draft the memo; add the numbers')).toEqual([
      'draft the memo',
      'add the numbers',
    ])
  })
})