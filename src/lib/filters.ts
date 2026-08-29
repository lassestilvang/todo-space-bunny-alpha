import type { FilterClause, Task, TaskFilter } from '@/types'
import { MIN, addDays, fromKey, startOfDay, toKey } from './date'
import { plannedMinutes } from './selectors'

/**
 * Saved filters.
 *
 * One matcher, used by the list view, the sidebar counts and the capture bar, so
 * the same question always gets the same answer. Clauses are ANDed: a filter is
 * a narrowing, not an OR soup. An empty filter matches everything.
 */

type DueWindow = Extract<FilterClause, { kind: 'due' }>['window']

const DUE_WORDS: Record<DueWindow, string> = {
  overdue: 'overdue',
  today: 'due today',
  tomorrow: 'due tomorrow',
  week: 'due this week',
  none: 'no date',
}

function dueIn(task: Task, window: DueWindow, now: number): boolean {
  const today = toKey(now)
  if (window === 'none') return !task.due
  if (!task.due) return false
  if (window === 'today') return task.due === today
  if (window === 'tomorrow') return task.due === toKey(addDays(new Date(now), 1))
  if (window === 'overdue') return task.due < today
  // this week: today through the end of the coming week
  const end = toKey(addDays(startOfDay(fromKey(today)), 6))
  return task.due >= today && task.due <= end
}

export function clauseHolds(task: Task, clause: FilterClause, now: number): boolean {
  const c = clause
  switch (c.kind) {
    case 'project':
      return task.projectId === c.id
    case 'label':
      return task.labelIds.includes(c.id)
    case 'priority':
      return task.priority === c.priority
    case 'due':
      return dueIn(task, c.window, now)
    case 'scheduled':
      return c.value === 'yes' ? !!task.scheduled : !task.scheduled
    case 'energy':
      return task.energy === c.energy
    default:
      return false
  }
}

/** Does this task answer the filter? */
export function matchesFilter(task: Task, filter: TaskFilter, now: number): boolean {
  return filter.clauses.every((c) => clauseHolds(task, c, now))
}

/** The tasks that answer the filter, unfinished first. */
export function filterTasks(tasks: Task[], filter: TaskFilter, now: number): Task[] {
  return tasks.filter((t) => !t.completed && matchesFilter(t, filter, now))
}

/** A short human phrase for one clause, for chips and tooltips. */
export function describeClause(
  clause: FilterClause,
  names: { projects: Record<string, string>; labels: Record<string, string> },
): string {
  switch (clause.kind) {
    case 'project':
      return `#${names.projects[clause.id] ?? 'unknown'}`
    case 'label':
      return `@${names.labels[clause.id] ?? 'unknown'}`
    case 'priority':
      return `P${clause.priority}`
    case 'due':
      return DUE_WORDS[clause.window]
    case 'scheduled':
      return clause.value === 'yes' ? 'on the clock' : 'not scheduled'
    case 'energy':
      return `${clause.energy} work`
  }
}

/** Total minutes of clock the filter's answers will ask for. */
export function filterMinutes(tasks: Task[], filter: TaskFilter, now: number): number {
  return filterTasks(tasks, filter, now).reduce((a, t) => a + plannedMinutes(t) * MIN, 0)
}