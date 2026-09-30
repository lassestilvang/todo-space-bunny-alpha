import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuEntry =
  | { kind: 'label'; text: string }
  | { kind: 'item'; label: string; icon?: ReactNode; onSelect?: () => void; danger?: boolean; hint?: string; disabled?: boolean }
  | { kind: 'divider' }

export function ContextMenu({
  entries,
  onClose,
}: {
  entries: MenuEntry[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const h = el.offsetHeight
    const w = el.offsetWidth
    setPos({
      top: Math.min(window.innerHeight - h - 8, Math.max(8, state.y)),
      left: Math.min(window.innerWidth - w - 8, Math.max(8, state.x)),
    })
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="anim-pop fixed z-200 min-w-[190px] rounded-[var(--radius-lg)] border border-line-2 bg-surface-2 p-1"
      style={{
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        boxShadow: 'var(--shadow-pop)',
      }}
    >
      {entries.map((e, i) => {
        if (e.kind === 'divider') return <div key={i} className="my-1 h-px bg-line" />
        if (e.kind === 'label')
          return (
            <div
              key={i}
              className="px-2 pb-1 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-ink-4"
            >
              {e.text}
            </div>
          )
        return (
          <button
            key={i}
            role="menuitem"
            disabled={e.disabled}
            onClick={() => {
              e.onSelect?.()
              onClose()
            }}
            className={[
              'press flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-[6px] text-left text-[12.5px] disabled:opacity-35',
              e.danger
                ? 'text-bad hover:bg-bad/12'
                : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
            ].join(' ')}
          >
            {e.icon && <span className="shrink-0 text-ink-3">{e.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{e.label}</span>
            {e.hint && <span className="mono-clock text-[10px] text-ink-4">{e.hint}</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}

type State = { x: number; y: number }
let state: State = { x: 0, y: 0 }

export function useContextMenu() {
  const [open, setOpen] = useState<{ entries: MenuEntry[]; x: number; y: number } | null>(null)
  const show = (e: { clientX: number; clientY: number } | { x: number; y: number }, entries: MenuEntry[]) => {
    const x = 'clientX' in e ? e.clientX : e.x
    const y = 'clientY' in e ? e.clientY : e.y
    state = { x, y }
    setOpen({ entries, x, y })
  }
  const node = open ? <ContextMenu entries={open.entries} onClose={() => setOpen(null)} /> : null
  return { show, node, close: () => setOpen(null) }
}
