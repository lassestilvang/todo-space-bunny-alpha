import { useEffect } from 'react'
import { useStore } from './store'
import { fmtDateKey } from './date'

/** How far ahead of the anchor we keep the plan true. */
const HORIZON = 7

/** Coalesce bursts of edits, and never refit while the user is mid-gesture. */
const SETTLE_MS = 500

/**
 * Keeps the plan true.
 *
 * Whenever the calendar itself changes — a meeting moves, a block is completed,
 * work hours are edited — the blocks the planner owns are re-fitted around the
 * new shape of the day. Blocks the user placed by hand are `planLocked` and
 * never move, and a refit that would not change anything writes nothing, so
 * this settles instead of looping.
 */
export function useAutoReplan() {
  useEffect(() => {
    let timer: number | undefined

    const run = () => {
      const s = useStore.getState()
      if (!s.settings.autoPlan) return
      const { moved, dropped, days } = s.refitRange(s.ui.anchor, HORIZON)
      if (moved === 0 && dropped === 0) return
      const where =
        days.length === 1
          ? fmtDateKey(days[0], { weekday: true, year: false })
          : `${days.length} days`
      const bits = [moved ? `${moved} block${moved === 1 ? '' : 's'} refitted` : null]
      if (dropped) bits.push(`${dropped} could not fit`)
      s.toast({
        text: `Kept the plan true · ${where} · ${bits.filter(Boolean).join(', ')}`,
        kind: dropped ? 'warn' : 'ok',
        action: { label: 'Undo', run: () => useStore.getState().undo() },
      })
    }

    const unsub = useStore.subscribe((state, prev) => {
      const same =
        state.tasks === prev.tasks &&
        state.events === prev.events &&
        state.habits === prev.habits &&
        state.settings === prev.settings &&
        state.ui.anchor === prev.ui.anchor
      if (same) return
      window.clearTimeout(timer)
      timer = window.setTimeout(run, SETTLE_MS)
    })

    return () => {
      window.clearTimeout(timer)
      unsub()
    }
  }, [])
}
