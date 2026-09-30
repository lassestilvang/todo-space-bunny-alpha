import { useMemo, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react'
import { Trash2, X } from 'lucide-react'
import type { ID, Priority, Project, Task } from '@/types'
import { fmtDateKey, fmtRelativeDay } from '@/lib/date'
import { cn, cssColor, isOverdue, sortTasks } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, Checkbox, Empty, Seg } from '@/components/ui'

type Order = 'priority' | 'due'

const QUADRANTS: { p: Priority; name: string; hint: string; rule: string }[] = [
  { p: 1, name: 'Do', hint: 'urgent · important', rule: 'bg-signal' },
  { p: 2, name: 'Schedule', hint: 'important, not urgent', rule: 'bg-ink-2' },
  { p: 3, name: 'Delegate', hint: 'urgent, not important', rule: 'bg-ink-3' },
  { p: 4, name: 'Eliminate', hint: 'not urgent, not important', rule: 'bg-ink-4' },
]

export function MatrixView() {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const setPanel = useStore((s) => s.setPanel)
  const setPriority = useStore((s) => s.setPriority)
  const toggleTask = useStore((s) => s.toggleTask)
  const deleteTask = useStore((s) => s.deleteTask)
  const toast = useStore((s) => s.toast)
  const undo = useStore((s) => s.undo)

  const [order, setOrder] = useState<Order>('priority')
  const [filter, setFilter] = useState<Priority | null>(null)
  const [drag, setDrag] = useState<ID | null>(null)
  const [over, setOver] = useState<Priority | 'trash' | null>(null)
  const [selected, setSelected] = useState<ID | null>(null)

  const buckets = useMemo(() => {
    const all = Object.values(tasks).filter((t) => !t.completed)
    const byPriority: Record<Priority, Task[]> = { 1: [], 2: [], 3: [], 4: [] }
    for (const t of all) byPriority[t.priority].push(t)
    for (const p of [1, 2, 3, 4] as Priority[]) {
      const base = byPriority[p]
      byPriority[p] =
        order === 'priority'
          ? sortTasks(base)
          : [...base].sort(
              (a, b) =>
                (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31') ||
                a.priority - b.priority ||
                a.order - b.order,
            )
    }
    return byPriority
  }, [tasks, order])

  const total = QUADRANTS.reduce((n, q) => n + buckets[q.p].length, 0)

  /* ---------------------------------------------------------------- actions */

  const dropOnQuadrant = (p: Priority, id: string) => {
    const task = tasks[id]
    if (!task || task.priority === p) return
    setPriority(id, p)
    setPanel({ kind: 'task', id })
    toast({
      text: `${task.title} → ${QUADRANTS.find((q) => q.p === p)?.name}`,
      kind: 'ok',
      action: { label: 'Undo', run: undo },
    })
  }

  const dropOnTrash = (id: string) => {
    const task = tasks[id]
    if (!task) return
    deleteTask(id)
    setSelected(null)
    toast({ text: `Deleted “${task.title}”`, kind: 'warn', action: { label: 'Undo', run: undo } })
  }

  const readDrag = (e: DragEvent) => e.dataTransfer.getData('text/plain') || drag

  const onCardKey = (e: KeyboardEvent, t: Task) => {
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault()
      dropOnQuadrant(Number(e.key) as Priority, t.id)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      dropOnTrash(t.id)
    }
  }

  if (total === 0 && !drag)
    return (
      <div className="anim-fade flex min-h-0 flex-1 flex-col">
        <Header
          order={order}
          setOrder={setOrder}
          filter={filter}
          setFilter={setFilter}
          count={total}
        />
        <Empty
          title="Nothing to weigh"
          hint="Every open task already sits on the clock or has been cleared. The matrix fills up as soon as you add work."
        />
      </div>
    )

  return (
    <div className="anim-fade flex min-h-0 flex-1 flex-col">
      <Header order={order} setOrder={setOrder} filter={filter} setFilter={setFilter} count={total} />

      <div className="relative flex min-h-0 flex-1 flex-col p-3 pb-11">
        <div className="flex h-full min-h-0 gap-2">
          {/* vertical axis */}
          <div className="relative w-7 shrink-0" aria-hidden>
            <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
            <span className="absolute left-1/2 top-2 -translate-x-1/2 bg-bg px-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-4 [writing-mode:vertical-rl]">
              Urgent →
            </span>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-bg px-1 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-4 [writing-mode:vertical-rl]">
              Not urgent →
            </span>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
              <Quadrant
                q={QUADRANTS[0]}
                tasks={buckets[1]}
                hidden={filter !== null && filter !== 1}
                active={filter === 1}
                drag={drag}
                over={over}
                projects={projects}
                onFilter={() => setFilter(filter === 1 ? null : 1)}
                onOver={setOver}
                onDropTask={(id) => dropOnQuadrant(1, id)}
                onFocusCard={setSelected}
                dragStart={setDrag}
                dragEnd={() => {
                  setDrag(null)
                  setOver(null)
                }}
                onKey={onCardKey}
                onOpen={(id) => setPanel({ kind: 'task', id })}
                onToggle={(id) => toggleTask(id)}
              />
              <Quadrant
                q={QUADRANTS[1]}
                tasks={buckets[2]}
                hidden={filter !== null && filter !== 2}
                active={filter === 2}
                drag={drag}
                over={over}
                projects={projects}
                onFilter={() => setFilter(filter === 2 ? null : 2)}
                onOver={setOver}
                onDropTask={(id) => dropOnQuadrant(2, id)}
                onFocusCard={setSelected}
                dragStart={setDrag}
                dragEnd={() => {
                  setDrag(null)
                  setOver(null)
                }}
                onKey={onCardKey}
                onOpen={(id) => setPanel({ kind: 'task', id })}
                onToggle={(id) => toggleTask(id)}
              />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-2">
              <Quadrant
                q={QUADRANTS[2]}
                tasks={buckets[3]}
                hidden={filter !== null && filter !== 3}
                active={filter === 3}
                drag={drag}
                over={over}
                projects={projects}
                onFilter={() => setFilter(filter === 3 ? null : 3)}
                onOver={setOver}
                onDropTask={(id) => dropOnQuadrant(3, id)}
                onFocusCard={setSelected}
                dragStart={setDrag}
                dragEnd={() => {
                  setDrag(null)
                  setOver(null)
                }}
                onKey={onCardKey}
                onOpen={(id) => setPanel({ kind: 'task', id })}
                onToggle={(id) => toggleTask(id)}
              />
              <Quadrant
                q={QUADRANTS[3]}
                tasks={buckets[4]}
                hidden={filter !== null && filter !== 4}
                active={filter === 4}
                drag={drag}
                over={over}
                projects={projects}
                onFilter={() => setFilter(filter === 4 ? null : 4)}
                onOver={setOver}
                onDropTask={(id) => dropOnQuadrant(4, id)}
                onFocusCard={setSelected}
                dragStart={setDrag}
                dragEnd={() => {
                  setDrag(null)
                  setOver(null)
                }}
                onKey={onCardKey}
                onOpen={(id) => setPanel({ kind: 'task', id })}
                onToggle={(id) => toggleTask(id)}
              />
            </div>

            {/* horizontal axis */}
            <div className="grid shrink-0 grid-cols-2 gap-2">
              <span className="text-center text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-4">
                ← Important
              </span>
              <span className="text-center text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-4">
                Not important →
              </span>
            </div>
          </div>
        </div>

        {/* trash drop target, bottom-right corner */}
        <button
          aria-label="Delete task"
          title={drag ? 'Drop to delete' : 'Select a card, then press to delete it'}
          onClick={() => selected && dropOnTrash(selected)}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            setOver('trash')
          }}
          onDragLeave={() => setOver((o) => (o === 'trash' ? null : o))}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            const id = readDrag(e)
            setDrag(null)
            if (id) dropOnTrash(id)
          }}
          className={cn(
            'press absolute bottom-2 right-3 grid size-7 place-items-center rounded-[var(--radius-md)] border border-dashed text-ink-4',
            drag || selected ? 'opacity-100' : 'opacity-45',
            over === 'trash'
              ? 'border-bad bg-bad/15 text-bad'
              : drag
                ? 'hover:border-bad hover:text-bad'
                : 'hover:border-line-strong hover:text-ink-3',
          )}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function Header({
  order,
  setOrder,
  filter,
  setFilter,
  count,
}: {
  order: Order
  setOrder: (o: Order) => void
  filter: Priority | null
  setFilter: (p: Priority | null) => void
  count: number
}) {
  const name = filter ? QUADRANTS.find((q) => q.p === filter)?.name : null
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
      <div>
        <h1 className="font-serif text-[23px] leading-none text-ink">Eisenhower</h1>
        <p className="mt-1 text-[11px] text-ink-4">
          {count} open · drag a card to re-prioritise · keys 1–4 and ⌫ work too
        </p>
      </div>
      <div className="flex items-center gap-2">
        {name && (
          <Btn size="xs" variant="quiet" onClick={() => setFilter(null)}>
            {name}
            <X size={11} />
          </Btn>
        )}
        <Seg
          value={order}
          options={[
            { value: 'priority', label: 'Priority' },
            { value: 'due', label: 'Due soon' },
          ]}
          onChange={setOrder}
        />
      </div>
    </header>
  )
}

