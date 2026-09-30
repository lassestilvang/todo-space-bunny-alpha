import { useEffect, useRef, useState } from 'react'
import {
  AlarmClock,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleDot,
  Clock3,
  Copy,
  Flag,
  GripVertical,
  Hash,
  ListTree,
  Lock,
  LockOpen,
  MapPin,
  Moon,
  NotebookPen,
  Repeat,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Timer,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { DayPart, Energy, Priority, Recurrence, Task } from '@/types'
import {
  addDays,
  describeRecurrence,
  fmtTime,
  fromKey,
  MIN,
  toKey,
} from '@/lib/date'
import { cn, cssColor, minutesLabel } from '@/lib/selectors'
import { Btn, Checkbox, IconBtn, Input, Seg } from './ui'
import { Markdown } from './Markdown'
import { uid } from '@/lib/id'

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 1, label: 'P1', color: 'var(--color-bad)' },
  { value: 2, label: 'P2', color: 'var(--color-c-ember)' },
  { value: 3, label: 'P3', color: 'var(--color-c-aqua)' },
  { value: 4, label: 'P4', color: 'var(--color-ink-4)' },
]

const ENERGIES: { value: Energy; icon: typeof Sun; label: string; hint: string }[] = [
  { value: 'deep', icon: Sparkles, label: 'Deep', hint: 'Needs your peak hours' },
  { value: 'shallow', icon: Sun, label: 'Shallow', hint: 'Fine on low battery' },
  { value: 'admin', icon: Moon, label: 'Admin', hint: 'Paperwork, low stakes' },
]

const PARTS: { value: DayPart; icon: typeof Sun; label: string }[] = [
  { value: 'any', icon: Clock3, label: 'Any' },
  { value: 'morning', icon: Sunrise, label: 'Morning' },
  { value: 'afternoon', icon: Sun, label: 'Afternoon' },
  { value: 'evening', icon: Sunset, label: 'Evening' },
]

export function DetailPanel() {
  const panel = useStore((s) => s.ui.panel)
  const setPanel = useStore((s) => s.setPanel)
  const tasks = useStore((s) => s.tasks)
  const events = useStore((s) => s.events)
  const projects = useStore((s) => s.projects)
  const labels = useStore((s) => s.labels)

  if (panel?.kind === 'task' && tasks[panel.id]) return <TaskEditor id={panel.id} onClose={() => setPanel(null)} />
  if (panel?.kind === 'event' && events[panel.id])
    return <EventEditor id={panel.id} onClose={() => setPanel(null)} />
  if (panel?.kind === 'settings') return <SettingsPanel onClose={() => setPanel(null)} />
  if (panel?.kind === 'habit' || panel?.kind === 'doc') return null
  void projects
  void labels
  return null
}

/* ------------------------------------------------------------------ task */

function TaskEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const task = useStore((s) => s.tasks[id])
  const update = useStore((s) => s.updateTask)
  const toggle = useStore((s) => s.toggleTask)
  const remove = useStore((s) => s.deleteTask)
  const duplicate = useStore((s) => s.duplicateTask)
  const schedule = useStore((s) => s.scheduleTask)
  const projects = useStore((s) => s.projects)
  const labels = useStore((s) => s.labels)
  const allTasks = useStore((s) => s.tasks)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)
  const startSession = useStore((s) => s.startSession)
  const toast = useStore((s) => s.toast)
  const [sub, setSub] = useState('')
  const [noteMode, setNoteMode] = useState<'write' | 'preview'>('write')
  const titleRef = useRef<HTMLTextAreaElement>(null)

  const project = task.projectId ? projects[task.projectId] : undefined
  const color = cssColor(project?.color)

  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [task?.title])

  if (!task) return null
  const doneSubs = task.subtasks.filter((s) => s.done).length

  const setDuration = (d: number) => {
    const next = Math.max(5, Math.min(480, d))
    update(id, { durationMin: next })
    if (task.scheduled) {
      schedule(id, { start: task.scheduled.start, end: task.scheduled.start + next * MIN })
    }
  }

  const toggleRecurrence = (r: Recurrence) =>
    update(id, {
      recurrence:
        task.recurrence &&
        task.recurrence.freq === r.freq &&
        task.recurrence.interval === r.interval &&
        JSON.stringify(task.recurrence.weekdays) === JSON.stringify(r.weekdays)
          ? undefined
          : r,
    })

  return (
    <PanelShell onClose={onClose} accent={color} label="Task">
      {/* title */}
      <div className="flex gap-2.5">
        <div className="pt-[3px]">
          <Checkbox
            checked={task.completed}
            color={color}
            label="Complete task"
            size={18}
            onChange={() => toggle(id)}
          />
        </div>
        <textarea
          ref={titleRef}
          value={task.title}
          rows={1}
          onChange={(e) => update(id, { title: e.target.value }, false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLTextAreaElement).blur()
            }
          }}
          className="w-full resize-none bg-transparent text-[16px] font-semibold leading-snug tracking-tight text-ink outline-none placeholder:text-ink-4"
        />
      </div>

      {task.completed && (
        <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] bg-good/10 px-2.5 py-1.5 text-[11.5px] text-good">
          <CheckCircle2 size={12} />
          Done {task.completedAt ? fmtTime(task.completedAt) : ''}
          <button className="ml-auto underline-offset-2 hover:underline" onClick={() => toggle(id)}>
            Undo
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3.5">
        {/* priority */}
        <Field label="Priority" icon={<Flag size={12} />}>
          <div className="flex gap-1">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                onClick={() => update(id, { priority: p.value })}
                className={cn(
                  'mono-clock press rounded-[6px] border px-2 py-[3px] text-[10.5px]',
                  task.priority === p.value
                    ? 'border-transparent text-ink'
                    : 'border-line text-ink-4 hover:text-ink-2',
                )}
                style={
                  task.priority === p.value
                    ? { background: `color-mix(in oklab, ${p.color} 22%, transparent)`, color: p.color }
                    : undefined
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>

        {/* duration */}
        <Field label="How long it really takes" icon={<Timer size={12} />}>
          <div className="flex items-center gap-1.5">
            <Stepper value={task.durationMin} onChange={setDuration} step={5} min={5} max={480} />
            <span className="mono-clock w-12 text-[11px] text-ink-3">
              {minutesLabel(task.durationMin)}
            </span>
          </div>
        </Field>

        {/* energy */}
        <Field label="Energy" icon={<Sparkles size={12} />}>
          <div className="flex gap-1">
            {ENERGIES.map((e) => {
              const Icon = e.icon
              return (
                <button
                  key={e.value}
                  title={e.hint}
                  onClick={() => update(id, { energy: e.value })}
                  className={cn(
                    'press flex items-center gap-1.5 rounded-[6px] border px-2 py-[3px] text-[11px]',
                    task.energy === e.value
                      ? 'border-line-strong bg-surface-3 text-ink'
                      : 'border-line text-ink-4 hover:text-ink-2',
                  )}
                >
                  <Icon size={11} />
                  {e.label}
                </button>
              )
            })}
          </div>
        </Field>

        {/* part of day */}
        <Field label="Best part of day" icon={<Sunrise size={12} />}>
          <div className="flex gap-1">
            {PARTS.map((p) => {
              const Icon = p.icon
              return (
                <button
                  key={p.value}
                  onClick={() => update(id, { dayPart: p.value })}
                  className={cn(
                    'press flex items-center gap-1 rounded-[6px] border px-2 py-[3px] text-[11px]',
                    task.dayPart === p.value
                      ? 'border-line-strong bg-surface-3 text-ink'
                      : 'border-line text-ink-4 hover:text-ink-2',
                  )}
                >
                  <Icon size={11} />
                  {p.label}
                </button>
              )
            })}
          </div>
        </Field>

        {/* due + schedule */}
        <Field label="When" icon={<CalendarClock size={12} />}>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              type="date"
              value={task.due ?? ''}
              onChange={(e) => update(id, { due: e.target.value || undefined })}
              className="mono-clock h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none focus:border-line-strong"
            />
            {task.due && (
              <>
                <input
                  type="time"
                  value={
                    task.scheduled
                      ? fmtTime(task.scheduled.start)
                      : task.dueHasTime
                        ? '09:00'
                        : ''
                  }
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number)
                    if (Number.isNaN(h)) return
                    const day = fromKey(task.due!)
                    const start = new Date(day).setHours(h, m, 0, 0)
                    schedule(id, { start, end: start + task.durationMin * MIN })
                  }}
                  className="mono-clock h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none focus:border-line-strong"
                />
                <IconBtn
                  label="Go to this day"
                  onClick={() => {
                    if (task.due) {
                      setAnchor(task.due)
                      setView('day')
                    }
                  }}
                >
                  <ArrowGlyph />
                </IconBtn>
                <IconBtn
                  label={task.dueHasTime ? 'Remove the time' : 'Give it a time'}
                  onClick={() => {
                    if (task.scheduled) schedule(id, null)
                    else {
                      const start = fromKey(task.due!).getTime() + 9 * 60 * MIN
                      schedule(id, { start, end: start + task.durationMin * MIN })
                    }
                  }}
                >
                  {task.scheduled ? <LockOpen size={13} /> : <CalendarPlus size={13} />}
                </IconBtn>
              </>
            )}
            {task.due && (
              <Btn size="xs" onClick={() => update(id, { due: toKey(addDays(fromKey(task.due!), 1)) })}>
                +1d
              </Btn>
            )}
            {!task.due && (
              <Btn size="xs" onClick={() => update(id, { due: toKey(new Date()) })}>
                Today
              </Btn>
            )}
          </div>
          {task.scheduled && (
            <div className="mono-clock mt-1.5 flex items-center gap-2 text-[10.5px] text-ink-4">
              <Lock size={10} /> block {fmtTime(task.scheduled.start)} – {fmtTime(task.scheduled.end)}
              {task.planLocked && ' · kept where you put it'}
            </div>
          )}
        </Field>

        {/* project */}
        <Field label="Project" icon={<CircleDot size={12} />}>
          <select
            value={task.projectId ?? ''}
            onChange={(e) => update(id, { projectId: e.target.value || undefined })}
            className="h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none focus:border-line-strong"
          >
            <option value="">Inbox</option>
            {Object.values(projects)
              .filter((p) => !p.archived)
              .sort((a, b) => a.order - b.order)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.glyph} {p.name}
                </option>
              ))}
          </select>
        </Field>

        {/* labels */}
        <Field label="Labels" icon={<Hash size={12} />}>
          <div className="flex flex-wrap gap-1">
            {Object.values(labels).map((l) => {
              const on = task.labelIds.includes(l.id)
              return (
                <button
                  key={l.id}
                  onClick={() =>
                    update(id, {
                      labelIds: on ? task.labelIds.filter((x) => x !== l.id) : [...task.labelIds, l.id],
                    })
                  }
                  className={cn(
                    'press rounded-full border px-2 py-[2px] text-[10.5px]',
                    on ? 'border-transparent' : 'border-line text-ink-4 hover:text-ink-2',
                  )}
                  style={
                    on
                      ? {
                          background: `color-mix(in oklab, var(--color-${l.color}) 20%, transparent)`,
                          color: `var(--color-${l.color})`,
                        }
                      : undefined
                  }
                >
                  {l.name}
                </button>
              )
            })}
          </div>
        </Field>

        {/* subtasks */}
        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <ListTree size={12} className="text-ink-4" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
              Steps
            </span>
            {task.subtasks.length > 0 && (
              <span className="mono-clock ml-auto text-[10px] text-ink-4">
                {doneSubs}/{task.subtasks.length}
              </span>
            )}
          </div>
          <div className="mb-1.5 h-[3px] overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${task.subtasks.length ? (doneSubs / task.subtasks.length) * 100 : 0}%`,
                background: color,
              }}
            />
          </div>
          <div className="space-y-0.5">
            {task.subtasks.map((s) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-[6px] px-1 py-1 hover:bg-surface-2">
                <Checkbox
                  checked={s.done}
                  color={color}
                  size={14}
                  label={s.title}
                  onChange={() =>
                    update(id, {
                      subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)),
                    })
                  }
                />
                <span
                  className={cn(
                    'min-w-0 flex-1 text-[12.5px]',
                    s.done ? 'text-ink-4 line-through' : 'text-ink-2',
                  )}
                >
                  {s.title}
                </span>
                <IconBtn
                  label="Remove step"
                  className="h-5 w-5 opacity-0 group-hover:opacity-100"
                  onClick={() => update(id, { subtasks: task.subtasks.filter((x) => x.id !== s.id) })}
                >
                  <X size={11} />
                </IconBtn>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <GripVertical size={12} className="text-ink-4" />
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && sub.trim()) {
                  update(id, { subtasks: [...task.subtasks, { id: uid('s'), title: sub.trim(), done: false }] })
                  setSub('')
                }
              }}
              placeholder="Add a step"
              className="h-7 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-4"
            />
          </div>
        </div>

        {/* notes */}
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <NotebookPen size={12} className="text-ink-4" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
              Notes
            </span>
            <div className="ml-auto">
              <Seg
                size="xs"
                value={noteMode}
                options={[
                  { value: 'write', label: 'Write' },
                  { value: 'preview', label: 'Read' },
                ]}
                onChange={(v) => setNoteMode(v as 'write' | 'preview')}
              />
            </div>
          </div>
          {noteMode === 'write' ? (
            <textarea
              value={task.notes}
              onChange={(e) => update(id, { notes: e.target.value }, false)}
              rows={5}
              placeholder="Markdown works here."
              className="w-full resize-y rounded-[var(--radius-md)] border border-line bg-surface-2 p-2.5 text-[12.5px] leading-relaxed text-ink-2 outline-none placeholder:text-ink-4 focus:border-line-strong"
            />
          ) : (
            <div className="prose-app rounded-[var(--radius-md)] border border-line bg-surface-2 p-2.5 text-[12.5px]">
              {task.notes ? <Markdown source={task.notes} /> : <span className="text-ink-4">Nothing written yet.</span>}
            </div>
          )}
        </div>

        {/* repeat */}
        <Field label="Repeat" icon={<Repeat size={12} />}>
          <div className="flex flex-wrap gap-1">
            {[
              { label: 'Daily', r: { freq: 'daily', interval: 1 } as Recurrence },
              {
                label: 'Weekdays',
                r: { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5] } as Recurrence,
              },
              {
                label: `Every ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(task.due ?? Date.now()).getDay()]}`,
                r: {
                  freq: 'weekly',
                  interval: 1,
                  weekdays: [new Date(task.due ?? Date.now()).getDay()],
                } as Recurrence,
              },
              { label: 'Monthly', r: { freq: 'monthly', interval: 1 } as Recurrence },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => toggleRecurrence(o.r)}
                className={cn(
                  'press rounded-[6px] border px-2 py-[3px] text-[10.5px]',
                  task.recurrence && describeRecurrence(task.recurrence) === describeRecurrence(o.r)
                    ? 'border-line-strong bg-surface-3 text-ink'
                    : 'border-line text-ink-4 hover:text-ink-2',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {task.recurrence && (
            <div className="mt-1.5 text-[10.5px] text-ink-4">{describeRecurrence(task.recurrence)}</div>
          )}
        </Field>

        {/* reminders */}
        <Field label="Remind me" icon={<AlarmClock size={12} />}>
          <div className="flex flex-wrap gap-1">
            {[0, 10, 60, 1440].map((m) => {
              const on = task.reminders.includes(-m)
              return (
                <button
                  key={m}
                  onClick={() =>
                    update(id, {
                      reminders: on
                        ? task.reminders.filter((x) => x !== -m)
                        : [...task.reminders, -m],
                    })
                  }
                  className={cn(
                    'press rounded-[6px] border px-2 py-[3px] text-[10.5px]',
                    on
                      ? 'border-line-strong bg-surface-3 text-ink'
                      : 'border-line text-ink-4 hover:text-ink-2',
                  )}
                >
                  {m === 0 ? 'At the time' : `${minutesLabel(m)} before`}
                </button>
              )
            })}
          </div>
        </Field>

        {/* waiting on */}
        <Field label="Blocked by" icon={<Lock size={12} />}>
          <select
            value={task.waitFor ?? ''}
            onChange={(e) => update(id, { waitFor: e.target.value || undefined })}
            className="h-7 max-w-[190px] rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none focus:border-line-strong"
          >
            <option value="">Not blocked</option>
            {Object.values(allTasks)
              .filter((t) => t.id !== id && !t.completed)
              .sort((a, b) => a.priority - b.priority)
              .slice(0, 40)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
          </select>
        </Field>
      </div>

      {/* actions */}
      <div className="mt-5 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        <Btn
          onClick={() => {
            startSession({ taskId: id, label: task.title, minutes: 25 })
            toast({ text: `Focusing on “${task.title}” — 25 minutes`, kind: 'ok' })
          }}
        >
          <Timer size={12} /> Focus 25m
        </Btn>
        <Btn onClick={() => duplicate(id)}>
          <Copy size={12} /> Duplicate
        </Btn>
        <div className="flex-1" />
        <Btn
          variant="danger"
          onClick={() => {
            remove(id)
            onClose()
          }}
        >
          <Trash2 size={12} /> Delete
        </Btn>
      </div>
    </PanelShell>
  )
}

/* ------------------------------------------------------------------ event */

function EventEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const event = useStore((s) => s.events[id])
  const update = useStore((s) => s.updateEvent)
  const remove = useStore((s) => s.deleteEvent)
  const projects = useStore((s) => s.projects)
  const setAnchor = useStore((s) => s.setAnchor)
  const setView = useStore((s) => s.setView)

  if (!event) return null
  const timeValue = (t: number) => fmtTime(t)

  return (
    <PanelShell onClose={onClose} label="Meeting" accent={cssColor(event.color)}>
      <input
        value={event.title}
        onChange={(e) => update(id, { title: e.target.value }, false)}
        className="w-full bg-transparent text-[16px] font-semibold tracking-tight text-ink outline-none"
      />

      <div className="mt-4 space-y-3.5">
        <Field label="Starts" icon={<CalendarClock size={12} />}>
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={toKey(event.start)}
              onChange={(e) => {
                const d = fromKey(e.target.value)
                const shift = d.getTime() - fromKey(toKey(event.start)).getTime()
                update(id, { start: event.start + shift, end: event.end + shift }, false)
              }}
              className="mono-clock h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none"
            />
            <input
              type="time"
              value={timeValue(event.start)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                const day = fromKey(toKey(event.start))
                const start = new Date(day).setHours(h, m, 0, 0)
                update(id, { start, end: start + (event.end - event.start) }, false)
              }}
              className="mono-clock h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none"
            />
          </div>
        </Field>

        <Field label="Ends" icon={<Clock3 size={12} />}>
          <div className="flex items-center gap-1.5">
            <input
              type="time"
              value={timeValue(event.end)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(':').map(Number)
                const day = fromKey(toKey(event.start))
                update(id, { end: new Date(day).setHours(h, m, 0, 0) }, false)
              }}
              className="mono-clock h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none"
            />
            <span className="mono-clock text-[10.5px] text-ink-4">
              {minutesLabel((event.end - event.start) / MIN)} long
            </span>
          </div>
        </Field>

        <Field label="Location" icon={<MapPin size={12} />}>
          <Input
            value={event.location ?? ''}
            onChange={(e) => update(id, { location: e.target.value }, false)}
            placeholder="Room, link, address"
            className="h-7 text-[12px]"
          />
        </Field>

        <Field label="Project" icon={<CircleDot size={12} />}>
          <select
            value={event.projectId ?? ''}
            onChange={(e) => update(id, { projectId: e.target.value || undefined })}
            className="h-7 rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none"
          >
            <option value="">No project</option>
            {Object.values(projects)
              .filter((p) => !p.archived)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.glyph} {p.name}
                </option>
              ))}
          </select>
        </Field>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
          <span className="flex items-center gap-2 text-[12px] text-ink-2">
            {event.locked ? <Lock size={12} /> : <Unlock size={12} />}
            {event.locked ? 'Holds its slot' : 'Planner may move around it'}
          </span>
          <input
            type="checkbox"
            checked={event.locked}
            onChange={(e) => update(id, { locked: e.target.checked })}
            className="size-3.5 accent-[var(--signal)]"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
          <span className="text-[12px] text-ink-2">Tentative — avoid booking over it</span>
          <input
            type="checkbox"
            checked={event.tentative}
            onChange={(e) => update(id, { tentative: e.target.checked })}
            className="size-3.5 accent-[var(--signal)]"
          />
        </label>

        <div>
          <div className="mb-1.5 flex items-center gap-1.5">
            <NotebookPen size={12} className="text-ink-4" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
              Agenda
            </span>
          </div>
          <textarea
            value={event.notes ?? ''}
            onChange={(e) => update(id, { notes: e.target.value }, false)}
            rows={5}
            className="w-full resize-y rounded-[var(--radius-md)] border border-line bg-surface-2 p-2.5 text-[12.5px] leading-relaxed text-ink-2 outline-none focus:border-line-strong"
          />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-1.5 border-t border-line pt-3">
        <Btn
          onClick={() => {
            setAnchor(toKey(event.start))
            setView('day')
          }}
        >
          Open this day
        </Btn>
        <div className="flex-1" />
        <Btn
          variant="danger"
          onClick={() => {
            remove(id)
            onClose()
          }}
        >
          <Trash2 size={12} /> Delete
        </Btn>
      </div>
    </PanelShell>
  )
}

