/**
 * The geometry of a drag on the calendar grid, with nothing but arithmetic.
 *
 * This lives outside the component on purpose. The worst drag bug in Tempo's
 * history came from measuring the pointer against a rect and *also* adding
 * `scrollTop`, double-counting the scroll and displacing every drag by the
 * scrolled amount. There is deliberately no scroll term here to get wrong: the
 * column's top edge is whatever the browser says it is right now, and the
 * pointer's offset from it is the answer.
 */

/** Minutes past `columnTop` for a pointer at `clientY`. */
export function minutesBelow(clientY: number, columnTop: number, pxPerMin: number): number {
  if (pxPerMin <= 0) return 0
  return (clientY - columnTop) / pxPerMin
}

/**
 * Where a pointer sits, in minutes from `gridStart`, for a block the cascade
 * draws `cascadeDownPx` below its own time.
 *
 * The correction is stated here once so it cannot be half-applied: a stacked
 * block is painted lower than it is booked, so the pointer's position in the
 * grid's frame has that offset taken out before it is compared with the block's
 * start.
 */
export function pointerFrame({
  clientY,
  columnTop,
  pxPerMin,
  gridStart,
  cascadeDownPx = 0,
}: {
  clientY: number
  columnTop: number
  pxPerMin: number
  gridStart: number
  cascadeDownPx?: number
}): number {
  return gridStart + minutesBelow(clientY, columnTop, pxPerMin) - cascadeDownPx / pxPerMin
}

/**
 * Where a dragged block should start, in minutes from midnight.
 *
 * `pointerMinutes` is the pointer's position from `pointerFrame`, and
 * `grabOffsetMin` is how far below the block's drawn top it was grabbed. Taking
 * the grab off is what keeps the block under the cursor.
 */
export function blockStart({
  pointerMinutes,
  grabOffsetMin,
  snapMin,
  gridStart,
  gridEnd,
  durationMin,
}: {
  pointerMinutes: number
  grabOffsetMin: number
  snapMin: number
  gridStart: number
  gridEnd: number
  durationMin: number
}): number {
  const wanted = pointerMinutes - grabOffsetMin
  // A step of zero would divide by zero; without a step the position is used as it is.
  const snapped = snapMin > 0 ? Math.round(wanted / snapMin) * snapMin : wanted
  const latest = Math.max(gridStart, gridEnd - durationMin)
  return Math.min(Math.max(snapped, gridStart), latest)
}

/**
 * The end of a dragged block. It can be shortened to fit the grid, but never
 * grown into a slot that is already taken: a block that starts at the pointer
 * keeps its length, and one that was clamped at the far edge gives the excess
 * back rather than spilling past the last hour.
 */
export function blockEnd(start: number, durationMin: number, gridEnd: number): number {
  return Math.min(start + durationMin, gridEnd)
}

/** Which column a pointer is over, clamped to the ones that exist. */
export function columnAt(clientX: number, columnsLeft: number, columnsWidth: number, count: number): number {
  if (count <= 0 || columnsWidth <= 0) return 0
  const raw = Math.floor((clientX - columnsLeft) / (columnsWidth / count))
  return Math.min(Math.max(raw, 0), count - 1)
}

/** The pixel height of a span, with the same floor the blocks are drawn at. */
export const spanHeight = (minutes: number, pxPerMin: number, gap = 3): number =>
  Math.max(18, minutes * pxPerMin - gap)

/** Minutes a task block occupies once a step has been ticked off it. */
export const blockMinutes = (minutes: number): number => Math.max(1, Math.round(minutes))