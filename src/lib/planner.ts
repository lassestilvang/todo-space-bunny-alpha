import type { CalEvent, Habit, Settings, Task, TimeRange } from '@/types'
import { plannedMinutes } from './selectors'
import { addDays, atMinutes, DAY, fromKey, minOfDay, toKey } from './date'

/**
 * The planner. Not an LLM — a real scheduler. It knows about duration, energy,
 * circadian preference, meetings, buffers and habit anchors, and it fills the
 * holes your day actually has.
 */

export type Interval = { start: number; end: number } // minutes since midnight

export type Placement = {
  taskId: string
  day: string
  start: number
  end: number
  reason: string
  chunkOf?: number
  chunkCount?: number
}

export type PlanOptions = {
  /** Consider tasks with no due date and float them into open space. */
  float: boolean
  /** Re-place tasks that already have a block. */
  replan: boolean
  /**
   * Keep the plan true after a change to the calendar: blocks the planner owns
   * are lifted out of the busy set and re-fitted, while blocks the user placed
   * by hand stay exactly where they are.
   */
  refit: boolean
  maxPerDay: number
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = {
  float: true,
  replan: false,
  refit: false,
  maxPerDay: 8,
}

export type PlannerInput = {
  tasks: Task[]
  events: CalEvent[]
  habits: Habit[]
  settings: Settings
}

export type PlanReport = {
  placements: Placement[]
  unplaced: { taskId: string; title: string; reason: string }[]
  loadMinutes: Record<string, number>
  capacityMinutes: Record<string, number>
}

/* ------------------------------------------------------------------ interval algebra */

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end

const total = (list: Interval[]) => list.reduce((a, i) => a + (i.end - i.start), 0)

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((x, y) => x.start - y.start)
  const out: Interval[] = []
  for (const iv of sorted) {
    const last = out[out.length - 1]
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end)
    else out.push({ ...iv })
  }
  return out
}

export function subtract(base: Interval[], busy: Interval[]): Interval[] {
  let free = base
  for (const b of mergeIntervals(busy)) {
    const next: Interval[] = []
    for (const f of free) {
      if (!overlaps(f, b)) {
        next.push(f)
        continue
      }
      if (f.start < b.start) next.push({ start: f.start, end: b.start })
      if (b.end < f.end) next.push({ start: b.end, end: f.end })
    }
    free = next
  }
  return free.filter((f) => f.end - f.start >= 10)
}

/* ------------------------------------------------------------------ day model */

const isWorkDay = (s: Settings, day: Date) => s.workDays.includes(day.getDay())

type DayModel = {
  key: string
  day: Date
  gaps: Interval[]
  busy: Interval[]
  committed: Interval[]
}

/**
 * Meetings, habit anchors and anything already on the clock for this day.
 *
 * In `refit` mode the blocks the planner owns are not busy: they are the things
 * being re-fitted, so counting them would leave the planner nowhere to move
 * them to. Anything the user placed by hand still counts.
 */
function busyForDay(input: PlannerInput, day: Date, opts: PlanOptions = DEFAULT_PLAN_OPTIONS): Interval[] {
  const dayStart = atMinutes(day, 0)
  const dayEnd = dayStart + DAY
  const busy: Interval[] = []

  for (const e of input.events) {
    if (e.allDay) continue
    if (e.end <= dayStart || e.start >= dayEnd) continue
    busy.push({ start: (e.start - dayStart) / 60_000, end: (e.end - dayStart) / 60_000 })
  }

  for (const h of input.habits) {
    if (h.archived || h.anchorMin === null) continue
    if (!habitFallsOn(h, day)) continue
    busy.push({ start: h.anchorMin, end: h.anchorMin + h.durationMin })
  }

  // Tasks already scheduled that the user locked, plus anything pre-planned
  // when we are not doing a full replan.
  for (const t of input.tasks) {
    if (!t.scheduled || t.completed) continue
    if (opts.refit && !t.planLocked) continue
    if (t.scheduled.end <= dayStart || t.scheduled.start >= dayEnd) continue
    busy.push({
      start: (t.scheduled.start - dayStart) / 60_000,
      end: (t.scheduled.end - dayStart) / 60_000,
    })
  }

  return mergeIntervals(busy)
}

/**
 * True when a block the planner owns no longer fits where it sits: it now
 * overlaps a meeting, a habit anchor, or a block the user placed by hand.
 *
 * This is the trigger for a refit. Blocks that still fit are left alone, so
 * moving one meeting does not shuffle the whole day.
 */
