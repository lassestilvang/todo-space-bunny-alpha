import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/selectors'

/* ---------------------------------- button ---------------------------------- */

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger' | 'outline'
  size?: 'xs' | 'sm' | 'md'
  active?: boolean
}

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = 'ghost', size = 'sm', active, className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cn(
        'press inline-flex items-center gap-1.5 rounded-[var(--radius-md)] font-medium whitespace-nowrap select-none disabled:opacity-40 disabled:pointer-events-none',
        size === 'xs' && 'h-6 px-2 text-[11px]',
        size === 'sm' && 'h-7 px-2.5 text-[12.5px]',
        size === 'md' && 'h-9 px-3.5 text-[13.5px]',
        variant === 'ghost' &&
          (active
            ? 'bg-surface-3 text-ink'
            : 'text-ink-2 hover:bg-surface-3 hover:text-ink'),
        variant === 'quiet' && 'text-ink-3 hover:text-ink hover:bg-surface-3',
        variant === 'outline' && 'border border-line-2 text-ink-2 hover:border-line-strong hover:text-ink',
        variant === 'primary' && 'bg-signal text-signal-ink hover:brightness-110 font-semibold',
        variant === 'danger' && 'text-bad hover:bg-bad/12',
        className,
      )}
    />
  )
})

export const IconBtn = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }
>(function IconBtn({ label, className, active, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={cn(
        'press grid place-items-center rounded-[var(--radius-md)] text-ink-3 hover:text-ink hover:bg-surface-3 disabled:opacity-35 disabled:pointer-events-none',
        'h-7 w-7',
        active && 'bg-surface-3 text-ink',
        className,
      )}
    />
  )
})

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'mono-clock inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] border border-line-2 bg-surface-2 px-1 text-[10px] leading-none text-ink-3',
        className,
      )}
    >
      {children}
    </kbd>
  )
}

export function Chip({
  color,
  children,
  className,
  onClick,
  title,
}: {
  color?: string
  children: ReactNode
  className?: string
  onClick?: () => void
  title?: string
}) {
  return (
    <span
      title={title}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-[3px] text-[11px] text-ink-2',
        onClick && 'cursor-pointer hover:border-line-strong hover:text-ink',
        className,
      )}
    >
      {color && (
        <span className="size-[7px] shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      )}
      {children}
    </span>
  )
}

export function Seg<T extends string>({
  value,
  options,
  onChange,
  size = 'sm',
  className,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  size?: 'xs' | 'sm'
  className?: string
}) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[var(--radius-md)] border border-line bg-surface-2/70 p-0.5',
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'press rounded-[6px] font-medium',
            size === 'xs' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]',
            value === o.value
              ? 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.18)]'
              : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------- inputs ---------------------------------- */

export function Checkbox({
  checked,
  onChange,
  size = 16,
  color,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  size?: number
  color?: string
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onChange(!checked)
      }}
      style={
        {
          width: size,
          height: size,
          '--tint': color ?? 'var(--color-good)',
        } as CSSProperties
      }
      className={cn(
        'press grid shrink-0 place-items-center rounded-[5px] border transition-colors',
        checked
          ? 'border-transparent'
          : 'border-line-strong hover:border-[var(--tint)]',
      )}
    >
      {checked && (
        <span
          className="grid h-full w-full place-items-center rounded-[5px]"
          style={{ background: color ?? 'var(--color-good)' }}
        >
          <svg viewBox="0 0 12 12" className="size-[70%]" aria-hidden>
            <path
              d="M2.5 6.4 4.6 8.5 9.5 3.6"
              fill="none"
              stroke="#0a0b0d"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'press relative h-[20px] w-[34px] shrink-0 rounded-full border',
        checked ? 'border-transparent bg-signal' : 'border-line-2 bg-surface-3',
      )}
    >
      <span
        className={cn(
          'absolute top-[2px] size-[14px] rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[16px]' : 'translate-x-[2px]',
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.16,1,0.3,1)' }}
      />
    </button>
  )
}

export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        'h-8 w-full rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 text-[13px] text-ink placeholder:text-ink-4 focus:border-line-strong focus:bg-surface-3 focus:outline-none',
        className,
      )}
    />
  )
}

