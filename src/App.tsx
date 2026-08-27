import { useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { CaptureBar } from './components/CaptureBar'
import { CalendarView } from './components/calendar/CalendarView'
import { DetailPanel } from './components/DetailPanel'
import { Assistant } from './components/Assistant'
import { CommandPalette } from './components/CommandPalette'
import { PlanSheet } from './components/PlanSheet'
import { Shortcuts } from './components/Shortcuts'
import { Toasts } from './components/Toasts'
import { PomodoroDock } from './components/Pomodoro'
import { MonthView } from './components/views/MonthView'
import { AgendaView } from './components/views/AgendaView'
import { MatrixView } from './components/views/MatrixView'
import { KanbanView } from './components/views/KanbanView'
import { HabitsView } from './components/views/HabitsView'
import { DocsView } from './components/views/DocsView'
import { StatsView } from './components/views/StatsView'
import { ListView } from './components/views/ListView'
import { useStore, syncTheme } from './lib/store'
import { toKey } from './lib/date'
import type { ViewId } from './types'

const VIEW_BY_NUMBER: ViewId[] = [
  'day',
  'week',
  'month',
  'agenda',
  'inbox',
  'today',
  'upcoming',
  'habits',
  'kanban',
]

export default function App() {
  const view = useStore((s) => s.ui.view)
  const theme = useStore((s) => s.settings.theme)
  const planOpen = useStore((s) => s.ui.planOpen)
  const captureOpen = useStore((s) => s.ui.captureOpen)
  const [load, setLoad] = useState({ planned: 0, capacity: 0, items: 0 })

  /* theme */
  useEffect(() => syncTheme(theme), [theme])

  /* autosize guard against runaway flex */
  useEffect(() => {
    const onResize = () => setLoad((l) => ({ ...l }))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const openPlan = useCallback(() => useStore.getState().setPlanOpen(true), [])

  /* ------------------------------------------------------------- hotkeys */
  useEffect(() => {
    let pendingG = false
    let gTimer: number | undefined

    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.setPalette(!s.ui.paletteOpen)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault()
        s.setHelpOpen(true)
        return
      }

      if (e.key === 'Escape') {
        if (s.ui.paletteOpen) s.setPalette(false)
        else if (s.ui.planOpen) s.setPlanOpen(false)
        else if (s.ui.helpOpen) s.setHelpOpen(false)
        else if (s.ui.panel) s.setPanel(null)
        return
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return

      if (pendingG) {
        pendingG = false
        window.clearTimeout(gTimer)
        const map: Record<string, ViewId> = { i: 'inbox', t: 'today', u: 'upcoming', d: 'day', w: 'week' }
        const v = map[e.key.toLowerCase()]
        if (v) {
          s.setView(v)
          e.preventDefault()
        }
        return
      }

      switch (e.key) {
        case 'g':
          pendingG = true
          gTimer = window.setTimeout(() => (pendingG = false), 900)
          return
        case 'c':
        case 'n':
        case 'i':
          if (e.key === 'i' && s.ui.view !== 'inbox') return
          e.preventDefault()
          s.setCapture(true, s.ui.capturePrefill, s.ui.captureSlot)
          focusCapture()
          return
        case '/':
          e.preventDefault()
          s.setPalette(true)
          return
        case '?':
          e.preventDefault()
          s.setHelpOpen(true)
          return
        case 'p':
        case 'P':
          e.preventDefault()
          s.setPlanOpen(true)
          return
        case 'f':
          e.preventDefault()
          document
            .querySelector<HTMLButtonElement>('[aria-label*="focus timer"], [aria-label*="Open timer"]')
            ?.click()
          return
      }

      if (/^[1-9]$/.test(e.key)) {
        const v = VIEW_BY_NUMBER[Number(e.key) - 1]
        if (v) {
          e.preventDefault()
          s.setView(v)
        }
        return
      }

      switch (e.key.toLowerCase()) {
        case 't':
          e.preventDefault()
          s.setAnchor(toKey(new Date()))
          s.setView('day')
          break
        case 'd':
          e.preventDefault()
          s.setView('day')
          break
        case 'w':
          e.preventDefault()
          s.setView('week')
          break
        case 'm':
          e.preventDefault()
          s.setView('month')
          break
        case 'a':
          e.preventDefault()
          s.setView('agenda')
          break
        case 's':
          e.preventDefault()
          s.setSettings({ theme: s.settings.theme === 'dark' ? 'light' : 'dark' })
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(gTimer)
    }
  }, [])

  const showCapture = captureOpen && (view === 'day' || view === 'week' || view === 'agenda' || view === 'inbox' || view === 'today' || view === 'upcoming')

  return (
    <div className="grain vignette flex h-full w-full flex-col overflow-hidden bg-bg text-ink">
      <div className="flex min-h-0 flex-1">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          <TopBar
            onPlan={openPlan}
            onHelp={() => useStore.getState().setHelpOpen(true)}
            load={load}
          />
          <div className="flex min-h-0 flex-1 flex-col">
            {view === 'day' && <CalendarView mode="day" onPlan={openPlan} onLoad={setLoad} />}
            {view === 'week' && <CalendarView mode="week" onPlan={openPlan} onLoad={setLoad} />}
            {view === 'month' && <MonthView />}
            {view === 'agenda' && <AgendaView />}
            {(view === 'inbox' || view === 'today' || view === 'upcoming') && (
              <ListView view={view} onPlan={openPlan} />
            )}
            {view === 'matrix' && <MatrixView />}
            {view === 'kanban' && <KanbanView />}
            {view === 'habits' && <HabitsView />}
            {view === 'docs' && <DocsView />}
            {view === 'stats' && <StatsView />}
            {view === 'assistant' && <AssistantGate />}
          </div>
          {showCapture && <CaptureBar />}
        </main>
      </div>

      <CommandPalette />
      <PlanSheet open={planOpen} onClose={() => useStore.getState().setPlanOpen(false)} />
      <Assistant />
      <DetailPanel />
      <PomodoroDock />
      <Shortcuts />
      <Toasts />
    </div>
  )
}

/** The sidebar "Assistant" entry: opens the coach rather than a dead page. */
function AssistantGate() {
  const setAssistant = useStore((s) => s.setAssistant)
  const setView = useStore((s) => s.setView)
  useEffect(() => {
    setAssistant(true)
    setView('day')
  }, [setAssistant, setView])
  return null
}

function focusCapture() {
  const el = document.querySelector<HTMLTextAreaElement>('.grain textarea')
  el?.focus()
}
