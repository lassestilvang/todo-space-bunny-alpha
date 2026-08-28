import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Check,
  Coffee,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  Timer,
} from 'lucide-react'
import type { ID } from '@/types'
import { MIN, fmtTime } from '@/lib/date'
import { cn, minutesLabel, sortTasks } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, Chip, IconBtn, Input, Kbd, Modal, SectionTitle } from '@/components/ui'

/* ================================================================
   Timer core — a tiny module singleton.

   `PomodoroWidget` and `Pomodoro` are rendered in different parts of
   the dock, and the panel must survive being closed. So the timer
   does not live in React state at all: it lives here, outside the
   component tree, and React subscribes to it through
   `useSyncExternalStore`. Closing the panel unmounts nothing that
   matters — the countdown keeps ticking, the dock pill keeps
   counting, and the page title keeps updating.
   ================================================================ */

type Phase = 'focus' | 'short' | 'long'

const PHASE_LABEL: Record<Phase, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
}

const MIN_LEN = 5
const MAX_LEN = 90
const LONG_EVERY = 4
const TICK_MS = 250

type TimerState = {
  phase: Phase
  running: boolean
  /** Absolute timestamp the current run ends at. Meaningless while paused. */
  endsAt: number
  /** Frozen remainder for a paused run, in ms. */
  remaining: number
  /** Non-null exactly while a run has an open record in the store. */
  sessionId: ID | null
  taskId: ID | undefined
  label: string
  focusMin: number
  shortMin: number
  longMin: number
  /** Focus blocks finished since the last long break. */
  rounds: number
  open: boolean
}

let state: TimerState = {
  phase: 'focus',
  running: false,
  endsAt: 0,
  remaining: 0,
  sessionId: null,
  taskId: undefined,
  label: '',
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  rounds: 0,
  open: false,
}

const listeners = new Set<() => void>()

function emit() {
  for (const l of Array.from(listeners)) l()
}

