import { useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronLeft,
  Columns3,
  FileText,
  Flame,
  Hash,
  Inbox,
  LayoutGrid,
  Moon,
  Plus,
  Sun,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ViewId } from '@/types'
import { cn, smartList } from '@/lib/selectors'
import { addDays, toKey } from '@/lib/date'
import { riskReport } from '@/lib/risk'
import { Btn, IconBtn, MenuItem, Modal, Popover, usePopover } from './ui'
import { PomodoroWidget } from './Pomodoro'

type NavItem = {
  id: ViewId
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  group: 'time' | 'lists' | 'work'
}

const TIME: NavItem[] = [
  { id: 'day', label: 'Day', icon: CalendarDays, group: 'time' },
  { id: 'week', label: 'Week', icon: LayoutGrid, group: 'time' },
  { id: 'month', label: 'Month', icon: CalendarDays, group: 'time' },
  { id: 'agenda', label: 'Agenda', icon: TrendingUp, group: 'time' },
]

const LISTS: NavItem[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox, group: 'lists' },
  { id: 'today', label: 'Today', icon: Target, group: 'lists' },
  { id: 'upcoming', label: 'Upcoming', icon: CalendarDays, group: 'lists' },
  { id: 'assistant', label: 'Assistant', icon: SparkIcon, group: 'lists' },
]

const WORK: NavItem[] = [
  { id: 'habits', label: 'Habits', icon: Flame, group: 'work' },
  { id: 'kanban', label: 'Board', icon: Columns3, group: 'work' },
  { id: 'matrix', label: 'Matrix', icon: ChartNoAxesColumn, group: 'work' },
  { id: 'docs', label: 'Notes', icon: FileText, group: 'work' },
  { id: 'stats', label: 'Review', icon: TrendingUp, group: 'work' },
]

function SparkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5 9.6 6 14 7.5 9.6 9 8 13.5 6.4 9 2 7.5 6.4 6 8 1.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Sidebar() {
  const view = useStore((s) => s.ui.view)
  const setView = useStore((s) => s.setView)
  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const labels = useStore((s) => s.labels)
  const activeProject = useStore((s) => s.ui.activeProject)
  const setActiveProject = useStore((s) => s.setActiveProject)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const addProject = useStore((s) => s.addProject)
  const [collapsed, setCollapsed] = useState(false)
  const [newProject, setNewProject] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [glyph, setGlyph] = useState('◆')
  const [colorIdx, setColorIdx] = useState(0)

  const allTasks = useMemo(() => Object.values(tasks), [tasks])
  const counts = useMemo(
    () => ({
      inbox: smartList(allTasks, 'inbox').length,
      today: smartList(allTasks, 'today').length,
      upcoming: smartList(allTasks, 'upcoming').length,
    }),
    [allTasks],
  )

  /** Today carries the number that matters: how much of it is actually at risk. */
  const todayRisk = useMemo(() => {
    const today = toKey(new Date())
    return riskReport(allTasks, today, toKey(addDays(new Date(), 6)), Date.now()).total
  }, [allTasks])

  const projectList = useMemo(
    () => Object.values(projects).filter((p) => !p.archived).sort((a, b) => a.order - b.order),
    [projects],
  )
  const labelList = useMemo(() => Object.values(labels), [labels])

  const countFor = (id: ViewId): number | null => {
    if (id === 'inbox') return counts.inbox
    if (id === 'today') return todayRisk > 0 ? todayRisk : counts.today
    if (id === 'upcoming') return counts.upcoming
    return null
  }

  const riskyFor = (id: ViewId) => id === 'today' && todayRisk > 0

  const createProject = () => {
    const name = projectName.trim()
    if (!name) return
    const colors = ['c-iris', 'c-aqua', 'c-ember', 'c-mint', 'c-orchid', 'c-saffron', 'c-sky', 'c-sand']
    addProject({ name, glyph, color: colors[colorIdx % colors.length] })
    setProjectName('')
    setNewProject(false)
  }

  return (
    <nav
      aria-label="Main"
      className="relative z-30 flex shrink-0 flex-col border-r border-line bg-bg"
      style={{ width: collapsed ? 52 : 228 }}
    >
      {/* brand */}
      <div className="flex h-14 items-center gap-2.5 px-3.5">
        <div
          className="grid size-[26px] shrink-0 place-items-center rounded-[8px] bg-signal text-signal-ink"
          style={{ boxShadow: '0 2px 10px -2px color-mix(in oklab, var(--signal) 60%, transparent)' }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
            <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.4V8l2.6 1.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="font-serif text-[17px] leading-none tracking-tight text-ink">Tempo</div>
            <div className="mt-[3px] text-[10px] uppercase tracking-[0.14em] text-ink-4">
              automatic planner
            </div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <Group title={collapsed ? '' : 'Time'}>
          {TIME.map((n) => (
            <NavRow
              key={n.id}
              item={n}
              collapsed={collapsed}
              active={view === n.id}
              onClick={() => setView(n.id)}
            />
          ))}
        </Group>

        <Group title={collapsed ? '' : 'Lists'}>
          {LISTS.map((n) => (
            <NavRow
              key={n.id}
              item={n}
              collapsed={collapsed}
              active={view === n.id || (activeProject === 'all' && view === n.id)}
              count={countFor(n.id)}
              risky={riskyFor(n.id)}
              onClick={() => setView(n.id)}
            />
          ))}
        </Group>

        <Group
          title={collapsed ? '' : 'Projects'}
          action={
            !collapsed ? (
              <IconBtn label="New project" onClick={() => setNewProject(true)}>
                <Plus size={13} />
              </IconBtn>
            ) : undefined
          }
        >
          {projectList.map((p) => {
            const n = allTasks.filter((t) => t.projectId === p.id && !t.completed).length
            const active = activeProject === p.id
            return (
              <button
                key={p.id}
                onClick={() => {
                  setActiveProject(active ? 'all' : p.id)
                  setView('kanban')
                }}
                title={collapsed ? p.name : undefined}
                className={cn(
                  'press group flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-[6px] text-left text-[12.5px]',
                  active ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                <span
                  className="grid size-[18px] shrink-0 place-items-center rounded-[5px] text-[10px]"
                  style={{
                    background: `color-mix(in oklab, var(--color-${p.color}) 20%, transparent)`,
                    color: `var(--color-${p.color})`,
                  }}
                >
                  {p.glyph}
                </span>
                {!collapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {n > 0 && <span className="tnum text-[10.5px] text-ink-4">{n}</span>}
                  </>
                )}
              </button>
            )
          })}
          {projectList.length === 0 && !collapsed && (
            <button
              onClick={() => setNewProject(true)}
              className="w-full rounded-[var(--radius-md)] px-2 py-2 text-left text-[12px] text-ink-4 hover:text-ink-2"
            >
              No projects yet — create one
            </button>
          )}
        </Group>

        {labelList.length > 0 && (
          <Group title={collapsed ? '' : 'Labels'}>
            <div className={collapsed ? 'flex flex-col items-center gap-1 py-1' : 'flex flex-wrap gap-1.5 px-1 py-1'}>
              {labelList.map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-[3px] text-[10.5px] text-ink-2"
                  title={l.name}
                >
                  <span className="size-[6px] rounded-full" style={{ background: `var(--color-${l.color})` }} />
                  {!collapsed && l.name}
                </span>
              ))}
            </div>
          </Group>
        )}

        <Group title={collapsed ? '' : 'Studio'}>
          {WORK.map((n) => (
            <NavRow
              key={n.id}
              item={n}
              collapsed={collapsed}
              active={view === n.id}
              onClick={() => setView(n.id)}
            />
          ))}
        </Group>
      </div>

      {/* footer */}
      <div className="flex items-center gap-1 border-t border-line px-2.5 py-2">
        <IconBtn
          label={settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={() => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
        >
          {settings.theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </IconBtn>
        {!collapsed && (
          <div className="ml-1 min-w-0 flex-1">
            <PomodoroWidget />
          </div>
        )}
        <div className="flex-1" />
        <IconBtn
          label={collapsed ? 'Expand' : 'Collapse'}
          onClick={() => setCollapsed((c) => !c)}
          className={collapsed ? '' : 'absolute right-2 top-3.5'}
        >
          <ChevronLeft size={14} className={collapsed ? 'rotate-180' : ''} />
        </IconBtn>
      </div>

      <Modal
        open={newProject}
        onClose={() => setNewProject(false)}
        title="New project"
        width={420}
        footer={
          <>
            <Btn onClick={() => setNewProject(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={createProject} disabled={!projectName.trim()}>
              Create
            </Btn>
          </>
        }
      >
        <div className="space-y-4 p-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-ink-4">Name</span>
            <input
              autoFocus
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createProject()}
              placeholder="e.g. Deep Work"
              className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 text-[13px] text-ink outline-none placeholder:text-ink-4 focus:border-line-strong"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-ink-4">Glyph</span>
            <div className="flex flex-wrap gap-1.5">
              {['◆', '◈', '△', '✦', '●', '■', '✳', '⬡', '❖', '☾'].map((g) => (
                <button
                  key={g}
                  onClick={() => setGlyph(g)}
                  className={`press size-8 rounded-[8px] border text-[13px] ${
                    glyph === g
                      ? 'border-signal bg-signal/15 text-signal'
                      : 'border-line text-ink-3 hover:text-ink'
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.1em] text-ink-4">Colour</span>
            <div className="flex flex-wrap gap-1.5">
              {['c-iris', 'c-aqua', 'c-ember', 'c-mint', 'c-orchid', 'c-saffron', 'c-sky', 'c-sand', 'c-rose', 'c-lime'].map(
                (c, i) => (
                  <button
                    key={c}
                    onClick={() => setColorIdx(i)}
                    aria-label={`Colour ${c}`}
                    className={`press size-6 rounded-full border-2 ${
                      colorIdx === i ? 'border-ink' : 'border-transparent'
                    }`}
                    style={{ background: `var(--color-${c})` }}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </Modal>
    </nav>
  )
}

function Group({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="mt-3 first:mt-1">
      {title && (
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-4">
            {title}
          </span>
          {action}
        </div>
      )}
      <div className="space-y-[1px]">{children}</div>
    </div>
  )
}

function NavRow({
  item,
  active,
  collapsed,
  count,
  risky,
  onClick,
}: {
  item: NavItem
  active: boolean
  collapsed: boolean
  count?: number | null
  risky?: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'press flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-[6px] text-left text-[12.5px]',
        active ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      <Icon size={14} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {count !== null && count !== undefined && count > 0 && (
            <span
              className={cn(
                'tnum rounded-full px-1.5 py-[1px] text-[10px]',
                risky ? 'bg-warn/20 text-warn' : 'bg-surface-3 text-ink-3',
              )}
            >
              {count}
            </span>
          )}
        </>
      )}
    </button>
  )
}

/** Small project picker used by the capture bar and task panel. */
export function ProjectPicker({
  value,
  onChange,
  align = 'start',
}: {
  value: string | undefined
  onChange: (id: string | undefined) => void
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const projects = useStore((s) => s.projects)
  const list = Object.values(projects).filter((p) => !p.archived).sort((a, b) => a.order - b.order)
  const current = value ? projects[value] : undefined
  const { close } = usePopover()

  return (
    <>
      <button
        ref={anchor}
        onClick={() => setOpen((o) => !o)}
        className="press flex items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink-2 hover:text-ink"
      >
        <span
          className="size-[7px] rounded-full"
          style={{ background: current ? `var(--color-${current.color})` : 'var(--color-ink-4)' }}
        />
        <span className="max-w-[140px] truncate">{current?.name ?? 'Inbox'}</span>
        <Hash size={11} className="text-ink-4" />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor.current} align={align} width={220}>
        <MenuItem
          onClick={() => {
            onChange(undefined)
            setOpen(false)
            close()
          }}
          selected={!value}
        >
          Inbox
        </MenuItem>
        {list.map((p) => (
          <MenuItem
            key={p.id}
            selected={value === p.id}
            icon={
              <span
                className="size-[7px] rounded-full"
                style={{ background: `var(--color-${p.color})` }}
              />
            }
            onClick={() => {
              onChange(p.id)
              setOpen(false)
              close()
            }}
          >
            {p.name}
          </MenuItem>
        ))}
      </Popover>
    </>
  )
}
