import type { DayPart, Priority, Recurrence } from '@/types'
import {
  addDays,
  atMinutes,
  fromKey,
  minutesUntilMidnight,
  MONTHS_SHORT,
  startOfDay,
  toKey,
} from './date'

/**
 * One-shot capture. Type the way you think; the parser strips the ceremony
 * and leaves a title plus structured fields. Every consumed span is reported
 * so the capture bar can echo back what it understood *before* you commit.
 */

export type TokenKind =
  | 'date'
  | 'time'
  | 'duration'
  | 'priority'
  | 'project'
  | 'label'
  | 'repeat'
  | 'part'

export type ParsedToken = { start: number; end: number; kind: TokenKind }

export type ParsedInput = {
  title: string
  due?: string
  scheduledStart?: number
  scheduledEnd?: number
  durationMin?: number
  priority?: Priority
  projects: string[]
  labels: string[]
  recurrence?: Recurrence
  dayPart?: DayPart
  tokens: ParsedToken[]
}

/* ------------------------------------------------------------------ constants */

const WEEKDAY_NUM: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

const DAY_PARTS: Record<string, { min: number; part: DayPart }> = {
  morning: { min: 9 * 60, part: 'morning' },
  afternoon: { min: 14 * 60, part: 'afternoon' },
  evening: { min: 19 * 60, part: 'evening' },
  night: { min: 21 * 60, part: 'evening' },
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
}

/* ------------------------------------------------------------------ date helpers */

function resolveMonthDay(monthStr: string, dayStr: string, today: Date): string | null {
  const m = MONTHS_SHORT.findIndex((x) => monthStr.slice(0, 3).toLowerCase() === x.toLowerCase())
  if (m < 0) return null
  const day = Number(dayStr)
  if (!Number.isFinite(day) || day < 1 || day > 31) return null
  let year = today.getFullYear()
  if (new Date(year, m, day).getTime() < startOfDay(today).getTime()) year += 1
  return toKey(new Date(year, m, day))
}

function resolveNumericDate(aStr: string, bStr: string, today: Date): string | null {
  let month = Number(aStr)
  let day = Number(bStr)
  if (month > 12 && day <= 12) [month, day] = [day, month]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  let year = today.getFullYear()
  if (new Date(year, month - 1, day).getTime() < startOfDay(today).getTime()) year += 1
  return toKey(new Date(year, month - 1, day))
}

/** The Monday of the week after the one containing `today`. */
function mondayOfNextWeek(today: Date): Date {
  const base = startOfDay(today)
  return addDays(base, 7 - ((base.getDay() + 6) % 7))
}

function minutesFromMeridiem(h: number, m: number, mer: string | undefined): number {
  let hour = h % 24
  if (mer === 'pm' && hour < 12) hour += 12
  if (mer === 'am' && hour === 12) hour = 0
  return hour * 60 + m
}

/* ------------------------------------------------------------------ scanner */

type Ctx = {
  src: string
  i: number
  out: ParsedInput
  today: Date
  pendingDate?: string
  pendingTime?: number
  /** Length in minutes implied by a parsed time range, e.g. "2-4pm". */
  rangeMinutes?: number
  timeHasMeridiem: boolean
}

type Handler = (c: Ctx, m: RegExpExecArray) => number | null
type Rule = (c: Ctx) => number | null

const rules: Rule[] = []

function addRule(re: RegExp, fn: Handler) {
  rules.push((c) => {
    re.lastIndex = c.i
    const m = re.exec(c.src)
    if (!m || m.index !== c.i) return null
    return fn(c, m)
  })
}

/** Records the span just consumed so the capture bar can highlight it. */
const mark = (c: Ctx, kind: TokenKind, m: RegExpExecArray) => {
  c.out.tokens.push({ start: c.i, end: c.i + m[0].length, kind })
}

/* --- projects & labels --- */
addRule(/#[^\s#@]+/y, (c, m) => {
  c.out.projects.push(m[0].slice(1))
  mark(c, 'project', m)
  return 1
})
addRule(/@[a-z0-9][\w/-]*/iy, (c, m) => {
  c.out.labels.push(m[0].slice(1))
  mark(c, 'label', m)
  return 1
})

