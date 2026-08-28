import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent,
} from 'react'
import { AlertTriangle, Lock, Sparkles } from 'lucide-react'
import type { CalendarItem } from '@/types'
import { MIN, atMinutes, clamp, fmtRelativeDay, fmtTime, isToday, snap } from '@/lib/date'
import { cn, type Positioned } from '@/lib/selectors'
import { activeItemPayload, hasItemPayload, readItemPayload, type DropPayload } from '@/lib/drag'
import { riskForItem } from '@/lib/risk'

export const GUTTER = 56
export const MIN_BLOCK = 10

type Mode = 'move' | 'resize-start' | 'resize-end'

type DragState =
  /** `down` is the block's cascade offset, so pointer maths stays in the same frame. */
  | { mode: Mode; id: string; grabOffsetMin: number; down: number }
  | { mode: 'create'; anchorMin: number; dayIndex: number; moved: boolean; down: number }
  | null

export type TimeGridProps = {
  days: Date[]
  items: Positioned[]
  gridStart: number
  gridEnd: number
  snapMin: number
  pxPerHour?: number
  now: number
  showNow: boolean
  selectedId?: string | null
  onOpen: (item: CalendarItem) => void
  onMove: (id: string, start: number, end: number) => void
  onCreate: (day: Date, start: number, end: number, title: string) => void
  onContext: (item: CalendarItem, x: number, y: number) => void
  /** Schedules a dragged task or all-day event at a specific time. */
  onDropItem?: (payload: DropPayload, day: Date, startMin: number) => void
}

