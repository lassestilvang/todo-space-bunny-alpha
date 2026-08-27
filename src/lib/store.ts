import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  CalEvent,
  ChatMessage,
  Doc,
  FocusSession,
  Habit,
  ID,
  Label,
  PanelId,
  Project,
  Settings,
  Task,
  TimeRange,
  ViewId,
} from '@/types'
import { uid } from './id'
import {
  addDays,
  fromKey,
  minOfDay,
  nextOccurrence,
  startOfDay,
  toKey,
} from './date'
import { DEFAULT_SETTINGS, seedState } from './seed'

type Entities = {
  tasks: Record<ID, Task>
  events: Record<ID, CalEvent>
  habits: Record<ID, Habit>
  docs: Record<ID, Doc>
  projects: Record<ID, Project>
  labels: Record<ID, Label>
}

type Snapshot = Entities

export type Toast = { id: string; text: string; kind: 'ok' | 'warn' | 'info'; action?: { label: string; run: () => void } }

type UIState = {
  view: ViewId
  anchor: string // YYYY-MM-DD
  panel: PanelId
  paletteOpen: boolean
  captureOpen: boolean
  capturePrefill: string
  /** Range the grid handed to the capture bar, in minutes from midnight. */
  captureSlot: CaptureSlot | null
  activeProject: ID | 'all' | 'none'
  calendarFocus: number
  planOpen: boolean
  helpOpen: boolean
  toasts: Toast[]
}

type State = Entities & {
  sessions: FocusSession[]
  chat: ChatMessage[]
  settings: Settings
  history: { past: Snapshot[]; future: Snapshot[] }
  ui: UIState
}

type NewTask = Partial<Task> & { title: string }

export type CaptureSlot = { day: string; start: number; end: number }

const ENTITIES: (keyof Entities)[] = ['tasks', 'events', 'habits', 'docs', 'projects', 'labels']

const snapshot = (s: State): Snapshot => ({
  tasks: s.tasks,
  events: s.events,
  habits: s.habits,
  docs: s.docs,
  projects: s.projects,
  labels: s.labels,
})

const HISTORY_LIMIT = 60

type Actions = {
  /* tasks */
  addTask: (t: NewTask) => ID
  addTasks: (ts: NewTask[]) => ID[]
  updateTask: (id: ID, patch: Partial<Task>, history?: boolean) => void
  toggleTask: (id: ID) => void
  deleteTask: (id: ID) => void
  duplicateTask: (id: ID) => ID | null
  scheduleTask: (id: ID, range: TimeRange | null) => void
  moveTaskToProject: (id: ID, projectId: ID | undefined) => void
  reorderTask: (id: ID, beforeId: ID | null) => void
  setPriority: (id: ID, priority: Task['priority']) => void
  cyclePriority: (id: ID) => void

  /* events */
  addEvent: (e: Partial<CalEvent> & { title: string; start: number; end: number }) => ID
  updateEvent: (id: ID, patch: Partial<CalEvent>, history?: boolean) => void
  deleteEvent: (id: ID) => void

  /* projects */
  addProject: (p: Partial<Project> & { name: string }) => ID
  updateProject: (id: ID, patch: Partial<Project>) => void
  deleteProject: (id: ID) => void
  archiveProject: (id: ID, archived: boolean) => void

  /* labels */
  addLabel: (name: string, color: string) => ID
  updateLabel: (id: ID, patch: Partial<Label>) => void
  deleteLabel: (id: ID) => void

  /* habits */
  addHabit: (h: Partial<Habit> & { name: string }) => ID
  updateHabit: (id: ID, patch: Partial<Habit>) => void
  deleteHabit: (id: ID) => void
  toggleHabit: (id: ID, key: string) => void

  /* docs */
  addDoc: (d?: Partial<Doc>) => ID
  updateDoc: (id: ID, patch: Partial<Doc>) => void
  deleteDoc: (id: ID) => void

  /* focus */
  startSession: (s: { taskId?: ID; label: string; minutes: number; start?: number }) => ID
  finishSession: (id: ID, minutes: number, completed: boolean) => void
  dropSession: (id: ID) => void

  /* plan */
  applyPlan: (blocks: { taskId: ID; start: number; end: number }[]) => void
  unscheduleDay: (key: string, onlyUnlocked?: boolean) => void

  /* settings + ui */
  setSettings: (patch: Partial<Settings>) => void
  setView: (v: ViewId) => void
  setAnchor: (key: string) => void
  setPanel: (p: PanelId) => void
  setPalette: (open: boolean) => void
  /**
   * `slot` is the range the calendar just drew out. The capture bar needs it
   * because a bare "08:00–09:00" otherwise resolves against today.
   */
  setCapture: (open: boolean, prefill?: string, slot?: CaptureSlot | null) => void
  setPlanOpen: (open: boolean) => void
  setHelpOpen: (open: boolean) => void
  setAssistant: (open: boolean) => void
  setActiveProject: (id: ID | 'all' | 'none') => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void

  /* chat */
  pushMessage: (m: Omit<ChatMessage, 'id' | 'ts'> & { id?: string; ts?: number }) => ID
  patchMessage: (id: ID, patch: Partial<ChatMessage>) => void
  clearChat: () => void

  /* history */
  undo: () => void
  redo: () => void

  /* data */
  resetAll: () => void
  importState: (json: string) => boolean
  exportState: () => string
}

