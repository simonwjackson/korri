import { createLogger } from "@shared/logger"
import {
  decodeNativeInputEvent,
  decodeNativeInputSubscription,
  encodeNativeInputSubscription,
  type NativeInputDeviceClass,
} from "./native/wire-schema"
import type { Direction, InputAdapter, InputListener } from "./types"

const logger = createLogger("native-input-adapter")

const EV_KEY = 1
const EV_ABS = 3

const BTN_A = 304
const BTN_B = 305
const BTN_Y = 308
const BTN_START = 315
const BTN_DPAD_UP = 544
const BTN_DPAD_DOWN = 545
const BTN_DPAD_LEFT = 546
const BTN_DPAD_RIGHT = 547

const ABS_X = 0
const ABS_Y = 1
const ABS_HAT0X = 16
const ABS_HAT0Y = 17

const DEFAULT_AXIS_THRESHOLD = 16_000
const DEFAULT_REPEAT_DELAY_MS = 400
const DEFAULT_REPEAT_INTERVAL_MS = 100
const DEFAULT_RECONNECT_INITIAL_DELAY_MS = 250
const DEFAULT_RECONNECT_MAX_DELAY_MS = 5_000
const DEFAULT_RECONNECT_FACTOR = 2

interface HoldState {
  readonly direction: Direction
  readonly timeout: ReturnType<typeof setTimeout>
  readonly interval?: ReturnType<typeof setInterval>
}

export interface NativeInputReconnectOptions {
  readonly initialDelayMs?: number
  readonly maxDelayMs?: number
  readonly factor?: number
}

export interface NativeInputAdapterOptions {
  readonly url: string
  readonly subscribe?: readonly NativeInputDeviceClass[]
  readonly reconnect?: NativeInputReconnectOptions
  readonly axisThreshold?: number
  readonly repeatDelayMs?: number
  readonly repeatIntervalMs?: number
}

export function createNativeInputAdapter(
  options: NativeInputAdapterOptions,
): InputAdapter {
  const subscribe = options.subscribe ?? ["gamepad"]
  const axisThreshold = options.axisThreshold ?? DEFAULT_AXIS_THRESHOLD
  const repeatDelayMs = options.repeatDelayMs ?? DEFAULT_REPEAT_DELAY_MS
  const repeatIntervalMs =
    options.repeatIntervalMs ?? DEFAULT_REPEAT_INTERVAL_MS
  const reconnectInitialDelayMs =
    options.reconnect?.initialDelayMs ?? DEFAULT_RECONNECT_INITIAL_DELAY_MS
  const reconnectMaxDelayMs =
    options.reconnect?.maxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS
  const reconnectFactor = options.reconnect?.factor ?? DEFAULT_RECONNECT_FACTOR

  return {
    name: "native",
    start(emit) {
      if (typeof WebSocket === "undefined") return () => {}

      const holds = new Map<string, HoldState>()
      const pressedButtons = new Set<string>()
      const axes = new Map<string, { x: number; y: number }>()
      let socket: WebSocket | undefined
      let disposed = false
      let reconnectTimer: ReturnType<typeof setTimeout> | undefined
      let nextReconnectDelayMs = reconnectInitialDelayMs

      const fireDirection = (direction: Direction) => {
        emit({ type: "direction", direction, source: "native" })
      }

      const startHold = (key: string, direction: Direction) => {
        if (holds.has(key)) return

        fireDirection(direction)
        const timeout = setTimeout(() => {
          const interval = setInterval(
            () => fireDirection(direction),
            repeatIntervalMs,
          )
          holds.set(key, { direction, timeout, interval })
        }, repeatDelayMs)
        holds.set(key, { direction, timeout })
      }

      const stopHold = (key: string) => {
        const hold = holds.get(key)
        if (!hold) return
        clearTimeout(hold.timeout)
        if (hold.interval) clearInterval(hold.interval)
        holds.delete(key)
      }

      const resetState = () => {
        for (const key of holds.keys()) stopHold(key)
        pressedButtons.clear()
        axes.clear()
      }

      const connect = () => {
        if (disposed) return

        socket = new WebSocket(options.url)

        socket.addEventListener("open", () => {
          nextReconnectDelayMs = reconnectInitialDelayMs
          socket?.send(encodeSubscription(subscribe))
        })

        socket.addEventListener("message", event => {
          try {
            const decoded = decodeNativeInputEvent(
              JSON.parse(String(event.data)),
            )
            if (decoded.kind !== "input") return
            if (decoded.class !== "gamepad") return
            handleGamepadInput(decoded, emit, {
              startHold,
              stopHold,
              pressedButtons,
              axes,
              axisThreshold,
            })
          } catch (error) {
            logger.warn({ err: error }, "ignored malformed native input frame")
          }
        })

        socket.addEventListener("error", () => scheduleReconnect())
        socket.addEventListener("close", () => {
          resetState()
          scheduleReconnect()
        })
      }

      const scheduleReconnect = () => {
        if (disposed || reconnectTimer) return

        reconnectTimer = setTimeout(() => {
          reconnectTimer = undefined
          connect()
        }, nextReconnectDelayMs)
        nextReconnectDelayMs = Math.min(
          reconnectMaxDelayMs,
          nextReconnectDelayMs * reconnectFactor,
        )
      }

      connect()

      return () => {
        disposed = true
        if (reconnectTimer) clearTimeout(reconnectTimer)
        resetState()
        socket?.close()
      }
    },
  }
}

