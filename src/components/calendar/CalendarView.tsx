import { useCallback, useEffect, useMemo } from 'react'
import { useStore } from '@/lib/store'
import type { CalendarItem, DayPart, Energy, Priority } from '@/types'
import { useNow } from '@/lib/useNow'
import { TimeGrid } from './TimeGrid'
import { DayRail } from '../DayRail'
import { useContextMenu, type MenuEntry } from '../ContextMenu'
import {
  addDays,
  atMinutes,
  fmtTime,
  fromKey,
  isToday,
  MIN,
  MONTHS_SHORT,
  startOfWeek,
  toKey,
  WEEKDAYS_SHORT,
} from '@/lib/date'
import { layoutItems, toItems, tasksOnDay } from '@/lib/selectors'
import type { DropPayload } from '@/lib/drag'
import { clearItemPayload, setItemPayload } from '@/lib/drag'

export function CalendarView({
  onPlan,
  mode,
  onLoad,
}: {
  onPlan: () => void
  mode: 'day' | 'week'
  onLoad: (load: { planned: number; capacity: number; items: number }) => void
}) {
  const anchor = useStore((s) => s.ui.anchor)
  const settings = useStore((s) => s.settings)
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const projects = useStore((s) => s.projects)
  const now = useNow(20_000)
  const updateTask = useStore((s) => s.updateTask)
  const updateEvent = useStore((s) => s.updateEvent)
  const addTask = useStore((s) => s.addTask)
  const setPanel = useStore((s) => s.setPanel)
  const panel = useStore((s) => s.ui.panel)
  const deleteEvent = useStore((s) => s.deleteEvent)
  const setCapture = useStore((s) => s.setCapture)
  const toast = useStore((s) => s.toast)
  const menu = useContextMenu()

  const days = useMemo(() => {
    if (mode === 'day') return [fromKey(anchor)]
    const start = startOfWeek(fromKey(anchor))
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchor, mode])

  const fromMs = atMinutes(days[0], 0)
  const toMs = atMinutes(addDays(days[days.length - 1], 1), 0)

  const items = useMemo(
    () => layoutItems(toItems(tasks, events, projects, fromMs, toMs)),
    [tasks, events, projects, fromMs, toMs],
  )

  const railDay = anchor
  const floaters = useMemo(() => {
    const list = Object.values(tasks)
    const { floating } = tasksOnDay(list, railDay)
    return floating
  }, [tasks, railDay])

  const allDayItems = useMemo(
    () => items.filter((i) => i.allDay),
    [items],
  )

  const plannedMinutes = useMemo(
    () =>
      items
        .filter((i) => !i.allDay && !i.done && i.kind === 'task')
        .reduce((a, i) => a + (i.end - i.start) / MIN, 0),
    [items],
  )
  /* The meter is per-day: week view reports the daily average so the ratio
     stays comparable against a single workday. */
  const capacityMinutes = Math.max(0, settings.workEnd - settings.workStart)
  const plannedPerDay = plannedMinutes / Math.max(1, days.length)

  useEffect(() => {
    onLoad({ planned: plannedPerDay, capacity: capacityMinutes, items: items.length })
  }, [plannedPerDay, capacityMinutes, items.length, onLoad])

  const openItem = useCallback(
    (item: CalendarItem) => {
      setPanel(item.kind === 'task' ? { kind: 'task', id: item.id } : { kind: 'event', id: item.id })
    },
    [setPanel],
  )

  const moveItem = useCallback(
    (id: string, start: number, end: number) => {
      const task = tasks[id]
      if (task) {
        updateTask(id, { scheduled: { start, end }, due: toKey(start), dueHasTime: true, planLocked: true })
        return
      }
      if (events[id]) updateEvent(id, { start, end })
    },
    [tasks, events, updateTask, updateEvent],
  )

  const create = useCallback(
    (day: Date, start: number, end: number, title?: string) => {
      const s = atMinutes(day, start)
      const e = atMinutes(day, end)
      if (!title) {
        // Hand the drawn day along with the range: a bare "08:00–09:00" would
        // otherwise be read as today, which is wrong on any other column.
        setCapture(true, `${fmtTime(s)}–${fmtTime(e)} `, { day: toKey(day), start, end })
        return
      }
      const id = addTask({
        title,
        due: toKey(day),
        dueHasTime: true,
        scheduled: { start: s, end: e },
        durationMin: end - start,
        planLocked: true,
      })
      setPanel({ kind: 'task', id })
      toast({ text: `Placed at ${fmtTime(s)}`, kind: 'ok' })
    },
    [addTask, setCapture, setPanel, toast],
  )

  const dropItem = useCallback(
    (payload: DropPayload, day: Date, start: number) => {
      const startAt = atMinutes(day, start)
      const endAt = startAt + payload.minutes * MIN
      if (payload.kind === 'event') {
        updateEvent(payload.id, { start: startAt, end: endAt, allDay: false })
        toast({ text: `${payload.title} moved to ${fmtTime(startAt)}`, kind: 'ok' })
        return
      }
      const task = tasks[payload.id]
      if (!task) return
      updateTask(payload.id, {
        title: payload.title,
        scheduled: { start: startAt, end: endAt },
        due: toKey(day),
        dueHasTime: true,
        durationMin: payload.minutes,
        planLocked: true,
      })
      toast({ text: `${payload.title} scheduled ${fmtTime(startAt)}`, kind: 'ok' })
    },
    [tasks, updateTask, updateEvent, toast],
  )

  const contextFor = useCallback(
    (item: CalendarItem, x: number, y: number) => {
      const entries: MenuEntry[] = []
      if (item.kind === 'task') {
        const t = tasks[item.id]
        if (t) {
          entries.push({ kind: 'label', text: t.title })
          entries.push({
            kind: 'item',
            label: t.completed ? 'Mark as not done' : 'Mark done',
            icon: <CheckGlyph />,
            onSelect: () => useStore.getState().toggleTask(t.id),
          })
          entries.push({
            kind: 'item',
            label: 'Take off the calendar',
            icon: <ClockGlyph />,
            onSelect: () => useStore.getState().scheduleTask(t.id, null),
          })
          entries.push({
            kind: 'item',
            label: 'Start a 25m focus block',
            icon: <SparkGlyph />,
            onSelect: () =>
              useStore.getState().startSession({ taskId: t.id, label: t.title, minutes: 25 }),
          })
          entries.push({ kind: 'divider' })
          entries.push({
            kind: 'item',
            label: 'Duplicate',
            onSelect: () => useStore.getState().duplicateTask(t.id),
          })
          entries.push({
            kind: 'item',
            label: 'Delete',
            danger: true,
            onSelect: () => useStore.getState().deleteTask(t.id),
          })
        }
      } else {
        entries.push({ kind: 'label', text: item.title })
        entries.push({
          kind: 'item',
          label: 'Edit meeting',
          onSelect: () => setPanel({ kind: 'event', id: item.id }),
        })
        entries.push({
          kind: 'item',
          label: 'Delete meeting',
          danger: true,
          onSelect: () => deleteEvent(item.id),
        })
      }
      menu.show({ x, y }, entries)
    },
    [tasks, setPanel, deleteEvent, menu],
  )

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <DayHeaderStrip days={days} allDay={allDayItems} floaters={floaters} mode={mode} anchor={anchor} nowMs={now} />
        <TimeGrid
          days={days}
          items={items}
          gridStart={settings.gridStart}
          gridEnd={settings.gridEnd}
          snapMin={settings.snapMin}
          now={now}
          showNow
          selectedId={panel?.kind === 'task' || panel?.kind === 'event' ? panel.id : null}
          onOpen={openItem}
          onMove={moveItem}
          onCreate={create}
          onContext={contextFor}
          onDropItem={dropItem}
        />
      </div>
      <DayRail day={railDay} floaters={floaters} onPlan={onPlan} />
      {menu.node}
    </div>
  )
}

