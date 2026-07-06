import {
  INPUT_SEAT_PROVIDER_ID,
  resolveInputSeatPolicy,
} from "@platform/input-seat/policy"
import {
  makeRequestedSeat,
  type SeatRuntimePort,
} from "@platform/input-seat/seat-runtime-port"
import type { SessiondManagedLaunchInputSeatSummary } from "@platform/library/sessiond-managed-launch-protocol"
import {
  KorriSessiondPreSpawnFailure,
  type KorriSessiondPreSpawnGate,
} from "./sessiond-pre-spawn"

export interface SessiondInputSeatPreSpawnGateOptions {
  readonly runtime: SeatRuntimePort
  readonly timeoutMs?: number
}

const DEFAULT_INPUT_SEAT_TIMEOUT_MS = 1_000

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

      const allocation = await options.runtime.allocate({
        launchId: request.launchId,
        seats: Array.from({ length: policy.playerCount }, (_, index) =>
          makeRequestedSeat(index + 1),
        ),
        timeoutMs: options.timeoutMs ?? DEFAULT_INPUT_SEAT_TIMEOUT_MS,
        signal: request.signal,
      })

      if (allocation.status === "allocated") {
        return {
          inputSeats: toManagedLaunchInputSeatSummary(allocation.seats),
          stop: async () => {
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