export function Row({
  label,
  children,
  hint,
  className,
}: {
  label: ReactNode
  children: ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-1.5', className)}>
      <div className="min-w-0">
        <div className="text-[12.5px] text-ink-2">{label}</div>
        {hint && <div className="text-[11px] text-ink-4">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  format,
  label,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  label?: string
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-2.5">
      <input
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tnum h-1.5 w-28 cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-signal"
        style={{
          background: `linear-gradient(90deg, var(--signal) ${pct}%, var(--surface-3) ${pct}%)`,
        }}
      />
      <span className="mono-clock w-14 shrink-0 text-right text-[11px] text-ink-3">
        {format ? format(value) : value}
      </span>
    </div>
  )
}

/* ---------------------------------- overlay ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 560,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: number
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center overflow-y-auto p-6 pt-[12vh]">
      <div
        className="anim-pop fixed inset-0 bg-bg-deep/70 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="panel anim-pop relative z-10 overflow-hidden p-0"
        style={{ width, maxWidth: 'calc(100vw - 32px)', boxShadow: 'var(--shadow-pop)' }}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="text-[13px] font-semibold tracking-tight text-ink">{title}</div>
            <IconBtn label="Close" onClick={onClose}>
              <X size={14} />
            </IconBtn>
          </div>
        )}
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------- popover ---------------------------------- */

type PopCtx = { close: () => void }
const PopContext = createContext<PopCtx>({ close: () => {} })
export const usePopover = () => useContext(PopContext)

export function Popover({
  open,
  onClose,
  anchor,
  children,
  align = 'start',
  width = 260,
  side = 'bottom',
}: {
  open: boolean
  onClose: () => void
  anchor: HTMLElement | null
  children: ReactNode
  align?: 'start' | 'end' | 'center'
  width?: number
  side?: 'bottom' | 'top' | 'right'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) return
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const el = ref.current
      const h = el?.offsetHeight ?? 0
      const w = el?.offsetWidth ?? width
      let top = side === 'top' ? a.top - h - 6 : side === 'right' ? a.top : a.bottom + 6
      let left =
        align === 'end' ? a.right - w : align === 'center' ? a.left + a.width / 2 - w / 2 : a.left
      if (side === 'right') left = a.right + 6
      top = Math.min(Math.max(8, top), window.innerHeight - h - 8)
      left = Math.min(Math.max(8, left), window.innerWidth - w - 8)
      setPos({ top, left })
    }
    place()
    const ro = new ResizeObserver(place)
    if (ref.current) ro.observe(ref.current)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchor, align, side, width])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (anchor?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchor])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      className="anim-pop fixed z-100 rounded-[var(--radius-lg)] border border-line-2 bg-surface-2 p-1.5"
      style={{
        width,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        boxShadow: 'var(--shadow-pop)',
      }}
    >
      <PopContext.Provider value={{ close: onClose }}>{children}</PopContext.Provider>
    </div>,
    document.body,
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  hint,
  danger,
  selected,
  disabled,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick?: () => void
  hint?: ReactNode
  danger?: boolean
  selected?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'press flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-[7px] text-left text-[13px]',
        danger ? 'text-bad hover:bg-bad/12' : 'text-ink-2 hover:bg-surface-3 hover:text-ink',
        selected && 'bg-surface-3 text-ink',
        disabled && 'pointer-events-none opacity-40',
      )}
    >
      {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="shrink-0 text-[11px] text-ink-4">{hint}</span>}
    </button>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-4">
      {children}
    </div>
  )
}

/* ---------------------------------- misc ---------------------------------- */

export function Ring({
  value,
  size = 34,
  stroke = 3,
  color = 'var(--signal)',
  children,
}: {
  value: number
  size?: number
  stroke?: number
  color?: string
  children?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const id = useId()
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`g${id}`}>
            <stop offset="0%" stopColor={color} stopOpacity="0.55" />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 grid place-items-center text-[10px] font-semibold text-ink-2 tnum">
          {children}
        </div>
      )}
    </div>
  )
}

export function Empty({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-ink-4">{icon}</div>}
      <div className="font-serif text-[19px] text-ink-2">{title}</div>
      {hint && <div className="max-w-[38ch] text-[12.5px] leading-relaxed text-ink-4">{hint}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function SectionTitle({
  children,
  right,
  className,
}: {
  children: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-1 pb-1.5', className)}>
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
        {children}
      </h3>
      {right}
    </div>
  )
}
