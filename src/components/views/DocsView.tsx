import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Bold,
  Check,
  CheckSquare,
  Code,
  Heading2,
  Italic,
  List,
  Pin,
  PinOff,
  Plus,
  Quote,
  Search,
  StickyNote,
  Trash2,
} from 'lucide-react'
import type { Doc, ID } from '@/types'
import { cn } from '@/lib/selectors'
import { useStore } from '@/lib/store'
import { Btn, Empty, IconBtn, Input, Modal, Seg } from '@/components/ui'
import { Markdown } from '@/components/Markdown'

/* ================================================================
   Formatting helpers — operate on the raw string, not on the DOM.
   ================================================================ */

type Format = {
  label: string
  icon: ReactNode
  before: string
  after?: string
  placeholder: string
  /** line mode: `again` strips an existing marker, `strip` removes one. */
  again?: RegExp
  strip?: RegExp
}

const FORMATS: Format[] = [
  {
    label: 'Bold',
    icon: <Bold size={13} />,
    before: '**',
    after: '**',
    placeholder: 'bold',
  },
  {
    label: 'Italic',
    icon: <Italic size={13} />,
    before: '*',
    after: '*',
    placeholder: 'italic',
  },
  {
    label: 'Heading',
    icon: <Heading2 size={13} />,
    before: '## ',
    placeholder: 'Heading',
    strip: /^#{1,6}\s+/,
  },
  {
    label: 'Bulleted list',
    icon: <List size={13} />,
    before: '- ',
    placeholder: 'List item',
    again: /^[-*+]\s+/,
  },
  {
    label: 'Checklist',
    icon: <CheckSquare size={13} />,
    before: '- [ ] ',
    placeholder: 'Checklist item',
    again: /^[-*+]\s+\[[ xX]?\]\s*/,
  },
  {
    label: 'Quote',
    icon: <Quote size={13} />,
    before: '> ',
    placeholder: 'Quote',
    again: /^>\s?/,
  },
  {
    label: 'Code',
    icon: <Code size={13} />,
    before: '`',
    after: '`',
    placeholder: 'code',
  },
]

const isLineMode = (f: Format) => !f.after

function applyFormat(
  value: string,
  start: number,
  end: number,
  f: Format,
): { value: string; start: number; end: number } {
  if (!isLineMode(f)) {
    const core = value.slice(start, end) || f.placeholder
    return {
      value: value.slice(0, start) + f.before + core + (f.after ?? '') + value.slice(end),
      start: start + f.before.length,
      end: start + f.before.length + core.length,
    }
  }
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nl = value.indexOf('\n', end)
  const lineEnd = nl === -1 ? value.length : nl
  const block = value.slice(lineStart, lineEnd)
  const next = block
    .split('\n')
    .map((l) => {
      if (f.again && f.again.test(l)) return l.replace(f.again, '')
      if (f.strip) return f.before + l.replace(f.strip, '')
      return f.before + (l || f.placeholder)
    })
    .join('\n')
  return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), start: lineStart, end: lineStart + next.length }
}

/* ================================================================
   View
   ================================================================ */

