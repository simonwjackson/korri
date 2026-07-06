import {
  decodeInputSeatIdentity,
  inputSeatNameForSlot,
  type InputSeatIdentity,
} from "./device-identity"

export type GamepadCapabilityProfile = "xbox360-gamepad"

export interface RequestedInputSeat {
  readonly slot: number
  readonly name: string
  readonly capabilityProfile: GamepadCapabilityProfile
}

export interface SeatAllocationRequest {
  readonly launchId: string
  readonly seats: readonly RequestedInputSeat[]
  readonly timeoutMs: number
  readonly signal?: AbortSignal
}

export type SeatAllocationResult =
  | {
      readonly status: "allocated"
      readonly launchId: string
      readonly seats: readonly InputSeatIdentity[]
    }
  | {
      readonly status: "unavailable"
      readonly reason: "allocation-failed" | "timeout" | "cancelled"
      readonly slot?: number
      readonly message: string
    }
  | {
      readonly status: "ambiguous"
      readonly slot: number
      readonly name: string
      readonly message: string
    }

export interface SeatRuntimePort {
  readonly allocate: (
    request: SeatAllocationRequest,
  ) => Promise<SeatAllocationResult>
  readonly release: (
    seats: readonly InputSeatIdentity[],
  ) => Promise<void> | void
}

export const validateGamepadCapabilityProfile = (
  input: GamepadCapabilityProfile,
): GamepadCapabilityProfile => {
  if (input !== "xbox360-gamepad") {
    throw new Error("input seats support gamepad-only capability profiles")
  }
  return input
}

export const makeRequestedSeat = (
  slot: number,
  capabilityProfile: GamepadCapabilityProfile = "xbox360-gamepad",
): RequestedInputSeat => ({
  slot,
  name: inputSeatNameForSlot(slot),
  capabilityProfile: validateGamepadCapabilityProfile(capabilityProfile),
})

interface MemorySeatRuntimeOptions {
  readonly readinessDelayMs?: number
  readonly failAtSlot?: number
  readonly duplicateName?: string
}

export interface MemorySeatRuntime extends SeatRuntimePort {
  readonly createdSlots: () => readonly number[]
  readonly releasedSlots: () => readonly number[]
}

const waitForReadiness = async (
  delayMs: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<"ready" | "timeout" | "cancelled"> => {
  if (signal?.aborted) return "cancelled"
  if (delayMs > timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, timeoutMs))
    return signal?.aborted ? "cancelled" : "timeout"
  }

  return await new Promise(resolve => {
    const timer = setTimeout(() => resolve("ready"), delayMs)
    const abort = () => {
      clearTimeout(timer)
      resolve("cancelled")
    }
    signal?.addEventListener("abort", abort, { once: true })
  })
}

export const createMemorySeatRuntime = (
  options: MemorySeatRuntimeOptions = {},
): MemorySeatRuntime => {
  const created: number[] = []
  const released: number[] = []

  const releaseAllocated = (seats: readonly InputSeatIdentity[]) => {
    for (const seat of seats) {
      if (!released.includes(seat.slot)) released.push(seat.slot)
    }
  }

  return {
    createdSlots: () => [...created],
    releasedSlots: () => [...released],
    release: seats => {
      releaseAllocated(seats)
    },
    allocate: async request => {
      const allocated: InputSeatIdentity[] = []

      for (const seat of request.seats) {
        validateGamepadCapabilityProfile(seat.capabilityProfile)

        if (options.failAtSlot === seat.slot) {
          releaseAllocated(allocated)
          return {
            status: "unavailable",
            reason: "allocation-failed",
            slot: seat.slot,
            message: `seat ${seat.slot} allocation failed`,
          }
        }

        created.push(seat.slot)
        const identity = decodeInputSeatIdentity({
          slot: seat.slot,
          playerIndex: seat.slot - 1,
          name: seat.name,
          backend: "evdev",
          deviceClass: "gamepad",
          capabilityProfile: seat.capabilityProfile,
          vendorId: "045e",
          productId: "028e",
          phys: `korri/input-seat/p${seat.slot}`,
          uniq: `korri-seat-p${seat.slot}`,
          eventPath: `/dev/input/event${100 + seat.slot}`,
          readiness: {
            readable: true,
            verifiedAt: new Date(0).toISOString(),
          },
        })
        allocated.push(identity)

        if (options.duplicateName === seat.name) {
          releaseAllocated(allocated)
          return {
            status: "ambiguous",
            slot: seat.slot,
            name: seat.name,
            message: `seat ${seat.slot} identity is ambiguous`,
          }
        }

        const readiness = await waitForReadiness(
          options.readinessDelayMs ?? 0,
          request.timeoutMs,
          request.signal,
        )
        if (readiness !== "ready") {
          releaseAllocated(allocated)
          return {
            status: "unavailable",
            reason: readiness,
            message: `seat readiness ${readiness}`,
          }
        }
      }

      return {
        status: "allocated",
        launchId: request.launchId,
        seats: allocated,
      }
    },
  }
}

export const createUnavailableSeatRuntime = (
  message = "input-seat runtime is not configured",
): SeatRuntimePort => ({
  allocate: async request => ({
    status: "unavailable",
    reason: request.signal?.aborted ? "cancelled" : "allocation-failed",
    message,
  }),
  release: () => {},
})
