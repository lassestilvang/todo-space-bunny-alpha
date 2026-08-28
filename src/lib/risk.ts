import type { CalendarItem, Task } from '@/types'
import { atMinutes, fromKey, toKey } from './date'

/** The moment a task's due date runs out: the end of that local day. */
export function dueBy(key: string): number {
  return atMinutes(fromKey(key), 24 * 60)
}

export type RiskKind =
  /** It has a block, but the block ends after the day it was due. */
  | 'late'
  /** It is due now or already was, and has no time on the clock at all. */
  | 'unplaced'

/**
 * Why a task is at risk, or null when it is fine.
 *
 * Derived on the spot and never stored, so the grid, the rail, the lists and the
 * sidebar cannot disagree about the same task.
 */
export function riskFor(task: Task, now: number): RiskKind | null {
  if (task.completed || !task.due || task.durationMin <= 0) return null
  const by = dueBy(task.due)
  if (task.scheduled) return task.scheduled.end > by ? 'late' : null
  // No block: only a risk once the day itself has arrived.
  return by <= atMinutes(fromKey(toKey(now)), 24 * 60) ? 'unplaced' : null
}

/** A task block on the grid is at risk only when it finishes after its due date. */
export function riskForItem(item: CalendarItem, now: number): RiskKind | null {
  if (item.kind !== 'task') return null
  return riskFor(item.ref as Task, now)
}

export type RiskReport = {
  late: Task[]
  unplaced: Task[]
  /** Total at risk. */
  total: number
}

const EMPTY: RiskReport = { late: [], unplaced: [], total: 0 }

/** Every at-risk task due inside a window, inclusive of both ends. */
export function riskReport(tasks: Task[], from: string, to: string, now: number): RiskReport {
  const late: Task[] = []
  const unplaced: Task[] = []
  for (const t of tasks) {
    if (!t.due || t.due < from || t.due > to) continue
    const kind = riskFor(t, now)
    if (kind === 'late') late.push(t)
    else if (kind === 'unplaced') unplaced.push(t)
  }
  return { late, unplaced, total: late.length + unplaced.length }
}

export { EMPTY as NO_RISK }

/** "1 finishes after its due date · 2 have no time yet" */
export function riskSentence(r: RiskReport): string {
  const bits: string[] = []
  if (r.late.length) bits.push(`${r.late.length} finish${r.late.length === 1 ? 'es' : ''} after the due date`)
  if (r.unplaced.length) bits.push(`${r.unplaced.length} ha${r.unplaced.length === 1 ? 's' : 've'} no time yet`)
  return bits.join(' · ')
}
