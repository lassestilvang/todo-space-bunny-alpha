import { useMemo, useState } from 'react'
import { ArrowRight, Check, Sparkles, Wand2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { planRange, summarise, toBlocks, type PlanOptions } from '@/lib/planner'
import { addDays, fmtDuration, fromKey, toKey } from '@/lib/date'
import { cn, cssColor, minutesLabel } from '@/lib/selectors'
import { Btn, Modal, Switch } from './ui'

export function PlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const habits = useStore((s) => s.habits)
  const projects = useStore((s) => s.projects)
  const settings = useStore((s) => s.settings)
  const anchor = useStore((s) => s.ui.anchor)
  const applyPlan = useStore((s) => s.applyPlan)
  const toast = useStore((s) => s.toast)
  const setPanel = useStore((s) => s.setPanel)
  const scheduleTask = useStore((s) => s.scheduleTask)

  const [float, setFloat] = useState(settings.autoPlan)
  const [replan, setReplan] = useState(false)
  const [horizon, setHorizon] = useState<1 | 3 | 5>(1)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const input = useMemo(
    () => ({
      tasks: Object.values(tasks),
      events: Object.values(events),
      habits: Object.values(habits),
      settings,
    }),
    [tasks, events, habits, settings],
  )

  const report = useMemo(
    () => planRange(input, anchor, horizon, { float, replan, maxPerDay: 9 } as Partial<PlanOptions>),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, anchor, horizon, float, replan],
  )

  const chosen = report.placements.filter((p) => !excluded.has(p.taskId))
  const minutes = chosen
    .filter((p) => p.day === anchor)
    .reduce((a, p) => a + (p.end - p.start), 0)

  const apply = () => {
    applyPlan(toBlocks(chosen))
    onClose()
    toast({
      text: `Scheduled ${chosen.length} block${chosen.length === 1 ? '' : 's'} · ${minutesLabel(
        minutes,
      )} on ${fromKey(anchor).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      kind: 'ok',
      action: { label: 'Undo', run: () => useStore.getState().undo() },
    })
  }

  const byDay = useMemo(() => {
    const map = new Map<string, typeof report.placements>()
    for (const p of report.placements) {
      if (excluded.has(p.taskId)) continue
      const list = map.get(p.day) ?? []
      list.push(p)
      map.set(p.day, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start)
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [report.placements, excluded])

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={620}
      title={
        <span className="flex items-center gap-2">
          <Wand2 size={14} className="text-signal" />
          Plan {horizon === 1 ? 'this day' : `the next ${horizon} days`}
        </span>
      }
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-ink-4">{summarise({ ...report, placements: chosen }, anchor)}</span>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={apply} disabled={!chosen.length}>
            <Check size={13} /> Schedule {chosen.length} block{chosen.length === 1 ? '' : 's'}
          </Btn>
        </>
      }
    >
      <div className="p-4">
        {/* summary */}
        <div className="mb-4 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-3.5">
          <div className="flex items-baseline gap-2">
            <span className="font-serif text-[19px] leading-none text-ink">
              {minutesLabel(minutes)}
            </span>
            <span className="text-[12px] text-ink-3">
              of focused time across {chosen.filter((p) => p.day === anchor).length} block
              {chosen.filter((p) => p.day === anchor).length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-3">
            {byDay.map(([day, list]) => (
              <div
                key={day}
                className="h-full"
                style={{
                  width: `${(list.reduce((a, p) => a + (p.end - p.start), 0) / Math.max(1, chosen.reduce((a, p) => a + (p.end - p.start), 0))) * 100}%`,
                  background: day === anchor ? 'var(--signal)' : 'color-mix(in oklab, var(--signal) 45%, transparent)',
                }}
                title={day}
              />
            ))}
          </div>
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-4">
            Nothing here is locked. Everything lands in a real gap between your meetings, your
            habit anchors and your working hours — then you can drag any of it.
          </p>
        </div>

        {/* options */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
            <span className="text-[12px] text-ink-2">Float undated work</span>
            <Switch checked={float} onChange={setFloat} label="Float undated work" />
          </label>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
            <span className="text-[12px] text-ink-2">Rebuild the whole day</span>
            <Switch checked={replan} onChange={setReplan} label="Rebuild the whole day" />
          </label>
          <div className="flex items-center gap-1 rounded-[var(--radius-md)] border border-line bg-surface-2 px-2 py-1.5">
            {[1, 3, 5].map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h as 1 | 3 | 5)}
                className={cn(
                  'press flex-1 rounded-[6px] py-1 text-[11.5px]',
                  horizon === h ? 'bg-surface-3 text-ink' : 'text-ink-3 hover:text-ink-2',
                )}
              >
                {h === 1 ? 'Today' : `${h} days`}
              </button>
            ))}
          </div>
        </div>

        {/* placements */}
        {byDay.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-line-2 px-4 py-8 text-center">
            <Sparkles size={18} className="mx-auto mb-2 text-ink-4" />
            <p className="text-[13px] text-ink-2">Nothing left to place.</p>
            <p className="mt-1 text-[11.5px] text-ink-4">
              Every open task already has a time, or the day has no room left.
            </p>
          </div>
        )}

        {byDay.map(([day, list]) => (
          <div key={day} className="mb-4 last:mb-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
                {day === toKey(new Date())
                  ? 'Today'
                  : fromKey(day).toLocaleDateString(undefined, {
                      weekday: 'long',
                      month: 'short',
                      day: 'numeric',
                    })}
              </span>
              <span className="mono-clock ml-auto text-[10px] text-ink-4">
                {fmtDuration(list.reduce((a, p) => a + (p.end - p.start), 0))}
              </span>
            </div>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line">
              {list.map((p) => {
                const t = tasks[p.taskId]
                if (!t) return null
                const color = cssColor(t.projectId ? projects[t.projectId]?.color : undefined)
                const on = !excluded.has(p.taskId)
                return (
                  <div
                    key={`${p.taskId}-${p.start}`}
                    className={cn(
                      'flex items-center gap-3 border-b border-line px-3 py-2 last:border-0',
                      !on && 'opacity-40',
                    )}
                  >
                    <div className="mono-clock w-[86px] shrink-0 text-[11px] text-ink-2">
                      {String(Math.floor(p.start / 60)).padStart(2, '0')}:
                      {String(p.start % 60).padStart(2, '0')}
                      <span className="text-ink-4">
                        {' '}
                        –{String(Math.floor(p.end / 60)).padStart(2, '0')}:
                        {String(p.end % 60).padStart(2, '0')}
                      </span>
                    </div>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
                    <button
                      onClick={() => setPanel({ kind: 'task', id: t.id })}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate text-[12.5px] text-ink">{t.title}</div>
                      <div className="truncate text-[10.5px] text-ink-4">{p.reason}</div>
                    </button>
                    {p.chunkCount && p.chunkCount > 1 && (
                      <span className="mono-clock shrink-0 rounded-full bg-surface-3 px-1.5 text-[9.5px] text-ink-3">
                        {p.chunkOf}/{p.chunkCount}
                      </span>
                    )}
                    <button
                      onClick={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev)
                          if (next.has(t.id)) next.delete(t.id)
                          else next.add(t.id)
                          return next
                        })
                      }
                      aria-label={on ? 'Skip this block' : 'Include this block'}
                      className={cn(
                        'press grid size-5 shrink-0 place-items-center rounded-full border',
                        on ? 'border-transparent' : 'border-line-2',
                      )}
                      style={on ? { background: color } : undefined}
                    >
                      {on && <Check size={11} color="#0a0b0d" />}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {/* unplaced */}
        {report.unplaced.length > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
              Could not fit
            </div>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line">
              {report.unplaced.map((u) => (
                <div key={u.taskId} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-ink-2">{u.title}</div>
                    <div className="text-[10.5px] text-ink-4">{u.reason}</div>
                  </div>
                  <Btn
                    size="xs"
                    onClick={() => {
                      const t = tasks[u.taskId]
                      if (!t) return
                      updateDueTomorrow(t.id)
                      scheduleTask(t.id, null)
                      toast({ text: `“${t.title}” moved to ${toKey(addDays(new Date(), 1))}`, kind: 'info' })
                    }}
                  >
                    <ArrowRight size={11} /> Tomorrow
                  </Btn>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

function updateDueTomorrow(id: string) {
  useStore.getState().updateTask(id, { due: toKey(addDays(new Date(), 1)) })
}
