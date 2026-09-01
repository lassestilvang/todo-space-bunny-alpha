/** Core domain model for Tempo. */

export type ID = string

export type Priority = 1 | 2 | 3 | 4 // 1 = most urgent, 4 = none

export type Energy = 'deep' | 'shallow' | 'admin'

export type DayPart = 'any' | 'morning' | 'afternoon' | 'evening'

export type Recurrence = {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number
  weekdays?: number[] // 0=Sun .. 6=Sat, only for weekly
  until?: string // ISO date
}

export type TimeRange = { start: number; end: number }

export type Subtask = {
  id: ID
  title: string
  done: boolean
}

export type Task = {
  id: ID
  title: string
  notes: string
  completed: boolean
  completedAt?: number
  createdAt: number
  updatedAt: number

  priority: Priority
  projectId?: ID
  labelIds: ID[]

  /** Calendar date the task is *promised* for (may have no time). */
  due?: string // YYYY-MM-DD
  dueHasTime: boolean
  /** The actual time block on the calendar. null = on the list, not the clock. */
  scheduled: TimeRange | null

  /** Realistic estimate in minutes. Also drives calendar block length. */
  durationMin: number
  /** Planner hint: which part of the day this deserves. */
  dayPart: DayPart
  energy: Energy

  recurrence?: Recurrence
  subtasks: Subtask[]

  /** Reminders as minutes-from-due offsets; negative = before. */
  reminders: number[]
  pinned: boolean
  /** Waiting on this other task id (soft dependency). */
  waitFor?: ID
  /** Set when the user has accepted/rejected an auto-scheduled block. */
  planLocked: boolean
  order: number
  completedStreak: number
}

export type CalEvent = {
  id: ID
  title: string
  start: number
  end: number
  allDay: boolean
  /** Meetings/meetings cannot be moved or displaced by the planner. */
  locked: boolean
  location?: string
  notes?: string
  projectId?: ID
  color?: string
  /** Attendees / free-busy only blocks. */
  tentative: boolean
  /** Set on the seed of a repeating meeting; shared by every occurrence. */
  seriesId?: ID
  recurrence?: Recurrence
}

export type HabitCadence = 'daily' | 'weekdays' | 'weekly' | 'custom'

export type Habit = {
  id: ID
  name: string
  color: string
  cadence: HabitCadence
  /** For weekly/custom: which weekdays count (0=Sun). */
  weekdays: number[]
  targetPerWeek: number
  /** Preferred clock time; planner reserves it as an anchor. */
  anchorMin: number | null
  durationMin: number
  /** YYYY-MM-DD strings that were completed. */
  log: string[]
  createdAt: number
  archived: boolean
  order: number
}

export type FocusSession = {
  id: ID
  taskId?: ID
  label: string
  start: number
  minutes: number
  completed: boolean
}

export type Doc = {
  id: ID
  title: string
  body: string
  projectId?: ID
  updatedAt: number
  createdAt: number
  pinned: boolean
}

export type Project = {
  id: ID
  name: string
  color: string
  glyph: string
  goal?: string
  archived: boolean
  order: number
  createdAt: number
}

export type Label = {
  id: ID
  name: string
  color: string
}

export type LlmConfig = {
  enabled: boolean
  provider: 'anthropic' | 'openai'
  model: string
  apiKey: string
  endpoint: string
}

export type Settings = {
  theme: 'dark' | 'light'
  /** Visible hour range of the calendar grid. */
  gridStart: number
  gridEnd: number
  /** Working hours used by the planner. */
  workStart: number
  workEnd: number
  workDays: number[]
  snapMin: number
  defaultDuration: number
  defaultPriority: Priority
  autoPlan: boolean
  /** Minutes of focus a day counts as meeting the goal. */
  focusGoalMin: number
  /** Chime when a focus block or a break ends. Off by default. */
  soundOn: boolean
  /** Minutes of buffer the planner leaves after a meeting. */
  bufferMin: number
  /** Longest continuous focus block the planner will create, in minutes. */
  maxBlockMin: number
  llm: LlmConfig
  /** Show the assistant panel by default on wide screens. */
  assistantOpen: boolean
  reduceDensity: boolean
}

export type ChatRole = 'user' | 'assistant' | 'system'

export type ChatMessage = {
  id: ID
  role: ChatRole
  content: string
  ts: number
  /** Actions the assistant actually applied, for the "undo" affordance. */
  applied?: string[]
  /**
   * Choices the assistant offers instead of taking. Serializable, so a proposal
   * can sit in the transcript and be applied later.
   */
  options?: { id: string; label: string; detail: string; action: unknown }[]
  pending?: boolean
  error?: boolean
}

/** One condition a saved filter asks of a task. */
export type FilterClause =
  | { kind: 'project'; id: ID }
  | { kind: 'label'; id: ID }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'due'; window: 'overdue' | 'today' | 'tomorrow' | 'week' | 'none' }
  | { kind: 'scheduled'; value: 'yes' | 'no' }
  | { kind: 'energy'; energy: Energy }

/** A named question about your tasks, kept so you can ask it again. */
export type TaskFilter = {
  id: ID
  name: string
  clauses: FilterClause[]
  order: number
}

export type ViewId =
  | 'day'
  | 'focus'
  /** A saved filter answering on the list view. */
  | 'filter'
  | 'week'
  | 'month'
  | 'agenda'
  | 'inbox'
  | 'today'
  | 'upcoming'
  | 'matrix'
  | 'kanban'
  | 'habits'
  | 'docs'
  | 'stats'
  | 'assistant'

export type PanelId =
  | { kind: 'task'; id: ID }
  | { kind: 'event'; id: ID }
  | { kind: 'habit'; id: ID }
  | { kind: 'doc'; id: ID }
  | { kind: 'settings' }
  | null

/** Normalised view model the calendar renders. */
export type CalendarItem = {
  id: ID
  kind: 'task' | 'event'
  title: string
  start: number
  end: number
  allDay: boolean
  color: string
  projectId?: ID
  done: boolean
  priority: Priority
  tentative: boolean
  energy: Energy
  ref: Task | CalEvent
}
