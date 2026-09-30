import { useMemo, useState } from 'react'
import {
  AlarmClock,
  ArrowUpRight,
  CheckCheck,
  CirclePlus,
  Flag,
  Inbox as InboxIcon,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Task, ViewId } from '@/types'
import { addDays, fmtRelativeDay, fmtTime, fromKey, toKey } from '@/lib/date'
import { planRange, toBlocks } from '@/lib/planner'
import { cn, cssColor, isOverdue, sortTasks } from '@/lib/selectors'
import { Btn, Checkbox, Empty, IconBtn, Kbd, Seg } from '../ui'

type Filter = 'all' | 'priority' | 'scheduled' | 'completed'

const COPY: Record<string, { title: string; sub: string }> = {
  inbox: {
    title: 'Inbox',
    sub: 'Everything you captured without deciding where it goes. Triage it or let the planner float it.',
  },
  today: {
    title: 'Today',
    sub: 'What is promised for today, whether or not it has a time yet.',
  },
  upcoming: {
    title: 'Upcoming',
    sub: 'Dated work that has not arrived yet.',
  },
}

export function ListView({ view, onPlan }: { view: ViewId; onPlan: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const events = useStore((s) => s.events)
  const habits = useStore((s) => s.habits)
  const settings = useStore((s) => s.settings)
  const toggle = useStore((s) => s.toggleTask)
  const update = useStore((s) => s.updateTask)
  const remove = useStore((s) => s.deleteTask)
  const schedule = useStore((s) => s.scheduleTask)
  const setPanel = useStore((s) => s.setPanel)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const toast = useStore((s) => s.toast)
  const activeProject = useStore((s) => s.ui.activeProject)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const today = toKey(new Date())
  const all = useMemo(() => Object.values(tasks), [tasks])

  const scoped = useMemo(
    () =>
      all.filter((t) =>
        activeProject === 'all' || activeProject === 'none'
          ? activeProject === 'all' || !t.projectId
          : t.projectId === activeProject,
      ),
    [all, activeProject],
  )

  const list = useMemo(() => {
    if (filter === 'completed') return sortTasks(scoped.filter((t) => t.completed))
    const open = scoped.filter((t) => !t.completed)
    switch (view) {
      case 'inbox':
        return sortTasks(open.filter((t) => !t.projectId))
      case 'today':
        return sortTasks(open.filter((t) => t.due === today || (t.scheduled && toKey(t.scheduled.start) === today)))
      case 'upcoming':
        return sortTasks(open.filter((t) => t.due && t.due > today))
      default:
        return sortTasks(open)
    }
  }, [scoped, view, filter, today])

  const filtered = useMemo(() => {
    if (filter === 'priority') return list.filter((t) => t.priority <= 2)
    if (filter === 'scheduled') return list.filter((t) => !!t.scheduled)
    return list
  }, [list, filter])

  const groups = useMemo(() => {
    const g = new Map<string, Task[]>()
    const weekEnd = toKey(addDays(new Date(), 7))
    const push = (k: string, t: Task) => {
      const arr = g.get(k) ?? []
      arr.push(t)
      g.set(k, arr)
    }
    for (const t of filtered) {
      if (t.due && t.due < today) push('Overdue', t)
      else if (t.due === today) push('Today', t)
      else if (t.due === toKey(addDays(new Date(), 1))) push('Tomorrow', t)
      else if (t.due && t.due <= weekEnd) push('This week', t)
      else if (t.due) push('Later', t)
      else if (t.scheduled) push('On the calendar', t)
      else push('No date', t)
    }
    return [...g.entries()]
  }, [filtered, today])

  const totalMin = filtered.reduce((a, t) => a + t.durationMin, 0)
  const unplacedToday = list.filter((t) => !t.scheduled && (t.due === today || isOverdue(t)))

  const placeAll = () => {
    const report = planRange(
      { tasks: all, events: Object.values(events), habits: Object.values(habits), settings },
      today,
      2,
      { float: false, replan: false, maxPerDay: 10 },
    )
    const blocks = toBlocks(report.placements)
    if (!blocks.length) {
      toast({ text: 'Nothing needs placing here', kind: 'info' })
      return
    }
    useStore.getState().applyPlan(blocks)
    toast({ text: `Placed ${blocks.length} blocks`, kind: 'ok' })
  }

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const copy = COPY[view] ?? { title: 'Tasks', sub: '' }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[860px] px-6 py-7">
        <header className="anim-rise mb-6">
          <h2 className="font-serif text-[30px] leading-none tracking-tight text-ink">{copy.title}</h2>
          <p className="mt-2 max-w-[62ch] text-[12.5px] leading-relaxed text-ink-3">{copy.sub}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Seg
              value={filter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'priority', label: 'Priority' },
                { value: 'scheduled', label: 'On the clock' },
                { value: 'completed', label: 'Done' },
              ]}
              onChange={(v) => setFilter(v as Filter)}
            />
            <span className="mono-clock text-[11px] text-ink-4">
              {filtered.length} item{filtered.length === 1 ? '' : 's'} · {Math.floor(totalMin / 60)}h{' '}
              {totalMin % 60}m estimated
            </span>
            {unplacedToday.length > 0 && (
              <Btn variant="primary" size="sm" onClick={placeAll} className="ml-auto">
                <Wand2 size={13} /> Place {unplacedToday.length} for today
              </Btn>
            )}
          </div>
        </header>

        {selected.size > 0 && (
          <div className="anim-rise sticky top-0 z-20 mb-3 flex items-center gap-2 rounded-[var(--radius-lg)] border border-line-2 bg-surface-2 px-3 py-2">
            <span className="text-[12px] text-ink-2">{selected.size} selected</span>
            <div className="flex-1" />
            <Btn size="xs" onClick={() => setFilter('priority')}>
              <Flag size={11} /> Flag P2
            </Btn>
            <Btn
              size="xs"
              onClick={() => {
                for (const id of selected) remove(id)
                setSelected(new Set())
              }}
            >
              <Trash2 size={11} /> Delete
            </Btn>
            <Btn size="xs" onClick={() => setSelected(new Set())}>
              Clear
            </Btn>
          </div>
        )}

        {groups.length === 0 && (
          <Empty
            icon={view === 'inbox' ? <InboxIcon size={22} /> : <CheckCheck size={22} />}
            title={filter === 'completed' ? 'Nothing finished yet' : 'Nothing here'}
            hint={
              filter === 'completed'
                ? 'Completed work will collect here, newest first.'
                : 'Capture something with the bar at the bottom, or press C.'
            }
            action={<Kbd>C</Kbd>}
          />
        )}

        {groups.map(([name, items]) => (
          <section key={name} className="mb-6">
            <div className="sticky top-0 z-10 flex items-center gap-2 bg-bg/90 py-1.5 backdrop-blur">
              <h3
                className={cn(
                  'text-[10.5px] font-semibold uppercase tracking-[0.14em]',
                  name === 'Overdue' ? 'text-bad' : 'text-ink-4',
                )}
              >
                {name === 'On the calendar' ? 'Has a time' : name}
              </h3>
              <span className="mono-clock text-[10px] text-ink-4">{items.length}</span>
              <span className="mono-clock ml-auto text-[10px] text-ink-4">
                {Math.floor(items.reduce((a, t) => a + t.durationMin, 0) / 60)}h{' '}
                {items.reduce((a, t) => a + t.durationMin, 0) % 60}m
              </span>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line">
              {items.map((t) => {
                const color = cssColor(t.projectId ? projects[t.projectId]?.color : undefined)
                const late = isOverdue(t)
                return (
                  <div
                    key={t.id}
                    className="group flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-0 hover:bg-surface-2"
                  >
                    <Checkbox
                      checked={t.completed}
                      color={color}
                      label={t.title}
                      onChange={() => toggle(t.id)}
                    />
                    <button
                      onClick={() => setPanel({ kind: 'task', id: t.id })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div
                        className={cn(
                          'truncate text-[13px]',
                          t.completed ? 'text-ink-4 line-through' : 'text-ink',
                        )}
                      >
                        {t.title}
                      </div>
                    </button>

                    {t.recurrence && <span className="shrink-0 text-[10px] text-ink-4">↻</span>}
                    {t.priority <= 2 && (
                      <span
                        className="mono-clock shrink-0 rounded-full px-1.5 py-[1px] text-[9.5px]"
                        style={{
                          color: t.priority === 1 ? 'var(--color-bad)' : 'var(--color-c-ember)',
                          background:
                            t.priority === 1
                              ? 'color-mix(in oklab, var(--color-bad) 14%, transparent)'
                              : 'color-mix(in oklab, var(--color-c-ember) 14%, transparent)',
                        }}
                      >
                        P{t.priority}
                      </span>
                    )}
                    <span className="mono-clock hidden w-9 shrink-0 text-right text-[10.5px] text-ink-4 sm:block">
                      {t.durationMin}m
                    </span>
                    {t.scheduled ? (
                      <button
                        onClick={() => {
                          setAnchor(toKey(t.scheduled!.start))
                          setView('day')
                        }}
                        className="mono-clock press shrink-0 rounded-full border border-line px-2 py-[2px] text-[10px] text-ink-2 hover:border-signal/50 hover:text-signal"
                      >
                        {fmtTime(t.scheduled.start)}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          'mono-clock shrink-0 text-[10.5px]',
                          late ? 'text-bad' : 'text-ink-4',
                        )}
                      >
                        {fmtRelativeDay(t.due)}
                      </span>
                    )}

                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                      <IconBtn
                        label="Select"
                        className="h-6 w-6"
                        active={selected.has(t.id)}
                        onClick={() => toggleSel(t.id)}
                      >
                        <CheckCheck size={11} />
                      </IconBtn>
                      <IconBtn
                        label="Cycle priority"
                        className="h-6 w-6"
                        onClick={() =>
                          update(t.id, {
                            priority: t.priority >= 4 ? 1 : ((t.priority + 1) as Task['priority']),
                          })
                        }
                      >
                        <Flag size={11} />
                      </IconBtn>
                      {t.due && (
                        <IconBtn
                          label="Push one day"
                          className="h-6 w-6"
                          onClick={() => update(t.id, { due: toKey(addDays(fromKey(t.due!), 1)) })}
                        >
                          <ArrowUpRight size={11} />
                        </IconBtn>
                      )}
                      <IconBtn
                        label={t.scheduled ? 'Take off the clock' : 'Put on the clock'}
                        className="h-6 w-6"
                        onClick={() => {
                          if (t.scheduled) {
                            schedule(t.id, null)
                            return
                          }
                          const report = planRange(
                            {
                              tasks: all,
                              events: Object.values(events),
                              habits: Object.values(habits),
                              settings,
                            },
                            t.due ?? today,
                            5,
                            { float: false, replan: false, maxPerDay: 20 },
                          )
                          const hit = report.placements.find((p) => p.taskId === t.id)
                          if (!hit) {
                            toast({ text: `No opening for “${t.title}” this week`, kind: 'warn' })
                            return
                          }
                          const [b] = toBlocks([hit])
                          schedule(t.id, { start: b.start, end: b.end })
                          toast({ text: `${t.title} → ${fmtTime(b.start)}`, kind: 'ok' })
                        }}
                      >
                        {t.scheduled ? <AlarmClock size={11} /> : <CirclePlus size={11} />}
                      </IconBtn>
                      <IconBtn
                        label="Delete"
                        className="h-6 w-6 hover:text-bad"
                        onClick={() => remove(t.id)}
                      >
                        <Trash2 size={11} />
                      </IconBtn>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}

        {unplacedToday.length > 0 && (
          <div className="panel anim-rise flex items-center gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] text-ink">
                {unplacedToday.length} task{unplacedToday.length === 1 ? '' : 's'} for today still
                have no time
              </div>
              <div className="text-[11.5px] text-ink-4">
                The planner can lay them out in the gaps you already have.
              </div>
            </div>
            <Btn variant="primary" size="sm" onClick={onPlan}>
              <Wand2 size={13} /> Plan
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}
