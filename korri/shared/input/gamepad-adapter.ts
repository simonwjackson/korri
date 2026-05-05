import type { Direction, InputAdapter } from "./types"

/**
 * Gamepad adapter: polls navigator.getGamepads() and emits semantic actions.
 *
 * Uses the Standard Gamepad layout (per W3C). Buttons:
 *   0 confirm (A / Cross)
 *   1 back    (B / Circle)
 *   3 options (Y / Triangle)
 *   9 menu    (Start)
 *  12-15 dpad up/down/left/right
 *
 * Direction supports both d-pad and the left analog stick. We model both like
 * "keys with auto-repeat": one event on press, then a slow repeat while held.
 * Tune via options.
 */

const STANDARD_BUTTONS = {
  confirm: 0,
  back: 1,
  options: 3,
  menu: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15,
} as const

const AXIS_LEFT_X = 0
const AXIS_LEFT_Y = 1

const DEFAULT_DPAD_AXIS_PAIRS: readonly DpadAxisPair[] = [
  // Linux/WebKit can expose evdev ABS_HAT0X/ABS_HAT0Y as Gamepad axes
  // instead of standard buttons 12-15. On Xbox-style devices those hats
  // commonly appear after stick/trigger axes.
  { x: 6, y: 7 },
]

export interface DpadAxisPair {
  readonly x: number
  readonly y: number
}

export interface GamepadAdapterOptions {
  /** Magnitude above which a stick axis counts as a directional press. 0..1 */
  readonly axisThreshold?: number
  /** Axis pairs that represent digital d-pad hats on non-standard mappings. */
  readonly dpadAxisPairs?: readonly DpadAxisPair[]
  /** Initial delay before a held direction repeats, in ms. */
  readonly repeatDelayMs?: number
  /** Interval between repeats while a direction is held, in ms. */
  readonly repeatIntervalMs?: number
}

interface HoldState {
  readonly down: boolean
  readonly pressedAt: number
  readonly lastEmitAt: number
}

const NEUTRAL: HoldState = { down: false, pressedAt: 0, lastEmitAt: 0 }

