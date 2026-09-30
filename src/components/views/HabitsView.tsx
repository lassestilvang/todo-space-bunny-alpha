import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  CalendarPlus,
  Check,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react'
import type { Habit, HabitCadence } from '@/types'
import {
  MIN,
  WEEKDAYS_SHORT,
  addDays,
  atMinutes,
  fmtTime,
  startOfWeek,
  toKey,
} from '@/lib/date'
import {
  COLOR_TOKENS,
  cn,
  cssColor,
  habitDueOn,
  habitStreak,
  habitWeekCount,
  type ColorToken,
} from '@/lib/selectors'
import { useStore } from '@/lib/store'
import {
  Btn,
  Empty,
  IconBtn,
  Input,
  MenuItem,
  Modal,
  Popover,
  Ring,
  SectionTitle,
  Seg,
} from '@/components/ui'

/* ------------------------------------------------------------------ types */

type Density = 'week' | '12w'

type Draft = {
  name: string
  color: ColorToken
  cadence: HabitCadence
  weekdays: number[]
  targetPerWeek: number
  anchorMin: number | null
  durationMin: number
}

const blankDraft = (): Draft => ({
  name: '',
  color: 'c-mint',
  cadence: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  targetPerWeek: 5,
  anchorMin: 8 * 60,
  durationMin: 15,
})

const cadenceLabel = (h: Habit): string => {
  if (h.cadence === 'daily') return 'Every day'
  if (h.cadence === 'weekdays') return 'Weekdays'
  if (!h.weekdays.length) return 'Weekly'
  return h.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAYS_SHORT[d])
    .join(' ')
}

const minToClock = (m: number): string => {
  const mm = ((m % 1440) + 1440) % 1440
  return `${`${Math.floor(mm / 60)}`.padStart(2, '0')}:${`${mm % 60}`.padStart(2, '0')}`
}

const clockToMin = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/* ------------------------------------------------------------------ atoms */

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink-2">{label}</div>
        {hint && <div className="text-[11px] text-ink-4">{hint}</div>}
      </div>
      <div className="flex w-[196px] shrink-0 items-center justify-end gap-1.5">{children}</div>
    </div>
  )
}

function Swatches({
  value,
  onChange,
}: {
  value: string
  onChange: (t: ColorToken) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1" role="group" aria-label="Colour">
      {COLOR_TOKENS.map((t) => (
        <button
          key={t}
          type="button"
          aria-label={t}
          aria-pressed={value === t}
          onClick={() => onChange(t)}
          style={{ background: cssColor(t) }}
          className={cn(
            'press size-[15px] rounded-[4px] border',
            value === t ? 'border-ink/70' : 'border-line-2 hover:border-line-strong',
          )}
        />
      ))}
    </div>
  )
}

function Stepper({
  value,
  onChange,
  min = 5,
  max = 90,
  step = 5,
  label,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  suffix?: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="flex items-center gap-1">
      <IconBtn label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}>
        <span className="mono-clock text-[13px] leading-none">−</span>
      </IconBtn>
      <span className="mono-clock tnum w-[54px] text-center text-[12.5px] text-ink">
        {value}
        {suffix ? <span className="text-ink-4">{suffix}</span> : null}
      </span>
      <IconBtn label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}>
        <span className="mono-clock text-[13px] leading-none">+</span>
      </IconBtn>
    </div>
  )
}

function RowMenu({
  onEdit,
  onAddToday,
  onDelete,
}: {
  onEdit: () => void
  onAddToday: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const ref = useRef<HTMLButtonElement>(null)

  return (
    <>
      <IconBtn
        label="Habit actions"
        ref={ref}
        onClick={(e) => {
          setAnchor(e.currentTarget)
          setOpen((v) => !v)
        }}
      >
        <MoreHorizontal size={14} />
      </IconBtn>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} align="end" width={190}>
        <MenuItem
          icon={<Pencil size={13} />}
          onClick={() => {
            setOpen(false)
            onEdit()
          }}
        >
          Edit
        </MenuItem>
        <MenuItem
          icon={<CalendarPlus size={13} />}
          onClick={() => {
            setOpen(false)
            onAddToday()
          }}
        >
          Add to today
        </MenuItem>
        <MenuItem
          icon={<Trash2 size={13} />}
          danger
          onClick={() => {
            setOpen(false)
            onDelete()
          }}
        >
          Delete
        </MenuItem>
      </Popover>
    </>
  )
}

/* ------------------------------------------------------------------ row */

