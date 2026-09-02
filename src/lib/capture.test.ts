import { describe, expect, it } from 'vitest'
import type { CalEvent, TaskFilter } from '@/types'
import { chipList, metaFrom, nameMaps } from './capture'
import { parseInput } from './nlp'
import { seriesFrom, seriesOf, occurrenceStarts } from './series'

const DAY = '2026-10-01'
const at = (h: number, m = 0) => {
  const d = new Date(`${DAY}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

let n = 0

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

describe('reading typed text', () => {
  const names = nameMaps(
    { p1: { id: 'p1', name: 'Studio', color: 'c-sky', glyph: 'x', archived: false, order: 0, createdAt: 0 } },
    { l1: { id: 'l1', name: 'errand', color: 'c-rose' } as never },
  )

  it('turns a project, label and priority into ids', () => {
    const meta = metaFrom(parseInput('plan the week #Studio @errand !2'), names)
    expect(meta).toMatchObject({
      title: 'plan the week',
      projectId: 'p1',
      labelIds: ['l1'],
      priority: 2,
      newProjectName: undefined,
    })
  })

  it('offers to create a project the user named but does not have', () => {
    const meta = metaFrom(parseInput('research #NewVenture'), names)
    expect(meta.newProjectName).toBe('NewVenture')
    expect(meta.projectId).toBeUndefined()
  })

  it('stops a project name at the first space, as tags do', () => {
    // Documented rather than fixed: "#Deep Work" files under "Deep" and leaves
    // "Work" in the title. The chips make that visible rather than silent.
    const meta = metaFrom(parseInput('deep work #Deep Work'), names)
    expect(meta.title).toBe('deep work Work')
    expect(meta.newProjectName).toBe('Deep')
  })

  it('matches a project name whatever the case', () => {
    const meta = metaFrom(parseInput('x #STUDIO'), names)
    expect(meta.projectId).toBe('p1')
  })

  it('reads the chips a caption bar would show', () => {
    const chips = chipList(parseInput('plan the week #Studio @errand !2 for 45m this morning at 09:00'))
    expect(chips.map((c) => c.label)).toEqual([
      '#',
      '@',
      'P',
      'date',
      'for',
      'energy',
      'block',
    ])
    expect(chips.find((c) => c.label === 'P')?.value).toBe('2')
    expect(chips.find((c) => c.label === 'block')?.value).toBe('09:00 – 09:45')
  })

  it('shows nothing for a plain sentence', () => {
    expect(chipList(parseInput('buy milk'))).toEqual([])
  })
})

describe('repeating meetings', () => {
  const weekly = (over: Partial<CalEvent> = {}) =>
    event({ title: 'Standup', start: at(9, 30), end: at(9, 45), seriesId: 'sr1', recurrence: { freq: 'weekly', interval: 1 }, ...over })

  it('keeps the time of day across daylight saving', () => {
    const seed = weekly()
    const starts = occurrenceStarts(seed, seed.end, 26)
    expect(starts).toHaveLength(26)
    const times = new Set(starts.map((s) => new Date(s).toTimeString().slice(0, 5)))
    // Once a year this would be wrong; the seed's wall-clock time must hold.
    expect([...times]).toEqual(['09:30'])
  })

  it('respects an interval of more than one', () => {
    const seed = weekly({ recurrence: { freq: 'weekly', interval: 2 } })
    const starts = occurrenceStarts(seed, seed.end, 3)
    // Fortnightly: each occurrence is two weeks after the one before it.
    const gaps = starts.slice(1).map((s, i) => Math.round((s - starts[i]) / 86400000))
    expect(gaps).toEqual([14, 14])
  })

  it('collects a series in time order', () => {
    const events: Record<string, CalEvent> = {}
    const seed = weekly({ id: 'a', start: at(9, 30), end: at(9, 45) })
    events.a = seed
    for (let i = 1; i < 3; i++) {
      const d = new Date(seed.start)
      d.setDate(d.getDate() + 7 * i)
      events['b' + i] = { ...seed, id: 'b' + i, start: d.getTime(), end: d.getTime() + 900000 }
    }
    events.elsewhere = event({ id: 'z', title: 'Other' })
    const all = seriesOf(events, 'a')
    expect(all.map((e) => e.id)).toEqual(['a', 'b1', 'b2'])
  })

  it('treats a lone event as a series of one', () => {
    const alone = event({ id: 'solo' })
    expect(seriesOf({ solo: alone }, 'solo')).toEqual([alone])
  })

  it('starts "this and future" at the occurrence you asked about', () => {
    const seed = weekly({ id: 'a', start: at(9, 30), end: at(9, 45) })
    const later = new Date(seed.start)
    later.setDate(later.getDate() + 14)
    const events: Record<string, CalEvent> = {
      a: seed,
      b: { ...seed, id: 'b', start: later.getTime(), end: later.getTime() + 900000 },
    }
    expect(seriesFrom(events, 'b').map((e) => e.id)).toEqual(['b'])
    expect(seriesFrom(events, 'a').map((e) => e.id)).toEqual(['a', 'b'])
  })

  it('returns nothing for an id that is gone', () => {
    expect(seriesOf({}, 'nope')).toEqual([])
    expect(seriesFrom({}, 'nope')).toEqual([])
  })
})

void ({} as TaskFilter)