export function createGamepadAdapter(
  options: GamepadAdapterOptions = {},
): InputAdapter {
  const axisThreshold = options.axisThreshold ?? 0.5
  const dpadAxisPairs = options.dpadAxisPairs ?? DEFAULT_DPAD_AXIS_PAIRS
  const repeatDelayMs = options.repeatDelayMs ?? 400
  const repeatIntervalMs = options.repeatIntervalMs ?? 100

  return {
    name: "gamepad",
    start(emit) {
      if (typeof navigator === "undefined" || !navigator.getGamepads) {
        // No gamepad API available (SSR, non-browser test, old browser).
        return () => {}
      }

      // One hold-state per (gamepad-index, control-id).
      const holds = new Map<string, HoldState>()
      let raf = 0

      const tickHold = (
        key: string,
        active: boolean,
        now: number,
        fire: () => void,
      ) => {
        const prev = holds.get(key) ?? NEUTRAL
        if (!active) {
          if (prev.down) holds.set(key, NEUTRAL)
          return
        }
        if (!prev.down) {
          fire()
          holds.set(key, { down: true, pressedAt: now, lastEmitAt: now })
          return
        }
        const elapsedSincePress = now - prev.pressedAt
        const elapsedSinceEmit = now - prev.lastEmitAt
        if (
          elapsedSincePress >= repeatDelayMs &&
          elapsedSinceEmit >= repeatIntervalMs
        ) {
          fire()
          holds.set(key, { ...prev, lastEmitAt: now })
        }
      }

      const fireDirection = (direction: Direction) =>
        emit({ type: "direction", direction, source: "gamepad" })

      const poll = () => {
        const now = performance.now()
        const pads = navigator.getGamepads?.() ?? []

        for (let i = 0; i < pads.length; i++) {
          const pad = pads[i]
          if (!pad) continue

          // D-pad
          const dpad: ReadonlyArray<readonly [number, Direction]> = [
            [STANDARD_BUTTONS.dpadUp, "up"],
            [STANDARD_BUTTONS.dpadDown, "down"],
            [STANDARD_BUTTONS.dpadLeft, "left"],
            [STANDARD_BUTTONS.dpadRight, "right"],
          ]
          for (const [btn, dir] of dpad) {
            tickHold(`${i}:dpad:${dir}`, isPressed(pad, btn), now, () =>
              fireDirection(dir),
            )
          }

          // Left stick — only the dominant axis fires per tick.
          const lx = pad.axes[AXIS_LEFT_X] ?? 0
          const ly = pad.axes[AXIS_LEFT_Y] ?? 0
          const stickDir = stickToDirection(lx, ly, axisThreshold)
          for (const dir of ["up", "down", "left", "right"] as const) {
            tickHold(`${i}:stick:${dir}`, stickDir === dir, now, () =>
              fireDirection(dir),
            )
          }

          // Non-standard Linux/WebKit mappings can expose d-pad hats as axes
          // rather than buttons 12-15.
          for (const pair of dpadAxisPairs) {
            tickDigitalAxis(
              i,
              holds,
              now,
              `hat:${pair.x}:${pair.y}:x`,
              pad.axes[pair.x] ?? 0,
              { negative: "left", positive: "right" },
              fireDirection,
              tickHold,
            )
            tickDigitalAxis(
              i,
              holds,
              now,
              `hat:${pair.x}:${pair.y}:y`,
              pad.axes[pair.y] ?? 0,
              { negative: "up", positive: "down" },
              fireDirection,
              tickHold,
            )
          }

          // Buttons (no repeat — single press semantics).
          tickButton(
            i,
            pad,
            holds,
            now,
            "confirm",
            STANDARD_BUTTONS.confirm,
            () => emit({ type: "confirm", source: "gamepad" }),
          )
          tickButton(i, pad, holds, now, "back", STANDARD_BUTTONS.back, () =>
            emit({ type: "back", source: "gamepad" }),
          )
          tickButton(
            i,
            pad,
            holds,
            now,
            "options",
            STANDARD_BUTTONS.options,
            () => emit({ type: "options", source: "gamepad" }),
          )
          tickButton(i, pad, holds, now, "menu", STANDARD_BUTTONS.menu, () =>
            emit({ type: "menu", source: "gamepad" }),
          )
        }

        raf = requestAnimationFrame(poll)
      }

      raf = requestAnimationFrame(poll)
      return () => cancelAnimationFrame(raf)
    },
  }
}

function isPressed(pad: Gamepad, index: number): boolean {
  const btn = pad.buttons[index]
  if (!btn) return false
  return typeof btn === "object" ? btn.pressed : (btn as unknown) === 1
}

function stickToDirection(
  x: number,
  y: number,
  threshold: number,
): Direction | null {
  if (Math.abs(x) > Math.abs(y)) {
    if (x > threshold) return "right"
    if (x < -threshold) return "left"
  } else {
    if (y > threshold) return "down"
    if (y < -threshold) return "up"
  }
  return null
}

function tickDigitalAxis(
  padIndex: number,
  holds: Map<string, HoldState>,
  now: number,
  name: string,
  value: number,
  directions: { readonly negative: Direction; readonly positive: Direction },
  fireDirection: (direction: Direction) => void,
  tickHold: (
    key: string,
    active: boolean,
    now: number,
    fire: () => void,
  ) => void,
) {
  const negativeActive = value < -0.5
  const positiveActive = value > 0.5

  tickHold(
    `${padIndex}:${name}:${directions.negative}`,
    negativeActive,
    now,
    () => fireDirection(directions.negative),
  )
  tickHold(
    `${padIndex}:${name}:${directions.positive}`,
    positiveActive,
    now,
    () => fireDirection(directions.positive),
  )
}

function tickButton(
  padIndex: number,
  pad: Gamepad,
  holds: Map<string, HoldState>,
  now: number,
  name: string,
  button: number,
  fire: () => void,
) {
  const key = `${padIndex}:btn:${name}`
  const prev = holds.get(key) ?? NEUTRAL
  const down = isPressed(pad, button)
  if (down && !prev.down) {
    fire()
    holds.set(key, { down: true, pressedAt: now, lastEmitAt: now })
  } else if (!down && prev.down) {
    holds.set(key, NEUTRAL)
  }
}