type GamepadInputEvent = Extract<
  ReturnType<typeof decodeNativeInputEvent>,
  { readonly kind: "input" }
>

interface GamepadInputState {
  readonly startHold: (key: string, direction: Direction) => void
  readonly stopHold: (key: string) => void
  readonly pressedButtons: Set<string>
  readonly axes: Map<string, { x: number; y: number }>
  readonly axisThreshold: number
}

function handleGamepadInput(
  event: GamepadInputEvent,
  emit: InputListener,
  state: GamepadInputState,
) {
  if (event.type === EV_KEY) {
    handleGamepadKey(event, emit, state)
    return
  }

  if (event.type === EV_ABS) {
    handleGamepadAbs(event, state)
  }
}

function handleGamepadKey(
  event: GamepadInputEvent,
  emit: InputListener,
  state: GamepadInputState,
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
    state.startHold(holdKey, direction)
  } else {
    state.stopHold(holdKey)
  }
}

function handleGamepadAbs(event: GamepadInputEvent, state: GamepadInputState) {
  if (event.code === ABS_X || event.code === ABS_Y) {
    const current = state.axes.get(event.deviceId) ?? { x: 0, y: 0 }
    const next =
      event.code === ABS_X
        ? { ...current, x: event.value }
        : { ...current, y: event.value }
    state.axes.set(event.deviceId, next)

    const direction = stickToDirection(next.x, next.y, state.axisThreshold)
    for (const candidate of ["up", "down", "left", "right"] as const) {
      const holdKey = `${event.deviceId}:stick:${candidate}`
      if (direction === candidate) {
        state.startHold(holdKey, candidate)
      } else {
        state.stopHold(holdKey)
      }
    }
    return
  }

  if (event.code === ABS_HAT0X) {
    updateDigitalAxis(state, event.deviceId, "hat-x", {
      negative: "left",
      positive: "right",
      value: event.value,
    })
    return
  }

  if (event.code === ABS_HAT0Y) {
    updateDigitalAxis(state, event.deviceId, "hat-y", {
      negative: "up",
      positive: "down",
      value: event.value,
    })
  }
}

function updateDigitalAxis(
  state: GamepadInputState,
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
    state.startHold(negativeKey, axis.negative)
    state.stopHold(positiveKey)
  } else if (axis.value > 0) {
    state.startHold(positiveKey, axis.positive)
    state.stopHold(negativeKey)
  } else {
    state.stopHold(negativeKey)
    state.stopHold(positiveKey)
  }
}

function buttonAction(
  code: number,
): "confirm" | "back" | "options" | "menu" | null {
  if (code === BTN_A) return "confirm"
  if (code === BTN_B) return "back"
  if (code === BTN_Y) return "options"
  if (code === BTN_START) return "menu"
  return null
}

function dpadDirection(code: number): Direction | null {
  if (code === BTN_DPAD_UP) return "up"
  if (code === BTN_DPAD_DOWN) return "down"
  if (code === BTN_DPAD_LEFT) return "left"
  if (code === BTN_DPAD_RIGHT) return "right"
  return null
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

function encodeSubscription(
  classes: readonly NativeInputDeviceClass[],
): string {
  return JSON.stringify(
    encodeNativeInputSubscription(
      decodeNativeInputSubscription({ classes: [...classes] }),
    ),
  )
}
