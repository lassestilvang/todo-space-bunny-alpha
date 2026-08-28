import type { FocusSession } from '@/types'
import { MIN, addDays, toKey } from './date'

/**
 * How a session counts towards the time you actually spent.
 *
 * A finished session is worth its full planned length. One that is still open
 * contributes only the time really elapsed; one that was abandoned before its
 * planned end contributes nothing, because no attention was recorded for it.
 *
 * This is the single definition. Review and Focus both read it, so the two
 * surfaces cannot report different numbers for the same day.
 */
export function focusMinutesOf(s: FocusSession, now: number): number {
  if (s.completed) return s.minutes
  const plannedEnd = s.start + s.minutes * MIN
  if (plannedEnd > now) return Math.max(0, (now - s.start) / MIN)
  return 0
}

export function isOpenSession(s: FocusSession, now: number): boolean {
  return !s.completed && s.start + s.minutes * MIN > now
}

/** Total minutes of focus on one day. */
export function focusMinutesOn(sessions: FocusSession[], key: string, now: number): number {
  return sessions.reduce((a, s) => (toKey(s.start) === key ? a + focusMinutesOf(s, now) : a), 0)
}

export type FocusDay = { key: string; minutes: number }

/** A run of day keys, oldest first, ending today. */
export function focusWindow(days: number, now: number): string[] {
  const out: string[] = []
  const today = toKey(now)
  for (let i = days - 1; i >= 0; i--) out.push(toKey(addDays(new Date(`${today}T00:00:00`), -i)))
  return out
}

/** Minutes per day across a window, aligned to the keys passed in. */
export function focusPerDay(sessions: FocusSession[], keys: string[], now: number): FocusDay[] {
  return keys.map((key) => ({ key, minutes: Math.round(focusMinutesOn(sessions, key, now)) }))
}

/**
 * Consecutive days, counting back from today, that reached the goal.
 *
 * Today only counts once it is over: a half-finished day is not a streak yet,
 * but it does not break one either. That keeps the number honest in both
 * directions — it never rewards an unfinished today, and never punishes one.
 */
export function focusStreak(
  sessions: FocusSession[],
  goalMin: number,
  now: number,
  maxDays = 400,
): number {
  if (goalMin <= 0) return 0
  const todayKey = toKey(now)
  let streak = 0
  for (let i = 0; i < maxDays; i++) {
    const key = toKey(addDays(new Date(`${todayKey}T00:00:00`), -i))
    const minutes = focusMinutesOn(sessions, key, now)
    if (minutes >= goalMin) {
      streak++
      continue
    }
    // An unfinished today is skipped rather than counted as a miss.
    if (i === 0) continue
    break
  }
  return streak
}

/** How much of today's goal is banked, clamped for the progress ring. */
export function goalProgress(minutesToday: number, goalMin: number): number {
  if (goalMin <= 0) return 0
  return Math.max(0, Math.min(1, minutesToday / goalMin))
}