function Quadrant({
  q,
  tasks,
  hidden,
  active,
  drag,
  over,
  projects,
  onFilter,
  onOver,
  onDropTask,
  onFocusCard,
  dragStart,
  dragEnd,
  onKey,
  onOpen,
  onToggle,
}: {
  q: (typeof QUADRANTS)[number]
  tasks: Task[]
  hidden: boolean
  active: boolean
  drag: ID | null
  over: Priority | 'trash' | null
  projects: Record<ID, Project>
  onFilter: () => void
  onOver: (p: Priority | 'trash' | null) => void
  onDropTask: (id: ID) => void
  onFocusCard: (id: ID) => void
  dragStart: (id: ID) => void
  dragEnd: () => void
  onKey: (e: KeyboardEvent, t: Task) => void
  onOpen: (id: ID) => void
  onToggle: (id: ID) => void
}) {
  const isOver = over === q.p && !!drag
  return (
    <section
      aria-label={`${q.name} — ${q.hint}`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        onOver(q.p)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onOver(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onOver(null)
        const id = e.dataTransfer.getData('text/plain')
        if (id) onDropTask(id)
      }}
      className={cn(
        'anim-rise flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface/40 transition-colors',
        isOver && 'border-signal/70 bg-signal/[0.05]',
        hidden && 'opacity-35',
      )}
    >
      <div className={cn('h-[2px] w-full shrink-0', q.rule)} aria-hidden />
      <div className="flex shrink-0 items-center justify-between gap-2 px-2.5 py-1.5">
        <button
          onClick={onFilter}
          aria-pressed={active}
          className="press flex min-w-0 items-baseline gap-2 text-left"
        >
          <span
            className={cn(
              'text-[13px] font-semibold tracking-tight',
              active ? 'text-signal' : 'text-ink',
            )}
          >
            {q.name}
          </span>
          <span className="truncate text-[10px] text-ink-4">{q.hint}</span>
        </button>
        <span className="mono-clock tnum shrink-0 text-[11px] text-ink-3">{tasks.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5">
        {hidden ? (
          <div className="grid h-full place-items-center px-2 text-center text-[10.5px] text-ink-4">
            filtered out
          </div>
        ) : tasks.length ? (
          <div className="flex flex-col gap-1.5">
            {tasks.map((t) => (
              <Card
                key={t.id}
                task={t}
                project={t.projectId ? projects[t.projectId] : undefined}
                dragging={drag === t.id}
                onDragStart={() => dragStart(t.id)}
                onDragEnd={dragEnd}
                onFocus={() => onFocusCard(t.id)}
                onKey={(e) => onKey(e, t)}
                onOpen={() => onOpen(t.id)}
                onToggle={() => onToggle(t.id)}
              />
            ))}
          </div>
        ) : (
          <div className="grid h-full min-h-[52px] place-items-center px-2 text-center text-[10.5px] text-ink-4">
            drop here
          </div>
        )}
      </div>
    </section>
  )
}

function Card({
  task,
  project,
  dragging,
  onDragStart,
  onDragEnd,
  onFocus,
  onKey,
  onOpen,
  onToggle,
}: {
  task: Task
  project?: Project
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onFocus: () => void
  onKey: (e: KeyboardEvent) => void
  onOpen: () => void
  onToggle: () => void
}) {
  const color = cssColor(project?.color, 'var(--color-ink-4)')
  const late = isOverdue(task)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onFocus={onFocus}
      className={cn(
        'block-surface press group relative cursor-grab rounded-[7px] py-1.5 pl-2.5 pr-1.5 active:cursor-grabbing',
        dragging && 'ghost-drag',
        task.completed && 'opacity-50',
      )}
      style={{ '--blk': color } as CSSProperties}
    >
      <div className="flex items-start gap-1.5">
        <Checkbox
          checked={task.completed}
          onChange={onToggle}
          size={13}
          color={color}
          label={`Complete ${task.title}`}
        />
        <button
          onClick={onOpen}
          onKeyDown={onKey}
          className="min-w-0 flex-1 text-left"
          aria-label={`${task.title}. Priority ${task.priority}. ${task.due ? `Due ${fmtDateKey(task.due)}` : 'No date'}. Press 1 to 4 to re-prioritise.`}
        >
          <div
            className={cn(
              'truncate text-[12px] leading-[1.35] text-ink',
              task.completed && 'line-through',
            )}
          >
            {task.title}
          </div>
          <div className="mt-[2px] flex items-center gap-1.5 text-[9.5px] leading-none text-ink-4">
            <span className="truncate" style={{ color: project ? color : undefined }}>
              {project?.name ?? 'Inbox'}
            </span>
            <span className="size-[2px] shrink-0 rounded-full bg-ink-4" aria-hidden />
            <span
              className={cn(
                'mono-clock tnum shrink-0',
                late && 'text-bad',
                !late && task.due && 'text-ink-3',
              )}
            >
              {task.due ? fmtRelativeDay(task.due) : '—'}
            </span>
          </div>
        </button>
      </div>
    </div>
  )
}
