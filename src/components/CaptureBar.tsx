import { useEffect, useMemo, useRef, useState } from 'react'
import { CornerDownLeft, Plus, Sparkles } from 'lucide-react'
import { useStore } from '@/lib/store'
import { fmtDateKey } from '@/lib/date'
import { parseInput, splitEntries, type ParsedInput, type TokenKind } from '@/lib/nlp'
import { cn } from '@/lib/selectors'
import { Kbd } from './ui'
import { ParsedChips } from './ParsedChips'
import { nameMaps } from '@/lib/capture'

const TOKEN_COLOR: Record<TokenKind, string> = {
  date: 'var(--color-c-aqua)',
  time: 'var(--color-c-iris)',
  duration: 'var(--color-c-sand)',
  priority: 'var(--color-c-rose)',
  project: 'var(--color-c-mint)',
  label: 'var(--color-c-lime)',
  repeat: 'var(--color-c-orchid)',
  part: 'var(--color-c-saffron)',
}

export function CaptureBar() {
  const [text, setText] = useState('')
  const [dateMode, setDateMode] = useState<'auto' | 'pinned'>('auto')
  const ref = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const addTask = useStore((s) => s.addTask)
  const projects = useStore((s) => s.projects)
  const labels = useStore((s) => s.labels)
  const anchor = useStore((s) => s.ui.anchor)
  const toast = useStore((s) => s.toast)
  const prefill = useStore((s) => s.ui.capturePrefill)
  const setCapture = useStore((s) => s.setCapture)

  useEffect(() => {
    if (!prefill) return
    setText(prefill)
    // Consume the prefill without closing the bar: it is already on screen.
    setCapture(true, '')
    requestAnimationFrame(() => ref.current?.focus())
  }, [prefill, setCapture])

  const parsed = useMemo(() => (text.trim() ? parseInput(text) : null), [text])

  /* focus the capture from anywhere */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      if (typing) return
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) return
      if (e.key === 'c' || e.key === 'n' || e.key === 'i') {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const { projectByName, labelByName } = useMemo(() => nameMaps(projects, labels), [projects, labels])

  const submit = () => {
    const entries = splitEntries(text)
    if (!entries.length) return
    const created: string[] = []
    for (const entry of entries) {
      const p = parseInput(entry)
      const projectId = p.projects.map((n) => projectByName.get(n.toLowerCase())).find(Boolean)
      let project = projectId as string | undefined
      if (!project && p.projects.length) {
        project = useStore.getState().addProject({ name: p.projects[0] })
      }
      const labelIds = p.labels
        .map((n) => labelByName.get(n.toLowerCase()))
        .filter((x): x is string => !!x)
      const due = p.due ?? (dateMode === 'pinned' ? anchor : undefined)
      const id = addTask({
        title: p.title,
        projectId: project,
        labelIds,
        priority: p.priority,
        due,
        dueHasTime: !!p.scheduledStart,
        scheduled: p.scheduledStart ? { start: p.scheduledStart, end: p.scheduledEnd! } : null,
        durationMin: p.durationMin,
        dayPart: p.dayPart,
        recurrence: p.recurrence,
      })
      created.push(id)
    }
    setText('')
    toast({
      text:
        created.length === 1
          ? `Added “${parseInput(entries[0]).title}”`
          : `Added ${created.length} tasks`,
      kind: 'ok',
    })
    ref.current?.focus()
  }

  const targetLabel =
    dateMode === 'pinned'
      ? fmtDateKey(anchor, { weekday: true, year: false })
      : 'no date'

  return (
    <div className="relative z-40 shrink-0 border-t border-line bg-bg/95 backdrop-blur">
      {parsed && <ParsedChips parsed={parsed} raw={text} />}
      <div className="mx-auto flex max-w-[1180px] items-center gap-2 px-4 py-2.5">
        <Plus size={15} className="shrink-0 text-ink-4" />
        <div className="relative min-w-0 flex-1">
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 whitespace-pre-wrap break-words px-0 py-[7px] text-[13.5px] leading-[20px] text-transparent"
          >
            <Highlighted text={text} parsed={parsed} />
            {'\u200b'}
          </div>
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                setText('')
                ref.current?.blur()
              }
            }}
            rows={1}
            placeholder="Capture anything —  “draft the memo tomorrow at 9:15 for 45m #Studio !1 every week”"
            className="relative z-10 block max-h-[132px] w-full resize-none bg-transparent py-[7px] text-[13.5px] leading-[20px] text-ink outline-none placeholder:text-ink-4"
            style={{ height: 'auto' }}
          />
        </div>

        <button
          onClick={() => setDateMode((m) => (m === 'auto' ? 'pinned' : 'auto'))}
          title="Pin new tasks to the day you are looking at"
          className={cn(
            'press hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] sm:inline-flex',
            dateMode === 'pinned'
              ? 'border-signal/60 bg-signal/10 text-signal'
              : 'border-line text-ink-4 hover:text-ink-2',
          )}
        >
          {dateMode === 'pinned' ? <Sparkles size={11} /> : <span className="size-[6px] rounded-full bg-ink-4" />}
          {targetLabel}
        </button>

        <Kbd className="hidden shrink-0 sm:inline-flex">
          <CornerDownLeft size={9} />
        </Kbd>
      </div>
    </div>
  )
}

function Highlighted({ text, parsed }: { text: string; parsed: ParsedInput | null }) {
  if (!parsed || !parsed.tokens.length) return <>{text}</>
  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const t of parsed.tokens) {
    if (t.start < cursor) continue
    if (t.start > cursor) parts.push(<span key={`t${cursor}`}>{text.slice(cursor, t.start)}</span>)
    const color = TOKEN_COLOR[t.kind]
    parts.push(
      <span
        key={`k${t.start}`}
        className="rounded-[3px]"
        style={{
          background: `color-mix(in oklab, ${color} 20%, transparent)`,
          boxShadow: `inset 0 -1.5px 0 ${color}`,
        }}
      >
        {text.slice(t.start, t.end)}
      </span>,
    )
    cursor = t.end
  }
  if (cursor < text.length) parts.push(<span key="tail">{text.slice(cursor)}</span>)
  return <>{parts}</>
}