function set(patch: Partial<TimerState>) {
  state = { ...state, ...patch }
  emit()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

const snapshot = () => state

/** Subscribes the calling component to the singleton timer. */
function useTimer(): TimerState {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

const lengthFor = (phase: Phase): number =>
  phase === 'focus' ? state.focusMin : phase === 'short' ? state.shortMin : state.longMin

const msFor = (phase: Phase): number => lengthFor(phase) * MIN

/** A fresh or reset phase stores no remainder, so it reports its full length. */
const remainingMs = (): number => {
  if (state.running) return Math.max(0, state.endsAt - Date.now())
  return state.remaining > 0 ? state.remaining : msFor(state.phase)
}

/* ---------------------------------- notify ---------------------------------- */

function notify(title: string, body: string) {
  // Never prompt. If permission was already granted, use it; otherwise stay silent.
  if (typeof Notification === 'undefined') return
  if (Notification.permission !== 'granted') return
  try {
    new Notification(title, { body, tag: 'tempo-pomodoro' })
  } catch {
    /* some browsers require a service worker registration; ignore */
  }
}

function announceFocusDone() {
  const store = useStore.getState()
  const task = state.taskId ? store.tasks[state.taskId] : undefined
  const mins = state.focusMin

  if (!task) {
    store.toast({ text: `Focus block done — ${mins} minutes logged`, kind: 'ok' })
    notify('Tempo', `${mins} minutes of focus logged.`)
    return
  }

  if (!task.completed) {
    store.toast({
      text: `Focus done — mark “${task.title}” complete?`,
      kind: 'ok',
      action: { label: 'Done', run: () => useStore.getState().toggleTask(task.id) },
    })
  } else {
    store.toast({ text: `Focus done on “${task.title}”`, kind: 'ok' })
  }

  if (task.scheduled) {
    const extra = 25
    store.toast({
      text: `“${task.title}” is blocked at ${fmtTime(task.scheduled.start)} — extend it by ${extra} minutes?`,
      kind: 'info',
      action: {
        label: `+${extra}m`,
        run: () => {
          const s2 = useStore.getState()
          const fresh = s2.tasks[task.id]
          if (!fresh?.scheduled) return
          s2.updateTask(task.id, {
            scheduled: {
              start: fresh.scheduled.start,
              end: fresh.scheduled.end + extra * MIN,
            },
            durationMin: fresh.durationMin + extra,
          })
        },
      },
    })
  }

  notify('Tempo', `Focus block done — ${mins} minutes.`)
}

const nextPhase = (phase: Phase, rounds: number): Phase => {
  if (phase === 'focus') return (rounds + 1) % LONG_EVERY === 0 ? 'long' : 'short'
  return 'focus'
}

/* ---------------------------------- ticker ---------------------------------- */

let ticker: number | null = null

function stopTicker() {
  if (ticker !== null) {
    window.clearInterval(ticker)
    ticker = null
  }
}

function ensureTicker() {
  if (ticker === null) ticker = window.setInterval(tick, TICK_MS)
}

function complete() {
  stopTicker()
  const finished = state
  const mins = lengthFor(finished.phase)
  const store = useStore.getState()

  if (finished.sessionId) {
    // Breaks are never recorded as focus time, so their record is discarded.
    if (finished.phase === 'focus') store.finishSession(finished.sessionId, mins, true)
    else store.dropSession(finished.sessionId)
  }

  if (finished.phase === 'focus') announceFocusDone()
  else notify('Tempo', `${PHASE_LABEL[finished.phase]} over.`)

  const rounds = finished.phase === 'focus' ? finished.rounds + 1 : finished.rounds
  const phase = nextPhase(finished.phase, finished.rounds)

  set({
    phase,
    rounds,
    running: false,
    sessionId: null,
    endsAt: 0,
    remaining: msFor(phase),
    taskId: undefined,
    label: '',
  })
}

function tick() {
  if (!state.running) {
    stopTicker()
    return
  }
  const left = Math.max(0, state.endsAt - Date.now())
  if (left <= 0) {
    complete()
    return
  }
  // `set` also publishes a fresh snapshot, which is what drives re-renders —
  // a bare `emit()` would be swallowed by useSyncExternalStore's identity check.
  set({ remaining: left })
}

/* ---------------------------------- actions ---------------------------------- */

function start() {
  if (state.running) return
  const mins = lengthFor(state.phase)
  const label = state.label.trim() || PHASE_LABEL[state.phase]
  const sessionId = useStore
    .getState()
    .startSession({ taskId: state.taskId, label, minutes: mins })
  set({ running: true, sessionId, label, endsAt: Date.now() + mins * MIN, remaining: mins * MIN })
  ensureTicker()
}

function pause() {
  if (!state.running) return
  // The store has no paused state, so a paused run simply has not been
  // written anywhere yet — it is logged on finish and dropped on cancel.
  const left = remainingMs()
  stopTicker()
  set({ running: false, endsAt: 0, remaining: left })
}

function resume() {
  if (state.running) return
  const left = state.remaining || msFor(state.phase)
  set({ running: true, endsAt: Date.now() + left })
  ensureTicker()
}

function cancel() {
  stopTicker()
  if (state.sessionId) useStore.getState().dropSession(state.sessionId)
  set({ running: false, sessionId: null, endsAt: 0, remaining: msFor(state.phase) })
}

function skip() {
  stopTicker()
  if (state.sessionId) useStore.getState().dropSession(state.sessionId)
  const phase = nextPhase(state.phase, state.rounds)
  set({
    phase,
    running: false,
    sessionId: null,
    taskId: undefined,
    label: '',
    endsAt: 0,
    remaining: msFor(phase),
  })
}

const reset = () => cancel()

function setLength(which: 'focusMin' | 'shortMin' | 'longMin', v: number) {
  const clamped = Math.min(MAX_LEN, Math.max(MIN_LEN, Math.round(v / 5) * 5))
  const active =
    which === 'focusMin' ? 'focus' : which === 'shortMin' ? 'short' : 'long'
  set({ [which]: clamped, remaining: state.phase === active ? clamped * MIN : state.remaining })
}

/* ================================================================
   Presentation helpers
   ================================================================ */

const clock = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000))
  return `${`${Math.floor(total / 60)}`.padStart(2, '0')}:${`${total % 60}`.padStart(2, '0')}`
}