const relTime = (ts: number): string => {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export function DocsView() {
  const docsMap = useStore((s) => s.docs)
  const projectsMap = useStore((s) => s.projects)
  const addDoc = useStore((s) => s.addDoc)
  const deleteDoc = useStore((s) => s.deleteDoc)
  const toast = useStore((s) => s.toast)

  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<ID | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [projectId, setProjectId] = useState<ID | undefined>(undefined)
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Doc | null>(null)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number | null>(null)
  const pending = useRef<{ id: ID; patch: Partial<Doc> } | null>(null)
  const pendingSel = useRef<[number, number] | null>(null)

  const projects = useMemo(
    () => Object.values(projectsMap).filter((p) => !p.archived).sort((a, b) => a.order - b.order),
    [projectsMap],
  )

  const allDocs = useMemo(
    () =>
      Object.values(docsMap).sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      ),
    [docsMap],
  )

  const docs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allDocs
    return allDocs.filter((d) => d.title.toLowerCase().includes(q) || d.body.toLowerCase().includes(q))
  }, [allDocs, query])

  /* ------------------------------------------------------------ autosave */

  const flush = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    const p = pending.current
    pending.current = null
    if (!p) return
    useStore.getState().updateDoc(p.id, p.patch)
    setSavedAt(Date.now())
  }

  const schedule = (id: ID, patch: Partial<Doc>) => {
    pending.current = { id, patch }
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 400)
  }

  // Never lose an edit on unmount.
  useEffect(() => flush, [])

  // Fade the "Saved" chip away.
  useEffect(() => {
    if (savedAt === null) return
    const t = window.setTimeout(() => setSavedAt(null), 1500)
    return () => window.clearTimeout(t)
  }, [savedAt])

  // Restore the caret after a toolbar action rewrote the value.
  useEffect(() => {
    const sel = pendingSel.current
    if (!sel) return
    pendingSel.current = null
    const ta = taRef.current
    if (!ta) return
    ta.focus()
    ta.setSelectionRange(sel[0], sel[1])
  })

  /* ------------------------------------------------------- selection sync */

  const active = activeId ? (docsMap[activeId] ?? null) : null

  const loadDoc = (d: Doc) => {
    flush()
    setActiveId(d.id)
    setTitle(d.title)
    setBody(d.body)
    setProjectId(d.projectId)
  }

  // First open picks the newest doc once, then stays put.
  const bootstrapped = useRef(false)
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    if (allDocs.length) loadDoc(allDocs[0])
  }, [allDocs])

  /* ------------------------------------------------------------- actions */

  const createDoc = () => {
    flush()
    const id = addDoc({ title: 'Untitled' })
    const created = useStore.getState().docs[id]
    setActiveId(id)
    setTitle(created.title)
    setBody(created.body)
    setProjectId(created.projectId)
    setMode('write')
    window.setTimeout(() => taRef.current?.focus(), 40)
  }

  const edit = (patch: Partial<Doc>) => {
    if (!activeId) return
    if (patch.title !== undefined) setTitle(patch.title)
    if (patch.body !== undefined) setBody(patch.body)
    if (patch.projectId !== undefined) setProjectId(patch.projectId)
    schedule(activeId, patch)
  }

  const doDelete = () => {
    const d = confirmDelete
    if (!d) return
    flush()
    deleteDoc(d.id)
    setConfirmDelete(null)
    const rest = Object.values(useStore.getState().docs).sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
    )
    if (activeId === d.id) {
      if (rest.length) {
        setActiveId(rest[0].id)
        setTitle(rest[0].title)
        setBody(rest[0].body)
        setProjectId(rest[0].projectId)
      } else {
        setActiveId(null)
        setTitle('')
        setBody('')
        setProjectId(undefined)
      }
    }
    toast({ text: 'Doc deleted', kind: 'warn' })
  }

  const format = (f: Format) => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart ?? body.length
    const end = ta.selectionEnd ?? body.length
    const res = applyFormat(body, start, end, f)
    pendingSel.current = [res.start, res.end]
    setBody(res.value)
    if (activeId) schedule(activeId, { body: res.value })
  }

  const words = useMemo(() => {
    const stripped = body
      .replace(/[#>*_`[\]()]/g, ' ')
      .trim()
    if (!stripped) return 0
    return stripped.split(/\s+/).filter(Boolean).length
  }, [body])

  const readingMin = Math.max(1, Math.round(words / 220))
  const project = projectId ? projectsMap[projectId] : undefined

  return (
    <div className="flex h-full min-h-0">
      {/* ------------------------------- list ------------------------------- */}
      <aside className="flex w-[262px] shrink-0 flex-col border-r border-line bg-surface">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <StickyNote size={13} className="text-ink-4" aria-hidden />
            <span className="text-[12.5px] font-semibold tracking-tight text-ink">Notes</span>
          </div>
          <Btn variant="quiet" size="xs" onClick={createDoc} aria-label="New doc">
            <Plus size={13} />
          </Btn>
        </div>

        <div className="shrink-0 px-3 py-2">
          <label className="relative block">
            <Search
              size={12}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-4"
              aria-hidden
            />
            <Input
              aria-label="Search notes"
              placeholder="Search title and body"
              className="h-7 pl-7 text-[12px]"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {docs.length === 0 ? (
            <div className="px-2 py-8 text-center text-[11.5px] text-ink-4">
              {allDocs.length ? 'Nothing matches that search.' : 'No notes yet.'}
            </div>
          ) : (
            docs.map((d) => {
              const on = d.id === activeId
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => loadDoc(d)}
                  aria-current={on}
                  className={cn(
                    'press anim-rise mb-0.5 block w-full rounded-[var(--radius-md)] px-2.5 py-2 text-left',
                    on ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {d.pinned && <Pin size={10} className="shrink-0 text-signal" aria-hidden />}
                    <span className="truncate text-[12.5px] font-semibold tracking-tight">
                      {d.title || 'Untitled'}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-4">
                    {d.body.trim() || 'Empty'}
                  </div>
                  <div className="mono-clock tnum mt-1 text-[9.5px] text-ink-4">
                    {relTime(d.updatedAt)}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* ------------------------------ editor ------------------------------ */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <Empty
            icon={<StickyNote size={26} strokeWidth={1.4} />}
            title="Nothing open"
            hint="Notes are where Tempo keeps the thinking: meeting prep, decisions, half-formed ideas. Markdown, autosaved."
            action={
              <Btn variant="primary" onClick={createDoc}>
                <Plus size={13} />
                New doc
              </Btn>
            }
          />
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
              <select
                aria-label="Project"
                value={projectId ?? ''}
                onChange={(e) => edit({ projectId: e.target.value || undefined })}
                className="h-7 max-w-[168px] rounded-[var(--radius-md)] border border-line bg-surface-2 px-1.5 text-[12px] text-ink-2 outline-none hover:border-line-strong focus:border-line-strong"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {project && (
                <span className="size-[7px] shrink-0 rounded-full" style={{ background: `var(--color-${project.color})` }} aria-hidden />
              )}

              <div className="flex items-center gap-0.5 border-l border-line pl-2">
                {FORMATS.map((f) => (
                  <IconBtn key={f.label} label={f.label} onClick={() => format(f)}>
                    {f.icon}
                  </IconBtn>
                ))}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <Seg
                  size="xs"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'write', label: 'Write' },
                    { value: 'preview', label: 'Preview' },
                  ]}
                />
                <IconBtn
                  label={active.pinned ? 'Unpin' : 'Pin'}
                  active={active.pinned}
                  onClick={() => edit({ pinned: !active.pinned })}
                >
                  {active.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                </IconBtn>
                <IconBtn label="Delete doc" onClick={() => setConfirmDelete(active)}>
                  <Trash2 size={13} />
                </IconBtn>
              </div>
            </div>

            <div className="shrink-0 px-4 pt-3">
              <input
                aria-label="Doc title"
                placeholder="Untitled"
                value={title}
                onChange={(e) => edit({ title: e.target.value })}
                className="w-full bg-transparent font-serif text-[26px] leading-tight tracking-tight text-ink outline-none placeholder:text-ink-4"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
              {mode === 'write' ? (
                <textarea
                  ref={taRef}
                  aria-label="Doc body"
                  spellCheck
                  placeholder={'Markdown: **bold**, *italic*, `code`, - lists, - [ ] checklists, > quotes, [links](https://…)'}
                  value={body}
                  onChange={(e) => edit({ body: e.target.value })}
                  className="min-h-[60vh] w-full resize-none bg-transparent font-mono text-[12.5px] leading-[1.75] text-ink-2 outline-none placeholder:text-ink-4"
                />
              ) : (
                <div className="prose-app min-h-[60vh] pb-6 text-[13.5px]">
                  {body.trim() ? (
                    <Markdown source={body} />
                  ) : (
                    <p className="text-ink-4">Nothing to preview yet.</p>
                  )}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-2 text-[11px] text-ink-4">
              <div className="flex items-center gap-3">
                <span className="mono-clock tnum">
                  <span className="text-ink-2">{words}</span> word{words === 1 ? '' : 's'}
                </span>
                <span aria-hidden>·</span>
                <span className="mono-clock tnum">{readingMin} min read</span>
                <span aria-hidden>·</span>
                <span className="mono-clock tnum">edited {relTime(active.updatedAt)}</span>
              </div>
              <span
                aria-live="polite"
                className={cn(
                  'inline-flex items-center gap-1 text-ink-3 transition-opacity duration-500',
                  savedAt === null ? 'opacity-0' : 'opacity-100',
                )}
              >
                <Check size={11} aria-hidden />
                Saved
              </span>
            </div>
          </>
        )}
      </section>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete note"
        width={400}
        footer={
          <>
            <Btn variant="quiet" onClick={() => setConfirmDelete(null)}>
              Keep
            </Btn>
            <Btn variant="danger" onClick={doDelete}>
              <Trash2 size={13} />
              Delete
            </Btn>
          </>
        }
      >
        <p className="px-4 py-4 text-[13px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">{confirmDelete?.title || 'Untitled'}</span> will be
          removed permanently.
        </p>
      </Modal>
    </div>
  )
}