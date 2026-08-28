/**
 * A short tone for the end of a focus block and the end of a break.
 *
 * Deliberately minimal: no audio files, no library, one oscillator per note
 * with a short envelope. The context is created lazily and only inside a user
 * gesture, because browsers refuse to start audio before one.
 */

/** Kept modest: the OS owns the real volume, this only shapes the cue. */
const GAIN = 0.16

type Ctx = AudioContext | null
let ctx: Ctx = null

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  // Autoplay policy parks the context until a gesture; this is the gesture.
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

/** Called from a click so the first cue is not swallowed by autoplay policy. */
export function unlockAudio(): void {
  context()
}

function note(ac: AudioContext, at: number, hz: number, ms: number, peak: number) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = 'sine'
  osc.frequency.value = hz
  gain.gain.setValueAtTime(0, ac.currentTime + at)
  gain.gain.linearRampToValueAtTime(peak, ac.currentTime + at + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + at + ms / 1000)
  osc.connect(gain).connect(ac.destination)
  osc.start(ac.currentTime + at)
  osc.stop(ac.currentTime + at + ms / 1000 + 0.02)
}

/**
 * Play the cue for a phase that has just ended.
 *
 * `to` is the phase we are entering, which decides the shape: a drop into a
 * break is low and soft, the return to work is a brighter two-note rise.
 *
 * Never plays when the setting is off, when the document is hidden, or when the
 * browser has no audio at all.
 */
export function playPhaseCue(to: 'focus' | 'break', enabled: boolean): void {
  if (!enabled) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  const ac = context()
  if (!ac) return
  if (to === 'break') {
    note(ac, 0, 392, 420, GAIN)
    note(ac, 0.16, 294, 520, GAIN * 0.85)
  } else {
    note(ac, 0, 523, 260, GAIN)
    note(ac, 0.13, 784, 420, GAIN)
  }
}