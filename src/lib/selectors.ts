import type { CalendarItem, CalEvent, Habit, ID, Project, Task } from '@/types'
import {
  addDays,
  DAY,
  daysBetween,
  fromKey,
  isSameDay,
  isValidKey,
  minOfDay,
  startOfDay,
  toKey,
} from './date'

export const cn = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(' ')

/* ---------------------------------- colour ---------------------------------- */

export const COLOR_TOKENS = [
  'c-ember',
  'c-saffron',
  'c-lime',
  'c-mint',
  'c-aqua',
  'c-sky',
  'c-iris',
  'c-orchid',
  'c-rose',
  'c-sand',
] as const

export type ColorToken = (typeof COLOR_TOKENS)[number]

export const cssColor = (token: string | undefined, fallback = 'var(--color-ink-3)'): string =>
  token ? `var(--color-${token})` : fallback

const NEUTRAL = 'var(--color-ink-4)'

export function colorForTask(t: Task, projects: Record<ID, Project>): string {
  const p = t.projectId ? projects[t.projectId] : undefined
  return cssColor(p?.color, NEUTRAL)
}

/* ---------------------------------- ordering ---------------------------------- */

export const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order

export const priorityWeight = (p: Task['priority']) => p

export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      a.priority - b.priority ||
      (a.due ?? '9999').localeCompare(b.due ?? '9999') ||
      byOrder(a, b),
  )
}

/* ---------------------------------- calendar ---------------------------------- */

export function toItems(
  tasks: Record<ID, Task>,
  events: Record<ID, CalEvent>,
  projects: Record<ID, Project>,
  fromMs: number,
  toMs: number,
): CalendarItem[] {
  const out: CalendarItem[] = []

  for (const t of Object.values(tasks)) {
    if (!t.scheduled) continue
    if (t.scheduled.end <= fromMs || t.scheduled.start >= toMs) continue
    out.push({
      id: t.id,
      kind: 'task',
      title: t.title,
      start: t.scheduled.start,
      end: t.scheduled.end,
      allDay: false,
      color: cssColor(t.projectId ? projects[t.projectId]?.color : undefined, NEUTRAL),
      projectId: t.projectId,
      done: t.completed,
      priority: t.priority,
      tentative: false,
      energy: t.energy,
      ref: t,
    })
  }

  for (const e of Object.values(events)) {
    if (e.end <= fromMs || e.start >= toMs) continue
    out.push({
      id: e.id,
      kind: 'event',
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      color: cssColor(e.color ?? (e.projectId ? projects[e.projectId]?.color : undefined), 'var(--color-ink-3)'),
      projectId: e.projectId,
      done: false,
      priority: 4,
      tentative: e.tentative,
      energy: 'shallow',
      ref: e,
    })
  }

  return out.sort((a, b) => a.start - b.start)
}

export type Positioned = CalendarItem & {
  /** Cluster id: every block that overlaps another shares one. */
  cluster: number
  /** Slot in the cluster's cascade, earliest first. */
  depth: number
  /** How many blocks share this cluster. */
  clusterSize: number
}

/**
 * Groups blocks that collide in time so the grid can cascade them.
 *
 * Overlapping blocks share one cluster and get a slot in it, earliest first:
 * urgent beats long when two start together. The grid then steps each slot down
 * a little further, so every block keeps a readable strip instead of being
 * squeezed into a narrow lane.
 */
export function layoutItems(items: CalendarItem[]): Positioned[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const out: Positioned[] = []
  let cluster: CalendarItem[] = []
  let clusterEnd = -Infinity
  let clusterId = 0

  const flush = () => {
    if (!cluster.length) return
    const ordered = [...cluster].sort(
      (a, b) => a.start - b.start || a.priority - b.priority || b.end - a.end,
    )
    ordered.forEach((item, depth) => {
      out.push({ ...item, cluster: clusterId, depth, clusterSize: ordered.length })
    })
    cluster = []
    clusterEnd = -Infinity
    clusterId++
  }

  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length) flush()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return out
}

/** Items that live on `key` — scheduled blocks plus floating all-day tasks. */
export function tasksOnDay(tasks: Task[], key: string): { scheduled: Task[]; floating: Task[] } {
  const dayStart = fromKey(key).getTime()
  const dayEnd = dayStart + DAY
  const scheduled: Task[] = []
  const floating: Task[] = []
  for (const t of tasks) {
    if (t.completed) continue
    if (t.scheduled && t.scheduled.start >= dayStart && t.scheduled.start < dayEnd) scheduled.push(t)
    else if (!t.scheduled && t.due === key) floating.push(t)
  }
  return { scheduled: sortTasks(scheduled), floating: sortTasks(floating) }
}

