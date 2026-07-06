import type { DiscoveredDevice } from "@platform/input/native/discover-devices"
import {
  decodeInputSeatIdentity,
  type InputSeatIdentity,
} from "./device-identity"
import {
  validateGamepadCapabilityProfile,
  type InputSeatGamepadState,
  type RequestedInputSeat,
  type SeatAllocationRequest,
  type SeatAllocationResult,
  type SeatRuntimePort,
  type SeatRuntimeWriter,
} from "./seat-runtime-port"

export interface UinputSeatHandle {
  readonly slot: number
  readonly token: string
  readonly expectedPhysicalPath?: string
  readonly expectedUniqueId?: string
}

export interface UinputSeatBackend {
  readonly createSeat: (seat: RequestedInputSeat) => Promise<UinputSeatHandle>
  readonly releaseSeat: (handle: UinputSeatHandle) => Promise<void> | void
  readonly discoverDevices: () => Promise<readonly DiscoveredDevice[]> | readonly DiscoveredDevice[]
  readonly writeGamepadState: (
    handle: UinputSeatHandle,
    state: InputSeatGamepadState,
  ) => Promise<void> | void
  readonly isDeviceReadable?: (eventPath: string) => Promise<boolean> | boolean
}

export interface UinputSeatRuntime extends SeatRuntimePort, SeatRuntimeWriter {}

export interface UinputSeatRuntimeOptions {
  readonly backend: UinputSeatBackend
  readonly inputRoot?: string
  readonly pollIntervalMs?: number
  readonly nowMs?: () => number
  readonly sleepMs?: (ms: number) => Promise<void>
}

const DEFAULT_INPUT_ROOT = "/dev/input"
const DEFAULT_POLL_INTERVAL_MS = 25

const UINT8_MAX = 0xff
const UINT32_MAX = 0xffff_ffff
const INT16_MIN = -32768
const INT16_MAX = 32767

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

export const createUinputSeatRuntime = (
  options: UinputSeatRuntimeOptions,
): UinputSeatRuntime => {
  const handles = new Map<number, UinputSeatHandle>()
  const inputRoot = options.inputRoot ?? DEFAULT_INPUT_ROOT
  const nowMs = options.nowMs ?? (() => Date.now())
  const sleepMs = options.sleepMs ?? sleep
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS

  const releaseHandles = async (slots: readonly number[]) => {
    for (const slot of slots) {
      const handle = handles.get(slot)
      if (handle === undefined) continue
      handles.delete(slot)
      await options.backend.releaseSeat(handle)
    }
  }

  return {
    allocate: async request => {
      const allocated: InputSeatIdentity[] = []
      const createdSlots: number[] = []

      for (const seat of request.seats) {
        validateGamepadCapabilityProfile(seat.capabilityProfile)

        if (request.signal?.aborted) {
          await releaseHandles(createdSlots)
          return cancelledResult()
        }

        let handle: UinputSeatHandle
        try {
          handle = await options.backend.createSeat(seat)
        } catch (error) {
          await releaseHandles(createdSlots)
          return {
            status: "unavailable",
            reason: "allocation-failed",
            slot: seat.slot,
            message: error instanceof Error ? error.message : `seat ${seat.slot} allocation failed`,
          }
        }

        handles.set(seat.slot, handle)
        createdSlots.push(seat.slot)

        const readiness = await waitForSeatIdentity(seat, handle, request, {
          backend: options.backend,
          inputRoot,
          nowMs,
          sleepMs,
          pollIntervalMs,
        })

        if (readiness.status !== "ready") {
          await releaseHandles(createdSlots)
          if (readiness.status === "ambiguous") return readiness.result
          return readiness.result
        }

        allocated.push(readiness.identity)
      }

      return {
        status: "allocated",
        launchId: request.launchId,
        seats: allocated,
      }
    },
    release: async seats => {
      await releaseHandles(seats.map(seat => seat.slot))
    },
    writeGamepadState: async (slot, state) => {
      const handle = handles.get(slot)
      if (handle === undefined) {
        throw new Error(`input seat ${slot} is not allocated`)
      }
      const validated = validateGamepadState(state)
      await options.backend.writeGamepadState(handle, validated)
    },
  }
}

interface WaitForSeatIdentityOptions {
  readonly backend: UinputSeatBackend
  readonly inputRoot: string
  readonly nowMs: () => number
  readonly sleepMs: (ms: number) => Promise<void>
  readonly pollIntervalMs: number
}

type SeatReadinessResult =
  | { readonly status: "ready"; readonly identity: InputSeatIdentity }
  | {
      readonly status: "unavailable"
      readonly result: Extract<SeatAllocationResult, { readonly status: "unavailable" }>
    }
  | {
      readonly status: "ambiguous"
      readonly result: Extract<SeatAllocationResult, { readonly status: "ambiguous" }>
    }