/* --- priority --- */
addRule(/!([1-4])\b/y, (c, m) => {
  c.out.priority = Number(m[1]) as Priority
  mark(c, 'priority', m)
  return 1
})
addRule(/\bp([1-4])\b/y, (c, m) => {
  c.out.priority = Number(m[1]) as Priority
  mark(c, 'priority', m)
  return 1
})
addRule(/\b(?:urgent|asap|critical|p0)\b/y, (c, m) => {
  c.out.priority = 1
  mark(c, 'priority', m)
  return 1
})
addRule(/\bhigh(?:[- ]?(?:pri|priority))?\b/y, (c, m) => {
  c.out.priority = 2
  mark(c, 'priority', m)
  return 1
})
addRule(/\blow(?:[- ]?(?:pri|priority))?\b/y, (c, m) => {
  c.out.priority = 3
  mark(c, 'priority', m)
  return 1
})

/* --- duration (declared before clock times so "for 2h" wins) --- */
const setDuration = (c: Ctx, m: RegExpExecArray, mins: number) => {
  c.out.durationMin = mins
  mark(c, 'duration', m)
}

addRule(
  /\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(?:h(?:rs?|ours?)?|hour)\s*(\d+)?\s*(?:m(?:in(?:ute)?s?)?)?\b/y,
  (c, m) => {
    setDuration(c, m, Math.round(Number(m[1]) * 60) + (m[2] ? Number(m[2]) : 0))
    return 1
  },
)
addRule(/\b(?:for\s+)?(\d+)\s*(?:m(?:in(?:ute)?s?)?|mins?)\b/y, (c, m) => {
  setDuration(c, m, Number(m[1]))
  return 1
})
addRule(/\b(?:for\s+)?a\s?(?:n)?\s?hour\b/y, (c, m) => {
  setDuration(c, m, 60)
  return 1
})
addRule(/\b(?:for\s+)?half\s+(?:an?\s+)?hour\b/y, (c, m) => {
  setDuration(c, m, 30)
  return 1
})
addRule(/\b(?:for\s+)?(?:a\s)?quarter\s+(?:of\s+an?\s+)?hour\b/y, (c, m) => {
  setDuration(c, m, 15)
  return 1
})

