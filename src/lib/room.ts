import type { CalEvent, Habit, Settings, Task } from '@/types'
import { MIN, atMinutes, fromKey, toKey } from './date'
import { fixedBusy, mergeIntervals, subtract, type Interval, type PlannerInput } from './planner'

/**
 * Making room.
 *
 * "Free up an hour this afternoon" is not an instruction the assistant should
 * execute blind — the user is asking where to give up time, not naming a block.
 * So this proposes: which blocks sit in the way, where each could move, and what
 * dropping one would cost. Applying a proposal is a single undoable step.
 */

export type MoveProposal = {
  id: string
  label: string
  detail: string
  action:
    | { type: 'move'; match: string; start: number; end: number }
    | { type: 'unschedule'; match: string }
    | { type: 'schedule'; match: string; when: string; durationMin?: number }
}

export type RoomReport = {
  /** What the request asked for, in minutes from midnight. */
  need: number
  from: number
  day: string
  /** The window as it stands. */
  window: { start: number; end: number }
  proposals: MoveProposal[]
  /** Largest opening in the rest of the day, when nothing is in the way. */
  biggestGap: Interval | null
  notes: string[]
}

const DAY_MIN = 24 * 60

/** Minutes from midnight for "now", clamped into working hours. */
export function defaultFrom(settings: Settings, now: number): number {
  const d = new Date(now)
  const min = d.getHours() * 60 + d.getMinutes()
  return Math.min(Math.max(min, settings.workStart), Math.max(settings.workStart, settings.workEnd - 60))
}

/**
 * Read "an hour", "90 minutes", "this afternoon", "at 15:00" out of a request.
 * Defaults to an hour from now, which is what people mean by "free up some time".
 */
