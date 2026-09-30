import { useMemo } from 'react'
import {
  AlarmClock,
  Check,
  Clock3,
  Flame,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Wand2,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { Task } from '@/types'
import { atMinutes, fmtDuration, fmtRelativeDay, fmtTime, toKey } from '@/lib/date'
import { cn, cssColor, isOverdue, sortTasks } from '@/lib/selectors'
import { clearItemPayload, setItemPayload } from '@/lib/drag'
import { Btn, Checkbox, Empty, Ring } from './ui'
import { planRange, toBlocks } from '@/lib/planner'

const ENERGY_ICON = { deep: Sparkles, shallow: Sun, admin: Moon } as const
const ENERGY_HINT = {
  deep: 'Deep work — needs your peak hours',
  shallow: 'Shallow — fine on low battery',
  admin: 'Admin — paperwork, low stakes',
} as const

export function DayRail({
  day,
  floaters,
  onPlan,
}: {
  day: string
  floaters: Task[]
  onPlan: () => void
}) {
  const tasks = useStore((s) => s.tasks)
  const habits = useStore((s) => s.habits)
  const projects = useStore((s) => s.projects)
  const events = useStore((s) => s.events)
  const settings = useStore((s) => s.settings)
  const toggleTask = useStore((s) => s.toggleTask)
  const scheduleTask = useStore((s) => s.scheduleTask)
  const setPanel = useStore((s) => s.setPanel)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const toast = useStore((s) => s.toast)

  const all = useMemo(() => Object.values(tasks), [tasks])
  const overdue = useMemo(
    () => sortTasks(all.filter((t) => !t.completed && isOverdue(t))),
    [all],
  )
  const todayHabits = useMemo(
    () =>
      Object.values(habits)
        .filter((h) => !h.archived)
        .filter((h) => (h.cadence === 'daily' ? true : h.cadence === 'weekdays' ? dayKeyWeekday(day) : h.weekdays.includes(dayKeyWeekday(day))))
        .sort((a, b) => a.order - b.order),
    [habits, day],
  )
  const habitsDone = todayHabits.filter((h) => h.log.includes(day)).length
  const dayEvents = Object.values(events).filter(
    (e) => !e.allDay && toKey(e.start) === day,
  )
  const scheduledCount = all.filter(
    (t) => !t.completed && t.scheduled && toKey(t.scheduled.start) === day,
  ).length
  const totalMin = all
    .filter((t) => !t.completed && t.scheduled && toKey(t.scheduled.start) === day)
    .reduce((a, t) => a + t.durationMin, 0)

  const workdayMin = Math.max(1, settings.workEnd - settings.workStart)
  const booked = Math.min(1, totalMin / workdayMin)

  const placeOne = (task: Task) => {
    const report = planRange(
      {
        tasks: all,
        events: Object.values(events),
        habits: Object.values(habits),
        settings,
      },
      day,
      5,
      { float: false, replan: false, maxPerDay: 20 },
    )
    const hit = report.placements.find((p) => p.taskId === task.id)
    if (!hit) {
      toast({ text: `No opening big enough for “${task.title}”`, kind: 'warn' })
      return
    }
    const [block] = toBlocks([hit])
    scheduleTask(task.id, { start: block.start, end: block.end })
    toast({ text: `Placed at ${fmtTime(block.start)} · ${hit.reason}`, kind: 'ok' })
  }

  const nothing =
    floaters.length === 0 && overdue.length === 0 && todayHabits.length === 0

  return (
    <aside className="flex w-[292px] shrink-0 flex-col border-l border-line bg-bg">
      {/* day summary */}
      <div className="border-b border-line px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Ring
            value={booked}
            size={42}
            color="var(--signal)"
          >
            <span className="mono-clock text-[10px]">{Math.round(totalMin / 60)}h</span>
          </Ring>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">
              {scheduledCount} block{scheduledCount === 1 ? '' : 's'} on the clock
            </div>
            <div className="mono-clock text-[10.5px] text-ink-4">
              {fmtDuration(totalMin)} of {fmtDuration(workdayMin)} booked · {dayEvents.length} meeting
              {dayEvents.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <Btn variant="primary" size="sm" onClick={onPlan} className="mt-3 w-full justify-center">
          <Wand2 size={13} /> Plan my day
        </Btn>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {/* habits */}
        {todayHabits.length > 0 && (
          <section className="mb-4">
            <Header
              icon={<Flame size={11} />}
              title="Habits"
              count={`${habitsDone}/${todayHabits.length}`}
            />
            <div className="space-y-px">
              {todayHabits.map((h) => {
                const done = h.log.includes(day)
                return (
                  <div key={h.id} className="flex items-center gap-2.5 rounded-[7px] px-1.5 py-1.5 hover:bg-surface-2">
                    <Checkbox
                      checked={done}
                      label={h.name}
                      color={cssColor(h.color)}
                      onChange={() => useStore.getState().toggleHabit(h.id, day)}
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[12.5px]',
                        done ? 'text-ink-4 line-through' : 'text-ink-2',
                      )}
                    >
                      {h.name}
                    </span>
                    {h.anchorMin !== null && (
                      <span className="mono-clock text-[9.5px] text-ink-4">
                        {fmtTime(atMinutes(new Date(2000, 0, 1), h.anchorMin))}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* not yet placed */}
        <section className="mb-4">
          <Header
            icon={<Clock3 size={11} />}
            title="Not yet placed"
            count={String(floaters.length)}
          />
          {floaters.length === 0 ? (
            <div className="px-1.5 py-1 text-[11.5px] text-ink-4">
              Everything for this day has a time.
            </div>
          ) : (
            <div className="space-y-px">
              {floaters.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) =>
                    setItemPayload(e, { kind: 'task', id: t.id, minutes: t.durationMin || 30, title: t.title })
                  }
                  onDragEnd={clearItemPayload}
                  onClick={() => setPanel({ kind: 'task', id: t.id })}
                  title="Drag onto the grid to schedule it"
                  className="group flex cursor-pointer items-start gap-2 rounded-[7px] px-1.5 py-1.5 hover:bg-surface-2"
                >
                  <Checkbox
                    checked={t.completed}
                    label={t.title}
                    color={cssColor(t.projectId ? projects[t.projectId]?.color : undefined)}
                    onChange={() => toggleTask(t.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] leading-tight text-ink">{t.title}</div>
                    <div className="mono-clock mt-[3px] flex items-center gap-1.5 text-[9.5px] text-ink-4">
                      {t.durationMin}m
                      {t.dayPart !== 'any' && <span className="text-ink-3">· {t.dayPart}</span>}
                      {t.priority <= 2 && <span className="text-rose">· P{t.priority}</span>}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      placeOne(t)
                    }}
                    title="Find the first opening that fits"
                    className="press mt-px grid size-6 shrink-0 place-items-center rounded-[6px] text-ink-4 opacity-0 hover:bg-surface-3 hover:text-signal group-hover:opacity-100"
                  >
                    <Wand2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* overdue */}
        {overdue.length > 0 && (
          <section>
            <Header icon={<AlarmClock size={11} />} title="Overdue" count={String(overdue.length)} />
            <div className="space-y-px">
              {overdue.map((t) => (
                <div
                  key={t.id}
                  draggable
                  onDragStart={(e) =>
                    setItemPayload(e, { kind: 'task', id: t.id, minutes: t.durationMin || 30, title: t.title })
                  }
                  onDragEnd={clearItemPayload}
                  onClick={() => setPanel({ kind: 'task', id: t.id })}
                  title="Drag onto the grid to schedule it"
                  className="flex cursor-pointer items-center gap-2.5 rounded-[7px] px-1.5 py-1.5 hover:bg-surface-2"
                >
                  <Checkbox checked={t.completed} label={t.title} onChange={() => toggleTask(t.id)} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">{t.title}</span>
                  <span className="mono-clock shrink-0 text-[9.5px] text-bad">
                    {fmtRelativeDay(t.due)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {nothing && (
          <Empty
            icon={<Check size={22} />}
            title="Clear"
            hint="Nothing is waiting for a time slot on this day."
          />
        )}

        <Btn
          variant="quiet"
          size="sm"
          className="mt-3 w-full justify-center"
          onClick={() => {
            setAnchor(day)
            setView('agenda')
          }}
        >
          Open the full agenda
        </Btn>
      </div>
    </aside>
  )
}

function dayKeyWeekday(key: string): number {
  const d = new Date(`${key}T00:00:00`)
  return d.getDay()
}

function Header({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode
  title: string
  count?: string
}) {
  return (
    <div className="flex items-center gap-1.5 px-1.5 pb-1.5 pt-1">
      <span className="text-ink-4">{icon}</span>
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
        {title}
      </span>
      <span className="mono-clock ml-auto text-[10px] text-ink-4">{count}</span>
    </div>
  )
}

const PART_ICON = { morning: Sunrise, afternoon: Sun, evening: Sunset, any: Clock3 } as const

export function PartBadge({ part }: { part: Task['dayPart'] }) {
  const Icon = PART_ICON[part]
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] capitalize text-ink-3">
      <Icon size={11} />
      {part}
    </span>
  )
}

export function EnergyBadge({ energy }: { energy: Task['energy'] }) {
  const Icon = ENERGY_ICON[energy]
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] text-ink-3" title={ENERGY_HINT[energy]}>
      <Icon size={11} />
      {energy}
    </span>
  )
}
