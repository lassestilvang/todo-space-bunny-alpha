import { Flame, Play, Timer } from 'lucide-react'
import { useStore } from '@/lib/store'
import { focusPerDay, focusStreak, goalProgress, isOpenSession } from '@/lib/focus'
import { WEEKDAYS_SHORT, fmtDateKey, toKey } from '@/lib/date'
import { cn, minutesLabel } from '@/lib/selectors'
import { Btn, Empty, Ring, SectionTitle } from '@/components/ui'
import { openTimer } from '@/components/Pomodoro'

/**
 * Focus: the time you actually gave a task, and whether that matched what you
 * meant to do. The numbers come from `lib/focus`, the same accounting the
 * Review view uses, so the two can never disagree.
 */
export function FocusView() {
  const sessions = useStore((s) => s.sessions)
  const settings = useStore((s) => s.settings)
  const goal = settings.focusGoalMin
  const now = Date.now()

  const today = toKey(now)
  // Both of these are a single pass over a small list, and `now` moves on every
  // render, so a memo would only pretend to be cached.
  const week = focusPerDay(sessions, dayKeys(7), now)
  const todayMinutes = week.find((d) => d.key === today)?.minutes ?? 0
  const streak = focusStreak(sessions, goal, now)
  const open = sessions.filter((s) => isOpenSession(s, now)).length
  const todaySessions = sessions.filter((s) => toKey(s.start) === today)

  const peak = Math.max(goal, ...week.map((d) => d.minutes), 1)
  const met = week.filter((d) => d.minutes >= goal).length
  const progress = goalProgress(todayMinutes, goal)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[720px] px-5 py-6">
        {/* --------------------------------- today --------------------------------- */}
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface-2/50 p-4">
          <div className="flex items-center gap-5">
            <Ring value={progress} size={92} stroke={6}>
              <div className="text-center">
                <div className="mono-clock tnum text-[17px] font-semibold leading-none text-ink">
                  {Math.round(progress * 100)}%
                </div>
                <div className="mt-1 text-[8.5px] uppercase tracking-[0.12em] text-ink-4">
                  of goal
                </div>
              </div>
            </Ring>

            <div className="min-w-0 flex-1">
              <h2 className="font-serif text-[19px] leading-tight tracking-tight text-ink">
                {fmtDateKey(today, { weekday: true, year: false })}
              </h2>
              <p className="mono-clock tnum mt-1 text-[12px] text-ink-2">
                {minutesLabel(todayMinutes)} of {minutesLabel(goal)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-4">
                <span className="flex items-center gap-1">
                  <Timer size={11} className="shrink-0" />
                  {todaySessions.length} session{todaySessions.length === 1 ? '' : 's'}
                  {open > 0 ? ` · ${open} running` : ''}
                </span>
                <span className="flex items-center gap-1">
                  <Flame size={11} className="shrink-0" />
                  {streak === 0
                    ? 'no streak yet'
                    : `${streak} day${streak === 1 ? '' : 's'} on target`}
                </span>
              </div>
              <Btn variant="primary" size="sm" onClick={openTimer} className="mt-3">
                <Play size={12} />
                {open > 0 ? 'Open the timer' : 'Start a focus block'}
              </Btn>
            </div>
          </div>
        </section>

        {/* --------------------------------- a week -------------------------------- */}
        <SectionTitle className="mt-6">The last seven days</SectionTitle>
        <section className="rounded-[var(--radius-lg)] border border-line bg-surface-2/50 p-4">
          <div className="relative">
            {/* the goal, drawn across every bar so "did I make it" is a glance */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-signal/45"
              style={{ bottom: `${(goal / peak) * 108}px` }}
            />
            <div className="flex items-end gap-2" style={{ height: 132 }}>
              {week.map((d) => {
                const h = Math.max(d.minutes > 0 ? 4 : 2, (d.minutes / peak) * 108)
                const hit = d.minutes >= goal
                const isToday = d.key === today
                return (
                  <div key={d.key} className="group flex min-w-0 flex-1 flex-col justify-end">
                    <div
                      title={`${fmtDateKey(d.key, { weekday: true })} · ${minutesLabel(d.minutes)} of ${minutesLabel(goal)}`}
                      className={cn(
                        'w-full rounded-t-[3px] transition-[height,opacity]',
                        hit ? 'bg-signal' : d.minutes > 0 ? 'bg-ink-4' : 'bg-line-strong',
                        isToday && !hit && 'bg-ink-3',
                      )}
                      style={{ height: `${h}px`, opacity: hit ? 1 : d.minutes > 0 ? 0.55 : 0.4 }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="mt-1.5 flex gap-2">
              {week.map((d) => (
                <div
                  key={d.key}
                  className={cn(
                    'mono-clock tnum min-w-0 flex-1 text-center text-[9.5px]',
                    d.key === today ? 'text-ink-2' : 'text-ink-4',
                  )}
                >
                  {WEEKDAYS_SHORT[new Date(`${d.key}T00:00:00`).getDay()]}
                </div>
              ))}
            </div>
          </div>

          <p className="mt-4 text-[11px] text-ink-4">
            {met} of {week.length} days reached {minutesLabel(goal)}
            {streak > 1 ? ` · longest run in this window is ${streak}` : ''}. The dashed line
            is the goal; a bar that reaches it counts toward the streak.
          </p>
        </section>

        {week.every((d) => d.minutes === 0) && (
          <Empty
            icon={<Timer size={18} />}
            title="No focus recorded yet"
            hint="Start a block and it will show up here, and in Review."
          />
        )}

        <p className="mt-5 text-[10.5px] leading-relaxed text-ink-4">
          A finished session counts at its planned length. One still running counts the time
          actually elapsed, and one abandoned before its planned end counts nothing. Today is
          only counted toward the streak once it is finished, so a half-made day neither earns
          nor breaks it.
        </p>
      </div>
    </div>
  )
}

function dayKeys(n: number): string[] {
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    out.push(toKey(d))
  }
  return out
}