export function TimeGrid({
  days,
  items,
  gridStart,
  gridEnd,
  snapMin,
  pxPerHour = 76,
  now,
  showNow,
  selectedId,
  onOpen,
  onMove,
  onCreate,
  onContext,
  onDropItem,
}: TimeGridProps) {
  const pxPerMin = pxPerHour / 60
  const totalMin = gridEnd - gridStart
  const height = totalMin * pxPerMin
  const scrollRef = useRef<HTMLDivElement>(null)
  const colsRef = useRef<HTMLDivElement>(null)

  const [drag, setDrag] = useState<DragState>(null)
  const [preview, setPreview] = useState<{ day: number; start: number; end: number } | null>(null)
  const previewRef = useRef(preview)
  previewRef.current = preview
  const dragRef = useRef(drag)
  dragRef.current = drag
  const itemsRef = useRef(items)
  itemsRef.current = items
  /**
   * A pointerup always emits a click, and by then `drag` is already cleared —
   * so remember the gesture in a ref and let the click handler consult it.
   */
  const draggedRef = useRef(false)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)

  const [composer, setComposer] = useState<{ day: number; start: number; end: number } | null>(null)
  const [composeText, setComposeText] = useState('')
  const composeRef = useRef<HTMLInputElement>(null)

  /** Where a dragged task or all-day event would land if released now. */
  const [dropAt, setDropAt] = useState<{ day: number; start: number; payload: DropPayload } | null>(null)

  /**
   * Cascade geometry per block: how far it steps down and right inside its
   * overlap cluster, which layer it paints on, and how much of it is actually
   * visible once the bands above have covered their share.
   *
   * Bands are chronological: each slot starts a little lower than the one
   * before, keeps the full column width, and paints over the band above, so all
   * of them stay readable instead of being squeezed into narrow lanes.
   */
  const cascade = useMemo(() => {
    const byCluster = new Map<number, Positioned[]>()
    for (const item of items) {
      const group = byCluster.get(item.cluster)
      if (group) group.push(item)
      else byCluster.set(item.cluster, [item])
    }
    const out = new Map<string, { down: number; right: number; z: number; visible: number }>()
    for (const group of byCluster.values()) {
      const n = group.length
      const height = (g: Positioned) => Math.max(18, ((g.end - g.start) / MIN) * pxPerMin - 3)
      // Every band steps down by `step`, so the last one absorbs all of them:
      // cap the step by what it can spare, and the rest stay readable.
      const step =
        n < 2 ? 0 : Math.max(0, Math.min(18, (height(group[n - 1]) - 18) / (n - 1)))
      group.forEach((item, k) => {
        const down = k * step
        // A band is covered from the top of the next one down; a later start
        // buys it extra room before that happens.
        const next = group[k + 1]
        const cover = next ? (((next.start - item.start) / MIN) * pxPerMin + step) : 0
        const own = Math.max(16, height(item) - down)
        out.set(item.id, {
          down,
          right: k * 3,
          z: k + 1,
          visible: cover > 0 ? Math.min(own, cover) : own,
        })
      })
    }
    return out
  }, [items, pxPerMin])

  // A drag that ends anywhere else (outside the grid) must not leave a ghost.
  useEffect(() => {
    const onEnd = () => setDropAt(null)
    window.addEventListener('dragend', onEnd)
    window.addEventListener('drop', onEnd)
    return () => {
      window.removeEventListener('dragend', onEnd)
      window.removeEventListener('drop', onEnd)
    }
  }, [])

  /* ------------------------------------------------------------------ scroll */

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const todayIdx = Math.max(0, days.findIndex((d) => isToday(d)))
    const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
    const target = clamp((nowMin - gridStart - 75) * pxPerMin, 0, Math.max(0, height - el.clientHeight))
    el.scrollTop = target
    void todayIdx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerHour, gridStart])

  /* ------------------------------------------------------ window-level drag */

  useEffect(() => {
    if (!drag) return
    const onMoveEvt = (e: PointerEvent) => {
      const cols = colsRef.current
      const scroll = scrollRef.current
      const d = dragRef.current
      if (!cols || !scroll || !d) return
      // Day view centres the columns inside the surface, so hit-testing has to
      // measure the columns themselves rather than the full scroll width.
      // `rect.top` is the column's *current* viewport top, so it already carries
      // the scroll: adding scroll.scrollTop here would displace every drag.
      const rect = cols.getBoundingClientRect()
      const colWidth = rect.width / days.length
      const dayIndex = clamp(Math.floor((e.clientX - rect.left) / colWidth), 0, days.length - 1)
      // A cascaded block is drawn `down` pixels below its own start time, so
      // subtract that here or every drag of a stacked block jumps by its offset.
      const raw = gridStart + (e.clientY - rect.top - d.down) / pxPerMin

      const origin = dragOrigin.current
      if (origin && (Math.abs(e.clientX - origin.x) > 3 || Math.abs(e.clientY - origin.y) > 3)) {
        draggedRef.current = true
      }

      if (d.mode === 'create') {
        const cur = snap(raw, snapMin)
        setPreview({ day: dayIndex, start: Math.min(cur, d.anchorMin), end: Math.max(cur, d.anchorMin) })
        if (Math.abs(cur - d.anchorMin) > 2) d.moved = true
        return
      }

      const item = itemsRef.current.find((i) => i.id === d.id)
      if (!item) return
      const dur = (item.end - item.start) / MIN
      // Resizing never changes the day: anchor it to the block's own column so
      // a pointer that drifts sideways mid-drag cannot jump the block.
      const ownDay = Math.max(
        0,
        days.findIndex(
          (d) => item.start >= atMinutes(d, 0) && item.start < atMinutes(d, 0) + 24 * 60 * MIN,
        ),
      )
      const ownStart = (item.start - atMinutes(days[ownDay], 0)) / MIN
      if (d.mode === 'move') {
        const start = clamp(snap(raw - d.grabOffsetMin, snapMin), gridStart, gridEnd - dur)
        setPreview({ day: dayIndex, start, end: start + dur })
      } else if (d.mode === 'resize-start') {
        const start = clamp(snap(raw, snapMin), gridStart, ownStart + dur - MIN_BLOCK)
        setPreview({ day: ownDay, start, end: ownStart + dur })
      } else {
        const end = clamp(snap(raw, snapMin), ownStart + MIN_BLOCK, gridEnd)
        setPreview({ day: ownDay, start: ownStart, end })
      }

      /* edge auto-scroll */
      const sRect = scroll.getBoundingClientRect()
      const edge = 60
      if (e.clientY < sRect.top + edge) scroll.scrollTop -= 14
      else if (e.clientY > sRect.bottom - edge) scroll.scrollTop += 14
    }

    const onUp = () => {
      const d = dragRef.current
      const p = previewRef.current
      setDrag(null)
      setPreview(null)
      if (!d || !p) return
      const day = days[p.day]
      if (d.mode === 'create') {
        const lo = Math.min(p.start, p.end)
        const hi = Math.max(p.start, p.end)
        // One gesture, one affordance: whether you clicked or dragged out a
        // range, the title goes in the field that sits on it. A click has no
        // length of its own, so it gets the usual half hour.
        setComposeText('')
        setComposer({
          day: p.day,
          start: lo,
          end: hi - lo >= MIN_BLOCK ? hi : lo + 30,
        })
        return
      }
      if (p.end - p.start < MIN_BLOCK) return
      const base = atMinutes(day, 0)
      onMove(d.id, base + p.start * MIN, base + p.end * MIN)
    }

    window.addEventListener('pointermove', onMoveEvt)
    window.addEventListener('pointerup', onUp, { once: true })
    window.addEventListener('pointercancel', onUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onMoveEvt)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, days, gridStart, gridEnd, pxPerMin, snapMin, onMove, onCreate])

  useEffect(() => {
    if (composer) {
      const t = setTimeout(() => composeRef.current?.focus(), 20)
      return () => clearTimeout(t)
    }
  }, [composer])

  const commitComposer = (day: number, start: number, end: number) => {
    const title = composeText.trim()
    if (title) onCreate(days[day], start, end, title)
    setComposer(null)
    setComposeText('')
  }

  const hours = useMemo(() => {
    const out: number[] = []
    for (let m = Math.ceil(gridStart / 60) * 60; m <= gridEnd; m += 60) out.push(m)
    return out
  }, [gridStart, gridEnd])

  const startBlockDrag = useCallback(
    (e: RPointerEvent, item: Positioned, mode: Mode, down: number) => {
      if (e.button !== 0) return
      e.stopPropagation()
      e.preventDefault()
      draggedRef.current = false
      dragOrigin.current = { x: e.clientX, y: e.clientY }
      if (mode === 'move') {
        const y = e.clientY - e.currentTarget.getBoundingClientRect().top
        setDrag({
          mode,
          id: item.id,
          down,
          grabOffsetMin: clamp(y / pxPerMin, 0, (item.end - item.start) / MIN),
        })
      } else {
        setDrag({ mode, id: item.id, down, grabOffsetMin: 0 })
      }
    },
    [pxPerMin],
  )

  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes()
  const isWeek = days.length > 1

  /** Client Y within a column to minutes from `gridStart`. */
  function minutesAt(clientY: number, el: HTMLElement): number {
    return gridStart + (clientY - el.getBoundingClientRect().top) / pxPerMin
  }

  /** Snapped drop time that keeps the whole block inside the visible grid. */
  function dropStartAt(clientY: number, el: HTMLElement, minutes: number): number {
    const snapped = snap(minutesAt(clientY, el), snapMin)
    const last = Math.max(gridStart, gridEnd - minutes)
    return clamp(snapped, gridStart, last)
  }

  return (
    <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      <div className="relative flex" style={{ height }}>
        {/* ---------------- time gutter ---------------- */}
        <div className="sticky left-0 z-20 h-full shrink-0 bg-bg" style={{ width: GUTTER }} aria-hidden>
          {hours.map((m) => (
            <div
              key={m}
              className="mono-clock absolute -translate-y-1/2 pr-2 text-right text-[10px] leading-none text-ink-4"
              style={{ top: (m - gridStart) * pxPerMin }}
            >
              {fmtTime(atMinutes(days[0], m))}
            </div>
          ))}
        </div>

        {/* ---------------- columns ---------------- */}
        <div
          ref={colsRef}
          className={cn(
            'relative flex min-w-0 flex-1',
            // A single day stretched across a wide window reads as an empty
            // table; centre a comfortable column instead.
            !isWeek && 'mx-auto w-full max-w-[880px]',
          )}
        >
          {days.map((day, dayIndex) => {
            const dayStart = atMinutes(day, 0)
            const dayEnd = dayStart + 24 * 60 * MIN
            const dayItems = items.filter((i) => i.start >= dayStart && i.start < dayEnd && !i.allDay)
            const today = isToday(day)
            const dropHere = dropAt?.day === dayIndex ? dropAt : null
            // The placeholder inherits the dragged block's cascade slot, so it
            // lands exactly where the block will sit when the drag is released.
            const dragItem = drag && drag.mode !== 'create' ? items.find((i) => i.id === drag.id) : null
            const ghostGeo = (dragItem && cascade.get(dragItem.id)) || { down: 0, right: 0, z: 0, visible: 0 }

            return (
              <div
                key={dayIndex}
                className={cn(
                  'relative min-w-0 flex-1 transition-colors',
                  isWeek && 'border-l border-line',
                  today && !dropHere && 'bg-signal/[0.03]',
                  dropHere && 'bg-signal/[0.06]',
                )}
                style={{ height }}
                onDragOver={(e) => {
                  if (!onDropItem) return
                  if (!hasItemPayload(e)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  const payload = activeItemPayload()
                  if (!payload) return
                  setDropAt({
                    day: dayIndex,
                    start: dropStartAt(e.clientY, e.currentTarget, payload.minutes),
                    payload,
                  })
                }}
                onDragLeave={(e) => {
                  // Only clear when the pointer actually leaves this column.
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return
                  setDropAt((d) => (d && d.day === dayIndex ? null : d))
                }}
                onDrop={(e) => {
                  if (!onDropItem) return
                  if (!hasItemPayload(e)) return
                  const payload = readItemPayload(e)
                  if (!payload) return
                  e.preventDefault()
                  const start = dropStartAt(e.clientY, e.currentTarget, payload.minutes)
                  setDropAt(null)
                  onDropItem(payload, day, start)
                }}
                onPointerDown={(e) => {
                  if (e.target !== e.currentTarget || e.button !== 0) return
                  const raw = minutesAt(e.clientY, e.currentTarget)
                  setDrag({ mode: 'create', anchorMin: snap(raw, snapMin), dayIndex, moved: false, down: 0 })
                  setPreview({ day: dayIndex, start: snap(raw, snapMin), end: snap(raw, snapMin) })
                }}
              >
                {/* grid lines */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage: `repeating-linear-gradient(to bottom, var(--grid-line) 0 1px, transparent 1px ${30 * pxPerMin}px), repeating-linear-gradient(to bottom, var(--grid-line-major) 0 1px, transparent 1px ${60 * pxPerMin}px)`,
                  }}
                />

                {/* drag preview — drawn with the same geometry as the block it replaces */}
                {drag && preview && preview.day === dayIndex && (
                  <div
                    className="pointer-events-none absolute z-30 overflow-hidden rounded-[7px] border border-signal/70 px-[7px]"
                    style={{
                      top: (Math.min(preview.start, preview.end) - gridStart) * pxPerMin + ghostGeo.down,
                      height: Math.max(
                        16,
                        Math.abs(preview.end - preview.start) * pxPerMin - 3 - ghostGeo.down,
                      ),
                      left: ghostGeo.right,
                      right: 3 + ghostGeo.right,
                      background: 'color-mix(in oklab, var(--signal) 13%, transparent)',
                    }}
                  >
                    <div className="truncate pt-[3px] text-[11px] font-semibold leading-[1.25] text-signal">
                      {dragItem?.title ?? ''}
                    </div>
                    <div className="mono-clock tnum truncate text-[9.5px] leading-tight text-signal">
                      {fmtTime(atMinutes(day, Math.min(preview.start, preview.end)))}
                    </div>
                  </div>
                )}

                {/* blocks */}
                {dayItems.map((item) => {
                  const { down = 0, right = 0, z = 0, visible } = cascade.get(item.id) ?? {}
                  const top = ((item.start - dayStart) / MIN - gridStart) * pxPerMin + down
                  const h = Math.max(16, ((item.end - item.start) / MIN) * pxPerMin - 3 - down)
                  const dragging = drag?.mode !== 'create' && drag?.id === item.id
                  // A thin band only has room for its name, so tighten the
                  // padding and drop the time line rather than clipping text.
                  const band = (visible ?? h) < 34
                  const compact = (visible ?? h) < 40
                  const atRisk = riskForItem(item, now) === 'late'
                  return (
                    <div
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.title}, ${fmtTime(item.start)} to ${fmtTime(item.end)}`}
                      className={cn(
                        'group no-drag block-surface absolute overflow-hidden rounded-[7px] px-[7px] text-left',
                        band ? 'py-[2px]' : 'py-[5px]',
                        'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus',
                        item.done && 'opacity-45 saturate-50',
                        dragging ? 'ghost-drag' : 'cursor-grab hover:brightness-[1.08]',
                        selectedId === item.id && 'ring-2 ring-signal/80',
                      )}
                      style={
                        {
                          top,
                          height: h,
                          left: right,
                          width: `calc(100% - ${right + 3}px)`,
                          zIndex: dragging ? 60 : z,
                          '--blk': item.color,
                        } as CSSProperties
                      }
                      onPointerDown={(e) => startBlockDrag(e, item, 'move', down)}
                      onKeyDown={(e) => {
                        const step = (e.shiftKey ? 60 : snapMin) * MIN
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          onOpen(item)
                        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          e.preventDefault()
                          const d = e.key === 'ArrowUp' ? -step : step
                          onMove(item.id, item.start + d, item.end + d)
                        } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) {
                          e.preventDefault()
                          const d = (e.key === 'ArrowLeft' ? -1 : 1) * 60 * MIN
                          onMove(item.id, item.start, Math.max(item.start + MIN_BLOCK * MIN, item.end + d))
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        // Swallow the click a drag always emits; a real click
                        // (no movement) still opens the editor.
                        if (draggedRef.current) {
                          draggedRef.current = false
                          return
                        }
                        onOpen(item)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onContext(item, e.clientX, e.clientY)
                      }}
                    >
                      {atRisk && h > 22 && (
                        <span
                          title={`Finishes ${fmtRelativeDay((item.ref as { due?: string }).due)}`}
                          className="pointer-events-none absolute bottom-[4px] right-[5px] z-10 text-warn"
                        >
                          <AlertTriangle size={11} />
                        </span>
                      )}
                      {item.kind === 'event' && item.tentative && (
                        <div className="mb-[1px] flex items-center gap-1 text-[9px] uppercase tracking-[0.08em] text-ink-3">
                          <Lock size={9} /> tentative
                        </div>
                      )}
                      <div
                        className={cn(
                          'truncate font-semibold leading-[1.25] text-ink',
                          band ? 'text-[10.5px]' : 'text-[11.5px]',
                          item.done && 'line-through',
                        )}
                      >
                        {item.title}
                      </div>
                      {!compact && (
                        <div className="mono-clock tnum mt-[1px] truncate text-[9.5px] leading-tight text-ink-2">
                          {fmtTime(item.start)}
                          {h > 56 ? ` – ${fmtTime(item.end)}` : ''}
                        </div>
                      )}
                      {h > 104 && item.kind === 'task' && (
                        <div className="mono-clock mt-1 flex items-center gap-1 truncate text-[9.5px] text-ink-3">
                          <Sparkles size={9} className="shrink-0" />
                          {Math.round((item.end - item.start) / MIN)}m
                        </div>
                      )}

                      <div
                        className="absolute inset-x-0 top-0 h-[6px] cursor-ns-resize opacity-0 group-hover:opacity-100"
                        onPointerDown={(e) => startBlockDrag(e, item, 'resize-start', down)}
                      />
                      <div
                        className="absolute inset-x-0 bottom-0 h-[6px] cursor-ns-resize opacity-0 group-hover:opacity-100"
                        onPointerDown={(e) => startBlockDrag(e, item, 'resize-end', down)}
                      />
                    </div>
                  )
                })}

                {/* drop ghost: where the dragged item will land */}
                {dropHere && (
                  <div
                    className="pointer-events-none absolute inset-x-[3px] z-30 overflow-hidden rounded-[7px] border border-dashed border-signal px-[7px] py-[5px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
                    style={{
                      top: (dropHere.start - gridStart) * pxPerMin,
                      height: Math.max(20, dropHere.payload.minutes * pxPerMin - 3),
                      background: 'color-mix(in oklab, var(--signal) 22%, var(--surface))',
                    }}
                  >
                    <div className="truncate text-[11.5px] font-semibold leading-[1.25] text-ink">
                      {dropHere.payload.title}
                    </div>
                    <div className="mono-clock tnum mt-[1px] text-[9.5px] leading-tight text-signal">
                      {fmtTime(atMinutes(day, dropHere.start))} –{' '}
                      {dropHere.start + dropHere.payload.minutes > 1440
                        ? `+1d ${fmtTime(atMinutes(day, dropHere.start + dropHere.payload.minutes - 1440))}`
                        : fmtTime(atMinutes(day, dropHere.start + dropHere.payload.minutes))}
                    </div>
                  </div>
                )}

                {/* inline composer */}
                {composer && composer.day === dayIndex && (
                  <div
                    className="anim-fade absolute z-30 rounded-[7px] border border-signal/60 bg-surface px-2 py-1.5"
                    style={{
                      top: (composer.start - gridStart) * pxPerMin,
                      minHeight: 26,
                      left: 3,
                      right: 3,
                    }}
                  >
                    <input
                      ref={composeRef}
                      value={composeText}
                      onChange={(e) => setComposeText(e.target.value)}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') commitComposer(composer.day, composer.start, composer.end)
                        if (e.key === 'Escape') setComposer(null)
                      }}
                      onBlur={() => {
                        if (composeText.trim()) commitComposer(composer.day, composer.start, composer.end)
                        else setComposer(null)
                      }}
                      placeholder={`${fmtTime(atMinutes(day, composer.start))} – ${fmtTime(
                        atMinutes(day, composer.end),
                      )}`}
                      className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-4"
                    />
                  </div>
                )}

                {/* now line */}
                {showNow && today && nowMin >= gridStart && nowMin <= gridEnd && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: (nowMin - gridStart) * pxPerMin }}
                    aria-hidden
                  >
                    <div
                      className="h-[1.5px] w-full bg-signal"
                      style={{ boxShadow: '0 0 10px 1px color-mix(in oklab, var(--signal) 45%, transparent)' }}
                    />
                    <span className="anim-now-dot absolute -left-[3px] -top-[3px] size-[7px] rounded-full bg-signal" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
