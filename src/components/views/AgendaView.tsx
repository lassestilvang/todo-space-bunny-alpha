import { useMemo, useState, type ReactNode } from 'react'
import { Clock, Lock } from 'lucide-react'
import type { CalendarItem, CalEvent, Task } from '@/types'
import {
  DAY,
  MIN,
  WEEKDAYS_SHORT,
  addDays,
  fmtDateKey,
  fmtRange,
  fmtRelativeDay,
  fmtTime,
  fromKey,
  toKey,
} from '@/lib/date'
import { planRange, toBlocks, type PlannerInput } from '@/lib/planner'
import { cn, cssColor, minutesLabel, toItems } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, Checkbox, Seg } from '@/components/ui'

type SpanValue = '7' | '14' | '21'

const SPANS: { value: SpanValue; label: string }[] = [
  { value: '7', label: '7d' },
  { value: '14', label: '14d' },
  { value: '21', label: '21d' },
]

const TITLE: Record<SpanValue, string> = {
  '7': 'Next week',
  '14': 'Next two weeks',
  '21': 'Next three weeks',
}

type DayModel = {
  key: string
  date: Date
  weekday: string
  dayNum: number
  relative: string
  today: boolean
  weekend: boolean
  workDay: boolean
  capacity: number
  focusMin: number
  meetMin: number
  allDay: CalEvent[]
  timed: CalendarItem[]
  loose: Task[]
}

