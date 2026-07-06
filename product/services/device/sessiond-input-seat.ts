import { randomUUID } from "node:crypto"
import { chmod, lstat, mkdir, rename, rm, writeFile } from "node:fs/promises"
import { dirname, isAbsolute } from "node:path"
import {
  INPUT_SEAT_PROVIDER_ID,
  resolveInputSeatPolicy,
} from "@platform/input-seat/policy"
import {
  makeRequestedSeat,
  type InputSeatGamepadState,
  type SeatRuntimePort,
  type SeatRuntimeWriter,
} from "@platform/input-seat/seat-runtime-port"
import {
  startSunshineInputSeatMirrorSocket,
  type SunshineInputSeatMirrorDiagnostic,
  type SunshineInputSeatMirrorSocketHandle,
} from "@platform/input-seat/sunshine-input-seat-mirror-socket"
import type { SessiondManagedLaunchInputSeatSummary } from "@platform/library/sessiond-managed-launch-protocol"
import {
  KorriSessiondPreSpawnFailure,
  type KorriSessiondPreSpawnGate,
} from "./sessiond-pre-spawn"

export interface SessiondInputSeatSunshineMirrorOptions {
  readonly socketPath?: string
  readonly socketPathForLaunch?: (launchId: string) => string
  readonly maxEventsPerSecond?: number
  readonly maxFrameBytes?: number
  readonly activeLaunchSidecarPath?: string
  readonly mirrorTokenFactory?: () => string
  readonly onDiagnostic?: (
    diagnostic: SunshineInputSeatMirrorDiagnostic,
  ) => void
}

export interface SessiondInputSeatPreSpawnGateOptions {
  readonly runtime: SeatRuntimePort
  readonly timeoutMs?: number
  readonly sunshineMirror?: SessiondInputSeatSunshineMirrorOptions
}

const DEFAULT_INPUT_SEAT_TIMEOUT_MS = 1_000
const DEFAULT_MAX_SUNSHINE_EVENTS_PER_SECOND = 240

const isSeatRuntimeWriter = (
  runtime: SeatRuntimePort,
): runtime is SeatRuntimePort & SeatRuntimeWriter =>
  typeof (runtime as { readonly writeGamepadState?: unknown })
    .writeGamepadState === "function"

export function createSessiondInputSeatPreSpawnGate(
  options: SessiondInputSeatPreSpawnGateOptions,
): KorriSessiondPreSpawnGate {
  return {
    id: INPUT_SEAT_PROVIDER_ID,
    start: async request => {
      const rawPolicy = request.launchCompanions?.[INPUT_SEAT_PROVIDER_ID]
      if (rawPolicy === undefined) return undefined

      const runtimeSupportsExtraSeats =
        typeof rawPolicy === "object" &&
        rawPolicy !== null &&
        "runtimeSupportsExtraSeats" in rawPolicy &&
        (rawPolicy as { readonly runtimeSupportsExtraSeats?: unknown })
          .runtimeSupportsExtraSeats === true

      const policy = resolveInputSeatPolicy(rawPolicy, {
        launchKind: "remote-managed",
        runtimeSupportsExtraSeats,
      })
      if (!policy.enabled || policy.playerCount === 0) return undefined

      if (options.sunshineMirror && !isSeatRuntimeWriter(options.runtime)) {
        throw new KorriSessiondPreSpawnFailure(
          "input-seat Sunshine mirror requires a writable seat runtime",
          "input-unavailable",
        )
      }

      const allocation = await options.runtime.allocate({
        launchId: request.launchId,
        seats: Array.from({ length: policy.playerCount }, (_, index) =>
          makeRequestedSeat(index + 1),
        ),
        timeoutMs: options.timeoutMs ?? DEFAULT_INPUT_SEAT_TIMEOUT_MS,
        signal: request.signal,
      })

      if (allocation.status === "allocated") {
        let mirror: SunshineInputSeatMirrorSocketHandle | undefined
        try {
          mirror = await startSunshineMirrorIfConfigured({
            launchId: request.launchId,
            seatCount: policy.playerCount,
            runtime: options.runtime as SeatRuntimePort & SeatRuntimeWriter,
            options: options.sunshineMirror,
          })
        } catch {
          await options.runtime.release(allocation.seats)
          throw new KorriSessiondPreSpawnFailure(
            "input-seat mirror unavailable",
            "input-unavailable",
          )
        }

        return {
          inputSeats: toManagedLaunchInputSeatSummary(allocation.seats),
          leaveInputSeat: slot => {
            mirror?.adapter.leaveSeat(slot)
          },
          stop: async () => {
            await mirror?.stop()
            await options.runtime.release(allocation.seats)
          },
        }
      }

      if (allocation.status === "ambiguous") {
        throw new KorriSessiondPreSpawnFailure(
          allocation.message,
          "input-ambiguous",
        )
      }

      throw new KorriSessiondPreSpawnFailure(
        allocation.message,
        "input-unavailable",
      )
    },
  }
}