export function blockConflicts(input: PlannerInput, task: Task): boolean {
  const s = task.scheduled
  if (!s) return false
  const day = fromKey(toKey(s.start))
  const dayStart = atMinutes(day, 0)
  const fixed = busyForDay(input, day, { ...DEFAULT_PLAN_OPTIONS, refit: true })
  const from = (s.start - dayStart) / 60_000
  const to = (s.end - dayStart) / 60_000
  return fixed.some((iv) => from < iv.end && to > iv.start)
}

/**
 * What cannot move on this day: meetings, habit anchors and blocks the user
 * placed by hand. Used both by the refit and by "make room" proposals.
 */
export function fixedBusy(input: PlannerInput, day: Date): Interval[] {
  return busyForDay(input, day, { ...DEFAULT_PLAN_OPTIONS, refit: true })
}

function habitFallsOn(h: Habit, day: Date): boolean {
  if (h.cadence === 'daily') return true
  if (h.cadence === 'weekdays') return day.getDay() >= 1 && day.getDay() <= 5
  return h.weekdays.includes(day.getDay())
}

/* ------------------------------------------------------------------ placement logic */

/** Where on the clock a given kind of work does its best work. */
function idealStart(task: Task, s: Settings): number {
  const partAnchor = { morning: 9 * 60, afternoon: 13 * 60 + 30, evening: 19 * 60, any: 0 }[
    task.dayPart
  ]
  const energyAnchor = { deep: 9 * 60 + 30, shallow: 11 * 60, admin: 16 * 60 }[task.energy]
  const anchor = partAnchor || energyAnchor
  const nudge = task.priority === 1 ? -30 : task.priority === 2 ? 0 : 30
  return Math.max(s.workStart, Math.min(s.workEnd - 30, anchor + nudge))
}

function reasonFor(task: Task, start: number): string {
  const bits: string[] = []
  if (task.priority === 1) bits.push('P1')
  if (task.energy === 'deep') bits.push('deep work in your peak')
  else if (task.energy === 'admin') bits.push('admin while energy is low')
  if (task.dayPart !== 'any') bits.push(`you asked for ${task.dayPart}`)
  const h = Math.floor(start / 60)
  const m = start % 60
  bits.push(`slot at ${h}:${`${m}`.padStart(2, '0')}`)
  return bits.join(' · ')
}

function bestSlot(gaps: Interval[], duration: number, ideal: number): number | null {
  let bestStart: number | null = null
  let bestScore = Infinity
  for (const gap of gaps) {
    const latest = gap.end - duration
    if (latest < gap.start) continue
    const start = Math.max(gap.start, Math.min(latest, ideal))
    const slack = gap.end - gap.start - duration
    // Prefer a snug fit, and prefer to sit close to the ideal hour.
    const score = Math.abs(start - ideal) * 1 + slack * 0.15
    if (score < bestScore) {
      bestScore = score
      bestStart = start
    }
  }
  return bestStart
}

/* ------------------------------------------------------------------ the plan */