function DrainingRing({
  remaining,
  total,
  running,
  children,
  size = 170,
  stroke = 7,
  tone = 'auto',
}: {
  remaining: number
  total: number
  running: boolean
  children: ReactNode
  size?: number
  stroke?: number
  /** `signal` keeps the arc amber even when idle, for the focus surface. */
  tone?: 'auto' | 'signal'
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={running || tone === 'signal' ? 'var(--signal)' : 'var(--ink-4)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: `stroke-dashoffset ${TICK_MS}ms linear, stroke 200ms ease` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

function LengthStep({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(MAX_LEN, Math.max(MIN_LEN, v))
  return (
    <div className="flex items-center justify-between gap-2 py-[3px]">
      <span className="text-[12px] text-ink-2">{label}</span>
      <div className="flex items-center gap-1">
        <IconBtn label={`Decrease ${label} length`} onClick={() => onChange(clamp(value - 5))} disabled={value <= MIN_LEN}>
          <Minus size={12} />
        </IconBtn>
        <span className="mono-clock tnum w-[44px] text-center text-[12.5px] text-ink">{value}m</span>
        <IconBtn label={`Increase ${label} length`} onClick={() => onChange(clamp(value + 5))} disabled={value >= MAX_LEN}>
          <Plus size={12} />
        </IconBtn>
      </div>
    </div>
  )
}

/* ================================================================
   Widget — the dock pill
   ================================================================ */

export function PomodoroWidget() {
  const t = useTimer()
  const left = remainingMs()
  const live = t.running || t.sessionId !== null

  return (
    <button
      type="button"
      onClick={() => set({ open: true })}
      aria-label={
        live
          ? `${PHASE_LABEL[t.phase]} ${t.running ? 'running' : 'paused'}, ${clock(left)} left. Open timer.`
          : `Open focus timer, ${PHASE_LABEL[t.phase]}`
      }
      className={cn(
        'press anim-rise inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12px]',
        t.running
          ? 'border-signal/45 bg-signal/10 text-ink'
          : t.sessionId
            ? 'border-line-2 bg-surface-2 text-ink-2'
            : 'border-line bg-surface-2 text-ink-3 hover:text-ink-2',
      )}
    >
      {t.phase === 'focus' ? (
        <Timer size={12} className={t.running ? 'text-signal' : 'text-ink-4'} aria-hidden />
      ) : (
        <Coffee size={12} className="text-ink-4" aria-hidden />
      )}
      <span className="font-medium">{PHASE_LABEL[t.phase]}</span>
      <span className="mono-clock tnum text-ink">{clock(left)}</span>
      {t.running && <span className="anim-now-dot size-[6px] rounded-full bg-signal" aria-hidden />}
      {!live && (
        <>
          <span className="h-3 w-px bg-line-2" aria-hidden />
          <span className="mono-clock tnum text-[10.5px] text-ink-4">
            {minutesLabel(lengthFor(t.phase))}
          </span>
        </>
      )}
    </button>
  )
}

/* ================================================================
   Task picker
   ================================================================ */

function TaskPicker({
  taskId,
  onPick,
}: {
  taskId: ID | undefined
  onPick: (id: ID | undefined, title: string) => void
}) {
  const tasksMap = useStore((s) => s.tasks)
  const projectsMap = useStore((s) => s.projects)
  const [query, setQuery] = useState('')

  const open = useMemo(
    () => sortTasks(Object.values(tasksMap).filter((t) => !t.completed)),
    [tasksMap],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? open.filter((t) => t.title.toLowerCase().includes(q)) : open
    return list.slice(0, 30)
  }, [open, query])

  const current = taskId ? tasksMap[taskId] : undefined

  return (
    <div className="min-w-0">
      <label className="relative block">
        <Search
          size={12}
          className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-4"
          aria-hidden
        />
        <Input
          aria-label="Search open tasks"
          placeholder="Search open tasks"
          className="h-8 pl-7 text-[12.5px]"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {current ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Chip
            color={
              current.projectId
                ? `var(--color-${projectsMap[current.projectId]?.color ?? 'c-mint'})`
                : undefined
            }
            title={current.scheduled ? `Blocked ${fmtTime(current.scheduled.start)}` : 'Not scheduled'}
          >
            <span className="max-w-[20ch] truncate">{current.title}</span>
          </Chip>
          {current.scheduled && (
            <span className="mono-clock tnum shrink-0 text-[10.5px] text-ink-4">
              {fmtTime(current.scheduled.start)}
            </span>
          )}
          <Btn variant="quiet" size="xs" onClick={() => onPick(undefined, '')}>
            Clear
          </Btn>
        </div>
      ) : filtered.length > 0 ? (
        <div className="mt-1.5 max-h-[128px] overflow-y-auto rounded-[var(--radius-md)] border border-line bg-surface-2 p-1">
          {filtered.map((task) => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                onPick(task.id, task.title)
                setQuery('')
              }}
              className="press flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[12.5px] text-ink-2 hover:bg-surface-3 hover:text-ink"
            >
              <span className="mono-clock tnum w-[14px] shrink-0 text-[10px] text-ink-4">
                P{task.priority}
              </span>
              <span className="min-w-0 flex-1 truncate">{task.title}</span>
              {task.projectId && (
                <span
                  className="size-[6px] shrink-0 rounded-full"
                  style={{
                    background: `var(--color-${projectsMap[task.projectId]?.color ?? 'c-mint'})`,
                  }}
                  aria-hidden
                />
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-ink-4">
          {query ? 'No open task matches.' : 'No open tasks — this block stays unattributed.'}
        </p>
      )}
    </div>
  )
}

/* ================================================================
   Panel — the full timer card
   ================================================================ */

/** Side effects only. Always mounted, so a running session survives the panel
    being closed: the dock column unmounts, this does not. */
function TimerEffects() {
  const t = useTimer()
  const left = remainingMs()
  const prevTitle = useRef<string | null>(null)

  useEffect(() => {
    if (t.running) {
      if (prevTitle.current === null) prevTitle.current = document.title
      document.title = `${clock(left)} · ${t.label || PHASE_LABEL[t.phase]} — Tempo`
    } else if (prevTitle.current !== null) {
      document.title = prevTitle.current
      prevTitle.current = null
    }
  }, [t.running, left, t.label, t.phase])

  // The singleton owns the store side of a session; clear the run if the
  // whole app unmounts underneath it.
  useEffect(() => () => stopTicker(), [])

  return null
}

/** The timer pill lives in the sidebar footer; the panel is a modal. */
export function PomodoroDock({ suppressModal = false }: { suppressModal?: boolean } = {}) {
  const t = useTimer()
  return (
    <>
      <TimerEffects />
      <Modal
        open={t.open && !suppressModal}
        onClose={() => set({ open: false })}
        width={420}
        title={
          <span className="flex w-full items-center gap-1.5">
            {t.phase === 'focus' ? (
              <Timer size={13} className="text-signal" aria-hidden />
            ) : (
              <Coffee size={13} className="text-ink-3" aria-hidden />
            )}
            <span className="text-[12.5px] font-semibold tracking-tight text-ink">
              {PHASE_LABEL[t.phase]}
            </span>
            <span className="mono-clock tnum text-[10px] font-normal text-ink-4">
              round {(t.rounds % LONG_EVERY) + 1}/{LONG_EVERY}
            </span>
          </span>
        }
      >
        <PomodoroPanel />
      </Modal>
    </>
  )
}

/**
 * Focus mode: the whole app steps aside so the only thing on screen is the
 * block of time you promised yourself. The session keeps running underneath, so
 * entering and leaving never interrupts it.
 */
export function FocusSurface({ onLeave }: { onLeave: () => void }) {
  const t = useTimer()

  // The surface owns its own keys: space runs the session, escape leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onLeave()
        return
      }
      if (e.key !== ' ' && e.code !== 'Space') return
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      e.preventDefault()
      // Read the singleton directly: this is an event, not a render.
      const s = state
      if (s.running) pause()
      else if (s.sessionId) resume()
      else start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onLeave])
  const task = useStore((s) => (t.taskId ? s.tasks[t.taskId] : undefined))
  const toggleTask = useStore((s) => s.toggleTask)
  const total = msFor(t.phase)
  const left = remainingMs()
  const p = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  const isFocus = t.phase === 'focus'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      className="fixed inset-0 z-[130] flex flex-col items-center justify-center bg-bg px-6"
    >
      {/* clicking away leaves, but never steals a click meant for a control */}
      <button
        aria-label="Leave focus mode"
        onClick={onLeave}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative flex flex-col items-center gap-7">
        <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.18em] text-ink-4">
          {isFocus ? <Timer size={12} /> : <Coffee size={12} />}
          <span>{PHASE_LABEL[t.phase]}</span>
          <span className="mono-clock tnum normal-case tracking-normal text-ink-4">
            round {(t.rounds % LONG_EVERY) + 1}/{LONG_EVERY}
          </span>
        </div>

        <DrainingRing remaining={left} total={total} running={t.running} tone="signal" size={288} stroke={9}>
          <div className="text-center">
            <div className="mono-clock tnum text-[58px] font-semibold leading-none tracking-tight text-ink">
              {clock(left)}
            </div>
            <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-ink-4">
              {t.running ? 'in flight' : t.sessionId ? 'paused' : 'ready'}
            </div>
          </div>
        </DrainingRing>

        <div className="max-w-[34rem] text-center">
          <div className="truncate font-serif text-[22px] leading-tight tracking-tight text-ink">
            {task ? task.title : 'Unattributed focus'}
          </div>
          <p className="mt-2 text-[12px] text-ink-4">
            {isFocus
              ? `Next up after this: ${minutesLabel(lengthFor(isFocus ? 'short' : 'focus'))} away from the keyboard.`
              : `Then ${minutesLabel(lengthFor('focus'))} of focus.`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {t.running ? (
            <Btn variant="primary" size="md" onClick={pause}>
              <Pause size={14} />
              Pause
            </Btn>
          ) : (
            <Btn variant="primary" size="md" onClick={t.sessionId ? resume : start}>
              <Play size={14} />
              {t.sessionId ? 'Resume' : 'Start'}
            </Btn>
          )}
          <Btn onClick={skip} aria-label="Skip to the next phase">
            <SkipForward size={14} />
            Skip
          </Btn>
          {task && !task.completed && (
            <Btn
              onClick={() => toggleTask(task.id)}
              aria-label="Mark the linked task done"
              className="border-good/40 text-good hover:bg-good/10"
            >
              <Check size={14} />
              Done
            </Btn>
          )}
        </div>

        <p className="mono-clock text-[10px] text-ink-4">
          <Kbd>esc</Kbd> to leave · <Kbd>space</Kbd> to {t.running ? 'pause' : 'start'} ·{' '}
          {Math.round(p * 100)}% left
        </p>
      </div>
    </div>
  )
}

