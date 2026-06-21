/**
 * PROTOTYPE — pico theme exploration. Throwaway.
 *
 * Tiny 8-bit sound engine (WebAudio, no assets). Square/triangle blips with a
 * short gain envelope so navigating the console actually *sounds* like one.
 * Lazily creates the AudioContext on first use and resumes it on a user gesture
 * (browser autoplay policy). Muted state persists in localStorage.
 */
const STORAGE_KEY = "pico:muted"

let ctx: AudioContext | null = null
let muted = readMuted()

function readMuted(): boolean {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1"
  } catch {
    return false
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  if (!ctx) {
    const Ctor = window.AudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === "suspended") void ctx.resume()
  return ctx
}

/** One blip: an oscillator with a fast attack + exponential decay (no clicks). */
function blip(
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  peak: number,
): void {
  const ac = ctx
  if (!ac) return
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Play a sequence of notes (Hz) as a quick arpeggio. */
function seq(
  notes: readonly number[],
  step: number,
  dur: number,
  type: OscillatorType = "square",
  peak = 0.05,
): void {
  if (muted) return
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime
  notes.forEach((n, i) => {
    blip(n, t0 + i * step, dur, type, peak)
  })
}

export const sfx = {
  /** Cursor move between items. */
  move: () => seq([720], 0, 0.05, "square", 0.04),
  /** Confirm / select. */
  confirm: () => seq([660, 990, 1320], 0.045, 0.09, "square", 0.05),
  /** Back / cancel. */
  back: () => seq([300, 200], 0.05, 0.1, "square", 0.045),
  /** Open a panel / toggle. */
  open: () => seq([520, 780], 0.04, 0.07, "triangle", 0.05),
  /** Launch a game — a little fanfare. */
  launch: () => seq([523, 659, 784, 1047], 0.07, 0.13, "square", 0.055),
  /** Power-on chime (boot). */
  boot: () => seq([392, 523, 659, 784], 0.09, 0.18, "triangle", 0.05),
  /** Error / blocked. */
  error: () => seq([240, 160], 0.08, 0.16, "square", 0.05),
}

export function isMuted(): boolean {
  return muted
}

export function toggleMuted(): boolean {
  muted = !muted
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, muted ? "1" : "0")
  } catch {
    // ignore
  }
  return muted
}