/* ---------------------------------- smart lists ---------------------------------- */

export type SmartList = 'inbox' | 'today' | 'upcoming' | 'anytime' | 'priority' | 'completed'

export function smartList(tasks: Task[], list: SmartList, projectId?: ID): Task[] {
  const todayKey = toKey(new Date())
  const scoped = projectId ? tasks.filter((t) => t.projectId === projectId) : tasks
  switch (list) {
    case 'inbox':
      return sortTasks(scoped.filter((t) => !t.projectId && !t.completed))
    case 'today':
      return sortTasks(
        scoped.filter(
          (t) =>
            !t.completed &&
            (t.due === todayKey ||
              (t.scheduled ? isSameDay(t.scheduled.start, Date.now()) : false)),
        ),
      )
    case 'upcoming':
      return sortTasks(
        scoped.filter((t) => !t.completed && !!t.due && t.due > todayKey),
      )
    case 'anytime':
      return sortTasks(scoped.filter((t) => !t.completed && !t.due))
    case 'priority':
      return sortTasks(scoped.filter((t) => !t.completed && t.priority <= 2))
    case 'completed':
      return [...scoped.filter((t) => t.completed)].sort(
        (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
      )
  }
}

export const isOverdue = (t: Task): boolean =>
  !t.completed && !!t.due && !!isValidKey(t.due) && daysBetween(fromKey(t.due), new Date()) > 0

/* ---------------------------------- habits ---------------------------------- */

export function habitStreak(h: Habit, today = new Date()): number {
  let streak = 0
  const key = toKey(today)
  const cursor = new Date(startOfDay(today))
  // Today only breaks the streak if it is already past the point of no return.
  if (!h.log.includes(key)) cursor.setDate(cursor.getDate() - 1)
  for (let i = 0; i < 400; i++) {
    const k = toKey(cursor)
    if (!habitDueOn(h, cursor)) {
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    if (h.log.includes(k)) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else break
  }
  return streak
}

export function habitDueOn(h: Habit, day: Date): boolean {
  if (h.cadence === 'daily') return true
  if (h.cadence === 'weekdays') return day.getDay() >= 1 && day.getDay() <= 5
  return h.weekdays.includes(day.getDay())
}

export function habitWeekCount(h: Habit, weekStart: Date): number {
  let n = 0
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    if (h.log.includes(toKey(d))) n++
  }
  return n
}

export const habitRate = (h: Habit, days = 30): number => {
  let due = 0
  let hit = 0
  for (let i = 1; i <= days; i++) {
    const d = addDays(new Date(), -i)
    if (!habitDueOn(h, d)) continue
    due++
    if (h.log.includes(toKey(d))) hit++
  }
  return due ? hit / due : 0
}

/* ---------------------------------- stats ---------------------------------- */

export function dayStats(tasks: Task[]) {
  const done = tasks.filter((t) => t.completed && t.completedAt && isSameDay(t.completedAt, Date.now()))
  const minutes = done.reduce((a, t) => a + t.durationMin, 0)
  const planned = tasks.filter((t) => !t.completed)
  return {
    done: done.length,
    minutes,
    planned: planned.length,
    plannedMinutes: planned.reduce((a, t) => a + t.durationMin, 0),
  }
}

/** Free/busy density per 30-minute slot for a day. Returns 0..1. */
export function dayLoad(items: CalendarItem[], key: string): Map<number, number> {
  const out = new Map<number, number>()
  const dayStart = fromKey(key).getTime()
  for (const item of items) {
    if (item.allDay) continue
    const s = Math.max(0, (item.start - dayStart) / (30 * 60_000))
    const e = Math.min(48, (item.end - dayStart) / (30 * 60_000))
    for (let slot = Math.floor(s); slot < Math.ceil(e); slot++) {
      out.set(slot, (out.get(slot) ?? 0) + 1)
    }
  }
  return out
}

export const minutesLabel = (raw: number) => {
  // Callers pass averages and fractional spans; never show a decimal.
  const m = Math.max(0, Math.round(raw))
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (!h) return `${mm}m`
  return mm ? `${h}h ${mm}m` : `${h}h`
}

export const timeLabel = (t: number) => {
  const d = new Date(t)
  return `${`${d.getHours()}`.padStart(2, '0')}:${`${d.getMinutes()}`.padStart(2, '0')}`
}

export { minOfDay, toKey, fromKey, addDays, daysBetween }
