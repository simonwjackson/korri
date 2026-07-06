import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { isAbsolute } from "node:path"
import {
  parseProcBusInputDevices,
  type DiscoveredDevice,
} from "@platform/input/native/discover-devices"
import type { InputSeatGamepadState, RequestedInputSeat } from "./seat-runtime-port"
import type { UinputSeatBackend, UinputSeatHandle } from "./uinput-seat-runtime"

export type UinputSeatBackendCommand =
  | {
      readonly op: "create"
      readonly slot: number
      readonly name: string
      readonly phys: string
      readonly uniq: string
    }
  | {
      readonly op: "state"
      readonly token: string
      readonly slot: number
      readonly state: InputSeatGamepadState
    }
  | {
      readonly op: "release"
      readonly token: string
      readonly slot: number
    }

export type UinputSeatBackendResponse =
  | { readonly ok: true; readonly token?: string }
  | { readonly ok: false; readonly error: string }

export interface UinputSeatBackendTransport {
  readonly request: (
    command: UinputSeatBackendCommand,
  ) => Promise<UinputSeatBackendResponse>
  readonly stop?: () => Promise<void> | void
}

export interface ProductionUinputSeatBackend extends UinputSeatBackend {
  readonly shutdown: () => Promise<void>
}

export interface UinputSeatBackendOptions {
  readonly helperPath: string
  readonly transport?: UinputSeatBackendTransport
  readonly procDevicesPath?: string
  readonly discoverDevices?: () => Promise<readonly DiscoveredDevice[]> | readonly DiscoveredDevice[]
  readonly isDeviceReadable?: (eventPath: string) => Promise<boolean> | boolean
  readonly helperRequestTimeoutMs?: number
}

export const createUinputSeatBackend = (
  options: UinputSeatBackendOptions,
): ProductionUinputSeatBackend => {
  assertProductionHelperPath(options.helperPath)

  const transport = options.transport ?? createNdjsonHelperTransport(options.helperPath)
  const procDevicesPath = options.procDevicesPath ?? "/proc/bus/input/devices"
  const helperRequestTimeoutMs = options.helperRequestTimeoutMs ?? 5_000

  const request = async (
    command: UinputSeatBackendCommand,
  ): Promise<UinputSeatBackendResponse> => {
    let timeout: Timer | undefined
    try {
      const response = await Promise.race([
        transport.request(command),
        new Promise<UinputSeatBackendResponse>(resolve => {
          timeout = setTimeout(
            () => resolve({ ok: false, error: REDACTED_HELPER_UNAVAILABLE }),
            helperRequestTimeoutMs,
          )
        }),
      ])
      if (!response.ok) await transport.stop?.()
      return response
    } catch {
      await transport.stop?.()
      return { ok: false, error: REDACTED_HELPER_UNAVAILABLE }
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  return {
    createSeat: async seat => {
      const phys = `korri/input-seat/p${seat.slot}`
      const uniq = `korri-seat-p${seat.slot}`
      const response = await request({
        op: "create",
        slot: seat.slot,
        name: seat.name,
        phys,
        uniq,
      })
      if (!response.ok) throw helperUnavailableError()
      if (!response.token) throw helperUnavailableError()
      return {
        slot: seat.slot,
        token: response.token,
        expectedPhysicalPath: phys,
        // Linux uinput exposes UI_SET_PHYS but not a UI_SET_UNIQ ioctl in the
        // supported kernel headers. Keep the helper token deterministic while
        // matching readiness by name+phys and duplicate detection.
        expectedUniqueId: null,
      }
    },
    releaseSeat: async handle => {
      const response = await request({
        op: "release",
        token: handle.token,
        slot: handle.slot,
      })
      if (!response.ok) throw helperUnavailableError()
    },
    discoverDevices: async () => {
      if (options.discoverDevices) return await options.discoverDevices()
      return parseProcBusInputDevices(await readFile(procDevicesPath, "utf8"))
    },
    writeGamepadState: async (handle, state) => {
      assertBoundedGamepadState(state)
      const response = await request({
        op: "state",
        token: handle.token,
        slot: handle.slot,
        state,
      })
      if (!response.ok) throw helperUnavailableError()
    },
    isDeviceReadable: async eventPath => {
      if (options.isDeviceReadable) return await options.isDeviceReadable(eventPath)
      try {
        await access(eventPath, constants.R_OK)
        return true
      } catch {
        return false
      }
    },
    shutdown: async () => {
      await transport.stop?.()
    },
  }
}

const REDACTED_HELPER_UNAVAILABLE = "input-seat uinput backend unavailable"

const helperUnavailableError = (): Error => new Error(REDACTED_HELPER_UNAVAILABLE)

const NIXOS_UINPUT_HELPER_WRAPPER = "/run/wrappers/bin/korri-uinput-seat-helper"

export const assertProductionHelperPath = (helperPath: string): void => {
  if (!helperPath || helperPath.trim() !== helperPath) {
    throw new Error("input-seat helper path must be a trimmed absolute production path")
  }
  if (!isAbsolute(helperPath)) {
    throw new Error("input-seat helper path must be absolute")
  }
  if (helperPath.includes("%")) {
    throw new Error("input-seat helper path must not contain systemd specifiers")
  }
  if (helperPath.startsWith("/nix/store/")) return
  if (helperPath === NIXOS_UINPUT_HELPER_WRAPPER) return
  throw new Error(
    "input-seat helper path must be an immutable Nix-store path or the fixed NixOS uinput wrapper",
  )
}

const UINT8_MAX = 0xff
const UINT32_MAX = 0xffff_ffff
const INT16_MIN = -32768
const INT16_MAX = 32767

const assertBoundedGamepadState = (state: InputSeatGamepadState): void => {
  assertIntegerInRange("buttons", state.buttons, 0, UINT32_MAX)
  assertIntegerInRange("leftTrigger", state.leftTrigger, 0, UINT8_MAX)
  assertIntegerInRange("rightTrigger", state.rightTrigger, 0, UINT8_MAX)
  assertIntegerInRange("leftStickX", state.leftStickX, INT16_MIN, INT16_MAX)
  assertIntegerInRange("leftStickY", state.leftStickY, INT16_MIN, INT16_MAX)
  assertIntegerInRange("rightStickX", state.rightStickX, INT16_MIN, INT16_MAX)
  assertIntegerInRange("rightStickY", state.rightStickY, INT16_MIN, INT16_MAX)
}

const assertIntegerInRange = (
  field: string,
  value: number,
  min: number,
  max: number,
): void => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`input-seat ${field} is out of range`)
  }
}

