import type { Settings, Task } from '@/types'
import { MIN, addDays, daysBetween, fromKey, toKey } from './date'

/**
 * What to do right now.
 *
 * This only ever advises: it reads state, it never writes. The weights below are
 * the whole judgement, and they are deliberately few enough to argue with.
 */
export type Advice = {
  task: Task
  score: number
  /** Why this one, in the order the reasons mattered. */
  why: string
  /** When its block starts. */
  start: number
}

const W_DEADLINE = 100
const W_PRIORITY = 34
const W_ENERGY = 30
const W_COMMITMENT = 12

/** Deadline pressure: full weight at today or overdue, gone in a fortnight. */
function deadlineScore(due: string | undefined, now: number): number {
  if (!due) return W_DEADLINE * 0.25 // due some day, just not written down
  const left = daysBetween(now, fromKey(due))
  const decay = Math.max(0, Math.min(1, (14 - left) / 14))
  return W_DEADLINE * decay
}

/** The hour this kind of work does its best, in minutes from midnight. */
function idealHour(task: Task): number {
  if (task.dayPart && task.dayPart !== 'any') {
    return { morning: 9 * 60, afternoon: 13 * 60 + 30, evening: 19 * 60 }[task.dayPart]
  }
  return { deep: 9 * 60 + 30, shallow: 11 * 60, admin: 16 * 60 }[task.energy]
}

/** How well this kind of work suits the current hour: full within 90 minutes. */
function energyScore(task: Task, settings: Settings, now: number): number {
  const d = new Date(now)
  const current = d.getHours() * 60 + d.getMinutes()
  const dist = Math.abs(current - idealHour(task))
  const fit = W_ENERGY * Math.max(0, Math.min(1, (300 - dist) / 210))
  // Outside the hours you said you work, everything fits less well.
  const inHours = current >= settings.workStart && current <= settings.workEnd
  return inHours ? fit : fit * 0.5
}

function deadlinePhrase(due: string | undefined, now: number): string {
  if (!due) return 'no date set'
  const left = daysBetween(now, fromKey(due))
  if (left <= 0) return left === 0 ? 'due today' : 'overdue'
  if (left === 1) return 'due tomorrow'
  if (left < 7) return `due in ${left} days`
  if (left < 14) return `due in ${left} days`
  return `due ${toKey(addDays(new Date(now), left))}`
}

/**
 * The one to three blocks worth doing now, best first.
 *
 * Candidates are blocks you already have on the clock — this advises about the
 * plan you made, it does not invent work or move anything. Tasks that finished,
 * or whose block has not started yet, are left out: at 09:00 you do not need
 * to be told about your 16:00.
 */
export function adviseNow(tasks: Task[], settings: Settings, now: number, limit = 3): Advice[] {
  const out: Advice[] = []
  for (const task of tasks) {
    if (task.completed || !task.scheduled) continue
    if (task.durationMin <= 0) continue
    // Something already under way is not a decision, it is a fact.
    if (task.scheduled.start <= now && task.scheduled.end <= now) continue
    if (task.scheduled.start > now + 90 * MIN) continue

    const deadline = deadlineScore(task.due, now)
    const priority = ((5 - task.priority) / 4) * W_PRIORITY
    const energy = energyScore(task, settings, now)
    const commitment = task.planLocked ? W_COMMITMENT : 0

    const bits: [number, string][] = [
      [deadline, deadlinePhrase(task.due, now)],
      [priority, `P${task.priority}`],
      [energy, `${task.energy} suits this hour`],
      [commitment, 'you placed it'],
    ]
    const why = bits
      .sort((a, b) => b[0] - a[0])
      .filter(([v]) => v > 1)
      .slice(0, 2)
      .map(([, label]) => label)
      .join(' · ')

    out.push({ task, score: deadline + priority + energy + commitment, why, start: task.scheduled.start })
  }
  return out.sort((a, b) => b.score - a.score || a.start - b.start).slice(0, limit)
}