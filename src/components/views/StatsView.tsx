import { focusMinutesOf, isOpenSession } from '@/lib/focus'
import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Timer,
} from 'lucide-react'
import {
  DAY,
  addDays,
  startOfDay,
  startOfWeek,
  toKey,
} from '@/lib/date'
import {
  cn,
  habitDueOn,
  habitWeekCount,
  isOverdue,
  minutesLabel,
  sortTasks,
} from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, Empty, Ring, SectionTitle, Seg } from '@/components/ui'

type Range = '7' | '30' | '90'

const DAY_MS = DAY

/* ------------------------------------------------------------------ bars */

function Bars({
  data,
  color,
  unit,
}: {
  data: { key: string; value: number; future: boolean; label: string }[]
  color: string
  unit: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const H = 84
  const every = data.length > 40 ? 7 : data.length > 16 ? 4 : 2

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-end gap-[3px]" style={{ height: H }}>
        {data.map((d, i) => (
          <div key={d.key} className="group relative flex min-w-0 flex-1 flex-col justify-end">
            <div
              title={`${d.label} · ${d.value} ${unit}`}
              className="press w-full rounded-t-[2px] transition-[height,opacity]"
              style={{
                height: `${Math.max(d.value > 0 ? 3 : 1, (d.value / max) * H)}px`,
                background: color,
                opacity: d.future ? 0.06 : d.value > 0 ? 1 : 0.16,
              }}
            />
            {i % every === 0 && (
              <div className="mono-clock tnum pointer-events-none absolute -bottom-[13px] left-0 text-[8.5px] leading-none text-ink-4">
                {d.label}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="h-[16px]" />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-4">
        {label}
      </div>
      <div className="mono-clock tnum mt-1 text-[19px] font-semibold leading-none text-ink">
        {value}
      </div>
      {sub && <div className="mt-1 text-[10.5px] text-ink-4">{sub}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ view */

export function StatsView() {
  const tasksMap = useStore((s) => s.tasks)
  const sessions = useStore((s) => s.sessions)
  const habitsMap = useStore((s) => s.habits)
  const setView = useStore((s) => s.setView)
  const setAnchor = useStore((s) => s.setAnchor)

  const [range, setRange] = useState<Range>('30')
  const days = Number(range)

  const now = Date.now()
  const today = new Date()
  const todayKey = toKey(today)
  const weekStart = startOfWeek(today)
  const weekEndKey = toKey(addDays(weekStart, 6))

  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap])
  const habits = useMemo(
    () => Object.values(habitsMap).filter((h) => !h.archived).sort((a, b) => a.order - b.order),
    [habitsMap],
  )

  /* ---------------------------------------------------------------- window */

  const fromMs = startOfDay(addDays(today, -(days - 1))).getTime()
  const toMs = fromMs + days * DAY_MS

  const dayKeys = useMemo(
    () => Array.from({ length: days }, (_, i) => toKey(addDays(today, -(days - 1 - i)))),
    [days],
  )

  /* ------------------------------------------------------------------ focus */

  const windowSessions = sessions.filter((s) => s.start >= fromMs && s.start < toMs)
  const focusTotal = windowSessions.reduce((a, s) => a + focusMinutesOf(s, now), 0)
  const completedSessions = windowSessions.filter((s) => s.completed).length
  const openSessions = windowSessions.filter((s) => isOpenSession(s, now))
  const abandoned = windowSessions.length - completedSessions - openSessions.length
  const avgSession = completedSessions ? focusTotal / completedSessions : 0

  const focusPerDay = useMemo(() => {
    const m = new Map<string, number>()
    for (const k of dayKeys) m.set(k, 0)
    for (const s of windowSessions) {
      const k = toKey(s.start)
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + focusMinutesOf(s, now))
    }
    return dayKeys.map((k) => {
      const d = new Date(k)
      return {
        key: k,
        value: Math.round(m.get(k) ?? 0),
        future: d.getTime() > now,
        label: range === '90' ? `${d.getDate()}` : `${d.getDate()}`,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKeys, windowSessions, now, range])

  /* -------------------------------------------------------------- throughput */

  const createdInWindow = tasks.filter((t) => t.createdAt >= fromMs && t.createdAt < toMs)
  const completedInWindow = tasks.filter(
    (t) => t.completedAt !== undefined && t.completedAt >= fromMs && t.completedAt < toMs,
  )
  const denom = completedInWindow.length + createdInWindow.length
  const completionRate = denom ? completedInWindow.length / denom : 0

  const completedPerDay = useMemo(() => {
    const m = new Map<string, number>(dayKeys.map((k) => [k, 0]))
    for (const t of completedInWindow) {
      const k = toKey(t.completedAt ?? 0)
      if (m.has(k)) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return dayKeys.map((k) => {
      const d = new Date(k)
      return { key: k, value: m.get(k) ?? 0, future: d.getTime() > now, label: `${d.getDate()}` }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKeys, completedInWindow, now])

  const dayHasCompletion = useMemo(() => {
    const set = new Set<string>()
    for (const t of tasks) if (t.completedAt !== undefined) set.add(toKey(t.completedAt))
    return set
  }, [tasks])

  const currentStreak = useMemo(() => {
    let n = 0
    let cursor = new Date(today)
    if (!dayHasCompletion.has(toKey(cursor))) cursor = addDays(cursor, -1)
    for (let i = 0; i < 400; i++) {
      if (!dayHasCompletion.has(toKey(cursor))) break
      n++
      cursor = addDays(cursor, -1)
    }
    return n
  }, [dayHasCompletion, today])

  const bestStreak = useMemo(() => {
    let best = 0
    let run = 0
    for (const k of dayKeys) {
      if (dayHasCompletion.has(k)) {
        run++
        if (run > best) best = run
      } else run = 0
    }
    return best
  }, [dayHasCompletion, dayKeys])

  /* ------------------------------------------------------------ commitments */

  const scheduledInWindow = createdInWindow.filter((t) => t.scheduled)
  const scheduledPct = createdInWindow.length ? scheduledInWindow.length / createdInWindow.length : 0

  const avgDelayDays = useMemo(() => {
    const delays = scheduledInWindow
      .map((t) => (t.scheduled ? t.scheduled.start - t.createdAt : 0))
      .filter((d) => d >= 0)
    if (!delays.length) return null
    return delays.reduce((a, b) => a + b, 0) / delays.length / DAY_MS
  }, [scheduledInWindow])

  /* ------------------------------------------------------------------ week */

  const weekSessions = sessions.filter(
    (s) => s.start >= weekStart.getTime() && s.start < weekStart.getTime() + 7 * DAY_MS,
  )
  const weekFocus = weekSessions.reduce((a, s) => a + focusMinutesOf(s, now), 0)
  const weekCompleted = tasks.filter(
    (t) => t.completedAt !== undefined && t.completedAt >= weekStart.getTime(),
  )
  const weekOverdue = sortTasks(tasks.filter(isOverdue)).length
  const weekPct = weekFocus / (5 * 60 * 7)

  const sentence = (() => {
    if (!weekSessions.length && !weekCompleted.length) {
      return 'Nothing recorded yet this week. The first session or checked-off task fills this line in.'
    }
    const parts: string[] = []
    if (weekFocus > 0) {
      parts.push(
        `You banked ${minutesLabel(Math.round(weekFocus))} of focus across ${weekSessions.length} session${weekSessions.length === 1 ? '' : 's'}`,
      )
    } else {
      parts.push('No focus sessions recorded this week')
    }
    if (weekCompleted.length) {
      parts.push(`and closed ${weekCompleted.length} task${weekCompleted.length === 1 ? '' : 's'}`)
    }
    const tail =
      weekPct >= 1
        ? ' — ahead of a full focused week.'
        : weekPct >= 0.5
          ? ` — ${Math.round(weekPct * 100)}% of a full focused week.`
          : weekFocus === 0 && weekCompleted.length
            ? ' — the list moved more than the clock did.'
            : ' — a quiet week so far.'
    return parts.join(' ') + tail
  })()

  /* --------------------------------------------------------------- review */

  const openTasks = sortTasks(tasks.filter((t) => !t.completed))

  type Review = {
    id: string
    label: string
    count: number
    hint: string
    go: () => void
    tone: 'bad' | 'warn' | 'ink'
  }

  const goDay = () => {
    setView('day')
    setAnchor(todayKey)
  }

  const reviews: Review[] = useMemo(() => {
    const tomorrowKey = toKey(addDays(today, 1))
    const overdue = openTasks.filter(isOverdue)
    const p1Floating = openTasks.filter((t) => t.priority === 1 && !t.scheduled)
    const dueTomorrowFloating = openTasks.filter((t) => !t.scheduled && t.due === tomorrowKey)
    const habitShort = habits.filter(
      (h) => habitWeekCount(h, weekStart) < h.targetPerWeek && habitDueOn(h, today),
    )

    const list: Review[] = []
    if (overdue.length)
      list.push({
        id: 'overdue',
        label: 'Overdue and still open',
        count: overdue.length,
        hint: 'Past their date, nothing scheduled',
        go: goDay,
        tone: 'bad',
      })
    if (p1Floating.length)
      list.push({
        id: 'p1',
        label: 'P1 tasks without a time block',
        count: p1Floating.length,
        hint: 'Most urgent work is still off the clock',
        go: goDay,
        tone: 'warn',
      })
    if (dueTomorrowFloating.length)
      list.push({
        id: 'tomorrow',
        label: 'Due tomorrow, unscheduled',
        count: dueTomorrowFloating.length,
        hint: 'No promise on the calendar yet',
        go: () => {
          setView('day')
          setAnchor(tomorrowKey)
        },
        tone: 'warn',
      })
    if (habitShort.length)
      list.push({
        id: 'habits',
        label: 'Habits below this week’s target',
        count: habitShort.length,
        hint: 'Still recoverable today',
        go: () => setView('habits'),
        tone: 'ink',
      })
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTasks, habits, todayKey])

  /* ----------------------------------------------------------------- empty */

  if (tasks.length === 0 && sessions.length === 0 && habits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty
          icon={<CheckCircle2 size={26} strokeWidth={1.4} />}
          title="No signal yet"
          hint="Stats are computed from what is actually in Tempo — sessions, tasks, habits. Nothing is estimated or filled in."
        />
      </div>
    )
  }

  /* ------------------------------------------------------------------ view */

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto flex max-w-[1000px] flex-col gap-6 px-6 py-6">
        {/* ------------------------------- hero ------------------------------- */}
        <header className="anim-rise">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-serif text-[34px] leading-[1.05] tracking-tight text-ink">
              {toKey(weekStart)} → {weekEndKey}
            </h2>
            <Seg
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '7 days' },
                { value: '30', label: '30 days' },
                { value: '90', label: '90 days' },
              ]}
            />
          </div>
          <p className="mt-2 max-w-[62ch] font-serif text-[17px] leading-snug text-ink-2">
            {sentence}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px] text-ink-4">
            <span className="mono-clock tnum">
              week focus <span className="text-ink-2">{minutesLabel(Math.round(weekFocus))}</span>
            </span>
            <span className="mono-clock tnum">
              week closed <span className="text-ink-2">{weekCompleted.length}</span>
            </span>
            <span className="mono-clock tnum">
              overdue <span className={cn(weekOverdue ? 'text-bad' : 'text-ink-2')}>{weekOverdue}</span>
            </span>
          </div>
        </header>

        {/* ------------------------------- focus ------------------------------- */}
        <section className="anim-rise">
          <SectionTitle
            right={
              <span className="mono-clock tnum text-[10.5px] text-ink-4">last {days} days</span>
            }
          >
            Focus
          </SectionTitle>
          <div className="panel px-4 py-4">
            <div className="flex flex-wrap items-end gap-8 pb-5">
              <Stat
                label="Total"
                value={minutesLabel(Math.round(focusTotal))}
                sub={`across ${completedSessions} completed session${completedSessions === 1 ? '' : 's'}`}
              />
              <Stat label="Sessions" value={`${windowSessions.length}`} sub={`${openSessions.length} open · ${abandoned} dropped`} />
              <Stat
                label="Avg length"
                value={completedSessions ? minutesLabel(Math.round(avgSession)) : '—'}
                sub="completed sessions only"
              />
              <Stat
                label="Best day"
                value={
                  focusPerDay.length
                    ? minutesLabel(Math.max(...focusPerDay.map((d) => d.value)))
                    : '—'
                }
                sub="in this window"
              />
            </div>
            <Bars data={focusPerDay} color="var(--signal)" unit="min" />
            <div className="mt-1 flex items-center justify-between text-[10px] text-ink-4">
              <span className="mono-clock tnum">{dayKeys[0]}</span>
              <span>minutes of focus per day</span>
              <span className="mono-clock tnum">{dayKeys[dayKeys.length - 1]}</span>
            </div>
          </div>
        </section>

        {/* ----------------------------- throughput ----------------------------- */}
        <section className="anim-rise">
          <SectionTitle>Throughput</SectionTitle>
          <div className="panel px-4 py-4">
            <div className="flex flex-wrap items-end gap-8 pb-5">
              <Stat label="Closed" value={`${completedInWindow.length}`} sub={`of ${createdInWindow.length} created`} />
              <Stat
                label="Completion rate"
                value={`${Math.round(completionRate * 100)}%`}
                sub="completed ÷ (completed + created)"
              />
              <Stat label="Current streak" value={`${currentStreak}d`} sub="days with a completion" />
              <Stat label="Best streak" value={`${bestStreak}d`} sub="in this window" />
            </div>
            <Bars data={completedPerDay} color="var(--good)" unit="tasks" />
            <div className="mt-1 flex items-center justify-between text-[10px] text-ink-4">
              <span className="mono-clock tnum">{dayKeys[0]}</span>
              <span>tasks completed per day</span>
              <span className="mono-clock tnum">{dayKeys[dayKeys.length - 1]}</span>
            </div>
          </div>
        </section>

        {/* ---------------------------- commitments ---------------------------- */}
        <section className="anim-rise">
          <SectionTitle>Commitments</SectionTitle>
          <div className="panel flex flex-wrap items-center gap-8 px-4 py-4">
            <Ring value={scheduledPct} size={62} stroke={5} color="var(--focus)">
              <span className="mono-clock text-[11px]">{Math.round(scheduledPct * 100)}</span>
            </Ring>
            <Stat
              label="Made it onto the clock"
              value={
                createdInWindow.length
                  ? `${scheduledInWindow.length}/${createdInWindow.length}`
                  : '—'
              }
              sub={`${Math.round(scheduledPct * 100)}% of tasks created in this window got a block`}
            />
            <Stat
              label="Capture → first block"
              value={avgDelayDays === null ? '—' : `${avgDelayDays.toFixed(1)}d`}
              sub={
                avgDelayDays === null
                  ? 'no scheduled task in this window'
                  : 'average gap between creating a task and its first block'
              }
            />
            <div className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-4">
              A task that never gets a block is a wish. Tempo records the delay so the gap is
              visible rather than felt.
            </div>
          </div>
        </section>

        {/* ------------------------------ review ------------------------------ */}
        <section className="anim-rise">
          <SectionTitle
            right={
              <span className="mono-clock tnum text-[10.5px] text-ink-4">
                {reviews.reduce((a, r) => a + r.count, 0)} open
              </span>
            }
          >
            Weekly review
          </SectionTitle>
          <div className="panel overflow-hidden">
            {reviews.length === 0 ? (
              <div className="px-4 py-6 text-center text-[12.5px] text-ink-4">
                Nothing pressing. Every task is scheduled, nothing is overdue, and habits are on
                target.
              </div>
            ) : (
              reviews.map((r, i) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={r.go}
                  className={cn(
                    'press anim-rise flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-2',
                    i > 0 && 'border-t border-line',
                  )}
                >
                  <span
                    className={cn(
                      'mono-clock tnum grid h-[22px] min-w-[26px] shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-semibold',
                      r.tone === 'bad' && 'bg-bad/14 text-bad',
                      r.tone === 'warn' && 'bg-warn/14 text-warn',
                      r.tone === 'ink' && 'bg-surface-3 text-ink-2',
                    )}
                  >
                    {r.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{r.label}</span>
                    <span className="block truncate text-[11px] text-ink-4">{r.hint}</span>
                  </span>
                  {r.tone === 'bad' ? (
                    <AlertTriangle size={13} className="shrink-0 text-bad/70" aria-hidden />
                  ) : r.tone === 'warn' ? (
                    <CalendarClock size={13} className="shrink-0 text-warn/70" aria-hidden />
                  ) : (
                    <Timer size={13} className="shrink-0 text-ink-4" aria-hidden />
                  )}
                  <ArrowRight size={13} className="shrink-0 text-ink-4" aria-hidden />
                </button>
              ))
            )}
          </div>
          {reviews.length > 0 && (
            <Btn
              variant="quiet"
              className="mt-2"
              onClick={() => {
                setView('day')
                setAnchor(todayKey)
              }}
            >
              Open today
              <ArrowRight size={12} />
            </Btn>
          )}
        </section>

        <p className="pb-2 text-[10.5px] leading-relaxed text-ink-4">
          Every number above is derived from Tempo&rsquo;s own records. Completed focus sessions count
          their planned length, sessions still running count elapsed time, and abandoned sessions
          count zero. Measured over {days} days.
        </p>
      </div>
    </div>
  )
}