type HelperRequestEnvelope = UinputSeatBackendCommand & {
  readonly id: number
}

type HelperResponseEnvelope = UinputSeatBackendResponse & {
  readonly id: number
}

export const createNdjsonHelperTransport = (
  command: string | readonly string[],
): UinputSeatBackendTransport => {
  const argv = typeof command === "string" ? [command] : [...command]
  const child = Bun.spawn(argv, {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdin = child.stdin
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let nextId = 1
  let stopped = false
  const pending = new Map<
    number,
    {
      readonly resolve: (response: UinputSeatBackendResponse) => void
      readonly reject: (error: Error) => void
    }
  >()

  const failPending = (error: Error) => {
    for (const waiter of pending.values()) waiter.reject(error)
    pending.clear()
  }

  void (async () => {
    const reader = child.stdout.getReader()
    let buffer = ""
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const response = JSON.parse(line) as HelperResponseEnvelope
          const waiter = pending.get(response.id)
          if (!waiter) continue
          pending.delete(response.id)
          if (response.ok) {
            waiter.resolve(
              response.token ? { ok: true, token: response.token } : { ok: true },
            )
          } else {
            waiter.resolve({ ok: false, error: response.error })
          }
        }
      }
    } catch (error) {
      failPending(error instanceof Error ? error : new Error("uinput helper stdout failed"))
    }
  })()

  void child.exited.then(exitCode => {
    if (stopped) return
    failPending(new Error(`uinput helper exited with status ${exitCode}`))
  })

  return {
    request: command => {
      if (stopped) return Promise.reject(new Error("uinput helper is stopped"))
      const id = nextId++
      const envelope: HelperRequestEnvelope = { id, ...command }
      return new Promise<UinputSeatBackendResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        try {
          stdin.write(encoder.encode(`${JSON.stringify(envelope)}\n`))
        } catch (error: unknown) {
          pending.delete(id)
          reject(error instanceof Error ? error : new Error("uinput helper write failed"))
        }
      })
    },
    stop: async () => {
      stopped = true
      try {
        stdin.end()
      } catch {
        // The helper may already have exited; termination below is best-effort.
      }

      const exited = await Promise.race([
        child.exited.then(() => true),
        new Promise<false>(resolve => setTimeout(() => resolve(false), 2_000)),
      ])
      if (!exited) child.kill()
      failPending(new Error("uinput helper stopped"))
    },
  }
}