const waitForSeatIdentity = async (
  seat: RequestedInputSeat,
  handle: UinputSeatHandle,
  request: SeatAllocationRequest,
  options: WaitForSeatIdentityOptions,
): Promise<SeatReadinessResult> => {
  const deadline = options.nowMs() + request.timeoutMs

  while (options.nowMs() <= deadline) {
    if (request.signal?.aborted) return { status: "unavailable", result: cancelledResult() }

    const devices = await options.backend.discoverDevices()
    const expectedPhysicalPath =
      handle.expectedPhysicalPath ?? `korri/input-seat/p${seat.slot}`
    const expectedUniqueId = handle.expectedUniqueId ?? `korri-seat-p${seat.slot}`
    const candidates = devices.filter(
      device =>
        device.name === seat.name &&
        (device.uniqueId === expectedUniqueId ||
          device.physicalPath === expectedPhysicalPath),
    )

    if (candidates.length > 1) {
      return {
        status: "ambiguous",
        result: {
          status: "ambiguous",
          slot: seat.slot,
          name: seat.name,
          message: `seat ${seat.slot} identity is ambiguous`,
        },
      }
    }

    const [device] = candidates
    if (device !== undefined) {
      if (!isGamepadOnlySeatDevice(device)) {
        return {
          status: "unavailable",
          result: {
            status: "unavailable",
            reason: "allocation-failed",
            slot: seat.slot,
            message: `seat ${seat.slot} is not a gamepad-only input device`,
          },
        }
      }

      const eventPath = `${options.inputRoot}/${device.eventNode}`
      const readable = await (options.backend.isDeviceReadable?.(eventPath) ?? true)
      if (!readable) {
        return {
          status: "unavailable",
          result: {
            status: "unavailable",
            reason: "allocation-failed",
            slot: seat.slot,
            message: `seat ${seat.slot} input device is not readable`,
          },
        }
      }

      return {
        status: "ready",
        identity: decodeInputSeatIdentity({
          slot: seat.slot,
          playerIndex: seat.slot - 1,
          name: seat.name,
          backend: "evdev",
          deviceClass: "gamepad",
          capabilityProfile: seat.capabilityProfile,
          vendorId: "045e",
          productId: "028e",
          phys: device.physicalPath ?? `korri/input-seat/p${seat.slot}`,
          uniq: device.uniqueId ?? `korri-seat-p${seat.slot}`,
          eventPath,
          readiness: {
            readable: true,
            verifiedAt: new Date(0).toISOString(),
          },
        }),
      }
    }

    await options.sleepMs(options.pollIntervalMs)
  }

  return {
    status: "unavailable",
    result: {
      status: "unavailable",
      reason: "timeout",
      slot: seat.slot,
      message: `seat ${seat.slot} readiness timeout`,
    },
  }
}

const isGamepadOnlySeatDevice = (device: DiscoveredDevice): boolean => {
  if (device.class !== "gamepad") return false
  if (device.capabilities.includes("REL_X")) return false
  if (device.capabilities.includes("REL_Y")) return false
  if (device.capabilities.includes("KEY_A")) return false
  if (device.capabilities.includes("SYSTEM_KEYS")) return false
  if (device.capabilities.includes("BTN_TOUCH")) return false
  if (device.capabilities.includes("ABS_MT")) return false
  return (
    device.capabilities.includes("BTN_GAMEPAD") ||
    device.capabilities.includes("BTN_JOYSTICK")
  )
}

const cancelledResult = (): Extract<
  SeatAllocationResult,
  { readonly status: "unavailable" }
> => ({
  status: "unavailable",
  reason: "cancelled",
  message: "seat allocation cancelled",
})

const validateGamepadState = (
  state: InputSeatGamepadState,
): InputSeatGamepadState => ({
  buttons: validateIntegerRange("buttons", state.buttons, 0, UINT32_MAX),
  leftTrigger: validateIntegerRange("leftTrigger", state.leftTrigger, 0, UINT8_MAX),
  rightTrigger: validateIntegerRange("rightTrigger", state.rightTrigger, 0, UINT8_MAX),
  leftStickX: validateIntegerRange("leftStickX", state.leftStickX, INT16_MIN, INT16_MAX),
  leftStickY: validateIntegerRange("leftStickY", state.leftStickY, INT16_MIN, INT16_MAX),
  rightStickX: validateIntegerRange("rightStickX", state.rightStickX, INT16_MIN, INT16_MAX),
  rightStickY: validateIntegerRange("rightStickY", state.rightStickY, INT16_MIN, INT16_MAX),
})

const validateIntegerRange = (
  label: string,
  value: number,
  min: number,
  max: number,
): number => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label} must be an integer in [${min}, ${max}]`)
  }
  return value
}