/* ------------------------------------------------------------------ settings */

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings)
  const set = useStore((s) => s.setSettings)
  const exportState = useStore((s) => s.exportState)
  const importState = useStore((s) => s.importState)
  const resetAll = useStore((s) => s.resetAll)
  const toast = useStore((s) => s.toast)
  return (
    <PanelShell onClose={onClose} label="Settings">
      <div className="space-y-4">
        <Group title="Your day">
          <NumRow
            label="Day starts"
            value={settings.gridStart}
            onChange={(v) => set({ gridStart: v })}
            format={(v) => fmtTime(new Date().setHours(Math.floor(v / 60), v % 60, 0, 0))}
            step={30}
          />
          <NumRow
            label="Day ends"
            value={settings.gridEnd}
            onChange={(v) => set({ gridEnd: v })}
            format={(v) => fmtTime(new Date().setHours(Math.floor(v / 60), v % 60, 0, 0))}
            step={30}
          />
          <NumRow
            label="Workday starts"
            value={settings.workStart}
            onChange={(v) => set({ workStart: v })}
            format={(v) => fmtTime(new Date().setHours(Math.floor(v / 60), v % 60, 0, 0))}
            step={30}
          />
          <NumRow
            label="Workday ends"
            value={settings.workEnd}
            onChange={(v) => set({ workEnd: v })}
            format={(v) => fmtTime(new Date().setHours(Math.floor(v / 60), v % 60, 0, 0))}
            step={30}
          />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[12.5px] text-ink-2">Working days</span>
            <div className="flex gap-0.5">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <button
                  key={i}
                  onClick={() =>
                    set({
                      workDays: settings.workDays.includes(i)
                        ? settings.workDays.filter((x) => x !== i)
                        : [...settings.workDays, i].sort(),
                    })
                  }
                  className={cn(
                    'mono-clock size-6 rounded-[6px] border text-[10.5px]',
                    settings.workDays.includes(i)
                      ? 'border-signal/60 bg-signal/12 text-signal'
                      : 'border-line text-ink-4',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </Group>

        <Group title="Planner">
          <NumRow
            label="Snap to"
            value={settings.snapMin}
            min={5}
            max={60}
            onChange={(v) => set({ snapMin: v })}
            format={(v) => `${v} min`}
            step={5}
          />
          <NumRow
            label="Default estimate"
            value={settings.defaultDuration}
            min={5}
            max={240}
            onChange={(v) => set({ defaultDuration: v })}
            format={(v) => `${v} min`}
            step={5}
          />
          <NumRow
            label="Buffer after each block"
            value={settings.bufferMin}
            min={0}
            max={30}
            onChange={(v) => set({ bufferMin: v })}
            format={(v) => `${v} min`}
            step={5}
          />
          <NumRow
            label="Longest block before a break"
            value={settings.maxBlockMin}
            min={30}
            max={240}
            onChange={(v) => set({ maxBlockMin: v })}
            format={(v) => `${v} min`}
            step={15}
          />
        </Group>

        <Group title="Assistant">
          <label className="block py-1.5">
            <span className="text-[12.5px] text-ink-2">Model</span>
            <select
              value={settings.llm.model}
              onChange={(e) => set({ llm: { ...settings.llm, model: e.target.value } })}
              className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] text-ink-2 outline-none"
            >
              <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
              <option value="claude-opus-4-1">Claude Opus 4.1</option>
              <option value="gpt-4.1">GPT-4.1</option>
              <option value="gpt-4o-mini">GPT-4o mini</option>
            </select>
          </label>
          <label className="block py-1.5">
            <span className="text-[12.5px] text-ink-2">API key</span>
            <input
              type="password"
              value={settings.llm.apiKey}
              onChange={(e) => set({ llm: { ...settings.llm, apiKey: e.target.value } })}
              placeholder="sk-… stored only in this browser"
              className="mono-clock mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-2 px-2 text-[11.5px] text-ink-2 outline-none"
            />
            <span className="mt-1 block text-[10.5px] leading-relaxed text-ink-4">
              Without a key the assistant still works — it falls back to a local planner that
              understands the calendar, the tasks and your rules. The key is only ever sent to the
              provider you pick, and lives in this browser&apos;s local storage.
            </span>
          </label>
        </Group>

        <Group title="Data">
          <div className="flex flex-wrap gap-1.5 pt-1.5">
            <Btn
              onClick={() => {
                const blob = new Blob([exportState()], { type: 'application/json' })
                const a = document.createElement('a')
                a.href = URL.createObjectURL(blob)
                a.download = `tempo-${toKey(new Date())}.json`
                a.click()
              }}
            >
              Export
            </Btn>
            <label className="press inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 text-[12.5px] text-ink-2 hover:bg-surface-3 hover:text-ink">
              Import
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  const ok = importState(await f.text())
                  toast({
                    text: ok ? 'Imported your workspace' : 'That file did not look like a Tempo export',
                    kind: ok ? 'ok' : 'warn',
                  })
                }}
              />
            </label>
            <Btn
              variant="danger"
              onClick={() => {
                if (confirm('Reset everything back to the sample workspace?')) resetAll()
              }}
            >
              Reset to sample
            </Btn>
          </div>
        </Group>
      </div>
    </PanelShell>
  )
}

