/**
 * Play-recording coordinator — records one gated, per-user play entry by
 * reacting to launch lifecycle events.
 *
 * A launch calls `beginLaunch` with its full context (user, game, release,
 * start time) at spawn, and `completeLaunch` when the session's terminal
 * fires. Duration is `endedAt − startedAt` — plain subtraction of two event
 * timestamps; nothing ticks or counts during play. Completion is idempotent
 * per `launchId`, so the direct (owner) and managed (sessiond) terminals can
 * both fire without double-recording.
 *
 * The coordinator owns no lifecycle knowledge and no timer: it holds one
 * pending record per in-flight launch and resolves it on the terminal event.
 */

import type { PlayLogStore } from "@platform/library/play-log-store"

export interface LaunchRecordingContext {
  readonly launchId: string
  readonly userId: string
  readonly gameId: string
  readonly releaseId?: string
  /** When the session started running. */
  readonly startedAt: Date
}

export interface PlayRecordingCoordinatorDeps {
  readonly store: PlayLogStore
  /** Clock injection for tests. Defaults to wall-clock. */
  readonly now?: () => Date
  /** Gate threshold in seconds. Defaults to the store's own default (0). */
  readonly thresholdSeconds?: number
  /** Best-effort error sink; recording must never break session teardown. */
  readonly onError?: (error: unknown) => void
}

export interface PlayRecordingCoordinator {
  readonly beginLaunch: (context: LaunchRecordingContext) => void
  /**
   * Resolve the pending launch and record a gated play. Returns `true` when an
   * entry was written, `false` when there was no pending launch or the gate
   * rejected it. Safe to call more than once per `launchId` (first wins).
   */
  readonly completeLaunch: (
    launchId: string,
    endedAt?: Date,
  ) => Promise<boolean>
}

export function createPlayRecordingCoordinator(
  deps: PlayRecordingCoordinatorDeps,
): PlayRecordingCoordinator {
  const now = deps.now ?? (() => new Date())
  const pending = new Map<string, LaunchRecordingContext>()

  return {
    beginLaunch: context => {
      pending.set(context.launchId, context)
    },
    completeLaunch: async (launchId, endedAt) => {
      const context = pending.get(launchId)
      if (!context) return false
      pending.delete(launchId)

      const occurredAt = endedAt ?? now()
      const durationSeconds = Math.max(
        0,
        Math.round((occurredAt.getTime() - context.startedAt.getTime()) / 1000),
      )

      try {
        return await deps.store.record(
          { userId: context.userId, gameId: context.gameId },
          {
            occurredAt,
            durationSeconds,
            ...(context.releaseId ? { releaseId: context.releaseId } : {}),
          },
          deps.thresholdSeconds !== undefined
            ? { thresholdSeconds: deps.thresholdSeconds }
            : undefined,
        )
      } catch (error) {
        deps.onError?.(error)
        return false
      }
    },
  }
}
