import type { Direction, InputListener } from "../types"
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  ABS_X,
  ABS_Y,
  BTN_A,
  BTN_B,
  BTN_DPAD_DOWN,
  BTN_DPAD_LEFT,
  BTN_DPAD_RIGHT,
  BTN_DPAD_UP,
  BTN_MODE,
  BTN_SELECT,
  BTN_START,
  BTN_Y,
  EV_ABS,
  EV_KEY,
} from "./button-codes"

const DEFAULT_AXIS_THRESHOLD = 16_000
const DEFAULT_LOW_RANGE_AXIS_THRESHOLD = 800
const DEFAULT_REPEAT_DELAY_MS = 400
const DEFAULT_REPEAT_INTERVAL_MS = 100
const DEFAULT_STALE_RELEASE_MS = 250

interface HoldState {
  readonly direction: Direction
  readonly timeout: ReturnType<typeof setTimeout>
  readonly staleTimeout: ReturnType<typeof setTimeout>
  readonly interval?: ReturnType<typeof setInterval>
}

export interface NativeGamepadInputEvent {
  readonly deviceId: string
  readonly type: number
  readonly code: number
  readonly value: number
  readonly timestamp: number
}

export interface NativeGamepadMapperOptions {
  readonly axisThreshold?: number
  readonly lowRangeAxisThreshold?: number
  readonly repeatDelayMs?: number
  readonly repeatIntervalMs?: number
  /** Safety valve: stop a held direction if no refresh/release arrives. */
  readonly staleReleaseMs?: number
}

export interface NativeGamepadMapper {
  handle(event: NativeGamepadInputEvent, emit: InputListener): void
  reset(): void
}

export function createNativeGamepadMapper(
  options: NativeGamepadMapperOptions = {},
): NativeGamepadMapper {
  const axisThreshold = options.axisThreshold ?? DEFAULT_AXIS_THRESHOLD
  const lowRangeAxisThreshold =
    options.lowRangeAxisThreshold ?? DEFAULT_LOW_RANGE_AXIS_THRESHOLD
  const repeatDelayMs = options.repeatDelayMs ?? DEFAULT_REPEAT_DELAY_MS
  const repeatIntervalMs =
    options.repeatIntervalMs ?? DEFAULT_REPEAT_INTERVAL_MS
  const staleReleaseMs = options.staleReleaseMs ?? DEFAULT_STALE_RELEASE_MS

  const holds = new Map<string, HoldState>()
  const pressedButtons = new Set<string>()
  const axes = new Map<string, { x: number; y: number }>()

  const fireDirection = (direction: Direction, emit: InputListener) => {
    emit({ type: "direction", direction, source: "native" })
  }

  const scheduleStaleRelease = (key: string) =>
    setTimeout(() => stopHold(key), staleReleaseMs)

  const startHold = (
    key: string,
    direction: Direction,
    emit: InputListener,
  ) => {
    const current = holds.get(key)
    if (current) {
      clearTimeout(current.staleTimeout)
      holds.set(key, {
        ...current,
        staleTimeout: scheduleStaleRelease(key),
      })
      return
    }

    fireDirection(direction, emit)
    const timeout = setTimeout(() => {
      const current = holds.get(key)
      if (!current) return

      const interval = setInterval(
        () => fireDirection(direction, emit),
        repeatIntervalMs,
      )
      holds.set(key, { ...current, interval })
    }, repeatDelayMs)
    holds.set(key, {
      direction,
      timeout,
      staleTimeout: scheduleStaleRelease(key),
    })
  }

  const stopHold = (key: string) => {
    const hold = holds.get(key)
    if (!hold) return
    clearTimeout(hold.timeout)
    clearTimeout(hold.staleTimeout)
    if (hold.interval) clearInterval(hold.interval)
    holds.delete(key)
  }

  const reset = () => {
    for (const key of [...holds.keys()]) stopHold(key)
    pressedButtons.clear()
    axes.clear()
  }

  return {
    handle(event, emit) {
      if (event.type === EV_KEY) {
        handleGamepadKey(event, emit, {
          startHold,
          stopHold,
          pressedButtons,
        })
        return
      }

      if (event.type === EV_ABS) {
        handleGamepadAbs(event, emit, {
          startHold,
          stopHold,
          axes,
          axisThreshold,
          lowRangeAxisThreshold,
        })
      }
    },
    reset,
  }
}

