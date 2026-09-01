import { describe, expect, it } from 'vitest'
import type { Task, TaskFilter } from '@/types'
import { describeClause, filterTasks, matchesFilter } from './filters'

const DAY = '2026-10-01'
const at = (h: number, m = 0) => {
  const d = new Date(`${DAY}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

let n = 0
const task = (over: Partial<Task> = {}): Task => ({
  id: `t${++n}`,
  title: `task ${n}`,
  notes: '',
  completed: false,
  createdAt: at(8),
  updatedAt: at(8),
  due: DAY,
  dueHasTime: false,
  scheduled: null,
  priority: 3,
  durationMin: 30,
  energy: 'shallow',
  dayPart: 'any',
  labelIds: [],
  subtasks: [],
  reminders: [],
  pinned: false,
  order: 0,
  planLocked: false,
  completedStreak: 0,
  ...over,
})

const filter = (clauses: TaskFilter['clauses']): TaskFilter => ({
  id: 'f',
  name: 'f',
  clauses,
  order: 0,
})

const NOW = at(23, 59)
/** The name maps the surfaces build: id to name. */
const projects = { p1: 'Studio' }
const labels = { l1: 'errand' }
const folders = { fo1: 'Work' }
const folderOf = (id?: string) => (id === 'p1' ? 'fo1' : undefined)

describe('conditions', () => {
  it('asks about a project, a label and a priority', () => {
    const t = task({ projectId: 'p1', labelIds: ['l1'], priority: 1 })
    expect(matchesFilter(t, filter([{ kind: 'project', id: 'p1' }]), NOW)).toBe(true)
    expect(matchesFilter(t, filter([{ kind: 'label', id: 'l1' }]), NOW)).toBe(true)
    expect(matchesFilter(t, filter([{ kind: 'priority', priority: 1 }]), NOW)).toBe(true)
    expect(matchesFilter(t, filter([{ kind: 'priority', priority: 2 }]), NOW)).toBe(false)
  })

  it('asks about a folder by way of its projects', () => {
    const filed = task({ projectId: 'p1' })
    const loose = task()
    const inFolder = filter([{ kind: 'folder', id: 'fo1' }])
    expect(matchesFilter(filed, inFolder, NOW, folderOf)).toBe(true)
    // A task with no project is not in a folder, whatever else matches.
    expect(matchesFilter(loose, inFolder, NOW, folderOf)).toBe(false)
  })

  it('asks about a due window', () => {
    const overdue = task({ due: '2026-09-30' })
    const later = task({ due: '2026-10-09' })
    const undated = task({ due: undefined })
    expect(matchesFilter(overdue, filter([{ kind: 'due', window: 'overdue' }]), NOW)).toBe(true)
    expect(matchesFilter(later, filter([{ kind: 'due', window: 'overdue' }]), NOW)).toBe(false)
    expect(matchesFilter(undated, filter([{ kind: 'due', window: 'none' }]), NOW)).toBe(true)
    expect(matchesFilter(task({ due: DAY }), filter([{ kind: 'due', window: 'today' }]), NOW)).toBe(true)
    expect(
      matchesFilter(task({ due: '2026-10-02' }), filter([{ kind: 'due', window: 'tomorrow' }]), NOW),
    ).toBe(true)
  })

  it('asks whether work is on the clock', () => {
    const placed = task({ scheduled: { start: at(9), end: at(10) } })
    expect(matchesFilter(placed, filter([{ kind: 'scheduled', value: 'yes' }]), NOW)).toBe(true)
    expect(matchesFilter(placed, filter([{ kind: 'scheduled', value: 'no' }]), NOW)).toBe(false)
    expect(matchesFilter(task(), filter([{ kind: 'scheduled', value: 'no' }]), NOW)).toBe(true)
  })
})

describe('combining conditions', () => {
  it('narrows: every clause has to hold', () => {
    const deep = task({ energy: 'deep', priority: 1 })
    const both = filter([
      { kind: 'priority', priority: 1 },
      { kind: 'energy', energy: 'deep' },
    ])
    expect(matchesFilter(deep, both, NOW)).toBe(true)
    expect(matchesFilter(task({ energy: 'shallow', priority: 1 }), both, NOW)).toBe(false)
  })

  it('matches everything when there are no conditions', () => {
    expect(matchesFilter(task(), filter([]), NOW)).toBe(true)
  })
})

describe('the answers', () => {
  it('leaves finished work out', () => {
    const tasks = [task(), task({ completed: true })]
    expect(filterTasks(tasks, filter([]), NOW)).toHaveLength(1)
  })

  it('carries the folder resolver through', () => {
    const tasks = [task({ projectId: 'p1' }), task()]
    expect(filterTasks(tasks, filter([{ kind: 'folder', id: 'fo1' }]), NOW, folderOf)).toHaveLength(1)
  })
})

describe('describing a clause', () => {
  it('reads back in the words the editor used', () => {
    const names = { projects, labels, folders }
    expect(describeClause({ kind: 'project', id: 'p1' }, names)).toBe('#Studio')
    expect(describeClause({ kind: 'label', id: 'l1' }, names)).toBe('@errand')
    expect(describeClause({ kind: 'priority', priority: 2 }, names)).toBe('P2')
    expect(describeClause({ kind: 'folder', id: 'fo1' }, names)).toBe('in Work')
    expect(describeClause({ kind: 'due', window: 'week' }, names)).toBe('due this week')
    expect(describeClause({ kind: 'scheduled', value: 'no' }, names)).toBe('not scheduled')
    expect(describeClause({ kind: 'energy', energy: 'deep' }, names)).toBe('deep work')
  })

  it('says so rather than guessing when a name is gone', () => {
    expect(describeClause({ kind: 'project', id: 'nope' }, { projects, labels })).toBe('#unknown')
  })
})