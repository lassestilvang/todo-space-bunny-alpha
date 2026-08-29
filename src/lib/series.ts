import type { CalEvent } from '@/types'
import { nextOccurrence, startOfDay } from './date'

/**
 * Recurring meetings.
 *
 * Occurrences are stored as real event rows that share a `seriesId`, which is
 * what the grid, the planner and the busy calculation already understand. The
 * cost is that a series is materialised up to a horizon rather than generated
 * forever; the benefit is that moving or cancelling one occurrence is an ordinary
 * edit to that row, and the rest of the series cannot be affected by accident.
 */

/** How many occurrences a new series is issued for. */
export const SERIES_HORIZON = 26

export const durationOf = (e: Pick<CalEvent, 'start' | 'end'>): number => e.end - e.start

/**
 * The next `count` occurrence starts after `from`, keeping the time of day of
 * the seed. The day test is the task recurrence's, so a task and a meeting with
 * the same rule repeat on the same days.
 */
export function occurrenceStarts(seed: CalEvent, from: number, count: number): number[] {
  const out: number[] = []
  if (!seed.recurrence) return out
  const timeOfDay = seed.start - startOfDay(seed.start).getTime()
  let cursor = from
  for (let i = 0; i < count; i++) {
    const next = nextOccurrence(seed.recurrence, cursor)
    if (next <= cursor) break
    out.push(next + timeOfDay)
    cursor = next
  }
  return out
}

/** Every occurrence of a series, in time order, the seed included. */
export function seriesOf(events: Record<string, CalEvent>, id: string): CalEvent[] {
  const seed = events[id]
  if (!seed) return []
  if (!seed.seriesId) return [seed]
  return Object.values(events)
    .filter((e) => e.seriesId === seed.seriesId)
    .sort((a, b) => a.start - b.start)
}

/** The occurrences from `id` onward — what "this and future" means. */
export function seriesFrom(events: Record<string, CalEvent>, id: string): CalEvent[] {
  const seed = events[id]
  if (!seed) return []
  if (!seed.seriesId) return [seed]
  return seriesOf(events, id).filter((e) => e.start >= seed.start)
}

export const isSeriesEvent = (e: CalEvent | undefined): boolean => !!e?.seriesId