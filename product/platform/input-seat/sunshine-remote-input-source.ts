import { Schema } from "effect"
import {
  connectInputSeat,
  disconnectInputSeat,
  reconnectInputSeat,
  type InputSeatState,
} from "./seat-state"

const ControllerNumber = Schema.Int.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value <= 15
      ? undefined
      : "controllerNumber must be an integer in 0..15",
  ),
)
const Uint8 = Schema.Int.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value <= 255
      ? undefined
      : "must be a uint8",
  ),
)
const Uint32 = Schema.Int.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff
      ? undefined
      : "must be a uint32",
  ),
)
const Int16 = Schema.Int.check(
  Schema.makeFilter<number>(value =>
    Number.isInteger(value) && value >= -32768 && value <= 32767
      ? undefined
      : "must be an int16",
  ),
)

const SunshineSourceConnectedFrame = Schema.Struct({
  kind: Schema.Literal("source-connected"),
  launchId: Schema.String,
  controllerNumber: ControllerNumber,
})

const SunshineSourceDisconnectedFrame = Schema.Struct({
  kind: Schema.Literal("source-disconnected"),
  launchId: Schema.String,
  controllerNumber: ControllerNumber,
  reason: Schema.optional(Schema.String),
})

const SunshineSourceStateFrame = Schema.Struct({
  kind: Schema.Literal("source-state"),
  launchId: Schema.String,
  controllerNumber: ControllerNumber,
  buttons: Uint32,
  leftTrigger: Uint8,
  rightTrigger: Uint8,
  leftStickX: Int16,
  leftStickY: Int16,
  rightStickX: Int16,
  rightStickY: Int16,
})

export const SunshineInputSeatFrame = Schema.Union([
  SunshineSourceConnectedFrame,
  SunshineSourceDisconnectedFrame,
  SunshineSourceStateFrame,
])
export type SunshineInputSeatFrame = Schema.Schema.Type<
  typeof SunshineInputSeatFrame
>

const STRICT_DECODE = { onExcessProperty: "error" } as const

export const decodeSunshineInputSeatFrame = (
  input: unknown,
): SunshineInputSeatFrame =>
  Schema.decodeUnknownSync(SunshineInputSeatFrame)(input, STRICT_DECODE)

export type SunshineInputSeatAcceptResult =
  | { readonly status: "accepted"; readonly slot?: number }
  | {
      readonly status: "dropped"
      readonly reason:
        | "stale-launch"
        | "non-gamepad-frame"
        | "no-seat-available"
        | "unknown-source"
        | "rate-limited"
    }

export interface SunshineForwardedGamepadState {
  readonly sourceId: string
  readonly slot: number
  readonly frame: Extract<
    SunshineInputSeatFrame,
    { readonly kind: "source-state" }
  >
}

export interface SunshineRemoteInputSourceAdapter {
  readonly accept: (
    frame: SunshineInputSeatFrame,
  ) => SunshineInputSeatAcceptResult
  readonly seats: () => readonly InputSeatState[]
  readonly forwardedEvents: () => readonly SunshineForwardedGamepadState[]
}

export interface SunshineRemoteInputSourceAdapterOptions {
  readonly launchId: string
  readonly seatCount: number
  readonly maxEventsPerSecond: number
  readonly nowMs?: () => number
}

interface RateBucket {
  windowStartMs: number
  count: number
}

const sourceIdForController = (controllerNumber: number): string =>
  `sunshine:controller-${controllerNumber}`

const occupiedBySource = (state: InputSeatState, sourceId: string): boolean =>
  state.tag !== "available" && state.sourceId === sourceId

export const createSunshineRemoteInputSourceAdapter = (
  options: SunshineRemoteInputSourceAdapterOptions,
): SunshineRemoteInputSourceAdapter => {
  let seats: InputSeatState[] = Array.from(
    { length: options.seatCount },
    (_, index) => ({ tag: "available" as const, slot: index + 1 }),
  )
  const forwarded: SunshineForwardedGamepadState[] = []
  const rateBuckets = new Map<string, RateBucket>()
  const nowMs = options.nowMs ?? (() => Date.now())

  const consumeRate = (sourceId: string): boolean => {
    const now = nowMs()
    const current = rateBuckets.get(sourceId)
    if (current === undefined || now - current.windowStartMs >= 1_000) {
      rateBuckets.set(sourceId, { windowStartMs: now, count: 1 })
      return true
    }
    if (current.count >= options.maxEventsPerSecond) return false
    rateBuckets.set(sourceId, {
      windowStartMs: current.windowStartMs,
      count: current.count + 1,
    })
    return true
  }

  const connect = (sourceId: string): SunshineInputSeatAcceptResult => {
    const reserved = seats.findIndex(
      seat =>
        seat.tag === "occupied-disconnected-reserved" &&
        seat.launchId === options.launchId &&
        seat.sourceId === sourceId,
    )
    if (reserved >= 0) {
      seats = seats.map((seat, index) =>
        index === reserved
          ? reconnectInputSeat(seat, {
              launchId: options.launchId,
              sourceId,
            })
          : seat,
      )
      return { status: "accepted", slot: seats[reserved]?.slot }
    }

    const existing = seats.find(seat => occupiedBySource(seat, sourceId))
    if (existing) return { status: "accepted", slot: existing.slot }

    const available = seats.findIndex(seat => seat.tag === "available")
    if (available < 0) return { status: "dropped", reason: "no-seat-available" }
    seats = seats.map((seat, index) =>
      index === available
        ? connectInputSeat(seat, { launchId: options.launchId, sourceId })
        : seat,
    )
    return { status: "accepted", slot: seats[available]?.slot }
  }

  return {
    seats: () => [...seats],
    forwardedEvents: () => [...forwarded],
    accept: frame => {
      if (frame.launchId !== options.launchId) {
        return { status: "dropped", reason: "stale-launch" }
      }
      if (
        frame.kind !== "source-connected" &&
        frame.kind !== "source-disconnected" &&
        frame.kind !== "source-state"
      ) {
        return { status: "dropped", reason: "non-gamepad-frame" }
      }

      const sourceId = sourceIdForController(frame.controllerNumber)
      if (frame.kind === "source-connected") return connect(sourceId)

      const seatIndex = seats.findIndex(seat =>
        occupiedBySource(seat, sourceId),
      )
      if (seatIndex < 0) return { status: "dropped", reason: "unknown-source" }
      const seat = seats[seatIndex]
      if (!seat) return { status: "dropped", reason: "unknown-source" }

      if (frame.kind === "source-disconnected") {
        if (seat.tag !== "occupied-connected") {
          return { status: "accepted", slot: seat.slot }
        }
        seats = seats.map((candidate, index) =>
          index === seatIndex
            ? disconnectInputSeat(
                candidate,
                frame.reason ?? "source-disconnected",
              )
            : candidate,
        )
        return { status: "accepted", slot: seat.slot }
      }

      if (!consumeRate(sourceId)) {
        return { status: "dropped", reason: "rate-limited" }
      }
      forwarded.push({ sourceId, slot: seat.slot, frame })
      return { status: "accepted", slot: seat.slot }
    },
  }
}
