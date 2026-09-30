import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Command, Keyboard, Sparkles, Wand2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ViewId } from '@/types'
import {
  addDays,
  fromKey,
  isToday,
  isoWeekNumber,
  MONTHS_LONG,
  startOfWeek,
  WEEKDAYS_LONG,
} from '@/lib/date'
import { cn, minutesLabel } from '@/lib/selectors'
import { Btn, IconBtn, Kbd, Seg } from './ui'

export const VIEWS: { value: ViewId; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
]

/** Views that are not date-scoped still deserve their own heading. */
const FLAT: Partial<Record<ViewId, { big: string; sub: string }>> = {
  inbox: { big: 'Inbox', sub: 'Everything captured, nothing scheduled yet' },
  today: { big: 'Today', sub: 'Due, floating, and habits' },
  upcoming: { big: 'Upcoming', sub: 'Everything ahead of you, in order' },
  matrix: { big: 'Matrix', sub: 'Urgent against important' },
  kanban: { big: 'Board', sub: 'Work moving across projects' },
  habits: { big: 'Habits', sub: 'Cadence, streaks, and honesty' },
  docs: { big: 'Notes', sub: 'Long-form thinking, autosaved' },
  stats: { big: 'Review', sub: 'Where the time actually went' },
}

export function TopBar({
  onPlan,
  onHelp,
  load,
}: {
  onPlan: () => void
  onHelp: () => void
  load: { planned: number; capacity: number; items: number }
}) {
  const anchor = useStore((s) => s.ui.anchor)
  const view = useStore((s) => s.ui.view)
  const setView = useStore((s) => s.setView)
  const setAnchor = useStore((s) => s.setAnchor)
  const setPalette = useStore((s) => s.setPalette)
  const assistantOpen = useStore((s) => s.settings.assistantOpen)
  const setAssistant = useStore((s) => s.setAssistant)

  const title = useMemo(() => {
    const d = fromKey(anchor)
    if (view === 'week') {
      const a = startOfWeek(d)
      const b = addDays(a, 6)
      return {
        big: `Week ${isoWeekNumber(d)}`,
        sub: `${a.getDate()} ${MONTHS_LONG[a.getMonth()]} – ${b.getDate()} ${
          a.getMonth() === b.getMonth() ? '' : `${MONTHS_LONG[b.getMonth()]} `
        }${b.getFullYear()}`,
      }
    }
    if (view === 'month') {
      return { big: `${MONTHS_LONG[d.getMonth()]}`, sub: String(d.getFullYear()) }
    }
    if (view === 'agenda') return { big: 'Agenda', sub: 'The next three weeks, in order' }
    const flat = FLAT[view as keyof typeof FLAT]
    if (flat) return flat
    if (isToday(d)) return { big: 'Today', sub: `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}` }
    return {
      big: WEEKDAYS_LONG[d.getDay()],
      sub: `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`,
    }
  }, [anchor, view])

  const step = (dir: number) => {
    const d = fromKey(anchor)
    if (view === 'month') setAnchor(toKeySafe(new Date(d.getFullYear(), d.getMonth() + dir, 1)))
    else if (view === 'week') setAnchor(toKeySafe(addDays(d, dir * 7)))
    else setAnchor(toKeySafe(addDays(d, dir)))
  }

  const pct = load.capacity ? Math.min(100, Math.round((load.planned / load.capacity) * 100)) : 0
  const isDateView = view === 'day' || view === 'week' || view === 'month'

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg px-3">
      {/* navigation — only where the anchor date means something */}
      {isDateView && (
        <div className="flex items-center gap-1">
          <IconBtn label="Previous" onClick={() => step(-1)}>
            <ChevronLeft size={15} />
          </IconBtn>
          <IconBtn label="Next" onClick={() => step(1)}>
            <ChevronRight size={15} />
          </IconBtn>
          <Btn
            onClick={() => setAnchor(toKeySafe(new Date()))}
            variant={isToday(fromKey(anchor)) ? 'quiet' : 'outline'}
            size="xs"
            className="ml-1"
          >
            Today
          </Btn>
        </div>
      )}

      {/* title */}
      <div className={cn('min-w-0 flex-1', isDateView && 'ml-1')}>
        <div className="flex items-baseline gap-2.5">
          <h1 className="truncate font-serif text-[21px] leading-none tracking-tight text-ink">
            {title.big}
          </h1>
          <span className="mono-clock hidden truncate text-[10.5px] text-ink-4 sm:inline">
            {title.sub}
          </span>
        </div>
      </div>

      {/* load meter */}
      {isDateView && load.items > 0 && (
        <div
          className="hidden items-center gap-2 lg:flex"
          title={
            view === 'week'
              ? `Daily average across this week: ${Math.round(load.planned)} minutes planned`
              : `${Math.round(load.planned)} minutes planned of ${load.capacity}`
          }
        >
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-500"
              style={{ width: `${Math.max(3, pct)}%` }}
            />
          </div>
          <span className="mono-clock tnum text-[10px] text-ink-4">
            {view === 'week' && <span className="text-ink-3">avg </span>}
            {minutesLabel(load.planned)}
            {load.capacity ? ` / ${minutesLabel(load.capacity)}` : ''}
          </span>
        </div>
      )}

      {/* view switcher */}
      <Seg
        value={view}
        options={VIEWS}
        onChange={(v) => setView(v)}
        className="hidden md:inline-flex"
      />

      {/* plan */}
      <Btn variant="primary" size="sm" onClick={onPlan} className="hidden sm:inline-flex">
        <Wand2 size={13} />
        Plan my day
      </Btn>

      <IconBtn label="Command palette" onClick={() => setPalette(true)}>
        <Command size={14} />
      </IconBtn>
      <IconBtn
        label="Toggle assistant"
        active={assistantOpen}
        onClick={() => setAssistant(!assistantOpen)}
      >
        <Sparkles size={14} />
      </IconBtn>
      <IconBtn label="Keyboard shortcuts" onClick={onHelp} className="hidden sm:grid">
        <Keyboard size={14} />
      </IconBtn>
    </header>
  )
}

const toKeySafe = (d: Date) => {
  const p = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function ViewSwitcher({ className }: { className?: string }) {
  const view = useStore((s) => s.ui.view)
  const setView = useStore((s) => s.setView)
  return <Seg value={view} options={VIEWS} onChange={setView} size="xs" className={cn(className)} />
}

export function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between py-1 text-[12.5px]">
      <span className="text-ink-2">{label}</span>
      <span className="flex gap-1">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </div>
  )
}
