import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { CalendarItem, CalEvent, Task } from '@/types'
import {
  DAY,
  WEEKDAYS_SHORT,
  daysBetween,
  fmtDateKey,
  fmtDuration,
  fmtTime,
  fromKey,
  isoWeekNumber,
  startOfWeek,
  toKey,
} from '@/lib/date'
import { cn, toItems } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, MenuItem, Popover } from '@/components/ui'

const MAX_CHIPS = 3
const RAIL = 34
const HEAD = [...WEEKDAYS_SHORT.slice(1), WEEKDAYS_SHORT[0]]

type Band = { event: CalEvent; start: number; span: number }

type DayCell = {
  key: string
  day: Date
  inMonth: boolean
  today: boolean
  week: number
  chips: CalendarItem[]
  loose: Task[]
}

type Week = { start: number; days: DayCell[]; bands: Band[] }

type MonthData = {
  weeks: Week[]
  allDay: CalEvent[]
  blocks: number
  events: number
  focusMin: number
  due: number
}

export function MonthView() {
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const projects = useStore((s) => s.projects)
  const anchor = useStore((s) => s.ui.anchor)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const setPanel = useStore((s) => s.setPanel)
  const addTask = useStore((s) => s.addTask)
  const toast = useStore((s) => s.toast)

  const [overflow, setOverflow] = useState<{ key: string; el: HTMLElement } | null>(null)
  const lastClick = useRef<{ key: string; t: number } | null>(null)

  /* ------------------------------------------------------------------ model */

  const data: MonthData = useMemo(() => {
    const a = fromKey(anchor)
    const first = new Date(a.getFullYear(), a.getMonth(), 1)
    const monthStart = first.getTime()
    const monthEnd = new Date(a.getFullYear(), a.getMonth() + 1, 1).getTime()
    const lead = (first.getDay() + 6) % 7
    const daysInMonth = new Date(a.getFullYear(), a.getMonth() + 1, 0).getDate()
    const nWeeks = Math.ceil((lead + daysInMonth) / 7)

    // Calendar arithmetic, not `+ 24h` steps: a DST week is 23 or 25 hours
    // long and naive millisecond math lands a day cell on the wrong date.
    const gridStart = startOfWeek(first, 1)
    const gridEnd = new Date(gridStart)
    gridEnd.setDate(gridEnd.getDate() + nWeeks * 7)
    const gridStartMs = gridStart.getTime()
    const gridEndMs = gridEnd.getTime()

    const keys: string[] = []
    const cursor = new Date(gridStart)
    for (let i = 0; i < nWeeks * 7; i++) {
      keys.push(toKey(cursor))
      cursor.setDate(cursor.getDate() + 1)
    }

    const items = toItems(tasks, events, projects, gridStartMs, gridEndMs)

    const timedByKey = new Map<string, CalendarItem[]>()
    for (const it of items) {
      if (it.allDay) continue
      const k = toKey(it.start)
      const list = timedByKey.get(k)
      if (list) list.push(it)
      else timedByKey.set(k, [it])
    }
    for (const list of timedByKey.values()) list.sort((x, y) => x.start - y.start)

    const looseByKey = new Map<string, Task[]>()
    for (const t of Object.values(tasks)) {
      if (t.completed || t.scheduled || !t.due) continue
      const list = looseByKey.get(t.due)
      if (list) list.push(t)
      else looseByKey.set(t.due, [t])
    }
    for (const list of looseByKey.values()) list.sort((x, y) => x.priority - y.priority || x.order - y.order)

    const allDay = Object.values(events)
      .filter((e) => e.allDay && e.end > gridStartMs && e.start < gridEndMs)
      .sort((x, y) => x.start - y.start)

    const todayKey = toKey(new Date())
    const weeks: Week[] = []
    for (let w = 0; w < nWeeks; w++) {
      const days: DayCell[] = keys.slice(w * 7, w * 7 + 7).map((key) => {
        const day = fromKey(key)
        return {
          key,
          day,
          inMonth: day.getTime() >= monthStart && day.getTime() < monthEnd,
          today: key === todayKey,
          week: isoWeekNumber(day),
          chips: timedByKey.get(key) ?? [],
          loose: looseByKey.get(key) ?? [],
        }
      })
      const wStart = fromKey(days[0].key).getTime()
      const wEnd = fromKey(days[6].key).getTime() + DAY
      const bands: Band[] = []
      for (const e of allDay) {
        if (e.end <= wStart || e.start >= wEnd) continue
        const from = Math.max(0, Math.min(6, daysBetween(wStart, Math.max(e.start, wStart))))
        const to = Math.max(
          from,
          Math.min(6, daysBetween(wStart, Math.min(e.end - 1, wEnd - 1))),
        )
        bands.push({ event: e, start: from, span: to - from + 1 })
      }
      weeks.push({ start: wStart, days, bands })
    }

    const inMonth = items.filter((i) => i.start >= monthStart && i.start < monthEnd)
    const focusMin = inMonth
      .filter((i) => i.kind === 'task')
      .reduce((acc, i) => acc + (i.end - i.start) / 60_000, 0)
    const lastKey = keys[nWeeks * 7 - 1]
    const due = Object.values(tasks).filter(
      (t) => !t.completed && !!t.due && t.due >= toKey(new Date(monthStart)) && t.due <= lastKey,
    ).length

    return {
      weeks,
      allDay,
      blocks: inMonth.filter((i) => i.kind === 'task').length,
      events: inMonth.filter((i) => i.kind === 'event' && !i.allDay).length,
      focusMin,
      due,
    }
  }, [anchor, tasks, events, projects])

  /* ---------------------------------------------------------------- actions */

  const gotoDay = (key: string) => {
    setAnchor(key)
    setView('day')
  }

  const shiftMonth = (delta: number) => {
    const a = fromKey(anchor)
    setAnchor(toKey(new Date(a.getFullYear(), a.getMonth() + delta, 1)))
  }

  const newTask = (key: string) => {
    const id = addTask({ title: 'New task', due: key })
    setAnchor(key)
    setPanel({ kind: 'task', id })
    toast({ text: 'New task — name it in the panel', kind: 'info' })
  }

  const openItem = (item: CalendarItem) =>
    setPanel({ kind: item.kind === 'task' ? 'task' : 'event', id: item.id })

  const openDayCell = (key: string) => {
    const now = Date.now()
    const prev = lastClick.current
    if (prev && prev.key === key && now - prev.t < 400) {
      lastClick.current = null
      return
    }
    lastClick.current = { key, t: now }
    gotoDay(key)
  }

  const popKey = overflow?.key
  const todayKey = toKey(new Date())

  return (
    <div className="anim-fade flex min-h-0 flex-1 flex-col">
      {/* ---------------------------------------------------------- header */}
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-line px-4 py-1.5">
        <div className="flex items-center gap-1">
          <Btn size="xs" variant="quiet" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={12} />
            month
          </Btn>
          <Btn size="xs" variant="quiet" onClick={() => shiftMonth(1)}>
            month
            <ChevronRight size={12} />
          </Btn>
          <Btn
            size="xs"
            variant="quiet"
            className="ml-1"
            onClick={() => setAnchor(todayKey)}
            disabled={anchor === todayKey}
          >
            Today
          </Btn>
        </div>

        <div className="flex items-center gap-5">
          <Stat label="blocks" value={`${data.blocks}`} />
          <Stat label="events" value={`${data.events}`} />
          <Stat label="focus" value={fmtDuration(Math.round(data.focusMin))} />
          <Stat label="due" value={`${data.due}`} />
        </div>
      </header>

      {/* ----------------------------------------------------- weekday rail */}
      <div
        className="grid shrink-0 border-b border-line bg-surface/60"
        style={{ gridTemplateColumns: `${RAIL}px repeat(7, minmax(0, 1fr))` }}
      >
        <div className="mono-clock grid place-items-center text-[9px] text-ink-4" aria-hidden>
          W
        </div>
        {HEAD.map((d, i) => (
          <div
            key={d}
            className={cn(
              'border-l border-line py-1 text-center text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-4',
              i > 4 && 'text-ink-4/70',
            )}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------ grid */}
      <div className="flex min-h-0 flex-1 flex-col">
        {data.weeks.map((week) => (
          <div
            key={week.start}
            role="row"
            className="grid min-h-[104px] flex-1 border-b border-line last:border-b-0"
            style={{
              gridTemplateColumns: `${RAIL}px repeat(7, minmax(0, 1fr))`,
              gridTemplateRows: 'auto minmax(0, 1fr)',
            }}
          >
            <div
              className="mono-clock row-span-2 flex items-start justify-center pt-1.5 text-[9px] leading-none text-ink-4/80"
              aria-hidden
            >
              {week.days[0].week}
            </div>

            {/* all-day band spanning the week */}
            <div className="anim-fade col-span-7 grid min-h-0 grid-cols-7 border-b border-l border-line/70">
              {week.bands.map((b) => (
                <button
                  key={b.event.id}
                  onClick={() => setPanel({ kind: 'event', id: b.event.id })}
                  title={b.event.title}
                  className="press mx-px my-[3px] flex min-w-0 items-center gap-1 overflow-hidden rounded-[4px] border border-line-2 bg-surface-2 px-1.5 text-left text-[10px] text-ink-2 hover:border-line-strong hover:text-ink"
                  style={{ gridColumn: `${b.start + 1} / span ${b.span}` }}
                >
                  <span
                    className="size-[5px] shrink-0 rounded-[1px]"
                    style={{ background: b.event.color ? `var(--color-${b.event.color})` : 'var(--color-ink-4)' }}
                    aria-hidden
                  />
                  <span className="truncate">{b.event.title}</span>
                </button>
              ))}
            </div>

            <div className="col-span-7 grid grid-cols-7 border-l border-line">
              {week.days.map((cell) => {
              const shown = cell.chips.slice(0, MAX_CHIPS)
              const rest = cell.loose.slice(0, MAX_CHIPS - shown.length)
              const hidden = cell.chips.length + cell.loose.length - shown.length - rest.length
              const isOpen = popKey === cell.key
              return (
                <div
                  key={cell.key}
                  role="gridcell"
                  aria-label={fmtDateKey(cell.key, { weekday: true })}
                  onClick={() => openDayCell(cell.key)}
                  onDoubleClick={() => newTask(cell.key)}
                  className={cn(
                    'group/cell relative flex min-w-0 flex-col gap-[2px] border-l border-line p-1 transition-colors',
                    cell.inMonth ? 'bg-transparent hover:bg-surface-2/50' : 'bg-bg-deep/45',
                    cell.today && 'bg-signal/[0.05] hover:bg-signal/[0.07]',
                  )}
                >
                  <div className="flex items-start justify-between gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        gotoDay(cell.key)
                      }}
                      className={cn(
                        'tnum press grid size-[19px] shrink-0 place-items-center rounded-full text-[11.5px] leading-none',
                        cell.today
                          ? 'bg-signal font-semibold text-signal-ink'
                          : cell.inMonth
                            ? 'text-ink-2 hover:bg-surface-3 hover:text-ink'
                            : 'text-ink-4',
                      )}
                    >
                      {cell.day.getDate()}
                    </button>
                    <button
                      aria-label={`New task on ${fmtDateKey(cell.key, { weekday: true })}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        newTask(cell.key)
                      }}
                      className="press grid size-[16px] place-items-center rounded-[4px] text-ink-4 opacity-50 hover:bg-surface-3 hover:text-ink group-hover/cell:opacity-100"
                    >
                      <Plus size={11} />
                    </button>
                  </div>

                  {shown.map((item) => (
                    <button
                      key={item.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        openItem(item)
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={`${fmtTime(item.start)}–${fmtTime(item.end)} · ${item.title}`}
                      className="block-surface press relative flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-[4px] px-1 py-px text-left hover:brightness-110"
                      style={{ '--blk': item.color } as CSSProperties}
                    >
                      <span className="mono-clock shrink-0 text-[8.5px] leading-[1.4] text-ink-3">
                        {fmtTime(item.start)}
                      </span>
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-[10px] leading-[1.4] text-ink-2',
                          item.done && 'text-ink-4 line-through',
                        )}
                      >
                        {item.title}
                      </span>
                    </button>
                  ))}

                  {rest.map((t) => (
                    <button
                      key={t.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        setPanel({ kind: 'task', id: t.id })
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      title={t.title}
                      className="press flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-[4px] border border-dashed border-line-2 px-1 py-px text-left hover:border-line-strong"
                    >
                      <span className="size-[4px] shrink-0 rounded-full bg-ink-4" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[10px] leading-[1.4] text-ink-3">
                        {t.title}
                      </span>
                    </button>
                  ))}

                  {hidden > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOverflow({ key: cell.key, el: e.currentTarget })
                      }}
                      className="press w-fit shrink-0 rounded-[3px] px-0.5 text-left text-[9.5px] leading-[1.4] text-ink-4 hover:text-signal"
                    >
                      +{hidden} more
                    </button>
                  )}

                  <Popover
                    open={isOpen}
                    anchor={isOpen ? overflow?.el ?? null : null}
                    onClose={() => setOverflow(null)}
                    width={248}
                  >
                    <div className="px-2 pb-1 pt-1.5">
                      <div className="font-serif text-[15px] leading-none text-ink">
                        {fmtDateKey(cell.key, { weekday: true })}
                      </div>
                    </div>
                    <DayList cell={cell} onOpenItem={openItem} />
                    <div className="mt-1 border-t border-line pt-1">
                      <MenuItem
                        icon={<ChevronRight size={12} />}
                        onClick={() => {
                          setOverflow(null)
                          gotoDay(cell.key)
                        }}
                      >
                        Open day
                      </MenuItem>
                      <MenuItem
                        icon={<Plus size={12} />}
                        onClick={() => {
                          setOverflow(null)
                          newTask(cell.key)
                        }}
                      >
                        New task
                      </MenuItem>
                    </div>
                  </Popover>
                </div>
              )
            })}
            </div>
          </div>
        ))}
      </div>

      <div className="mono-clock shrink-0 border-t border-line px-4 py-1 text-[9.5px] text-ink-4">
        click a day to open it · + adds a task
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9.5px] uppercase tracking-[0.14em] text-ink-4">{label}</span>
      <span className="mono-clock tnum text-[13px] leading-none text-ink-2">{value}</span>
    </div>
  )
}

function DayList({
  cell,
  onOpenItem,
}: {
  cell: DayCell
  onOpenItem: (item: CalendarItem) => void
}) {
  const setPanel = useStore((s) => s.setPanel)
  if (!cell.chips.length && !cell.loose.length)
    return <div className="px-2 py-2 text-[11.5px] text-ink-4">Nothing on this day.</div>
  return (
    <div className="max-h-[240px] overflow-y-auto">
      {cell.chips.map((item) => (
        <button
          key={item.id}
          onClick={() => onOpenItem(item)}
          className="press flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-[6px] text-left hover:bg-surface-3"
        >
          <span
            className="size-[7px] shrink-0 rounded-full"
            style={{ background: item.color }}
            aria-hidden
          />
          <span className="mono-clock shrink-0 text-[10.5px] text-ink-4">
            {fmtTime(item.start)}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12px] text-ink-2',
              item.done && 'text-ink-4 line-through',
            )}
          >
            {item.title}
          </span>
        </button>
      ))}
      {cell.loose.map((t) => (
        <button
          key={t.id}
          onClick={() => setPanel({ kind: 'task', id: t.id })}
          className="press flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-[6px] text-left hover:bg-surface-3"
        >
          <span className="size-[7px] shrink-0 rounded-full border border-dashed border-ink-4" aria-hidden />
          <span className="mono-clock shrink-0 text-[10.5px] text-ink-4">—</span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{t.title}</span>
        </button>
      ))}
    </div>
  )
}
