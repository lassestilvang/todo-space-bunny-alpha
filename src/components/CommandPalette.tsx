import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight,
  CalendarDays,
  Command,
  CornerDownLeft,
  Download,
  Eraser,
  Flame,
  Gauge,
  LayoutGrid,
  Moon,
  NotebookPen,
  Plus,
  Search,
  Sun,
  Target,
  TrendingUp,
  Wand2,
} from 'lucide-react'
import { useStore } from '@/lib/store'
import type { ViewId } from '@/types'
import { fmtRelativeDay, toKey } from '@/lib/date'
import { cn, cssColor } from '@/lib/selectors'
import { Kbd } from './ui'

type Row = {
  id: string
  group: string
  title: string
  sub?: string
  color?: string
  icon?: React.ReactNode
  run: () => void
}

export function CommandPalette() {
  const open = useStore((s) => s.ui.paletteOpen)
  const setOpen = useStore((s) => s.setPalette)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const tasks = useStore((s) => s.tasks)
  const projects = useStore((s) => s.projects)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setView = useStore((s) => s.setView)
  const setAnchor = useStore((s) => s.setAnchor)
  const setPanel = useStore((s) => s.setPanel)
  const setCapture = useStore((s) => s.setCapture)
  const addProject = useStore((s) => s.addProject)
  const exportState = useStore((s) => s.exportState)
  const resetAll = useStore((s) => s.resetAll)
  const setPlanOpen = useStore((s) => s.setPlanOpen)

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
    }
  }, [open])

  const rows = useMemo<Row[]>(() => {
    const today = toKey(new Date())
    const actions: Row[] = [
      {
        id: 'a-capture',
        group: 'Do',
        title: 'Capture a task',
        sub: 'then type what you mean',
        icon: <Plus size={13} />,
        run: () => setCapture(true, ''),
      },
      {
        id: 'a-plan',
        group: 'Do',
        title: 'Plan my day',
        sub: 'lay out the open tasks',
        icon: <Wand2 size={13} />,
        run: () => setPlanOpen(true),
      },
      {
        id: 'a-today',
        group: 'Do',
        title: 'Jump to today',
        icon: <CalendarDays size={13} />,
        run: () => {
          setAnchor(today)
          setView('day')
        },
      },
      {
        id: 'a-project',
        group: 'Do',
        title: 'New project',
        icon: <Plus size={13} />,
        run: () => addProject({ name: 'New project' }),
      },
    ]

    const views: Row[] = (
      [
        ['day', 'Day', <CalendarDays size={13} />],
        ['week', 'Week', <LayoutGrid size={13} />],
        ['month', 'Month', <CalendarDays size={13} />],
        ['agenda', 'Agenda', <TrendingUp size={13} />],
        ['habits', 'Habits', <Flame size={13} />],
        ['docs', 'Notes', <NotebookPen size={13} />],
        ['stats', 'Review', <Gauge size={13} />],
        ['inbox', 'Inbox', <Target size={13} />],
        ['today', 'Today', <Target size={13} />],
      ] as [ViewId, string, React.ReactNode][]
    ).map(([id, label, icon]) => ({
      id: `v-${id}`,
      group: 'Go to',
      title: label,
      icon,
      run: () => setView(id),
    }))

    const tools: Row[] = [
      {
        id: 't-theme',
        group: 'Settings',
        title: settings.theme === 'dark' ? 'Switch to light' : 'Switch to dark',
        icon: settings.theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />,
        run: () => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }),
      },
      {
        id: 't-prefs',
        group: 'Settings',
        title: 'Settings',
        icon: <Command size={13} />,
        run: () => setPanel({ kind: 'settings' }),
      },
      {
        id: 't-export',
        group: 'Settings',
        title: 'Export workspace',
        sub: '.json',
        icon: <Download size={13} />,
        run: () => {
          const blob = new Blob([exportState()], { type: 'application/json' })
          const a = document.createElement('a')
          a.href = URL.createObjectURL(blob)
          a.download = `tempo-${today}.json`
          a.click()
        },
      },
      {
        id: 't-reset',
        group: 'Settings',
        title: 'Reset to the sample workspace',
        icon: <Eraser size={13} />,
        run: () => {
          if (confirm('Reset everything back to the sample workspace?')) resetAll()
        },
      },
    ]

    const taskRows: Row[] = Object.values(tasks)
      .filter((t) => !t.completed)
      .slice(0, 300)
      .map((t) => ({
        id: `t-${t.id}`,
        group: 'Tasks',
        title: t.title,
        sub: `${t.scheduled ? 'on the clock · ' : ''}${fmtRelativeDay(t.due)} · ${t.durationMin}m`,
        color: cssColor(t.projectId ? projects[t.projectId]?.color : undefined),
        icon: <Target size={12} />,
        run: () => {
          if (t.scheduled) setAnchor(toKey(t.scheduled.start))
          setPanel({ kind: 'task', id: t.id })
        },
      }))

    const projectRows: Row[] = Object.values(projects)
      .filter((p) => !p.archived)
      .map((p) => ({
        id: `p-${p.id}`,
        group: 'Projects',
        title: `${p.glyph}  ${p.name}`,
        color: cssColor(p.color),
        run: () => {
          useStore.getState().setActiveProject(p.id)
          setView('kanban')
        },
      }))

    return [...actions, ...views, ...tools, ...projectRows, ...taskRows]
  }, [
    tasks,
    projects,
    settings.theme,
    setView,
    setAnchor,
    setPanel,
    setCapture,
    addProject,
    exportState,
    resetAll,
    setSettings,
    setPlanOpen,
  ])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return rows.slice(0, 12)
    const scored = rows
      .map((r) => {
        const hay = `${r.title} ${r.sub ?? ''}`.toLowerCase()
        const i = hay.indexOf(term)
        if (i < 0) {
          // subsequence fallback
          let j = 0
          for (const ch of term) {
            j = hay.indexOf(ch, j)
            if (j < 0) return { r, score: -1 }
            j++
          }
          return { r, score: 1 }
        }
        return { r, score: (i === 0 ? 0 : 1) * 100 - i }
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score)
    return scored.map((x) => x.r).slice(0, 40)
  }, [rows, q])

  useEffect(() => {
    setSel((s) => Math.min(s, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  if (!open) return null

  const grouped = filtered.reduce<Record<string, Row[]>>((acc, r) => {
    ;(acc[r.group] ??= []).push(r)
    return acc
  }, {})

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-start justify-center p-6 pt-[10vh]">
      <div className="anim-fade fixed inset-0 bg-bg-deep/70 backdrop-blur-[3px]" onClick={() => setOpen(false)} />
      <div
        className="anim-pop panel relative z-10 flex max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden"
        style={{ boxShadow: 'var(--shadow-pop)' }}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={15} className="shrink-0 text-ink-4" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, filtered.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(0, s - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                const r = filtered[sel]
                if (r) {
                  r.run()
                  setOpen(false)
                }
              } else if (e.key === 'Escape') {
                setOpen(false)
              }
            }}
            placeholder="Search tasks, or type a command…"
            className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-4"
          />
          <Kbd>esc</Kbd>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="px-3 py-8 text-center text-[12.5px] text-ink-4">
              Nothing matches “{q}”.
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-1.5 last:mb-0">
              <div className="px-2 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
                {group}
              </div>
              {items.map((r) => {
                const idx = filtered.indexOf(r)
                return (
                  <button
                    key={r.id}
                    onMouseEnter={() => setSel(idx)}
                    onClick={() => {
                      r.run()
                      setOpen(false)
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-[7px] text-left',
                      idx === sel ? 'bg-surface-3' : 'hover:bg-surface-2',
                    )}
                  >
                    {r.color ? (
                      <span className="size-[7px] shrink-0 rounded-full" style={{ background: r.color }} />
                    ) : (
                      <span className="shrink-0 text-ink-4">{r.icon}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.title}</span>
                    {r.sub && <span className="mono-clock shrink-0 text-[10.5px] text-ink-4">{r.sub}</span>}
                    {idx === sel && <ArrowRight size={12} className="shrink-0 text-ink-3" />}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-2 text-[10.5px] text-ink-4">
          <span className="flex items-center gap-1">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> move
          </span>
          <span className="flex items-center gap-1">
            <Kbd>
              <CornerDownLeft size={9} />
            </Kbd>
            open
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
