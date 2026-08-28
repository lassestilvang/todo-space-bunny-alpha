import type { ParsedInput } from '@/lib/nlp'
import { chipList } from '@/lib/capture'
import { cn } from '@/lib/selectors'

/**
 * The reading under an input: what the text was understood to mean.
 *
 * One component for both the capture bar and the calendar's inline field, so
 * the two can never describe the same text differently.
 */
export function ParsedChips({
  parsed,
  raw,
  className,
}: {
  parsed: ParsedInput
  /** The text as typed, so the cleaned title can be shown when it differs. */
  raw?: string
  className?: string
}) {
  const chips = chipList(parsed)
  const cleaned = raw !== undefined && parsed.title !== raw.trim()
  if (!chips.length && !cleaned) return null
  return (
    <div className={cn('anim-fade flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((c) => (
        <span
          key={`${c.label}-${c.value}`}
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[2px] text-[11px]"
          style={{
            borderColor: `color-mix(in oklab, ${c.color ?? 'var(--color-ink-4)'} 35%, transparent)`,
            color: c.color ?? 'var(--color-ink-3)',
            background: `color-mix(in oklab, ${c.color ?? 'var(--color-ink-4)'} 8%, transparent)`,
          }}
        >
          <span className="text-[9.5px] uppercase tracking-[0.1em] opacity-70">{c.label}</span>
          <span className="text-ink-2">{c.value}</span>
        </span>
      ))}
      {cleaned && (
        <span className="text-[11px] text-ink-4">
          → <span className="text-ink-2">{parsed.title}</span>
        </span>
      )}
    </div>
  )
}