function DayHeaderStrip({
  days,
  allDay,
  floaters,
  mode,
  anchor,
  nowMs,
}: {
  days: Date[]
  allDay: CalendarItem[]
  floaters: { id: string; title: string }[]
  mode: 'day' | 'week'
  anchor: string
  nowMs: number
}) {
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const setPanel = useStore((s) => s.setPanel)
  const tasks = useStore((s) => s.tasks)
  const thisYear = new Date(nowMs).getFullYear()

  return (
    <div className="shrink-0 border-b border-line bg-bg">
      <div className="flex">
        <div className="w-14 shrink-0" />
        <div
          className={[
            'flex min-w-0 flex-1',
            // Mirrors the grid's centred single-day column so headers stay aligned.
            mode === 'day' ? 'mx-auto w-full max-w-[880px]' : '',
          ].join(' ')}
        >
          {days.map((d) => {
            const key = toKey(d)
            const today = isToday(d)
            const isAnchor = key === anchor
            const dayAllDay = allDay.filter((a) => toKey(a.start) === key)
            const dayFloat = floaters.filter((f) => tasks[f.id]?.due === key)
            return (
              <div
                key={key}
                className={[
                  'min-w-0 flex-1 border-l border-line px-2 pb-2 pt-2.5',
                  mode === 'week' ? '' : 'px-4',
                ].join(' ')}
                style={isAnchor && mode === 'week' ? { background: 'color-mix(in oklab, var(--signal) 5%, transparent)' } : undefined}
              >
                <div className="flex items-baseline gap-1.5">
                  <button
                    onClick={() => {
                      setAnchor(key)
                      if (mode === 'week') setView('day')
                    }}
                    className={[
                      'press flex items-baseline gap-1.5 rounded-md px-1 py-0.5',
                      today ? 'text-signal' : 'text-ink-2 hover:text-ink',
                    ].join(' ')}
                  >
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em]">
                      {WEEKDAYS_SHORT[d.getDay()]}
                    </span>
                    <span className="mono-clock tnum text-[15px] font-semibold leading-none">
                      {d.getDate()}
                    </span>
                  </button>
                  {mode === 'week' && (
                    <span className="mono-clock ml-auto text-[9.5px] text-ink-4">
                      {MONTHS_SHORT[d.getMonth()]} {d.getFullYear() === thisYear ? '' : d.getFullYear()}
                    </span>
                  )}
                </div>

                {(dayAllDay.length > 0 || dayFloat.length > 0) && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {dayAllDay.map((a) => (
                      <button
                        key={a.id}
                        draggable
                        onDragStart={(e) => {
                          // A multi-day span cannot become a time block; give
                          // it an hour instead of pretending it fits.
                          const span = Math.round((a.end - a.start) / MIN)
                          const minutes = span > 0 && span <= 12 * 60 ? Math.max(15, span) : 60
                          setItemPayload(e, { kind: 'event', id: a.id, minutes, title: a.title })
                        }}
                        onDragEnd={clearItemPayload}
                        onClick={() => setPanel(a.kind === 'task' ? { kind: 'task', id: a.id } : { kind: 'event', id: a.id })}
                        title="Drag onto the grid to give it a time"
                        className="press max-w-full cursor-grab truncate rounded-full border px-2 py-[2px] text-[10px] hover:brightness-110 active:cursor-grabbing"
                        style={{
                          borderColor: 'var(--line-2)',
                          color: 'var(--ink-2)',
                          background: `color-mix(in oklab, ${a.color} 14%, transparent)`,
                        }}
                      >
                        {a.title}
                      </button>
                    ))}
                    {dayFloat.map((f) => (
                      <button
                        key={f.id}
                        draggable
                        onDragStart={(e) =>
                          setItemPayload(e, {
                            kind: 'task',
                            id: f.id,
                            minutes: tasks[f.id]?.durationMin || 30,
                            title: f.title,
                          })
                        }
                        onDragEnd={clearItemPayload}
                        onClick={() => setPanel({ kind: 'task', id: f.id })}
                        title="Drag onto the grid to schedule it"
                        className="press flex max-w-full cursor-grab items-center gap-1 rounded-full border border-dashed border-line-2 px-2 py-[2px] text-[10px] text-ink-3 hover:text-ink hover:brightness-110 active:cursor-grabbing"
                      >
                        <span className="truncate">{f.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {mode === 'day' && (
        <div className="flex items-center gap-2 border-t border-line px-4 py-1.5 text-[11px] text-ink-4">
          <span>Drag a floating task in, or double-click an empty slot to capture in place.</span>
          <span className="mono-clock ml-auto">{snapLabel()}</span>
        </div>
      )}
    </div>
  )
}

const snapLabel = () => `${useStore.getState().settings.snapMin}m snap`

const CheckGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M2.5 6.4 4.6 8.5 9.5 3.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const ClockGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <circle cx="6" cy="6" r="4.6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M6 3.6V6l1.8 1.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)
const SparkGlyph = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M6 1.4 7.2 4.8 10.6 6 7.2 7.2 6 10.6 4.8 7.2 1.4 6 4.8 4.8 6 1.4Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
  </svg>
)

export type { DayPart, Energy, Priority }
