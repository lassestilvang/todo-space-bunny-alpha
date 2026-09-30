import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { CheckCircle2, X } from 'lucide-react'
import { cn } from '@/lib/selectors'

export function Toasts() {
  const toasts = useStore((s) => s.ui.toasts)
  const dismiss = useStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toasts.length) return
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), t.action ? 6500 : 3200),
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, dismiss])

  if (!toasts.length) return null

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 left-1/2 z-150 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'anim-pop pointer-events-auto flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-[12.5px] backdrop-blur',
            t.kind === 'ok' && 'border-good/35 bg-good/12 text-ink',
            t.kind === 'warn' && 'border-warn/40 bg-warn/12 text-ink',
            t.kind === 'info' && 'border-line-2 bg-surface-2 text-ink',
          )}
          style={{ boxShadow: 'var(--shadow-pop)' }}
        >
          <CheckCircle2
            size={13}
            className={cn(
              t.kind === 'ok' && 'text-good',
              t.kind === 'warn' && 'text-warn',
              t.kind === 'info' && 'text-ink-3',
            )}
          />
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run()
                dismiss(t.id)
              }}
              className="press rounded-full border border-line-2 px-2 py-[2px] text-[11px] text-ink-2 hover:text-ink"
            >
              {t.action.label}
            </button>
          )}
          <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-4 hover:text-ink">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