/* --- time ranges: "2-4pm", "from 9 to 11", "9:30–11:00" --- */
addRule(
  /\b(?:from\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:[-–—]|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/y,
  (c, m) => {
    const mer = m[5]?.toLowerCase()
    const start = minutesFromMeridiem(Number(m[1]), Number(m[2] || 0), mer)
    let end = minutesFromMeridiem(Number(m[3]), Number(m[4] || 0), mer)
    if (end <= start) end += 12 * 60
    c.pendingTime = start
    c.rangeMinutes = end - start
    c.timeHasMeridiem = !!mer
    mark(c, 'time', m)
    return 1
  },
)

/* --- clock times --- */
addRule(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/y, (c, m) => {
  c.pendingTime = minutesFromMeridiem(Number(m[1]), Number(m[2] || 0), m[3]?.toLowerCase())
  c.timeHasMeridiem = !!m[3]
  mark(c, 'time', m)
  return 1
})
addRule(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/y, (c, m) => {
  c.pendingTime = minutesFromMeridiem(Number(m[1]), Number(m[2] || 0), m[3].toLowerCase())
  c.timeHasMeridiem = true
  mark(c, 'time', m)
  return 1
})
addRule(/(?<!\d)(\d{1,2}):(\d{2})(?!\d)/y, (c, m) => {
  c.pendingTime = Number(m[1]) * 60 + Number(m[2])
  c.timeHasMeridiem = true
  mark(c, 'time', m)
  return 1
})
addRule(/\b(?:noon|midday)\b/y, (c, m) => {
  c.pendingTime = 12 * 60
  mark(c, 'time', m)
  return 1
})
addRule(/\bmidnight\b/y, (c, m) => {
  c.pendingTime = 0
  c.timeHasMeridiem = true
  mark(c, 'time', m)
  return 1
})

/* --- recurrence --- */
addRule(/\bevery\s+(?:other\s+)?(\d+)?\s*(day|week|month)s?\b/y, (c, m) => {
  const interval = m[1] ? Number(m[1]) : 2
  const unit = m[2][0]
  c.out.recurrence =
    unit === 'd'
      ? { freq: 'daily', interval: m[1] ? interval : 1 }
      : unit === 'w'
        ? { freq: 'weekly', interval: m[1] ? interval : 1 }
        : { freq: 'monthly', interval: m[1] ? interval : 1 }
  mark(c, 'repeat', m)
  return 1
})
addRule(/\bevery\s+day\b/y, (c, m) => {
  c.out.recurrence = { freq: 'daily', interval: 1 }
  mark(c, 'repeat', m)
  return 1
})
addRule(/\bevery\s+weekday(?:s)?\b/y, (c, m) => {
  c.out.recurrence = { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] }
  mark(c, 'repeat', m)
  return 1
})
addRule(
  /\bevery\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\s*(?:,|and|\+)\s*(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\b/y,
  (c, m) => {
    c.out.recurrence = {
      freq: 'weekly',
      interval: 1,
      weekdays: [WEEKDAY_NUM[m[1].slice(0, 3)], WEEKDAY_NUM[m[2].slice(0, 3)]],
    }
    mark(c, 'repeat', m)
    return 1
  },
)
addRule(/\bevery\s+(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day)?\b/y, (c, m) => {
  c.out.recurrence = { freq: 'weekly', interval: 1, weekdays: [WEEKDAY_NUM[m[1].slice(0, 3)]] }
  mark(c, 'repeat', m)
  return 1
})
addRule(/\bevery\s+(morning|afternoon|evening|night)\b/y, (c, m) => {
  const key = m[1] as keyof typeof DAY_PARTS
  c.out.recurrence = { freq: 'daily', interval: 1 }
  c.out.dayPart = DAY_PARTS[key].part
  if (c.pendingTime === undefined) c.pendingTime = DAY_PARTS[key].min
  mark(c, 'repeat', m)
  return 1
})
addRule(/\b(?:daily|weekly|monthly|yearly|annually)\b/y, (c, m) => {
  const w = m[0]
  c.out.recurrence =
    w === 'daily'
      ? { freq: 'daily', interval: 1 }
      : w === 'weekly'
        ? { freq: 'weekly', interval: 1 }
        : { freq: 'monthly', interval: 1 }
  mark(c, 'repeat', m)
  return 1
})

/* --- dates --- */
addRule(/\b(?:today|tdy|tod)\b/y, (c, m) => {
  c.pendingDate = toKey(c.today)
  mark(c, 'date', m)
  return 1
})
addRule(/\b(?:tomorrow|tmrw?|tom)\b/y, (c, m) => {
  c.pendingDate = toKey(addDays(c.today, 1))
  mark(c, 'date', m)
  return 1
})
addRule(/\b(?:yesterday|yday)\b/y, (c, m) => {
  c.pendingDate = toKey(addDays(c.today, -1))
  mark(c, 'date', m)
  return 1
})
addRule(/\btonight\b/y, (c, m) => {
  c.pendingDate = toKey(c.today)
  c.pendingTime = 20 * 60
  c.out.dayPart = 'evening'
  mark(c, 'date', m)
  return 1
})
addRule(
  /\b(next\s+|this\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|s)?\b/y,
  (c, m) => {
    const target = WEEKDAY_NUM[m[2].slice(0, 3)]
    const base = startOfDay(c.today)
    let d: Date
    if (m[1] && m[1].trim().toLowerCase() === 'next') {
      const monday = mondayOfNextWeek(c.today)
      d = addDays(monday, target === 0 ? 6 : target - 1)
    } else {
      d = addDays(base, (target - base.getDay() + 7) % 7)
    }
    c.pendingDate = toKey(d)
    mark(c, 'date', m)
    return 1
  },
)
addRule(
  /\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s*(day|week|month|hour)s?\b/y,
  (c, m) => {
    const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1])
    if (!Number.isFinite(n)) return null
    const unit = m[2][0]
    if (unit === 'h') {
      const nowMin = c.today.getHours() * 60 + c.today.getMinutes()
      c.pendingTime = (nowMin + n * 60) % 1440
      c.timeHasMeridiem = true
      mark(c, 'time', m)
      return 1
    }
    const delta = unit === 'w' ? n * 7 : unit === 'm' ? n * 30 : n
    c.pendingDate = toKey(addDays(c.today, delta))
    mark(c, 'date', m)
    return 1
  },
)
addRule(/\b(?:eod|end\s+of\s+day)\b/y, (c, m) => {
  c.pendingDate = toKey(c.today)
  if (c.pendingTime === undefined) c.pendingTime = minutesUntilMidnight() - 1
  mark(c, 'date', m)
  return 1
})
addRule(/\b(?:eow|end\s+of\s+week)\b/y, (c, m) => {
  const base = startOfDay(c.today)
  c.pendingDate = toKey(addDays(base, (5 - base.getDay() + 7) % 7 || 7))
  if (c.pendingTime === undefined) c.pendingTime = 17 * 60
  mark(c, 'date', m)
  return 1
})
addRule(/\bnext\s+week\b/y, (c, m) => {
  c.pendingDate = toKey(addDays(startOfDay(c.today), 7))
  mark(c, 'date', m)
  return 1
})
addRule(/\bnext\s+month\b/y, (c, m) => {
  const n = c.today
  c.pendingDate = toKey(new Date(n.getFullYear(), n.getMonth() + 1, 1))
  mark(c, 'date', m)
  return 1
})
addRule(
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/iy,
  (c, m) => {
    const key = resolveMonthDay(m[1], m[2], c.today)
    if (!key) return null
    c.pendingDate = key
    mark(c, 'date', m)
    return 1
  },
)
addRule(
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/iy,
  (c, m) => {
    const key = resolveMonthDay(m[2], m[1], c.today)
    if (!key) return null
    c.pendingDate = key
    mark(c, 'date', m)
    return 1
  },
)
addRule(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/y, (c, m) => {
  const key = m[3]
    ? toKey(
        new Date(
          m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]),
          Number(m[1]) - 1,
          Number(m[2]),
        ),
      )
    : resolveNumericDate(m[1], m[2], c.today)
  if (!key) return null
  c.pendingDate = key
  mark(c, 'date', m)
  return 1
})