const startSunshineMirrorIfConfigured = async (input: {
  readonly launchId: string
  readonly seatCount: number
  readonly runtime: SeatRuntimePort & SeatRuntimeWriter
  readonly options?: SessiondInputSeatSunshineMirrorOptions
}): Promise<SunshineInputSeatMirrorSocketHandle | undefined> => {
  if (!input.options) return undefined
  const socketPath =
    input.options.socketPath ?? input.options.socketPathForLaunch?.(input.launchId)
  if (!socketPath) {
    throw new Error("input-seat Sunshine mirror socket path is not configured")
  }

  const mirrorToken = input.options.activeLaunchSidecarPath
    ? input.options.mirrorTokenFactory?.() ?? randomUUID()
    : undefined
  const sidecarPath = input.options.activeLaunchSidecarPath

  try {
    const socket = await startSunshineInputSeatMirrorSocket({
      launchId: input.launchId,
      socketPath,
      seatCount: input.seatCount,
      maxEventsPerSecond:
        input.options.maxEventsPerSecond ?? DEFAULT_MAX_SUNSHINE_EVENTS_PER_SECOND,
      ...(input.options.maxFrameBytes !== undefined
        ? { maxFrameBytes: input.options.maxFrameBytes }
        : {}),
      ...(mirrorToken !== undefined
        ? { authorizeFrame: token => token === mirrorToken }
        : {}),
      onDiagnostic: input.options.onDiagnostic,
      onGamepadState: async state => {
        await input.runtime.writeGamepadState(
          state.slot,
          frameToGamepadState(state.frame),
        )
      },
    })

    if (sidecarPath !== undefined && mirrorToken !== undefined) {
      await writeActiveLaunchSidecar(sidecarPath, {
        launchId: input.launchId,
        generation: 1,
        mirrorToken,
      })
    }

    return {
      ...socket,
      stop: async () => {
        await clearActiveLaunchSidecar(sidecarPath)
        await socket.stop()
      },
    }
  } catch (error) {
    await clearActiveLaunchSidecar(sidecarPath)
    throw error
  }
}

interface ActiveLaunchSidecar {
  readonly launchId: string
  readonly generation: number
  readonly mirrorToken: string
}

const writeActiveLaunchSidecar = async (
  sidecarPath: string,
  sidecar: ActiveLaunchSidecar,
): Promise<void> => {
  validateSidecarPath(sidecarPath)
  const dir = dirname(sidecarPath)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700)
  await rejectSymlink(sidecarPath)
  const tempPath = `${sidecarPath}.tmp-${process.pid}-${Date.now()}`
  await rejectSymlink(tempPath)
  const payload = `${JSON.stringify(sidecar)}\n`
  try {
    await writeFile(tempPath, payload, { mode: 0o600, flag: "wx" })
    await chmod(tempPath, 0o600)
    await rename(tempPath, sidecarPath)
    await chmod(sidecarPath, 0o600)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

const clearActiveLaunchSidecar = async (
  sidecarPath: string | undefined,
): Promise<void> => {
  if (!sidecarPath) return
  validateSidecarPath(sidecarPath)
  await rejectSymlink(sidecarPath)
  await rm(sidecarPath, { force: true })
}

const validateSidecarPath = (sidecarPath: string) => {
  if (!isAbsolute(sidecarPath) || sidecarPath.includes("%")) {
    throw new Error("input-seat active-launch sidecar path must be absolute")
  }
}

const rejectSymlink = async (path: string): Promise<void> => {
  try {
    const current = await lstat(path)
    if (current.isSymbolicLink()) {
      throw new Error("input-seat active-launch sidecar path must not be a symlink")
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return
    throw error
  }
}

const frameToGamepadState = (frame: {
  readonly buttons: number
  readonly leftTrigger: number
  readonly rightTrigger: number
  readonly leftStickX: number
  readonly leftStickY: number
  readonly rightStickX: number
  readonly rightStickY: number
}): InputSeatGamepadState => ({
  buttons: frame.buttons,
  leftTrigger: frame.leftTrigger,
  rightTrigger: frame.rightTrigger,
  leftStickX: frame.leftStickX,
  leftStickY: frame.leftStickY,
  rightStickX: frame.rightStickX,
  rightStickY: frame.rightStickY,
})

const toManagedLaunchInputSeatSummary = (
  seats: readonly {
    readonly slot: number
    readonly playerIndex: number
    readonly name: string
  }[],
): SessiondManagedLaunchInputSeatSummary => ({
  seats: seats.map(seat => ({
    slot: seat.slot,
    playerIndex: seat.playerIndex + 1,
    name: seat.name,
    state: "available",
  })),
})
