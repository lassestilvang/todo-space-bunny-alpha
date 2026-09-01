import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { MINUTES_IN_DAY, clockText, parseClock } from '@/lib/clock'
import { cn } from '@/lib/selectors'

/**
 * A 24-hour time field.
 *
 * Always shows `HH:MM`, accepts `9:30`, `09:30`, `0930` or `9`, and nudges in
 * 15-minute steps from the buttons or the arrow keys. The value is minutes from
 * midnight; call sites convert to and from timestamps.
 */
export function TimeField({
  value,
  onChange,
  ariaLabel,
  disabled,
  className,
  step = 15,
  width = 'w-[68px]',
}: {
  /** Minutes from midnight, or null when there is no time yet. */
  value: number | null
  onChange: (minutes: number) => void
  ariaLabel: string
  disabled?: boolean
  className?: string
  step?: number
  width?: string
}) {
  /** What the user is typing, or null to follow the value. */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : clockText(value))

  const commit = (raw: string) => {
    const parsed = parseClock(raw)
    setDraft(null)
    // Unparseable input reverts to the last good value rather than guessing.
    if (parsed !== null) onChange(parsed)
  }

  const nudge = (by: number) => {
    const from = value === null ? 9 * 60 : value
    onChange(((from + by) % MINUTES_IN_DAY + MINUTES_IN_DAY) % MINUTES_IN_DAY)
  }

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        aria-label={`Earlier by ${step} minutes`}
        disabled={disabled}
        onClick={() => nudge(-step)}
        className="press grid size-6 shrink-0 place-items-center rounded-[6px] border border-line bg-surface-2 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
      >
        <Minus size={11} />
      </button>

      <input
        value={shown}
        disabled={disabled}
        aria-label={ariaLabel}
        inputMode="numeric"
        placeholder="--:--"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(e.currentTarget.value)
            e.currentTarget.blur()
          }
          if (e.key === 'Escape') {
            e.stopPropagation()
            setDraft(null)
            e.currentTarget.blur()
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            setDraft(null)
            nudge(e.key === 'ArrowUp' ? step : -step)
          }
        }}
        className={cn(
          'mono-clock h-7 rounded-[6px] border border-line bg-surface-2 px-1.5 text-center text-[12px] text-ink-2 outline-none focus:border-line-strong focus:bg-surface-3',
          width,
        )}
      />

      <button
        type="button"
        aria-label={`Later by ${step} minutes`}
        disabled={disabled}
        onClick={() => nudge(step)}
        className="press grid size-6 shrink-0 place-items-center rounded-[6px] border border-line bg-surface-2 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-40"
      >
        <Plus size={11} />
      </button>
    </div>
  )
}