/* ------------------------------------------------------------------ shell */

function PanelShell({
  children,
  onClose,
  label,
  accent,
}: {
  children: React.ReactNode
  onClose: () => void
  label: string
  accent?: string
}) {
  return (
    <div className="anim-slide-left relative z-40 flex w-[380px] shrink-0 flex-col border-l border-line bg-bg">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
          {accent && <span className="size-[7px] rounded-full" style={{ background: accent }} />}
          {label}
        </span>
        <IconBtn label="Close panel" onClick={onClose}>
          <X size={15} />
        </IconBtn>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>
  )
}

function Field({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="text-ink-4">{icon}</span>}
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-4">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-surface-2/50 px-3 py-2">
      <h4 className="pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
        {title}
      </h4>
      {children}
    </section>
  )
}

function Stepper({
  value,
  onChange,
  step,
  min,
  max,
}: {
  value: number
  onChange: (v: number) => void
  step: number
  min: number
  max: number
}) {
  return (
    <div className="flex items-center overflow-hidden rounded-[7px] border border-line">
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        className="press h-7 w-7 text-ink-3 hover:bg-surface-3 hover:text-ink"
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mono-clock tnum h-7 w-12 border-x border-line bg-surface-2 text-center text-[11.5px] text-ink outline-none"
      />
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        className="press h-7 w-7 text-ink-3 hover:bg-surface-3 hover:text-ink"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  )
}

function NumRow({
  label,
  value,
  onChange,
  format,
  step = 15,
  min = 0,
  max = 1440,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  format: (v: number) => string
  step?: number
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mono-clock tnum h-7 w-16 rounded-[6px] border border-line bg-surface-2 px-2 text-right text-[11.5px] text-ink outline-none"
        />
        <span className="mono-clock w-12 text-[10.5px] text-ink-4">{format(value)}</span>
      </div>
    </div>
  )
}

const ArrowGlyph = () => (
  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M2 7h10M8.5 3.5 12 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export type { Task }
