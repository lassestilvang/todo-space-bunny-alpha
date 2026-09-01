import { describe, expect, it } from 'vitest'
import { blockEnd, blockStart, columnAt, minutesBelow, pointerFrame, spanHeight } from './grid'

const PX_PER_MIN = 76 / 60
const GRID_START = 6 * 60
const GRID_END = 22 * 60

describe('where the pointer is', () => {
  it('reads minutes below the top of the column', () => {
    // 76px an hour, so 76px is 60 minutes.
    expect(minutesBelow(1000, 1000, PX_PER_MIN)).toBe(0)
    expect(minutesBelow(1000 + 76, 1000, PX_PER_MIN)).toBeCloseTo(60)
    expect(minutesBelow(1000 - 38, 1000, PX_PER_MIN)).toBeCloseTo(-30)
  })

  it('gives the same answer wherever the grid is scrolled', () => {
    // Regression: the handler used to add scrollTop on top of a rect that
    // already carried the scroll, displacing every drag by the scrolled amount.
    // These two must be identical, which is the whole point.
    const columnTopScrolled = 152 - 600
    const clientY = columnTopScrolled + 152
    expect(minutesBelow(clientY, columnTopScrolled, PX_PER_MIN)).toBe(
      minutesBelow(clientY + 600, columnTopScrolled + 600, PX_PER_MIN),
    )
  })

  it('is not fooled by a zero scale', () => {
    expect(minutesBelow(500, 100, 0)).toBe(0)
  })
})

describe('which column the pointer is over', () => {
  const left = 300
  const width = 700

  it('picks the column under the pointer', () => {
    expect(columnAt(left + 10, left, width, 7)).toBe(0)
    expect(columnAt(left + 110, left, width, 7)).toBe(1)
    expect(columnAt(left + 690, left, width, 7)).toBe(6)
  })

  it('clamps to the columns that exist', () => {
    expect(columnAt(left - 400, left, width, 7)).toBe(0)
    expect(columnAt(left + 5000, left, width, 7)).toBe(6)
    expect(columnAt(left + 10, left, 0, 7)).toBe(0)
    expect(columnAt(left + 10, left, width, 0)).toBe(0)
  })
})

describe('where a dragged block lands', () => {
  const base = { snapMin: 15, gridStart: GRID_START, gridEnd: GRID_END, durationMin: 60 }

  it('snaps to the step', () => {
    expect(blockStart({ ...base, pointerMinutes: 9 * 60 + 7, grabOffsetMin: 0 })).toBe(
      9 * 60,
    )
    expect(blockStart({ ...base, pointerMinutes: 9 * 60 + 8, grabOffsetMin: 0 })).toBe(
      9 * 60 + 15,
    )
  })

  it('stays under the cursor, wherever it was grabbed', () => {
    // Grabbed 20 minutes below the block's top, and the pointer is at 10:07.
    const start = blockStart({
      ...base,
      pointerMinutes: 10 * 60 + 7,
      grabOffsetMin: 20,
    })
    expect(start).toBe(9 * 60 + 45)
  })

  it('travels exactly as far as the pointer, however it is stacked', () => {
    // The invariant a cascade offset must not break: dragging by an hour moves
    // the block by an hour. A block drawn below its own time gets its offset
    // taken out of the pointer's position once, in pointerFrame.
    const oneHour = 60
    for (const down of [0, 18, 36]) {
      const before = blockStart({
        ...base,
        pointerMinutes: pointerFrame({ clientY: 1000, columnTop: 200, pxPerMin: PX_PER_MIN, gridStart: GRID_START, cascadeDownPx: down }) + 20,
        grabOffsetMin: 20,
      })
      const after = blockStart({
        ...base,
        pointerMinutes:
          pointerFrame({ clientY: 1000 + oneHour * PX_PER_MIN, columnTop: 200, pxPerMin: PX_PER_MIN, gridStart: GRID_START, cascadeDownPx: down }) + 20,
        grabOffsetMin: 20,
      })
      expect(after - before).toBe(oneHour)
    }
  })

  it('takes the cascade offset out of the pointer, once', () => {
    // Two halves that must not both do the same job: pointerFrame removes the
    // offset the cascade drew the block down by, blockStart removes the grab.
    const plain = pointerFrame({ clientY: 1000, columnTop: 200, pxPerMin: PX_PER_MIN, gridStart: GRID_START })
    const stacked = pointerFrame({
      clientY: 1000,
      columnTop: 200,
      pxPerMin: PX_PER_MIN,
      gridStart: GRID_START,
      cascadeDownPx: 30,
    })
    expect(plain - stacked).toBeCloseTo(30 / PX_PER_MIN)

    // So the offset is removed exactly once: with the snapping taken out, a
    // stacked block lands the same offset earlier than an un-stacked one, and
    // not twice that.
    const loose = { ...base, snapMin: 1, durationMin: 15 }
    const grab = 5 / PX_PER_MIN
    const offset = Math.round(30 / PX_PER_MIN)
    expect(blockStart({ ...loose, pointerMinutes: stacked, grabOffsetMin: grab })).toBe(
      blockStart({ ...loose, pointerMinutes: plain, grabOffsetMin: grab }) - offset,
    )
  })

  it('never starts before the grid or after the last hour', () => {
    expect(blockStart({ ...base, pointerMinutes: 0, grabOffsetMin: 0 })).toBe(GRID_START)
    expect(blockStart({ ...base, pointerMinutes: 23 * 60, grabOffsetMin: 0 })).toBe(
      GRID_END - 60,
    )
  })

  it('cannot be dragged off the far end, however long the block', () => {
    const start = blockStart({
      ...base,
      pointerMinutes: 23 * 60,
      grabOffsetMin: 0,
      durationMin: 180,
    })
    expect(start).toBe(GRID_END - 180)
  })

  it('copes with no snap step without dividing by zero', () => {
    expect(blockStart({ ...base, pointerMinutes: 600, grabOffsetMin: 0, snapMin: 0 })).toBe(
      600,
    )
  })
})

describe('the end of a block', () => {
  it('keeps its length when there is room', () => {
    expect(blockEnd(9 * 60, 60, GRID_END)).toBe(10 * 60)
  })

  it('gives the excess back rather than spilling past the grid', () => {
    expect(blockEnd(21 * 60 + 30, 60, GRID_END)).toBe(GRID_END)
  })
})

describe('drawing a block', () => {
  it('has a floor so a very short block is still visible', () => {
    expect(spanHeight(0, PX_PER_MIN)).toBe(18)
    expect(spanHeight(60, PX_PER_MIN)).toBeCloseTo(73)
  })
})