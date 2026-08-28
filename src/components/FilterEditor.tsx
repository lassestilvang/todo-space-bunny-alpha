import { useState } from 'react'
import { Filter, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { FilterClause, TaskFilter } from '@/types'
import { Btn, IconBtn, Input, Modal } from './ui'
import { matchesFilter } from '@/lib/filters'

const SELECT =
  'h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none'

const KINDS: { kind: FilterClause['kind']; label: string }[] = [
  { kind: 'project', label: 'Project' },
  { kind: 'label', label: 'Label' },
  { kind: 'priority', label: 'Priority' },
  { kind: 'due', label: 'Due' },
  { kind: 'scheduled', label: 'On the clock' },
  { kind: 'energy', label: 'Energy' },
]

/** A first clause of the kind, so the row is always valid the moment it exists. */
function firstOf(kind: FilterClause['kind'], projects: string[], labels: string[]): FilterClause {
  switch (kind) {
    case 'project':
      return { kind, id: projects[0] ?? '' }
    case 'label':
      return { kind, id: labels[0] ?? '' }
    case 'priority':
      return { kind, priority: 1 }
    case 'due':
      return { kind, window: 'week' }
    case 'scheduled':
      return { kind, value: 'no' }
    case 'energy':
      return { kind, energy: 'deep' }
  }
}

/**
 * Create or edit a saved filter. Clauses are ANDed, so the editor's job is to
 * make that obvious: every row narrows, and the live count says by how much.
 */
export function FilterEditor({
  filterId,
  onClose,
}: {
  /** null creates a new filter. */
  filterId: string | null
  onClose: () => void
}) {
  const filters = useStore((s) => s.filters)
  const projects = useStore((s) => s.projects)
  const labels = useStore((s) => s.labels)
  const tasks = useStore((s) => s.tasks)
  const addFilter = useStore((s) => s.addFilter)
  const updateFilter = useStore((s) => s.updateFilter)
  const deleteFilter = useStore((s) => s.deleteFilter)

  const existing = filterId ? filters[filterId] : null
  const [name, setName] = useState(existing?.name ?? '')
  const [clauses, setClauses] = useState<FilterClause[]>(existing?.clauses ?? [])

  const projectIds = Object.keys(projects)
  const labelIds = Object.keys(labels)
  const draft: TaskFilter = {
    id: existing?.id ?? 'draft',
    name: name.trim() || 'Untitled filter',
    clauses,
    order: existing?.order ?? 0,
  }
  const matchCount = Object.values(tasks).filter((t) => !t.completed && matchesFilter(t, draft, Date.now())).length

  const patch = (i: number, next: FilterClause) =>
    setClauses((cs) => cs.map((c, n) => (n === i ? next : c)))

  const save = () => {
    if (existing) updateFilter(existing.id, { name: draft.name, clauses })
    else addFilter({ name: draft.name, clauses })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={560}
      title={existing ? 'Edit filter' : 'New filter'}
      footer={
        <>
          {existing && (
            <Btn
              onClick={() => {
                deleteFilter(existing.id)
                onClose()
              }}
              aria-label="Delete this filter"
              className="mr-auto border-bad/40 text-bad hover:bg-bad/10"
            >
              <Trash2 size={13} />
              Delete
            </Btn>
          )}
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={!name.trim()}>
            {existing ? 'Save' : 'Create filter'}
          </Btn>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11.5px] text-ink-3">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Deep work this week"
            className="mt-1"
            autoFocus
          />
        </label>

        <div>
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-[11.5px] text-ink-3">Conditions</span>
            <span className="mono-clock text-[10px] text-ink-4">
              {clauses.length === 0
                ? 'no conditions — every open task'
                : `${matchCount} open task${matchCount === 1 ? '' : 's'} answer this`}
            </span>
          </div>

          <div className="space-y-1.5">
            {clauses.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <select
                  value={c.kind}
                  onChange={(e) =>
                    patch(i, firstOf(e.target.value as FilterClause['kind'], projectIds, labelIds))
                  }
                  className={SELECT}
                  aria-label="Condition"
                >
                  {KINDS.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {k.label}
                    </option>
                  ))}
                </select>

                {c.kind === 'project' && (
                  <select
                    value={c.id}
                    onChange={(e) => patch(i, { kind: 'project', id: e.target.value })}
                    className={`${SELECT} flex-1`}
                    aria-label="Project"
                  >
                    {projectIds.length === 0 && <option value="">no projects yet</option>}
                    {projectIds.map((id) => (
                      <option key={id} value={id}>
                        {projects[id].name}
                      </option>
                    ))}
                  </select>
                )}
                {c.kind === 'label' && (
                  <select
                    value={c.id}
                    onChange={(e) => patch(i, { kind: 'label', id: e.target.value })}
                    className={`${SELECT} flex-1`}
                    aria-label="Label"
                  >
                    {labelIds.length === 0 && <option value="">no labels yet</option>}
                    {labelIds.map((id) => (
                      <option key={id} value={id}>
                        {labels[id].name}
                      </option>
                    ))}
                  </select>
                )}
                {c.kind === 'priority' && (
                  <select
                    value={c.priority}
                    onChange={(e) =>
                      patch(i, { kind: 'priority', priority: Number(e.target.value) as 1 | 2 | 3 | 4 })
                    }
                    className={`${SELECT} flex-1`}
                    aria-label="Priority"
                  >
                    <option value={1}>P1 · urgent</option>
                    <option value={2}>P2 · high</option>
                    <option value={3}>P3 · normal</option>
                    <option value={4}>P4 · low</option>
                  </select>
                )}
                {c.kind === 'due' && (
                  <select
                    value={c.window}
                    onChange={(e) => patch(i, { kind: 'due', window: e.target.value as never })}
                    className={`${SELECT} flex-1`}
                    aria-label="Due window"
                  >
                    <option value="overdue">overdue</option>
                    <option value="today">due today</option>
                    <option value="tomorrow">due tomorrow</option>
                    <option value="week">due this week</option>
                    <option value="none">no date set</option>
                  </select>
                )}
                {c.kind === 'scheduled' && (
                  <select
                    value={c.value}
                    onChange={(e) => patch(i, { kind: 'scheduled', value: e.target.value as 'yes' | 'no' })}
                    className={`${SELECT} flex-1`}
                    aria-label="Scheduled"
                  >
                    <option value="yes">on the clock</option>
                    <option value="no">not on the clock</option>
                  </select>
                )}
                {c.kind === 'energy' && (
                  <select
                    value={c.energy}
                    onChange={(e) => patch(i, { kind: 'energy', energy: e.target.value as never })}
                    className={`${SELECT} flex-1`}
                    aria-label="Energy"
                  >
                    <option value="deep">deep</option>
                    <option value="shallow">shallow</option>
                    <option value="admin">admin</option>
                  </select>
                )}

                <IconBtn
                  label="Remove condition"
                  onClick={() => setClauses((cs) => cs.filter((_, n) => n !== i))}
                >
                  <Trash2 size={12} />
                </IconBtn>
              </div>
            ))}
          </div>

          <Btn
            size="sm"
            className="mt-2"
            onClick={() =>
              setClauses((cs) => [...cs, firstOf('due', projectIds, labelIds)])
            }
          >
            <Plus size={12} />
            Add condition
          </Btn>
        </div>

        {clauses.length > 1 && (
          <p className="flex items-start gap-1.5 text-[10.5px] leading-snug text-ink-4">
            <Filter size={11} className="mt-[1px] shrink-0" />
            Conditions are combined with <span className="mono-clock">and</span>: a task has to
            answer all of them.
          </p>
        )}
      </div>
    </Modal>
  )
}