function HabitRow({
  habit,
  density,
  weekStart,
  onEdit,
  onAddToday,
  onDelete,
}: {
  habit: Habit
  density: Density
  weekStart: Date
  onEdit: () => void
  onAddToday: () => void
  onDelete: () => void
}) {
  const toggleHabit = useStore((s) => s.toggleHabit)
  const color = cssColor(habit.color)
  const streak = habitStreak(habit)
  const done = habitWeekCount(habit, weekStart)
  const ratio = habit.targetPerWeek ? Math.min(1, done / habit.targetPerWeek) : 0
  const todayKey = toKey(new Date())

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const heatStart = addDays(weekStart, -11 * 7)
  const heat = Array.from({ length: 84 }, (_, i) => {
    const d = addDays(heatStart, i)
    return { day: d, key: toKey(d), due: habitDueOn(habit, d), logged: habit.log.includes(toKey(d)) }
  })

  return (
    <div className="panel anim-rise relative flex flex-col gap-3 px-3.5 py-3">
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[2.5px] rounded-full"
        style={{ background: color }}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-[150px] flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-[9px] shrink-0 rounded-[2px]"
              style={{ background: color }}
            />
            <span className="truncate text-[14px] font-semibold tracking-tight text-ink">
              {habit.name}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 pl-[17px] text-[11px] text-ink-4">
            <span className="inline-flex items-center gap-1">
              <Repeat size={10} />
              {cadenceLabel(habit)}
            </span>
            <span aria-hidden>·</span>
            <span className="mono-clock tnum">
              {habit.anchorMin === null ? 'any time' : fmtTime(atMinutes(new Date(), habit.anchorMin))}
            </span>
            <span aria-hidden>·</span>
            <span className="mono-clock tnum">{habit.durationMin}m</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5" title={`${streak} day streak`}>
          <span className="mono-clock tnum text-[19px] font-semibold leading-none text-ink">
            {streak}
          </span>
          <span className="text-[10px] uppercase tracking-[0.1em] text-ink-4">streak</span>
        </div>

        <div className="flex items-center gap-2">
          <Ring value={ratio} size={30} stroke={3} color={color}>
            <span className="mono-clock text-[9px]">
              {done}/{habit.targetPerWeek}
            </span>
          </Ring>
          <div className="hidden w-[74px] sm:block">
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full"
                style={{ width: `${ratio * 100}%`, background: color }}
              />
            </div>
            <div className="mono-clock tnum mt-1 text-[9.5px] text-ink-4">
              {habit.targetPerWeek === 7 && habit.cadence === 'daily'
                ? `${Math.round(ratio * 100)}%`
                : `${habit.targetPerWeek}/wk`}
            </div>
          </div>
        </div>

        <RowMenu onEdit={onEdit} onAddToday={onAddToday} onDelete={onDelete} />
      </div>

      {/* ------------------------------ week strip ------------------------------ */}
      <div className="flex items-end gap-4">
        <div className="flex shrink-0 items-end gap-[5px]">
          {days.map((d) => {
            const key = toKey(d)
            const due = habitDueOn(habit, d)
            const on = habit.log.includes(key)
            const isToday = key === todayKey
            const future = d.getTime() > Date.now()
            return (
              <button
                key={key}
                type="button"
                disabled={!due || future}
                onClick={() => toggleHabit(habit.id, key)}
                title={`${key} · ${due ? (on ? 'done' : 'not done') : 'not scheduled'}`}
                aria-label={`${habit.name}, ${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${
                  due ? (on ? 'done, click to undo' : 'not done, click to log') : 'not scheduled'
                }`}
                aria-pressed={on}
                className={cn(
                  'press grid h-[26px] w-[26px] place-items-center rounded-[7px] border',
                  on
                    ? 'border-transparent'
                    : 'border-line-2 bg-surface-2 hover:border-line-strong',
                  !due && 'opacity-20',
                  future && 'opacity-10',
                  isToday && !on && 'ring-1 ring-signal/60',
                )}
                style={on ? { background: color } : undefined}
              >
                {on ? (
                  <Check size={12} className="text-black/75" aria-hidden />
                ) : (
                  <span className="mono-clock text-[9.5px] leading-none text-ink-4">
                    {d.getDate()}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {density === '12w' && (
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[9.5px] uppercase tracking-[0.12em] text-ink-4">
              last 12 weeks
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[2px]" role="group" aria-label={`${habit.name} history, last 12 weeks`}>
              {heat.map((c) => {
                const future = c.day.getTime() > Date.now()
                const level = c.logged ? 0.9 : c.due ? 0.08 : 0.025
                return (
                  <button
                    key={c.key}
                    type="button"
                    disabled={!c.due || future}
                    onClick={() => toggleHabit(habit.id, c.key)}
                    title={`${c.key} · ${c.logged ? 'done' : c.due ? 'missed' : 'not scheduled'}`}
                    aria-label={`${c.key}: ${c.logged ? 'done' : c.due ? 'missed' : 'not scheduled'}`}
                    aria-pressed={c.logged}
                    className={cn(
                      'press size-[9px] rounded-[2px] disabled:pointer-events-none',
                      c.logged && 'hover:brightness-125',
                    )}
                    style={{
                      background: cssColor(habit.color),
                      opacity: future ? 0.02 : level,
                    }}
                  />
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ view */

export function HabitsView() {
  const habitsMap = useStore((s) => s.habits)
  const tasksMap = useStore((s) => s.tasks)
  const workStart = useStore((s) => s.settings.workStart)
  const addHabit = useStore((s) => s.addHabit)
  const updateHabit = useStore((s) => s.updateHabit)
  const deleteHabit = useStore((s) => s.deleteHabit)
  const addTask = useStore((s) => s.addTask)
  const toast = useStore((s) => s.toast)

  const [density, setDensity] = useState<Density>('week')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(blankDraft)
  const [confirm, setConfirm] = useState<Habit | null>(null)

  const habits = useMemo(
    () => Object.values(habitsMap).filter((h) => !h.archived).sort((a, b) => a.order - b.order),
    [habitsMap],
  )

  const now = new Date()
  const todayKey = toKey(now)
  const weekStart = startOfWeek(now)

  const dueToday = habits.filter((h) => habitDueOn(h, now))
  const doneToday = dueToday.filter((h) => h.log.includes(todayKey))
  const ratio = dueToday.length ? doneToday.length / dueToday.length : 0

  /* --- 12-week aggregate, count-driven opacity --- */
  const heatStart = addDays(weekStart, -11 * 7)
  const heatDays = Array.from({ length: 84 }, (_, i) => {
    const d = addDays(heatStart, i)
    const key = toKey(d)
    const count = habits.reduce((n, h) => n + (h.log.includes(key) ? 1 : 0), 0)
    return { day: d, key, count, future: d.getTime() > Date.now() }
  })
  const heatMax = Math.max(1, ...heatDays.map((d) => d.count))

  const openNew = () => {
    setEditingId(null)
    setDraft(blankDraft())
    setEditorOpen(true)
  }

  const openEdit = (h: Habit) => {
    setEditingId(h.id)
    setDraft({
      name: h.name,
      color: h.color as ColorToken,
      cadence: h.cadence,
      weekdays: h.weekdays.length ? h.weekdays : [1, 2, 3, 4, 5],
      targetPerWeek: h.targetPerWeek,
      anchorMin: h.anchorMin,
      durationMin: h.durationMin,
    })
    setEditorOpen(true)
  }

  const save = () => {
    const name = draft.name.trim()
    if (!name) return
    const payload = {
      name,
      color: draft.color,
      cadence: draft.cadence,
      weekdays: draft.cadence === 'weekly' ? draft.weekdays.slice().sort((a, b) => a - b) : [1, 2, 3, 4, 5],
      targetPerWeek: Math.max(1, Math.min(7, draft.targetPerWeek)),
      anchorMin: draft.anchorMin,
      durationMin: Math.max(5, Math.min(180, draft.durationMin)),
    }
    if (editingId) {
      updateHabit(editingId, payload)
      toast({ text: 'Habit updated', kind: 'ok' })
    } else {
      addHabit(payload)
      toast({ text: `${name} added`, kind: 'ok' })
    }
    setEditorOpen(false)
  }

  const addToToday = (h: Habit) => {
    const todayKeyNow = toKey(new Date())
    const clash = Object.values(tasksMap).some(
      (t) =>
        !t.completed &&
        t.scheduled &&
        toKey(t.scheduled.start) === todayKeyNow &&
        t.title.trim().toLowerCase() === h.name.trim().toLowerCase(),
    )
    if (clash) {
      toast({ text: `${h.name} is already on today's calendar`, kind: 'info' })
      return
    }
    const startMin = h.anchorMin ?? workStart
    const start = atMinutes(new Date(), startMin)
    addTask({
      title: h.name,
      due: todayKeyNow,
      dueHasTime: true,
      durationMin: h.durationMin,
      scheduled: { start, end: start + h.durationMin * MIN },
      priority: 3,
      energy: 'shallow',
    })
    toast({
      text: `${h.name} blocked for ${fmtTime(start)}`,
      kind: 'ok',
      action: {
        label: 'Undo',
        run: () => {
          const found = Object.values(useStore.getState().tasks).find(
            (t) => !t.completed && t.title.trim().toLowerCase() === h.name.trim().toLowerCase() && t.due === todayKeyNow,
          )
          if (found) useStore.getState().deleteTask(found.id)
        },
      },
    })
  }

  const remove = (h: Habit) => {
    deleteHabit(h.id)
    toast({ text: `${h.name} deleted`, kind: 'warn' })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ------------------------------- header ------------------------------- */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3.5">
          <Ring value={ratio} size={44} stroke={3.5} color="var(--signal)">
            <span className="mono-clock text-[11px]">{Math.round(ratio * 100)}</span>
          </Ring>
          <div>
            <h2 className="font-serif text-[22px] leading-none tracking-tight text-ink">
              Habits
            </h2>
            <p className="mt-1 text-[11.5px] text-ink-3">
              <span className="mono-clock tnum">{doneToday.length}</span> of{' '}
              <span className="mono-clock tnum">{dueToday.length}</span> done today
              {habits.length > dueToday.length && (
                <span className="text-ink-4">
                  {' '}
                  · {habits.length - dueToday.length} resting today
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Seg
            value={density}
            onChange={setDensity}
            options={[
              { value: 'week', label: 'This week' },
              { value: '12w', label: 'Last 12 weeks' },
            ]}
          />
          <Btn variant="primary" onClick={openNew}>
            <Plus size={13} />
            habit
          </Btn>
        </div>
      </div>

      {/* ------------------------------- body ------------------------------- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {habits.length === 0 ? (
          <Empty
            icon={<Repeat size={26} strokeWidth={1.4} />}
            title="Nothing to keep yet"
            hint="Habits are the slow layer of Tempo. Add one, pick a cadence, and Tempo reserves the anchor time on your calendar."
            action={
              <Btn variant="primary" onClick={openNew}>
                <Plus size={13} />
                Add your first habit
              </Btn>
            }
          />
        ) : (
          <div className="mx-auto flex max-w-[1100px] flex-col gap-2.5">
            <SectionTitle
              right={
                <span className="mono-clock tnum text-[10.5px] text-ink-4">
                  {habits.length} tracked
                </span>
              }
            >
              {density === 'week' ? 'This week' : 'Twelve weeks'}
            </SectionTitle>

            {density === '12w' && (
              <div className="panel anim-rise flex items-end justify-between gap-6 px-3.5 py-3">
                <div>
                  <div className="text-[12.5px] font-semibold text-ink">Consistency</div>
                  <p className="mt-0.5 max-w-[46ch] text-[11.5px] leading-relaxed text-ink-4">
                    Habits completed per day, twelve weeks back. Brighter means more habits closed
                    on that day.
                  </p>
                </div>
                <div className="flex items-end gap-3">
                  <div
                    className="grid grid-flow-col grid-rows-7 gap-[2px]"
                    role="group"
                    aria-label="All habits, last 12 weeks"
                  >
                    {heatDays.map((c) => {
                      const level = c.count ? 0.22 + 0.78 * (c.count / heatMax) : 0.025
                      return (
                        <span
                          key={c.key}
                          title={`${c.key} · ${c.count} habit${c.count === 1 ? '' : 's'}`}
                          className="size-[11px] rounded-[2px]"
                          style={{
                            background: 'var(--signal)',
                            opacity: c.future ? 0.02 : level,
                          }}
                        />
                      )
                    })}
                  </div>
                  <div className="flex flex-col items-start gap-1 pb-1 text-[9.5px] text-ink-4">
                    <span>0</span>
                    <span className="flex items-center gap-1">
                      <span className="size-[9px] rounded-[2px] bg-signal/40" />
                      <span className="size-[9px] rounded-[2px] bg-signal/75" />
                      {heatMax}+
                    </span>
                  </div>
                </div>
              </div>
            )}

            {habits.map((h) => (
              <HabitRow
                key={h.id}
                habit={h}
                density={density}
                weekStart={weekStart}
                onEdit={() => openEdit(h)}
                onAddToday={() => addToToday(h)}
                onDelete={() => setConfirm(h)}
              />
            ))}

            <p className="px-1 pt-1 text-[11px] text-ink-4">
              Weeks start on {WEEKDAYS_SHORT[1]}. Days outside a habit's cadence are inert.
            </p>
          </div>
        )}
      </div>

      {/* ------------------------------- editor ------------------------------- */}
      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editingId ? 'Edit habit' : 'New habit'}
        width={520}
        footer={
          <>
            <Btn variant="quiet" onClick={() => setEditorOpen(false)}>
              Cancel
            </Btn>
            <Btn variant="primary" disabled={!draft.name.trim()} onClick={save}>
              {editingId ? 'Save' : 'Add habit'}
            </Btn>
          </>
        }
      >
        <div className="flex flex-col gap-1 px-4 py-3">
          <Field label="Name">
            <Input
              autoFocus
              aria-label="Habit name"
              placeholder="Read 20 pages"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
            />
          </Field>

          <Field label="Colour">
            <Swatches value={draft.color} onChange={(color) => setDraft({ ...draft, color })} />
          </Field>

          <Field label="Cadence" hint={cadenceLabel({ ...draft, id: '', log: [], createdAt: 0, archived: false, order: 0 })}>
            <Seg
              size="xs"
              value={draft.cadence}
              onChange={(cadence) =>
                setDraft({
                  ...draft,
                  cadence,
                  targetPerWeek:
                    cadence === 'daily' ? 7 : cadence === 'weekdays' ? 5 : draft.targetPerWeek,
                })
              }
              options={[
                { value: 'daily', label: 'Daily' },
                { value: 'weekdays', label: 'Weekdays' },
                { value: 'weekly', label: 'Weekly' },
              ]}
            />
          </Field>

          {draft.cadence === 'weekly' && (
            <Field label="Days">
              <div className="flex gap-0.5">
                {WEEKDAYS_SHORT.map((w, i) => {
                  const on = draft.weekdays.includes(i)
                  return (
                    <button
                      key={w}
                      type="button"
                      aria-label={w}
                      aria-pressed={on}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          weekdays: on
                            ? draft.weekdays.filter((d) => d !== i)
                            : [...draft.weekdays, i],
                          targetPerWeek: Math.max(
                            1,
                            on ? draft.weekdays.length - 1 : draft.weekdays.length + 1,
                          ),
                        })
                      }
                      className={cn(
                        'press h-6 w-6 rounded-[6px] text-[10px] font-semibold',
                        on ? 'bg-raised text-ink' : 'text-ink-4 hover:bg-surface-3 hover:text-ink-2',
                      )}
                    >
                      {w[0]}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}

          <Field label="Target per week">
            <Stepper
              label="target per week"
              value={draft.targetPerWeek}
              min={1}
              max={7}
              step={1}
              onChange={(targetPerWeek) => setDraft({ ...draft, targetPerWeek })}
            />
          </Field>

          <Field
            label="Anchor time"
            hint={draft.anchorMin === null ? 'No reservation' : minToClock(draft.anchorMin)}
          >
            <div className="flex items-center gap-1.5">
              <Input
                type="time"
                aria-label="Anchor time"
                className="w-[104px]"
                value={draft.anchorMin === null ? '' : minToClock(draft.anchorMin)}
                onChange={(e) =>
                  setDraft({ ...draft, anchorMin: clockToMin(e.target.value) })
                }
              />
              {draft.anchorMin !== null && (
                <Btn variant="quiet" onClick={() => setDraft({ ...draft, anchorMin: null })}>
                  clear
                </Btn>
              )}
            </div>
          </Field>

          <Field label="Duration">
            <Stepper
              label="duration"
              suffix="m"
              value={draft.durationMin}
              min={5}
              max={180}
              step={5}
              onChange={(durationMin) => setDraft({ ...draft, durationMin })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Delete habit"
        width={420}
        footer={
          <>
            <Btn variant="quiet" onClick={() => setConfirm(null)}>
              Keep
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (confirm) remove(confirm)
                setConfirm(null)
              }}
            >
              <Trash2 size={13} />
              Delete
            </Btn>
          </>
        }
      >
        <p className="px-4 py-4 text-[13px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{confirm?.name}</span> and its{' '}
          <span className="mono-clock tnum">{confirm?.log.length ?? 0}</span> logged days will be
          removed. Scheduled blocks for it stay on the calendar.
        </p>
      </Modal>
    </div>
  )
}