export function planRange(
  input: PlannerInput,
  fromDayKey: string,
  days: number,
  options: Partial<PlanOptions> = {},
): PlanReport {
  const opts = { ...DEFAULT_PLAN_OPTIONS, ...options }
  const s = input.settings
  const startDay = fromKey(fromDayKey)

  const tasksById = new Map(input.tasks.map((t) => [t.id, t]))
  const blocked = new Set(
    input.tasks
      .filter((t) => t.waitFor && !tasksById.get(t.waitFor)?.completed)
      .map((t) => t.id),
  )

  const horizonEnd = toKey(addDays(startDay, Math.max(0, days - 1)))
  const inHorizon = (t: { scheduled: TimeRange | null }) =>
    !t.scheduled ||
    (toKey(t.scheduled.start) >= toKey(startDay) && toKey(t.scheduled.start) <= horizonEnd)

  const candidates = input.tasks
    .filter((t) => !t.completed && !blocked.has(t.id))
    .filter((t) => plannedMinutes(t) > 0)
    .filter((t) => opts.replan || !t.planLocked)
    .filter((t) => opts.replan || opts.refit || !t.scheduled)
    // A refit only re-fits work that already had a block inside the window.
    // Placing *new* work is a decision the user makes from the planner sheet,
    // not a side effect of moving a meeting.
    .filter((t) => !opts.refit || (t.scheduled !== null && inHorizon(t)))
    .filter((t) => t.due || opts.float)

  const queue = [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.energy !== b.energy) return rank(a) - rank(b)
    return (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.order - b.order
  })

  const models = new Map<string, DayModel>()
  const modelFor = (day: Date): DayModel => {
    const key = toKey(day)
    let m = models.get(key)
    if (!m) {
      const busy = busyForDay(input, day, opts)
      const base = isWorkDay(s, day) ? [{ start: s.workStart, end: s.workEnd }] : []
      m = { key, day, busy, committed: [], gaps: subtract(base, busy) }
      models.set(key, m)
    }
    return m
  }

  const placements: Placement[] = []
  const unplaced: PlanReport['unplaced'] = []
  const loadMinutes: Record<string, number> = {}
  const capacityMinutes: Record<string, number> = {}

  const recompute = (m: DayModel) => {
    const base = isWorkDay(s, m.day) ? [{ start: s.workStart, end: s.workEnd }] : []
    m.gaps = subtract(subtract(base, m.busy), m.committed)
  }

  for (let di = 0; di < days; di++) {
    const day = addDays(startDay, di)
    if (!isWorkDay(s, day)) continue
    const key = toKey(day)
    const model = modelFor(day)
    capacityMinutes[key] = total(model.gaps)
    let placedCount = 0

    for (const task of queue) {
      if (placedCount >= opts.maxPerDay) break
      if (placements.some((p) => p.taskId === task.id)) continue
      if (task.due && task.due > key) continue // due later — do not pull it forward

      let remaining = plannedMinutes(task)
      const chunks: Placement[] = []
      const ideal = idealStart(task, s)

      while (remaining > 0) {
        const chunk = Math.min(remaining, s.maxBlockMin)
        const start = bestSlot(model.gaps, chunk, ideal)
        if (start === null) break
        const end = start + chunk
        chunks.push({
          taskId: task.id,
          day: key,
          start,
          end,
          reason: reasonFor(task, start),
          chunkOf: 1,
        })
        model.committed.push({ start, end: end + s.bufferMin })
        recompute(model)
        remaining -= chunk
      }

      if (chunks.length) {
        const count = Math.ceil(plannedMinutes(task) / s.maxBlockMin)
        chunks.forEach((c, i) => {
          c.chunkOf = i + 1
          c.chunkCount = count
        })
        placements.push(...chunks)
        placedCount++
      } else if (!task.scheduled) {
        const note = {
          taskId: task.id,
          title: task.title,
          reason: di === 0 ? 'No opening big enough today' : `Day ${di + 1} is already full`,
        }
        if (!unplaced.some((u) => u.taskId === note.taskId)) unplaced.push(note)
      }
    }

    loadMinutes[key] = total(
      model.committed.map((c) => ({ start: c.start, end: c.end - s.bufferMin })),
    )
  }

  return { placements, unplaced, loadMinutes, capacityMinutes }
}

const rank = (t: Task) => (t.energy === 'deep' ? 0 : t.energy === 'shallow' ? 1 : 2)

/** Turn minute offsets into absolute epoch blocks ready for the store. */
export function toBlocks(placements: Placement[]): { taskId: string; start: number; end: number }[] {
  return placements.map((p) => {
    const base = fromKey(p.day).getTime()
    return { taskId: p.taskId, start: base + p.start * 60_000, end: base + p.end * 60_000 }
  })
}

/** Short human summary for the plan review sheet. */
export function summarise(report: PlanReport, day: string): string {
  const todays = report.placements.filter((p) => p.day === day)
  if (!todays.length) return 'Nothing left to place.'
  const minutes = total(todays.map((p) => ({ start: p.start, end: p.end })))
  const cap = report.capacityMinutes[day] ?? 0
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const focus = `${h ? `${h}h ` : ''}${m ? `${m}m` : ''}`.trim() || '0m'
  const pct = cap ? Math.round((minutes / cap) * 100) : 0
  const first = Math.min(...todays.map((p) => p.start))
  const last = Math.max(...todays.map((p) => p.end))
  const fmt = (x: number) => `${Math.floor(x / 60)}:${`${x % 60}`.padStart(2, '0')}`
  return `${todays.length} block${todays.length === 1 ? '' : 's'} · ${focus} scheduled · ${pct}% of free time · ${fmt(first)}–${fmt(last)}`
}

export { minOfDay }