interface GamepadKeyState {
  readonly startHold: (
    key: string,
    direction: Direction,
    emit: InputListener,
  ) => void
  readonly stopHold: (key: string) => void
  readonly pressedButtons: Set<string>
}

function handleGamepadKey(
  event: NativeGamepadInputEvent,
  emit: InputListener,
  state: GamepadKeyState,
) {
  const down = event.value !== 0
  const buttonKey = `${event.deviceId}:button:${event.code}`

  const action = buttonAction(event.code)
  if (action) {
    if (down && !state.pressedButtons.has(buttonKey)) {
      state.pressedButtons.add(buttonKey)
      emit({ type: action, source: "native" })
    } else if (!down) {
      state.pressedButtons.delete(buttonKey)
    }
    return
  }

  const direction = dpadDirection(event.code)
  if (!direction) return

  const holdKey = `${event.deviceId}:dpad:${direction}`
  if (down) {
    state.startHold(holdKey, direction, emit)
  } else {
    state.stopHold(holdKey)
  }
}

interface GamepadAbsState {
  readonly startHold: (
    key: string,
    direction: Direction,
    emit: InputListener,
  ) => void
  readonly stopHold: (key: string) => void
  readonly axes: Map<string, { x: number; y: number }>
  readonly axisThreshold: number
  readonly lowRangeAxisThreshold: number
}

function handleGamepadAbs(
  event: NativeGamepadInputEvent,
  emit: InputListener,
  state: GamepadAbsState,
) {
  if (event.code === ABS_X || event.code === ABS_Y) {
    const current = state.axes.get(event.deviceId) ?? { x: 0, y: 0 }
    const next =
      event.code === ABS_X
        ? { ...current, x: event.value }
        : { ...current, y: event.value }
    state.axes.set(event.deviceId, next)

    const direction = stickToDirection(
      next.x,
      next.y,
      axisThresholdForDevice(event.deviceId, state),
    )
    for (const candidate of ["up", "down", "left", "right"] as const) {
      const holdKey = `${event.deviceId}:stick:${candidate}`
      if (direction === candidate) {
        state.startHold(holdKey, candidate, emit)
      } else {
        state.stopHold(holdKey)
      }
    }
    return
  }

  if (event.code === ABS_HAT0X) {
    updateDigitalAxis(state, emit, event.deviceId, "hat-x", {
      negative: "left",
      positive: "right",
      value: event.value,
    })
    return
  }

  if (event.code === ABS_HAT0Y) {
    updateDigitalAxis(state, emit, event.deviceId, "hat-y", {
      negative: "up",
      positive: "down",
      value: event.value,
    })
  }
}

function updateDigitalAxis(
  state: GamepadAbsState,
  emit: InputListener,
  deviceId: string,
  axisName: string,
  axis: {
    readonly negative: Direction
    readonly positive: Direction
    readonly value: number
  },
) {
  const negativeKey = `${deviceId}:${axisName}:${axis.negative}`
  const positiveKey = `${deviceId}:${axisName}:${axis.positive}`

  if (axis.value < 0) {
    state.startHold(negativeKey, axis.negative, emit)
    state.stopHold(positiveKey)
  } else if (axis.value > 0) {
    state.startHold(positiveKey, axis.positive, emit)
    state.stopHold(negativeKey)
  } else {
    state.stopHold(negativeKey)
    state.stopHold(positiveKey)
  }
}

type NativeButtonAction = "confirm" | "back" | "options" | "menu"

function buttonAction(code: number): NativeButtonAction | null {
  if (code === BTN_A) return "confirm"
  if (code === BTN_B) return "back"
  if (code === BTN_SELECT) return "back"
  if (code === BTN_Y) return "options"
  if (code === BTN_START) return "menu"
  if (code === BTN_MODE) return "menu"
  return null
}

function dpadDirection(code: number): Direction | null {
  if (code === BTN_DPAD_UP) return "up"
  if (code === BTN_DPAD_DOWN) return "down"
  if (code === BTN_DPAD_LEFT) return "left"
  if (code === BTN_DPAD_RIGHT) return "right"
  return null
}

function axisThresholdForDevice(
  deviceId: string,
  state: Pick<GamepadAbsState, "axisThreshold" | "lowRangeAxisThreshold">,
) {
  if (deviceId.startsWith("rsinput-gamepad/")) {
    return Math.min(state.axisThreshold, state.lowRangeAxisThreshold)
  }
  return state.axisThreshold
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
