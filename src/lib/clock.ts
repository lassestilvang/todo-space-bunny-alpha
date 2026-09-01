/**
 * Clock text, in the one format Tempo uses: 24-hour `HH:MM`.
 *
 * The native `input[type=time]` renders in the browser's locale, so the same
 * build showed "2:30 PM" to one person and "14:30" to another. Parsing and
 * printing live here so no field can reintroduce that.
 */

export const MINUTES_IN_DAY = 1440

/** Minutes from midnight to `HH:MM`, wrapping at midnight. */
export function clockText(minutes: number): string {
  const m = ((Math.round(minutes) % MINUTES_IN_DAY) + MINUTES_IN_DAY) % MINUTES_IN_DAY
  const h = Math.floor(m / 60)
  return `${`${h}`.padStart(2, '0')}:${`${m % 60}`.padStart(2, '0')}`
}

/**
 * "9:30", "09:30", "0930" and "9" all mean the same clock time.
 * Returns null for anything else, so a typo reverts instead of landing the
 * cursor somewhere surprising.
 */
export function parseClock(text: string): number | null {
  const raw = text.trim()
  if (!raw) return null
  const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(raw)
  if (!m) return null
  const h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  if (!Number.isInteger(h) || !Number.isInteger(min)) return null
  if (h > 23 || min > 59) return null
  return h * 60 + min
}