const pushHistory = (s: State) => ({
  past: [...s.history.past, snapshot(s)].slice(-HISTORY_LIMIT),
  future: [] as Snapshot[],
})

const nextOrder = <T extends { order: number }>(map: Record<ID, T>): number => {
  let max = -1
  for (const v of Object.values(map)) if (v.order > max) max = v.order
  return max + 1
}

const makeTask = (t: NewTask, s: State): Task => {
  const now = Date.now()
  return {
    id: t.id ?? uid('t'),
    title: t.title,
    notes: t.notes ?? '',
    completed: false,
    createdAt: now,
    updatedAt: now,
    priority: t.priority ?? s.settings.defaultPriority,
    projectId: t.projectId,
    labelIds: t.labelIds ?? [],
    due: t.due,
    dueHasTime: t.dueHasTime ?? !!t.scheduled,
    scheduled: t.scheduled ?? null,
    durationMin: t.durationMin ?? s.settings.defaultDuration,
    dayPart: t.dayPart ?? 'any',
    energy: t.energy ?? 'shallow',
    recurrence: t.recurrence,
    subtasks: t.subtasks ?? [],
    reminders: t.reminders ?? [],
    pinned: t.pinned ?? false,
    waitFor: t.waitFor,
    planLocked: t.planLocked ?? false,
    order: t.order ?? nextOrder(s.tasks),
    completedStreak: 0,
  }
}

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      ...seedState(),
      history: { past: [], future: [] },
      ui: {
        view: 'day',
        anchor: toKey(new Date()),
        panel: null,
        paletteOpen: false,
        captureOpen: true,
        capturePrefill: '',
        captureSlot: null,
        activeProject: 'all',
        calendarFocus: 0,
        planOpen: false,
        helpOpen: false,
        toasts: [],
      },

      /* ------------------------------- tasks ------------------------------- */
      addTask: (t) => {
        const s = get()
        const task = makeTask(t, s)
        set((st) => ({ tasks: { ...st.tasks, [task.id]: task } }))
        return task.id
      },
      addTasks: (list) => {
        const s = get()
        const created = list.map((t) => makeTask(t, s))
        set((st) => {
          const tasks = { ...st.tasks }
          for (const c of created) tasks[c.id] = c
          return { tasks }
        })
        return created.map((c) => c.id)
      },
      updateTask: (id, patch, history = true) =>
        set((s) => {
          const existing = s.tasks[id]
          if (!existing) return {}
          const next = { ...existing, ...patch, updatedAt: Date.now() }
          const tasks = { ...s.tasks, [id]: next }
          return history ? { tasks, history: pushHistory(s) } : { tasks }
        }),
      toggleTask: (id) =>
        set((s) => {
          const t = s.tasks[id]
          if (!t) return {}
          const completing = !t.completed
          const tasks = { ...s.tasks }
          tasks[id] = {
            ...t,
            completed: completing,
            completedAt: completing ? Date.now() : undefined,
            completedStreak: completing ? t.completedStreak + 1 : 0,
            updatedAt: Date.now(),
          }
          let created: Task | null = null
          if (completing && t.recurrence) {
            const from = t.due ?? toKey(new Date())
            const nextDue = toKey(nextOccurrence(t.recurrence, fromKey(from).getTime()))
            const keepTime = t.scheduled
              ? minOfDay(t.scheduled.start)
              : t.dueHasTime
                ? minOfDay(fromKey(from).getTime() + 9 * 3600_000)
                : null
            created = makeTask(
              {
                title: t.title,
                notes: t.notes,
                projectId: t.projectId,
                labelIds: t.labelIds,
                priority: t.priority,
                due: nextDue,
                dueHasTime: keepTime !== null,
                durationMin: t.durationMin,
                dayPart: t.dayPart,
                energy: t.energy,
                recurrence: t.recurrence,
                subtasks: t.subtasks.map((x) => ({ ...x, done: false })),
                scheduled: keepTime !== null
                  ? {
                      start: fromKey(nextDue).getTime() + keepTime * 60_000,
                      end: fromKey(nextDue).getTime() + (keepTime + t.durationMin) * 60_000,
                    }
                  : null,
                order: t.order,
              },
              s,
            )
            tasks[created.id] = created
          }
          return {
            tasks,
            history: {
              past: [...s.history.past, snapshot(s)].slice(-HISTORY_LIMIT),
              future: [],
            },
          }
        }),
      deleteTask: (id) =>
        set((s) => ({
          tasks: Object.fromEntries(Object.entries(s.tasks).filter(([k]) => k !== id)),
          history: pushHistory(s),
        })),
      duplicateTask: (id) => {
        const s = get()
        const t = s.tasks[id]
        if (!t) return null
        return s.addTask({ ...t, title: `${t.title} (copy)`, id: undefined, order: undefined })
      },
      scheduleTask: (id, range) =>
        set((s) => {
          const t = s.tasks[id]
          if (!t) return {}
          const tasks = {
            ...s.tasks,
            [id]: {
              ...t,
              scheduled: range,
              planLocked: range ? false : t.planLocked,
              due: range ? toKey(range.start) : t.due,
              dueHasTime: range ? true : t.dueHasTime,
              updatedAt: Date.now(),
            },
          }
          return { tasks, history: { past: [...s.history.past, snapshot(s)].slice(-HISTORY_LIMIT), future: [] } }
        }),
      moveTaskToProject: (id, projectId) => get().updateTask(id, { projectId }),
      reorderTask: (id, beforeId) =>
        set((s) => {
          const ordered = Object.values(s.tasks)
            .filter((t) => t.projectId === s.tasks[id]?.projectId)
            .sort((a, b) => a.order - b.order)
          const without = ordered.filter((t) => t.id !== id)
          const at = beforeId ? without.findIndex((t) => t.id === beforeId) : without.length
          without.splice(at < 0 ? without.length : at, 0, s.tasks[id])
          const tasks = { ...s.tasks }
          without.forEach((t, i) => (tasks[t.id] = { ...t, order: i }))
          return { tasks }
        }),
      setPriority: (id, priority) => get().updateTask(id, { priority }),
      cyclePriority: (id) => {
        const t = get().tasks[id]
        if (!t) return
        get().updateTask(id, { priority: t.priority >= 4 ? 1 : ((t.priority + 1) as Task['priority']) })
      },

      /* ------------------------------- events ------------------------------- */
      addEvent: (e) => {
        const id = e.id ?? uid('e')
        const ev: CalEvent = {
          id,
          title: e.title,
          start: e.start,
          end: e.end,
          allDay: e.allDay ?? false,
          locked: e.locked ?? false,
          location: e.location,
          notes: e.notes,
          projectId: e.projectId,
          color: e.color,
          tentative: e.tentative ?? false,
        }
        set((s) => ({
          events: { ...s.events, [id]: ev },
          history: pushHistory(s),
        }))
        return id
      },
      updateEvent: (id, patch, history = true) =>
        set((s) => {
          const ev = s.events[id]
          if (!ev) return {}
          const events = { ...s.events, [id]: { ...ev, ...patch } }
          return history ? { events, history: pushHistory(s) } : { events }
        }),
      deleteEvent: (id) =>
        set((s) => ({
          events: Object.fromEntries(Object.entries(s.events).filter(([k]) => k !== id)),
          history: pushHistory(s),
        })),

      /* ------------------------------ projects ------------------------------ */
      addProject: (p) => {
        const id = p.id ?? uid('p')
        set((s) => ({
          projects: {
            ...s.projects,
            [id]: {
              id,
              name: p.name,
              color: p.color ?? 'c-sky',
              glyph: p.glyph ?? '◆',
              goal: p.goal,
              archived: p.archived ?? false,
              order: p.order ?? nextOrder(s.projects),
              createdAt: Date.now(),
            },
          },
          history: pushHistory(s),
        }))
        return id
      },
      updateProject: (id, patch) =>
        set((s) => ({
          projects: { ...s.projects, [id]: { ...s.projects[id], ...patch } },
          history: pushHistory(s),
        })),
      deleteProject: (id) =>
        set((s) => ({
          projects: Object.fromEntries(Object.entries(s.projects).filter(([k]) => k !== id)),
          tasks: Object.fromEntries(
            Object.entries(s.tasks).map(([k, t]) => [k, t.projectId === id ? { ...t, projectId: undefined } : t]),
          ),
          history: pushHistory(s),
        })),
      archiveProject: (id, archived) => get().updateProject(id, { archived }),

      /* ------------------------------- labels ------------------------------- */
      addLabel: (name, color) => {
        const id = uid('l')
        set((s) => ({
          labels: { ...s.labels, [id]: { id, name, color } },
          history: pushHistory(s),
        }))
        return id
      },
      updateLabel: (id, patch) =>
        set((s) => ({ labels: { ...s.labels, [id]: { ...s.labels[id], ...patch } } })),
      deleteLabel: (id) =>
        set((s) => ({
          labels: Object.fromEntries(Object.entries(s.labels).filter(([k]) => k !== id)),
          tasks: Object.fromEntries(
            Object.entries(s.tasks).map(([k, t]) => [
              k,
              { ...t, labelIds: t.labelIds.filter((l) => l !== id) },
            ]),
          ),
        })),

      /* ------------------------------- habits ------------------------------- */
      addHabit: (h) => {
        const id = h.id ?? uid('h')
        set((s) => ({
          habits: {
            ...s.habits,
            [id]: {
              id,
              name: h.name,
              color: h.color ?? 'c-mint',
              cadence: h.cadence ?? 'daily',
              weekdays: h.weekdays ?? [1, 2, 3, 4, 5],
              targetPerWeek: h.targetPerWeek ?? 5,
              anchorMin: h.anchorMin ?? null,
              durationMin: h.durationMin ?? 15,
              log: h.log ?? [],
              createdAt: Date.now(),
              archived: h.archived ?? false,
              order: h.order ?? nextOrder(s.habits),
            },
          },
          history: pushHistory(s),
        }))
        return id
      },
      updateHabit: (id, patch) =>
        set((s) => ({
          habits: { ...s.habits, [id]: { ...s.habits[id], ...patch } },
          history: pushHistory(s),
        })),
      deleteHabit: (id) =>
        set((s) => ({
          habits: Object.fromEntries(Object.entries(s.habits).filter(([k]) => k !== id)),
          history: pushHistory(s),
        })),
      toggleHabit: (id, key) =>
        set((s) => {
          const h = s.habits[id]
          if (!h) return {}
          const log = h.log.includes(key) ? h.log.filter((d) => d !== key) : [...h.log, key]
          return {
            habits: { ...s.habits, [id]: { ...h, log } },
            history: pushHistory(s),
          }
        }),

      /* -------------------------------- docs -------------------------------- */
      addDoc: (d = {}) => {
        const id = d.id ?? uid('d')
        const now = Date.now()
        set((s) => ({
          docs: {
            ...s.docs,
            [id]: {
              id,
              title: d.title ?? 'Untitled',
              body: d.body ?? '',
              projectId: d.projectId,
              updatedAt: now,
              createdAt: now,
              pinned: d.pinned ?? false,
            },
          },
          history: pushHistory(s),
        }))
        return id
      },
      updateDoc: (id, patch) =>
        set((s) => ({
          docs: { ...s.docs, [id]: { ...s.docs[id], ...patch, updatedAt: Date.now() } },
        })),
      deleteDoc: (id) => set((s) => ({ docs: Object.fromEntries(Object.entries(s.docs).filter(([k]) => k !== id)) })),

      /* ------------------------------- focus ------------------------------- */
      startSession: ({ taskId, label, minutes, start }) => {
        const id = uid('s')
        set((s) => ({
          sessions: [
            ...s.sessions,
            { id, taskId, label, minutes, start: start ?? Date.now(), completed: false },
          ],
        }))
        return id
      },
      finishSession: (id, minutes, completed) =>
        set((s) => ({
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, minutes, completed } : x)),
        })),
      dropSession: (id) => set((s) => ({ sessions: s.sessions.filter((x) => x.id !== id) })),

      /* ------------------------------- planner ------------------------------- */
      applyPlan: (blocks) =>
        set((s) => {
          const tasks = { ...s.tasks }
          for (const b of blocks) {
            const t = tasks[b.taskId]
            if (!t) continue
            tasks[b.taskId] = {
              ...t,
              scheduled: { start: b.start, end: b.end },
              due: t.due ?? toKey(b.start),
              dueHasTime: true,
              updatedAt: Date.now(),
            }
          }
          return { tasks, history: { past: [...s.history.past, snapshot(s)].slice(-HISTORY_LIMIT), future: [] } }
        }),
      unscheduleDay: (key, onlyUnlocked = false) =>
        set((s) => {
          const tasks = { ...s.tasks }
          let n = 0
          for (const [id, t] of Object.entries(tasks)) {
            if (!t.scheduled) continue
            if (toKey(t.scheduled.start) !== key) continue
            if (onlyUnlocked && t.planLocked) continue
            tasks[id] = { ...t, scheduled: null }
            n++
          }
          return {
            tasks,
            history: pushHistory(s),
          }
        }),

      /* ------------------------------ settings ------------------------------ */
      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setView: (v) => set((s) => ({ ui: { ...s.ui, view: v } })),
      setAnchor: (key) => set((s) => ({ ui: { ...s.ui, anchor: key } })),
      setPanel: (p) => set((s) => ({ ui: { ...s.ui, panel: p } })),
      setPalette: (open) => set((s) => ({ ui: { ...s.ui, paletteOpen: open } })),
      setCapture: (open, prefill = '', slot = null) =>
        set((s) => ({
          ui: { ...s.ui, captureOpen: open, capturePrefill: prefill, captureSlot: slot },
        })),
      setPlanOpen: (open) => set((s) => ({ ui: { ...s.ui, planOpen: open } })),
      setHelpOpen: (open) => set((s) => ({ ui: { ...s.ui, helpOpen: open } })),
      setAssistant: (open) => set((s) => ({ ui: { ...s.ui, panel: open ? s.ui.panel : null } , settings: { ...s.settings, assistantOpen: open } })),
      setActiveProject: (id) => set((s) => ({ ui: { ...s.ui, activeProject: id } })),
      toast: (t) =>
        set((s) => ({
          ui: {
            ...s.ui,
            toasts: [...s.ui.toasts, { ...t, id: uid('toast') }].slice(-4),
          },
        })),
      dismissToast: (id) =>
        set((s) => ({ ui: { ...s.ui, toasts: s.ui.toasts.filter((x) => x.id !== id) } })),

      /* -------------------------------- chat -------------------------------- */
      pushMessage: (m) => {
        const id = m.id ?? uid('m')
        set((s) => ({
          chat: [
            ...s.chat,
            { id, role: m.role, content: m.content, ts: m.ts ?? Date.now(), applied: m.applied, pending: m.pending, error: m.error },
          ],
        }))
        return id
      },
      patchMessage: (id, patch) =>
        set((s) => ({
          chat: s.chat.map((m) => (m.id === id ? { ...m, ...patch } : m)),
        })),
      clearChat: () => set({ chat: [] }),

      /* ------------------------------- history ------------------------------- */
      undo: () =>
        set((s) => {
          const prev = s.history.past[s.history.past.length - 1]
          if (!prev) return {}
          return {
            ...prev,
            history: {
              past: s.history.past.slice(0, -1),
              future: [snapshot(s), ...s.history.future].slice(0, HISTORY_LIMIT),
            },
          }
        }),
      redo: () =>
        set((s) => {
          const next = s.history.future[0]
          if (!next) return {}
          return {
            ...next,
            history: {
              past: [...s.history.past, snapshot(s)].slice(-HISTORY_LIMIT),
              future: s.history.future.slice(1),
            },
          }
        }),

      /* -------------------------------- data -------------------------------- */
      resetAll: () => {
        const fresh = seedState()
        set((s) => ({
          ...fresh,
          history: pushHistory(s),
        }))
      },
      importState: (json) => {
        try {
          const parsed = JSON.parse(json) as Partial<State>
          if (!parsed.tasks || !parsed.settings) return false
          set((s) => ({ ...parsed, history: pushHistory(s) }))
          return true
        } catch {
          return false
        }
      },
      exportState: () => {
        const s = get()
        return JSON.stringify(
          { ...snapshot(s), sessions: s.sessions, settings: s.settings, chat: s.chat },
          null,
          2,
        )
      },
    }),
    {
      name: 'tempo.v1',
      version: 1,
      partialize: (s) => ({
        tasks: s.tasks,
        events: s.events,
        habits: s.habits,
        docs: s.docs,
        projects: s.projects,
        labels: s.labels,
        sessions: s.sessions,
        chat: s.chat,
        settings: s.settings,
        ui: {
          ...s.ui,
          panel: null,
          paletteOpen: false,
          planOpen: false,
          helpOpen: false,
          toasts: [],
          anchor: toKey(new Date()),
        },
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>
        return {
          ...current,
          ...p,
          history: { past: [], future: [] },
          ui: { ...current.ui, ...(p.ui ?? {}), panel: null, paletteOpen: false, planOpen: false, helpOpen: false, toasts: [] },
          settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
        }
      },
    },
  ),
)

export const selectSnapshot = (s: State) => snapshot(s)
export { ENTITIES }

/* ------------------------------ theme side effect ------------------------------ */

let lastTheme: string | null = null
export function syncTheme(theme: 'dark' | 'light') {
  if (lastTheme === theme) return
  lastTheme = theme
  const el = document.documentElement
  el.classList.toggle('dark', theme === 'dark')
  el.classList.toggle('light', theme === 'light')
  el.style.colorScheme = theme
}

export const startOfToday = () => startOfDay(Date.now())
export { addDays }