export function parseRoomRequest(text: string, settings: Settings, now: number) {
  const lower = text.toLowerCase()
  let need = 60
  const amount = /(\d+)\s*(m|min|minute|minutes)\b/.exec(lower)
  if (amount) need = Number(amount[1])
  else {
    const hours = /(\d+(?:\.\d+)?)\s*(h|hr|hour|hours)\b/.exec(lower)
    if (hours) need = Math.round(Number(hours[1]) * 60)
  }
  need = Math.max(5, Math.min(240, need))

  let from = defaultFrom(settings, now)
  let rolledForward = false
  const clock = /(?:at|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(lower)
  if (clock) {
    let h = Number(clock[1])
    const m = clock[2] ? Number(clock[2]) : 0
    if (clock[3] === 'pm' && h < 12) h += 12
    if (clock[3] === 'am' && h === 12) h = 0
    const asked = h * 60 + m
    // "free up an hour at 3:00" in the afternoon means three, not three in the
    // morning; a window that has already passed is no use to anyone.
    if (asked < defaultFrom(settings, now)) {
      from = defaultFrom(settings, now)
      rolledForward = true
    } else {
      from = Math.min(Math.max(asked, 0), settings.workEnd - 15)
    }
  } else if (/afternoon/.test(lower)) from = Math.max(settings.workStart, 13 * 60)
  else if (/morning/.test(lower)) from = settings.workStart
  else if (/evening|tonight/.test(lower)) from = Math.max(settings.workStart, 19 * 60)

  return { need, from, rolledForward }
}

/** Task blocks on one day, split into the ones the planner owns and the rest. */
function blocksOn(tasks: Task[], key: string) {
  const onDay = tasks.filter((t) => !t.completed && t.scheduled && toKey(t.scheduled.start) === key)
  const movable = onDay.filter((t) => !t.planLocked)
  return { onDay, movable }
}

const overlaps = (iv: Interval, from: number, to: number) => iv.start < to && iv.end > from

/** Minutes from local midnight for a timestamp. */
const clockOf = (t: number): number => {
  const d = new Date(t)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * What is standing in the window that we are not allowed to move: meetings,
 * habit anchors and blocks the user placed by hand. Naming these is the
 * difference between "nothing is in the way" and an honest answer.
 */
function immovableIn(
  window: Interval,
  tasks: Task[],
  events: CalEvent[],
  habits: Habit[],
): string[] {
  const out: string[] = []
  for (const e of events) {
    if (e.allDay) continue
    const s = clockOf(e.start)
    const en = clockOf(e.end)
    if (overlaps({ start: s, end: en }, window.start, window.end)) out.push(e.title)
  }
  for (const h of habits) {
    if (h.anchorMin === null) continue
    if (overlaps({ start: h.anchorMin, end: h.anchorMin + h.durationMin }, window.start, window.end))
      out.push(h.name)
  }
  for (const t of tasks) {
    if (!t.scheduled || !t.planLocked || t.completed) continue
    const s = clockOf(t.scheduled.start)
    const en = clockOf(t.scheduled.end)
    if (overlaps({ start: s, end: en }, window.start, window.end)) out.push(t.title)
  }
  return out
}

/**
 * Propose ways to free `need` minutes starting at `from` on the day of `now`.
 *
 * Nothing is written here. Each proposal carries the action that would do it, so
 * the assistant can show the options and apply exactly one if asked.
 */
export function proposeRoom(
  tasks: Task[],
  events: CalEvent[],
  habits: Habit[],
  settings: Settings,
  now: number,
  request: string,
): RoomReport {
  const { need, from, rolledForward } = parseRoomRequest(request, settings, now)
  const key = toKey(now)
  const input: PlannerInput = { tasks, events, habits, settings }
  const day = fromKey(key)
  const dayStart = atMinutes(day, 0)

  const fixed = fixedBusy(input, day)
  const { movable } = blocksOn(tasks, key)
  const window = { start: from, end: Math.min(from + need, settings.workEnd) }
  const notes: string[] = []
  if (rolledForward) notes.push('That time has already passed today, so I looked from now.')

  // Blocks the planner owns, as clock intervals.
  const owned: Interval[] = movable.map((t) => ({
    start: (t.scheduled!.start - dayStart) / MIN,
    end: (t.scheduled!.end - dayStart) / MIN,
  }))
  const work: Interval[] =
    isWorkday(settings, day) ? [{ start: settings.workStart, end: settings.workEnd }] : []

  const inTheWay = movable
    .map((t) => ({ task: t, iv: owned.find((o) => Math.round(o.start * MIN) === t.scheduled!.start - dayStart)! }))
    .filter((x) => x.iv && overlaps(x.iv, window.start, window.end))
    // Least important first: priority 4 before 1, then the shorter block.
    .sort((a, b) => b.task.priority - a.task.priority || a.iv.end - a.iv.start)

  const gapsWithout = (except: Interval | null) =>
    subtract(subtract(work, fixed), mergeIntervals(owned.filter((o) => o !== except)))
  const gaps = subtract(subtract(work, fixed), mergeIntervals(owned))
  const biggestGap =
    gaps.length > 0 ? gaps.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a)) : null

  if (!inTheWay.length) {
    const standing = immovableIn(window, tasks, events, habits)
    const alternative = biggestGap
      ? ` The nearest opening is ${clockLabel(biggestGap.start)}–${clockLabel(biggestGap.end)}, ${Math.round(biggestGap.end - biggestGap.start)} minutes.`
      : ' There is no opening left in your working day either.'
    return {
      need,
      from,
      day: key,
      window,
      proposals: [],
      biggestGap,
      notes: [
        standing.length
          ? // Honest: the hour is taken, but by something I am not allowed to move.
            `${clockLabel(window.start)}–${clockLabel(window.end)} is ${listNames(standing)}, which I cannot move.${alternative}`
          : `Nothing is in the way. The largest opening left today is ${clockLabel(biggestGap!.start)}–${clockLabel(biggestGap!.end)} — ${Math.round(biggestGap!.end - biggestGap!.start)} minutes.`,
      ],
    }
  }

  const proposals: MoveProposal[] = []
  const first = inTheWay[0]

  // 1. Move the least important block in the way to the first gap after the window.
  const free = gapsWithout(first.iv)
  const where = free.find((g) => g.end - g.start >= first.iv.end - first.iv.start && g.end > window.start)
  if (where) {
    const dur = first.iv.end - first.iv.start
    const start = Math.max(where.start, window.end)
    const at = dayStart + start * MIN
    proposals.push({
      id: 'move',
      label: `Move “${first.task.title}” to ${clockLabel(start)}`,
      detail: `${Math.round(dur)} minutes, ${clockLabel(start)}–${clockLabel(start + dur)} — it fits after your window`,
      action: {
        type: 'move',
        match: first.task.title,
        start: at,
        end: at + dur * MIN,
      },
    })
  }

  // 2. Take it off the clock entirely.
  proposals.push({
    id: 'drop',
    label: `Take “${first.task.title}” off the clock`,
    detail: `It stays open and keeps its due date — the planner can place it another day`,
    action: { type: 'unschedule', match: first.task.title },
  })

  // 3. Shrink it to what actually fits in the window.
  const roomLeft = window.end - Math.max(window.start, first.iv.start)
  if (roomLeft >= 10 && roomLeft < first.iv.end - first.iv.start) {
    proposals.push({
      id: 'shrink',
      label: `Shorten “${first.task.title}” to ${Math.round(roomLeft)} minutes`,
      detail: 'The rest stays on your list; the clock only covers what fits',
      action: {
        type: 'schedule',
        match: first.task.title,
        when: 'at its current time',
        durationMin: Math.round(roomLeft),
      },
    })
  }

  if (inTheWay.length > 1) {
    const others = inTheWay.slice(1, 3)
    notes.push(
      `Also in the way: ${others.map((o) => `“${o.task.title}”`).join(', ')}. Freeing this window means moving one of them.`,
    )
  }
  if (window.end - window.start < need) {
    notes.push(`There is only ${Math.round(window.end - window.start)} minutes left in your working day from ${clockLabel(from)}.`)
  }

  return { need, from, day: key, window, proposals, biggestGap, notes }
}

function isWorkday(s: Settings, day: Date): boolean {
  return s.workDays.includes(day.getDay())
}

/** "a", "a and b", "a, b and c" — so a reply reads as a sentence. */
export const listNames = (names: string[]): string =>
  names.length <= 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

const clockLabel = (minutes: number): string => {
  const m = ((Math.round(minutes) % DAY_MIN) + DAY_MIN) % DAY_MIN
  return `${`${Math.floor(m / 60)}`.padStart(2, '0')}:${`${m % 60}`.padStart(2, '0')}`
}

/** Prose for the assistant to lead with. */
export function roomReply(r: RoomReport): string {
  const want = `${Math.floor(r.need / 60) ? `${Math.floor(r.need / 60)}h ` : ''}${r.need % 60 ? `${r.need % 60}m ` : ''}`.trim()
  if (!r.proposals.length) {
    return `You asked for ${want} from ${clockLabel(r.from)}. ${r.notes.join(' ')}`
  }
  const target = `${clockLabel(r.window.start)}–${clockLabel(r.window.end)}`
  return [
    `To free ${want} at ${target}, something has to give. Here are the ways:`,
    ...r.notes,
  ].join('\n')
}

