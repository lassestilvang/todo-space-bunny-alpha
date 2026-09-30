import type { DragEvent } from 'react'

/**
 * Drag payload for moving work onto the calendar.
 *
 * One MIME type carries everything a drop needs, so a single grid handler can
 * schedule tasks and time-box all-day events alike.
 */
export const ITEM_MIME = 'text/tempo-item'

export type DropPayload = {
  kind: 'task' | 'event'
  id: string
  /** Length the block should take once it lands on the clock. */
  minutes: number
  title: string
}

/**
 * The browser withholds the payload text until `drop`, so the source also
 * parks it here for the duration of the gesture. Only one drag runs at a time.
 */
let active: DropPayload | null = null

export function setItemPayload(e: DragEvent, payload: DropPayload): void {
  active = payload
  e.dataTransfer.setData(ITEM_MIME, JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'copyMove'
}

/** Call from the source's `dragend`. */
export function clearItemPayload(): void {
  active = null
}

/** Readable during `dragover`, where `getData` is still empty. */
export function activeItemPayload(): DropPayload | null {
  return active
}

export function hasItemPayload(e: DragEvent): boolean {
  return Array.prototype.includes.call(e.dataTransfer.types, ITEM_MIME)
}

export function readItemPayload(e: DragEvent): DropPayload | null {
  const raw = e.dataTransfer.getData(ITEM_MIME)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<DropPayload>
    if ((parsed.kind !== 'task' && parsed.kind !== 'event') || !parsed.id) return null
    const minutes = Number(parsed.minutes)
    return {
      kind: parsed.kind,
      id: parsed.id,
      minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 30,
      title: typeof parsed.title === 'string' ? parsed.title : 'Untitled',
    }
  } catch {
    return null
  }
}