export function AgendaView() {
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const habits = useStore((s) => s.habits)
  const projects = useStore((s) => s.projects)
  const settings = useStore((s) => s.settings)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const setPanel = useStore((s) => s.setPanel)
  const toggleTask = useStore((s) => s.toggleTask)
  const applyPlan = useStore((s) => s.applyPlan)
  const toast = useStore((s) => s.toast)
  const undo = useStore((s) => s.undo)

  const [span, setSpan] = useState<SpanValue>('21')
  const days = Number(span)

  const model = useMemo(() => {
    const todayKey = toKey(new Date())
    const start = fromKey(todayKey)
    const rangeEnd = start.getTime() + days * DAY
    const items = toItems(tasks, events, projects, start.getTime(), rangeEnd)
    const allEvents = Object.values(events)

    const timedByKey = new Map<string, CalendarItem[]>()
    for (const it of items) {
      if (it.allDay) continue
      const k = toKey(it.start)
      const list = timedByKey.get(k)
      if (list) list.push(it)
      else timedByKey.set(k, [it])
    }
    for (const list of timedByKey.values()) list.sort((a, b) => a.start - b.start)

    const looseByKey = new Map<string, Task[]>()
    for (const t of Object.values(tasks)) {
      if (t.completed || t.scheduled || !t.due) continue
      const list = looseByKey.get(t.due)
      if (list) list.push(t)
      else looseByKey.set(t.due, [t])
    }
    for (const list of looseByKey.values())
      list.sort((a, b) => a.priority - b.priority || a.order - b.order)

    const out: DayModel[] = []
    for (let i = 0; i < days; i++) {
      const date = addDays(start, i)
      const key = toKey(date)
      const dayStart = date.getTime()
      const timed = timedByKey.get(key) ?? []
      const allDay = allEvents.filter(
        (e) => e.allDay && e.end > dayStart && e.start < dayStart + DAY,
      )
      let focusMin = 0
      let meetMin = 0
      for (const it of timed) {
        const mins = Math.max(0, Math.round((Math.min(it.end, dayStart + DAY) - it.start) / MIN))
        if (it.kind === 'event') meetMin += mins
        else focusMin += mins
      }
      const workDay = settings.workDays.includes(date.getDay())
      out.push({
        key,
        date,
        weekday: WEEKDAYS_SHORT[date.getDay()],
        dayNum: date.getDate(),
        relative: fmtRelativeDay(key),
        today: i === 0,
        weekend: date.getDay() === 0 || date.getDay() === 6,
        workDay,
        capacity: workDay ? Math.max(0, settings.workEnd - settings.workStart) : 0,
        focusMin,
        meetMin,
        allDay,
        timed,
        loose: looseByKey.get(key) ?? [],
      })
    }
    return out
  }, [tasks, events, projects, settings, days])

  /* ---------------------------------------------------------------- actions */

  const openItem = (item: CalendarItem) =>
    setPanel({ kind: item.kind === 'task' ? 'task' : 'event', id: item.id })

  const openDay = (key: string) => {
    setAnchor(key)
    setView('day')
  }

  /** First fit for one task: real busy time, only this task as a candidate. */
  const scheduleTask = (task: Task) => {
    const todayKey = toKey(new Date())
    const from = task.due && task.due > todayKey ? task.due : todayKey
    const input: PlannerInput = {
      tasks: Object.values(tasks).map((t) => (t.id === task.id ? t : { ...t, due: undefined })),
      events: Object.values(events),
      habits: Object.values(habits),
      settings,
    }
    const report = planRange(input, from, 21, { float: false, replan: false, maxPerDay: 1 })
    const placement = report.placements.find((p) => p.taskId === task.id)
    if (!placement) {
      toast({ text: 'No opening big enough in the next three weeks', kind: 'warn' })
      return
    }
    applyPlan(toBlocks([placement]))
    const start = fromKey(placement.day).getTime() + placement.start * MIN
    toast({
      text: `${task.title} · ${fmtRelativeDay(placement.day)} ${fmtTime(start)}`,
      kind: 'ok',
      action: { label: 'Undo', run: undo },
    })
  }

  const totals = model.reduce(
    (acc, d) => {
      acc.min += d.focusMin + d.meetMin
      acc.blocks += d.timed.length
      if (!d.timed.length && !d.loose.length) acc.clear += 1
      return acc
    },
    { min: 0, blocks: 0, clear: 0 },
  )
  const firstKey = model[0]?.key ?? toKey(new Date())
  const lastKey = model[model.length - 1]?.key ?? firstKey

  return (
    <div className="anim-fade flex min-h-0 flex-1 flex-col">
      {/* ---------------------------------------------------------- header */}
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-2.5">
        <div>
          <h1 className="font-serif text-[23px] leading-none text-ink">{TITLE[span]}</h1>
          <p className="mono-clock mt-1 text-[10.5px] text-ink-4">
            {fmtDateKey(firstKey, { year: true })} — {fmtDateKey(lastKey, { year: true })}
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Stat label="blocks" value={`${totals.blocks}`} />
          <Stat label="booked" value={minutesLabel(totals.min)} />
          <Stat label="clear" value={`${totals.clear}`} />
          <Seg value={span} options={SPANS} onChange={setSpan} />
        </div>
      </header>

      {/* ----------------------------------------------------------- scroll */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {model.map((d) => {
          const planned = d.focusMin + d.meetMin
          const ratio = d.capacity ? planned / d.capacity : 0
          const tone = !d.capacity || !planned ? '' : ratio > 1 ? 'bg-bad' : ratio > 0.85 ? 'bg-warn' : 'bg-good'
          const empty = !d.timed.length && !d.loose.length && !d.allDay.length
          return (
            <section key={d.key} className="flex border-b border-line">
              {/* rail */}
              <aside
                className={cn(
                  'sticky top-0 z-10 w-[98px] shrink-0 self-start border-r border-line bg-bg px-3 py-2.5',
                  d.today && 'bg-signal/[0.06]',
                )}
              >
                <button
                  onClick={() => openDay(d.key)}
                  className="press flex w-full items-baseline gap-1.5 text-left"
                  aria-label={`Open ${fmtDateKey(d.key, { weekday: true })}`}
                >
                  <span
                    className={cn(
                      'tnum font-serif text-[21px] leading-none',
                      d.today ? 'text-signal' : d.weekend ? 'text-ink-4' : 'text-ink',
                    )}
                  >
                    {d.dayNum}
                  </span>
                  <span className="mono-clock text-[9.5px] uppercase tracking-[0.1em] text-ink-4">
                    {d.weekday}
                  </span>
                </button>
                <div
                  className={cn(
                    'mt-1 truncate text-[10.5px] leading-none',
                    d.today ? 'text-signal' : planned ? 'text-ink-3' : 'text-ink-4',
                  )}
                >
                  {d.relative}
                </div>
                {d.capacity > 0 && (
                  <div className="mono-clock tnum mt-1 text-[9.5px] leading-none text-ink-4">
                    {minutesLabel(planned)} · {Math.round(ratio * 100)}%
                  </div>
                )}
              </aside>

              {/* body */}
              <div className="min-w-0 flex-1 px-3 py-2">
                {empty ? (
                  <div className="flex min-h-[24px] items-center gap-3">
                    <span className="h-px flex-1 bg-line" aria-hidden />
                    <span className="whitespace-nowrap text-[11px] text-ink-4">
                      {d.workDay ? 'clear — nothing planned' : 'clear — day off'}
                    </span>
                    <span className="h-px flex-1 bg-line" aria-hidden />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="mono-clock text-[10px] text-ink-3">
                        {d.timed.length
                          ? `${fmtTime(d.timed[0].start)} – ${fmtTime(
                              d.timed[d.timed.length - 1].end,
                            )}`
                          : d.relative}
                      </span>
                      {d.capacity > 0 && (
                        <span className="mono-clock text-[10px] text-ink-4">
                          {minutesLabel(planned)} of {minutesLabel(d.capacity)} booked
                        </span>
                      )}
                    </div>

                    {/* load bar */}
                    <div
                      className="mt-1 flex h-[3px] w-full overflow-hidden rounded-full bg-surface-3"
                      role="img"
                      aria-label={`${minutesLabel(planned)} booked of ${
                        d.capacity ? minutesLabel(d.capacity) : 'no'
                      } workday`}
                    >
                      {d.capacity > 0 && (
                        <>
                          <div
                            className="h-full bg-ink-4"
                            style={{ width: `${Math.min(100, (d.meetMin / d.capacity) * 100)}%` }}
                          />
                          <div
                            className={cn('h-full', tone || 'bg-ink-3')}
                            style={{ width: `${Math.min(100, (d.focusMin / d.capacity) * 100)}%` }}
                          />
                        </>
                      )}
                    </div>

                    {d.allDay.map((e) => (
                      <div key={e.id} className="mt-1.5 flex items-center gap-2">
                        <span className="mono-clock w-[84px] shrink-0 text-[10px] text-ink-4">
                          all day
                        </span>
                        <span
                          className="h-4 w-[2px] shrink-0 rounded-full bg-ink-3"
                          aria-hidden
                        />
                        <button
                          onClick={() => setPanel({ kind: 'event', id: e.id })}
                          className="press min-w-0 flex-1 truncate text-left text-[12px] text-ink-2 hover:text-ink"
                        >
                          {e.title}
                        </button>
                      </div>
                    ))}

                    <div className="mt-1 flex flex-col">
                      {d.timed.map((item) => (
                        <Row
                          key={`b-${item.id}`}
                          time={fmtRange(item.start, item.end)}
                          title={item.title}
                          color={item.color}
                          done={item.done}
                          meta={minutesLabel(Math.max(0, Math.round((item.end - item.start) / MIN)))}
                          badge={item.tentative ? 'tentative' : undefined}
                          onOpen={() => openItem(item)}
                          onToggle={item.kind === 'task' ? () => toggleTask(item.id) : undefined}
                        />
                      ))}
                      {d.loose.map((t) => (
                        <Row
                          key={`f-${t.id}`}
                          time="—"
                          title={t.title}
                          color={cssColor(t.projectId ? projects[t.projectId]?.color : undefined, 'var(--color-ink-4)')}
                          meta={minutesLabel(t.durationMin)}
                          loose
                          onOpen={() => setPanel({ kind: 'task', id: t.id })}
                          onToggle={() => toggleTask(t.id)}
                          action={
                            <Btn
                              size="xs"
                              variant="quiet"
                              onClick={() => scheduleTask(t)}
                              title="Find the first opening that fits"
                            >
                              <Clock size={11} />
                              schedule
                            </Btn>
                          }
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function Row({
  time,
  title,
  color,
  meta,
  done,
  loose,
  badge,
  action,
  onOpen,
  onToggle,
}: {
  time: string
  title: string
  color: string
  meta: string
  done?: boolean
  loose?: boolean
  badge?: string
  action?: ReactNode
  onOpen: () => void
  onToggle?: () => void
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-[var(--radius-md)] px-1.5 py-[3px] hover:bg-surface-2',
        loose && 'border border-dashed border-line',
      )}
    >
      <span
        className={cn(
          'mono-clock w-[84px] shrink-0 text-[10.5px] leading-[1.4]',
          loose ? 'text-ink-4/70' : 'text-ink-3',
        )}
      >
        {time}
      </span>
      <span
        className={cn('h-4 w-[2px] shrink-0 rounded-full', loose && 'opacity-40')}
        style={{ background: color }}
        aria-hidden
      />
      {onToggle ? (
        <Checkbox checked={!!done} onChange={onToggle} color={color} />
      ) : (
        <span className="size-4 shrink-0" aria-hidden />
      )}
      <button
        onClick={onOpen}
        className={cn(
          'min-w-0 flex-1 truncate text-left text-[12.5px] leading-[1.5] hover:text-ink',
          done ? 'text-ink-4 line-through' : loose ? 'text-ink-2' : 'text-ink',
        )}
      >
        {title}
      </button>
      {badge && (
        <span className="mono-clock flex shrink-0 items-center gap-1 text-[9.5px] text-ink-4">
          <Lock size={9} />
          {badge}
        </span>
      )}
      <span className="mono-clock shrink-0 text-[10px] text-ink-4">{meta}</span>
      {action}
    </div>
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
