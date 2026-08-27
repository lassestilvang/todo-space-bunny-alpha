import type { Recurrence } from '@/types'

export const MIN = 60_000
export const HOUR = 60 * MIN
export const DAY = 24 * HOUR

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const MONTHS_LONG = MONTHS
export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export const startOfDay = (d: Date | number): Date =>
  typeof d === 'number' ? new Date(new Date(d).setHours(0, 0, 0, 0)) : new Date(d.setHours(0, 0, 0, 0))

export const endOfDay = (d: Date | number): Date =>
  typeof d === 'number'
    ? new Date(new Date(d).setHours(23, 59, 59, 999))
    : new Date(d.setHours(23, 59, 59, 999))

export const addDays = (d: Date | number, n: number): Date =>
  typeof d === 'number' ? new Date(d + n * DAY) : new Date(d.getTime() + n * DAY)

export const addMinutes = (t: number, n: number): number => t + n * MIN

export const startOfWeek = (d: Date | number, weekStartsOn = 1): Date => {
  const d0 = startOfDay(d)
  const diff = (d0.getDay() - weekStartsOn + 7) % 7
  return addDays(d0, -diff)
}

export const endOfWeek = (d: Date | number, weekStartsOn = 1): Date =>
  addDays(startOfWeek(d, weekStartsOn), 7)

export const isSameDay = (a: Date | number, b: Date | number): boolean =>
  startOfDay(a).getTime() === startOfDay(b).getTime()

export const isToday = (t: Date | number): boolean => isSameDay(t, Date.now())

export const isWeekend = (t: Date | number): boolean => {
  const g = startOfDay(t).getDay()
  return g === 0 || g === 6
}

export const daysBetween = (a: Date | number, b: Date | number): number =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY)

/* ---------------------------------- YYYY-MM-DD ---------------------------------- */

export const toKey = (d: Date | number): string => {
  const dt = typeof d === 'number' ? new Date(d) : d
  const m = `${dt.getMonth() + 1}`.padStart(2, '0')
  const day = `${dt.getDate()}`.padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${day}`
}

export const fromKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const isValidKey = (key: string | undefined): boolean =>
  !!key && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(fromKey(key).getTime())

/* ---------------------------------- minutes <-> clock ---------------------------------- */

/** Minutes since local midnight. */
export const minOfDay = (t: Date | number): number => {
  const d = typeof t === 'number' ? new Date(t) : t
  return d.getHours() * 60 + d.getMinutes()
}

export const atMinutes = (day: Date | number, minutes: number): number => {
  const d0 = startOfDay(day)
  return d0.getTime() + minutes * MIN
}

export const snap = (minutes: number, step: number): number => Math.round(minutes / step) * step

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/* ---------------------------------- formatting ---------------------------------- */

/** 24h by default — this is a planning instrument, not a clock app. */
/** 24-hour clock, always: "09:05", "14:30". */
export function fmtTime(t: number | Date): string {
  const d = typeof t === 'number' ? new Date(t) : t
  const h = `${d.getHours()}`.padStart(2, '0')
  const m = `${d.getMinutes()}`.padStart(2, '0')
  return `${h}:${m}`
}

export const fmtRange = (start: number, end: number): string =>
  `${fmtTime(start)}–${fmtTime(end)}`

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function fmtDateKey(key: string, opts?: { weekday?: boolean; year?: boolean }): string {
  const d = fromKey(key)
  const wd = opts?.weekday ? `${WEEKDAYS_SHORT[d.getDay()]} ` : ''
  const yr = opts?.year === false ? '' : ` ${d.getFullYear()}`
  return `${wd}${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${yr}`
}

export function fmtDayHeading(d: Date | number): string {
  const dt = typeof d === 'number' ? new Date(d) : d
  if (isToday(dt)) return 'Today'
  const diff = daysBetween(Date.now(), dt)
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return WEEKDAYS_LONG[dt.getDay()]
}

export function fmtRelativeDay(key: string | undefined): string {
  if (!key || !isValidKey(key)) return 'No date'
  const diff = daysBetween(Date.now(), fromKey(key))
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return WEEKDAYS[fromKey(key).getDay()]
  if (diff < 0) {
    const n = Math.abs(diff)
    return `${n}d overdue`
  }
  if (diff < 21) return `in ${diff}d`
  return fmtDateKey(key, { weekday: false, year: false })
}

export const monthKey = (d: Date | number): string => {
  const dt = typeof d === 'number' ? new Date(d) : d
  return `${dt.getFullYear()}-${`${dt.getMonth() + 1}`.padStart(2, '0')}`
}

/* ---------------------------------- recurrence ---------------------------------- */

export function occursOn(r: Recurrence, from: Date | number, to: Date | number): boolean {
  const a = startOfDay(from)
  const b = startOfDay(to)
  if (a.getTime() === b.getTime()) return true
  const step = b.getTime() - a.getTime()
  if (step < 0) return false
  if (r.until && b.getTime() > fromKey(r.until).getTime()) return false

  switch (r.freq) {
    case 'daily': {
      const n = Math.round(step / DAY)
      return n % r.interval === 0
    }
    case 'weekly': {
      const days = r.weekdays?.length ? r.weekdays : [startOfDay(from).getDay()]
      if (!days.includes(b.getDay())) return false
      const weekDiff = Math.floor(daysBetween(startOfWeek(a), startOfWeek(b)) / 7)
      return weekDiff % r.interval === 0
    }
    case 'monthly': {
      const months =
        (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
      if (months % r.interval !== 0) return false
      return b.getDate() === a.getDate()
    }
  }
}

export function describeRecurrence(r: Recurrence): string {
  const every = r.interval === 1 ? 'Every' : `Every ${r.interval}`
  if (r.freq === 'daily') return r.interval === 1 ? 'Daily' : `${every} days`
  if (r.freq === 'monthly') return r.interval === 1 ? 'Monthly' : `${every} months`
  const days = r.weekdays?.length ? r.weekdays : []
  if (!days.length || (days.length === 7 && r.interval === 1)) {
    return r.interval === 1 ? 'Weekly' : `${every} weeks`
  }
  const list =
    days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))
      ? 'weekdays'
      : days
          .slice()
          .sort((a, b) => a - b)
          .map((d) => WEEKDAYS[d])
          .join(', ')
  return `${every} ${list.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/, (m) => m)}`
}

export function nextOccurrence(r: Recurrence, after: number): number {
  let t = startOfDay(after).getTime() + DAY
  for (let i = 0; i < 800; i++) {
    if (occursOn(r, startOfDay(after), t)) return t
    t = addDays(t, 1).getTime()
  }
  return t
}

/* ---------------------------------- misc ---------------------------------- */

export function minutesUntilMidnight(): number {
  const now = new Date()
  return 24 * 60 - (now.getHours() * 60 + now.getMinutes())
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  if (h < 22) return 'Good evening'
  return 'Good night'
}

export function isoWeekNumber(d: Date | number): number {
  const dt = typeof d === 'number' ? new Date(d) : new Date(d)
  // The Thursday of this week determines the ISO year and the week index.
  const target = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate())
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7))
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY))
}
