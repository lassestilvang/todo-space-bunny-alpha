import { useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Clock, Inbox, MoveRight, Plus } from 'lucide-react'
import type { ID, Project, Task } from '@/types'
import { fmtRelativeDay, fmtTime, toKey } from '@/lib/date'
import { cn, cssColor, isOverdue, minutesLabel } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, Checkbox, Empty } from '@/components/ui'

const COLUMN_W = 272
const INBOX = 'inbox'

type Col = {
  key: string
  projectId: ID | undefined
  name: string
  color?: string
  glyph?: string
}

export function KanbanView() {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const activeProject = useStore((s) => s.ui.activeProject)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const addProject = useStore((s) => s.addProject)

  const [drag, setDrag] = useState<ID | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [overCard, setOverCard] = useState<ID | null>(null)

  const all = useMemo(
    () => Object.values(projects).filter((p) => !p.archived).sort((a, b) => a.order - b.order),
    [projects],
  )

  /** `null` means "show the whole board". */
  const scoped =
    activeProject !== 'all' && activeProject !== 'none' && all.some((p) => p.id === activeProject)
      ? activeProject
      : null

  const columns = useMemo<Col[]>(() => {
    const cols: Col[] = all
      .filter((p) => !scoped || p.id === scoped)
      .map((p) => ({ key: p.id, projectId: p.id, name: p.name, color: p.color, glyph: p.glyph }))
    if (!scoped) cols.push({ key: INBOX, projectId: undefined, name: 'Inbox' })
    return cols
  }, [all, scoped])

  const byCol = useMemo(() => {
    const out: Record<string, Task[]> = {}
    for (const c of columns) out[c.key] = []
    for (const t of Object.values(tasks)) {
      if (t.completed) continue
      const key = t.projectId ?? INBOX
      if (out[key]) out[key].push(t)
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.order - b.order)
    return out
  }, [tasks, columns])

  const openTotal = columns.reduce(
    (n, c) => n + (byCol[c.key]?.length ?? 0),
    0,
  )
  const minutesTotal = columns.reduce(
    (n, c) => n + (byCol[c.key] ?? []).reduce((a, t) => a + t.durationMin, 0),
    0,
  )

  if (!all.length)
    return (
      <div className="anim-fade flex min-h-0 flex-1 flex-col">
        <BoardHeader
          open={0}
          minutes={0}
          scoped={null}
          onClearScope={() => setActiveProject('all')}
          subtitle="Projects give every task a home, a colour and a budget."
        />
        <Empty
          title="No projects yet"
          hint="A board is one column per project. Create the first one and everything you file under it lines up here."
          action={
            <Btn variant="primary" onClick={() => addProject({ name: 'New project' })}>
              <Plus size={13} />
              New project
            </Btn>
          }
        />
      </div>
    )

  return (
    <div className="anim-fade flex min-h-0 flex-1 flex-col">
      <BoardHeader
        open={openTotal}
        minutes={minutesTotal}
        scoped={scoped ? projects[scoped] : null}
        onClearScope={() => setActiveProject('all')}
        subtitle="Drag a card to another column, or to a position inside one."
      />

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3">
        <div className="flex h-full min-h-0 gap-3">
          {columns.map((col, i) => (
            <Column
              key={col.key}
              col={col}
              next={columns.length > 1 ? (columns[(i + 1) % columns.length] ?? null) : null}
              tasks={byCol[col.key] ?? []}
              drag={drag}
              overCol={overCol}
              overCard={overCard}
              onDragStart={setDrag}
              onDragEnd={() => {
                setDrag(null)
                setOverCol(null)
                setOverCard(null)
              }}
              onOverCol={(k) => {
                setOverCol(k)
                setOverCard(null)
              }}
              onOverCard={setOverCard}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function BoardHeader({
  open,
  minutes,
  scoped,
  onClearScope,
  subtitle,
}: {
  open: number
  minutes: number
  scoped: Project | null | undefined
  onClearScope: () => void
  subtitle: string
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
      <div>
        <h1 className="flex items-center gap-2 font-serif text-[23px] leading-none text-ink">
          {scoped ? scoped.name : 'Board'}
          {scoped && (
            <button
              onClick={onClearScope}
              aria-label="Show all projects"
              title="Show all projects"
              className="press rounded-[var(--radius-md)] text-[12px] text-ink-4 hover:bg-surface-3 hover:text-ink"
            >
              all projects
            </button>
          )}
        </h1>
        <p className="mt-1 text-[11px] text-ink-4">{subtitle}</p>
      </div>
      <div className="flex items-center gap-5">
        <Stat label="open" value={`${open}`} />
        <Stat label="planned" value={minutesLabel(minutes)} />
      </div>
    </header>
  )
}

function Column({
  col,
  next,
  tasks,
  drag,
  overCol,
  overCard,
  onDragStart,
  onDragEnd,
  onOverCol,
  onOverCard,
}: {
  col: Col
  next: Col | null
  tasks: Task[]
  drag: ID | null
  overCol: string | null
  overCard: ID | null
  onDragStart: (id: ID) => void
  onDragEnd: () => void
  onOverCol: (key: string | null) => void
  onOverCard: (id: ID | null) => void
}) {
  const moveTaskToProject = useStore((s) => s.moveTaskToProject)
  const reorderTask = useStore((s) => s.reorderTask)
  const toggleTask = useStore((s) => s.toggleTask)
  const setPanel = useStore((s) => s.setPanel)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const addTask = useStore((s) => s.addTask)
  const toast = useStore((s) => s.toast)

  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const color = cssColor(col.color, 'var(--color-ink-4)')
  const isOver = overCol === col.key
  const minutes = tasks.reduce((a, t) => a + t.durationMin, 0)

  const place = (id: ID, beforeId: ID | null) => {
    reorderTask(id, beforeId)
  }

  const move = (id: ID, beforeId: ID | null) => {
    if (beforeId === id) return
    moveTaskToProject(id, col.projectId)
    place(id, beforeId)
    onDragEnd()
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    const title = draft.trim()
    if (!title) return
    addTask({ title, projectId: col.projectId })
    setDraft('')
    toast({ text: `Added to ${col.name}`, kind: 'info' })
    inputRef.current?.focus()
  }

  const jump = (t: Task) => {
    if (!t.scheduled) return
    setAnchor(toKey(t.scheduled.start))
    setView('day')
  }

  /* keyboard / click fallback for dragging between columns */
  const handOver = (t: Task) => {
    if (!next) return
    moveTaskToProject(t.id, next.projectId)
    reorderTask(t.id, null)
    toast({ text: `Moved to ${next.name}`, kind: 'info' })
  }

  return (
    <section
      aria-label={`${col.name} column`}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (overCol !== col.key) onOverCol(col.key)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && overCol === col.key)
          onOverCol(null)
      }}
      onDrop={(e) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/plain') || drag
        if (id) move(id, null)
        else onDragEnd()
      }}
      className={cn(
        'flex max-h-full min-h-0 shrink-0 flex-col rounded-[var(--radius-lg)] border bg-surface/40 transition-colors',
        isOver ? 'border-signal/70 bg-signal/[0.04]' : 'border-line',
      )}
      style={{ width: COLUMN_W }}
    >
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-2">
        <span
          className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-[10px] leading-none"
          style={{
            background: `color-mix(in oklab, ${color} 22%, transparent)`,
            color,
          }}
          aria-hidden
        >
          {col.glyph ?? <Inbox size={11} />}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold tracking-tight text-ink">
          {col.name}
        </span>
        <span className="mono-clock tnum shrink-0 text-[11px] text-ink-3">{tasks.length}</span>
        <span className="mono-clock tnum shrink-0 text-[10px] text-ink-4">{minutesLabel(minutes)}</span>
      </div>

      {/* cards */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {tasks.length ? (
          <div className="flex flex-col gap-1.5">
            {tasks.map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', t.id)
                  e.dataTransfer.effectAllowed = 'move'
                  onDragStart(t.id)
                }}
                onDragEnd={onDragEnd}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onOverCard(t.id)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const id = e.dataTransfer.getData('text/plain') || drag
                  if (id) move(id, t.id)
                  else onDragEnd()
                }}
                className={cn(
                  'block-surface press relative cursor-grab rounded-[7px] py-1.5 pl-2.5 pr-1.5 active:cursor-grabbing',
                  drag === t.id && 'ghost-drag',
                  overCard === t.id && drag && drag !== t.id && 'ring-1 ring-signal/60',
                )}
                style={{ '--blk': color } as CSSProperties}
              >
                <div className="flex items-start gap-1.5">
                  <Checkbox
                    checked={t.completed}
                    onChange={() => toggleTask(t.id)}
                    size={13}
                    color={color}
                    label={`Complete ${t.title}`}
                  />
                  <button
                    onClick={() => setPanel({ kind: 'task', id: t.id })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="truncate text-[12px] leading-[1.35] text-ink">{t.title}</div>
                    <div className="mt-[2px] flex items-center gap-1.5 text-[9.5px] leading-none text-ink-4">
                      <span
                        className={cn(
                          'mono-clock tnum shrink-0 rounded-[3px] px-[3px] py-px',
                          t.priority === 1 && 'bg-signal/18 text-signal',
                          t.priority === 2 && 'text-warn',
                          t.priority > 2 && 'text-ink-4',
                        )}
                        aria-label={`priority ${t.priority}`}
                      >
                        P{t.priority}
                      </span>
                      <span
                        className={cn(
                          'mono-clock tnum shrink-0',
                          isOverdue(t) ? 'text-bad' : t.due ? 'text-ink-3' : 'text-ink-4/70',
                        )}
                      >
                        {t.due ? fmtRelativeDay(t.due) : '—'}
                      </span>
                      <span className="mono-clock tnum shrink-0 text-ink-4/80">
                        {minutesLabel(t.durationMin)}
                      </span>
                    </div>
                  </button>
                </div>
                {t.scheduled && (
                  <button
                    onClick={() => jump(t)}
                    aria-label={`Scheduled ${fmtTime(t.scheduled.start)} — open that day`}
                    title={`On the clock at ${fmtTime(t.scheduled.start)}`}
                    className="press anim-fade absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full border border-line-2 bg-surface-2 text-ink-3 hover:border-line-strong hover:text-signal"
                  >
                    <Clock size={10} />
                  </button>
                )}
                {next && (
                  <button
                    onClick={() => handOver(t)}
                    aria-label={`Move ${t.title} to ${next.name}`}
                    title={`Move to ${next.name}`}
                    className="press absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full border border-line-2 bg-surface-2 text-ink-4 opacity-0 hover:text-ink group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <MoveRight size={10} />
                  </button>
                )}
              </div>
            ))}
            {overCard === null && drag && (
              <div className="h-[2px] w-full rounded-full bg-signal/70" aria-hidden />
            )}
          </div>
        ) : (
          <div className="grid h-full min-h-[64px] place-items-center px-3 text-center text-[10.5px] leading-relaxed text-ink-4">
            {isOver ? 'drop to move here' : 'empty — nothing filed here'}
          </div>
        )}
      </div>

      {/* composer */}
      <form onSubmit={create} className="flex shrink-0 items-center gap-1.5 border-t border-line px-2 py-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="+ new task"
          aria-label={`New task in ${col.name}`}
          className="h-7 min-w-0 flex-1 rounded-[var(--radius-md)] border border-transparent bg-transparent px-1.5 text-[12px] text-ink placeholder:text-ink-4 hover:border-line focus:border-line-2 focus:bg-surface-2 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="Add task"
          disabled={!draft.trim()}
          className="press grid size-6 shrink-0 place-items-center rounded-[var(--radius-md)] text-ink-4 hover:bg-surface-3 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
        >
          <Plus size={13} />
        </button>
      </form>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.14em] text-ink-4">{label}</span>
      <span className="mono-clock tnum text-[13px] leading-none text-ink-2">{value}</span>
    </div>
  )
}
