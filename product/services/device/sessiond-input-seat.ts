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
        } catch (error) {
          await options.runtime.release(allocation.seats)
          throw new KorriSessiondPreSpawnFailure(
            error instanceof Error ? error.message : String(error),
            "input-unavailable",
          )
        }

        return {
          inputSeats: toManagedLaunchInputSeatSummary(allocation.seats),
          ...(mirror
            ? {
                launchEnv: {
                  KORRI_INPUT_SEAT_MIRROR_SOCKET: mirror.socketPath,
                  KORRI_INPUT_SEAT_LAUNCH_ID: request.launchId,
                },
              }
            : {}),
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

  return await startSunshineInputSeatMirrorSocket({
    launchId: input.launchId,
    socketPath,
    seatCount: input.seatCount,
    maxEventsPerSecond:
      input.options.maxEventsPerSecond ?? DEFAULT_MAX_SUNSHINE_EVENTS_PER_SECOND,
    ...(input.options.maxFrameBytes !== undefined
      ? { maxFrameBytes: input.options.maxFrameBytes }
      : {}),
    onDiagnostic: input.options.onDiagnostic,
    onGamepadState: async state => {
      await input.runtime.writeGamepadState(
        state.slot,
        frameToGamepadState(state.frame),
      )
    },
  })
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