function PomodoroPanel() {
  const t = useTimer()
  const tasksMap = useStore((s) => s.tasks)

  const total = msFor(t.phase)
  const left = remainingMs()
  const task = t.taskId ? tasksMap[t.taskId] : undefined
  const p = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0

  return (
    <div className="flex flex-col">
      <div className="flex flex-col items-center gap-3 px-4 py-4">
        <DrainingRing remaining={left} total={total} running={t.running}>
          <div className="text-center">
            <div className="mono-clock tnum text-[33px] font-semibold leading-none tracking-tight text-ink">
              {clock(left)}
            </div>
            <div className="mt-1.5 text-[9.5px] uppercase tracking-[0.14em] text-ink-4">
              {t.running ? 'in flight' : t.sessionId ? 'paused' : 'ready'}
            </div>
          </div>
        </DrainingRing>

        <div className="w-full truncate text-center text-[12px] text-ink-3">
          {task ? task.title : <span className="text-ink-4">Unattributed focus</span>}
        </div>

        {/* ------------------------------ transport ----------------------------- */}
        <div className="flex w-full items-center justify-center gap-1.5">
          {t.running ? (
            <Btn variant="primary" size="md" onClick={pause}>
              <Pause size={13} />
              Pause
            </Btn>
          ) : (
            <Btn variant="primary" size="md" onClick={t.sessionId ? resume : start}>
              <Play size={13} />
              {t.sessionId ? 'Resume' : 'Start'}
            </Btn>
          )}
          <Btn onClick={skip} aria-label="Skip to the next phase">
            <SkipForward size={13} />
            Skip
          </Btn>
          <Btn onClick={reset} aria-label="Reset this phase">
            <RotateCcw size={13} />
            Reset
          </Btn>
        </div>

        <p className="mono-clock tnum w-full text-center text-[10px] text-ink-4">
          {minutesLabel(lengthFor(t.phase))} block · {Math.round(p * 100)}% left
        </p>
      </div>

      {/* -------------------------------- task -------------------------------- */}
      <div className="border-t border-line px-4 py-3">
        <SectionTitle>Working on</SectionTitle>
        <TaskPicker taskId={t.taskId} onPick={(id, title) => set({ taskId: id, label: title })} />
        <div className="mt-2">
          <label
            htmlFor="pomo-label"
            className="text-[10px] font-semibold uppercase tracking-[0.13em] text-ink-4"
          >
            Session label
          </label>
          <Input
            id="pomo-label"
            aria-label="Session label"
            placeholder={task ? task.title : PHASE_LABEL[t.phase]}
            className="mt-1 h-7 text-[12px]"
            value={t.label}
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>
      </div>

      {/* ------------------------------- lengths ------------------------------- */}
      <div className="border-t border-line px-4 py-2.5">
        <LengthStep label="Focus" value={t.focusMin} onChange={(v) => setLength('focusMin', v)} />
        <LengthStep label="Short break" value={t.shortMin} onChange={(v) => setLength('shortMin', v)} />
        <LengthStep label="Long break" value={t.longMin} onChange={(v) => setLength('longMin', v)} />
        <p className="pt-1 text-[10px] text-ink-4">
          {MIN_LEN}–{MAX_LEN} minutes each. A long break lands after every {LONG_EVERY} focus
          blocks.
        </p>
      </div>
    </div>
  )
}