/* --- bare day parts --- */
addRule(/\b(morning|afternoon|evening|night)\b/y, (c, m) => {
  const key = m[1] as keyof typeof DAY_PARTS
  if (c.pendingTime === undefined) c.pendingTime = DAY_PARTS[key].min
  c.out.dayPart = DAY_PARTS[key].part
  mark(c, 'part', m)
  return 1
})

/* ------------------------------------------------------------------ driver */

export function parseInput(input: string, now = new Date()): ParsedInput {
  const out: ParsedInput = { title: '', projects: [], labels: [], tokens: [] }
  const c: Ctx = {
    src: input,
    i: 0,
    out,
    today: startOfDay(now),
    timeHasMeridiem: false,
  }

  let guard = 0
  while (c.i < input.length && guard++ < 5000) {
    let advanced = false
    for (const r of rules) {
      const n = r(c)
      if (n && n > 0) {
        c.i += n
        advanced = true
        break
      }
    }
    if (!advanced) c.i++
  }

  const dur = c.rangeMinutes ?? out.durationMin

  if (c.pendingDate) {
    out.due = c.pendingDate
    if (c.pendingTime !== undefined) {
      out.scheduledStart = atMinutes(fromKey(c.pendingDate), c.pendingTime)
      out.scheduledEnd = out.scheduledStart + (dur ?? 30) * 60_000
      out.durationMin = dur ?? 30
    } else if (dur) {
      out.durationMin = dur
    }
  } else if (c.pendingTime !== undefined) {
    const nowMin = now.getHours() * 60 + now.getMinutes()
    if (c.rangeMinutes) {
      const dayOffset = c.pendingTime <= nowMin ? 1 : 0
      out.scheduledStart = atMinutes(addDays(now, dayOffset), c.pendingTime)
      out.scheduledEnd = out.scheduledStart + c.rangeMinutes * 60_000
      out.due = toKey(out.scheduledStart)
    } else if (c.pendingTime > nowMin) {
      out.due = toKey(now)
      out.scheduledStart = atMinutes(now, c.pendingTime)
      out.scheduledEnd = out.scheduledStart + (dur ?? 30) * 60_000
    } else {
      out.durationMin = dur
    }
  } else if (c.rangeMinutes) {
    out.durationMin = c.rangeMinutes
  }

  /* rebuild the title from untouched spans */
  const ranges = [...out.tokens].sort((a, b) => a.start - b.start)
  let title = ''
  let cursor = 0
  for (const t of ranges) {
    if (t.start < cursor) continue
    title += input.slice(cursor, t.start)
    cursor = t.end
  }
  title += input.slice(cursor)

  title = title
    .replace(/\s{2,}/g, ' ')
    .replace(/(^|\s)[-–—,:;·|]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+'/g, "'")
    .trim()

  out.title = title || input.trim()

  if (!out.dayPart && out.scheduledStart !== undefined) {
    const h = new Date(out.scheduledStart).getHours()
    out.dayPart = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  }

  return out
}

/** Human summary of what was understood — rendered as chips under the input. */
export function describeParsed(p: ParsedInput): string[] {
  const chips: string[] = []
  if (p.projects.length) chips.push(`#${p.projects.join(' #')}`)
  if (p.labels.length) chips.push(`@${p.labels.join(' @')}`)
  if (p.priority) chips.push(`P${p.priority}`)
  if (p.recurrence) chips.push('repeats')
  if (p.due) {
    const d = new Date(`${p.due}T00:00:00`)
    chips.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
  }
  if (p.durationMin) chips.push(`${p.durationMin}m`)
  if (p.scheduledStart !== undefined) {
    chips.push(
      new Date(p.scheduledStart).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    )
  }
  return chips
}

/** Split a multi-line quick add into separate entries. */
export function splitEntries(input: string): string[] {
  return input
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}
