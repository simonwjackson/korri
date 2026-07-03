/**
 * Play-recording observer — records one gated play entry when a foreground
 * session ends.
 *
 * Subscribes to the foreground-session owner's `onStateEntered` hook (the
 * sanctioned lifecycle-observation seam) and, on the terminal `ExitObserved`
 * transition, appends `{ occurredAt, durationSeconds }` to the game's play
 * log. Duration is measured from the `Running` transition. The gate lives in
 * the store (`durationSeconds >= threshold`).
 *
 * Scope: this fires for owner-observed terminals (direct / non-sessiond-
 * managed launches). On sessiond-managed hosts the owner hands terminal
 * observation to sessiond after readiness, so those launches need a
 * sessiond-side terminal hook — tracked as follow-up.
 */

import type { PlayLogStore } from "@platform/library/play-log-store"
import type { ForegroundSessionState } from "@platform/stream/foreground-session-lifecycle"

export interface PlayRecordingObserverDeps {
  readonly store: PlayLogStore
  /** Clock injection for tests. Defaults to wall-clock. */
  readonly now?: () => Date
  /** Gate threshold in seconds. Defaults to the store's own default (0). */
  readonly thresholdSeconds?: number
  /** Best-effort error sink; recording must never break session teardown. */
  readonly onError?: (error: unknown) => void
}

export interface PlayRecordingObserver {
  readonly onStateEntered: (state: ForegroundSessionState) => Promise<void>
}

export function createPlayRecordingObserver(
  deps: PlayRecordingObserverDeps,
): PlayRecordingObserver {
  const now = deps.now ?? (() => new Date())
  let startedAt: Date | undefined
  let gameId: string | undefined

  return {
    onStateEntered: async state => {
      if (state._tag === "Running") {
        startedAt = now()
        gameId = state.active.gameId
        return
      }

      if (state._tag !== "ExitObserved" || !startedAt || !gameId) return

      const occurredAt = now()
      const durationSeconds = Math.max(
        0,
        Math.round((occurredAt.getTime() - startedAt.getTime()) / 1000),
      )
      const recordedGameId = gameId
      startedAt = undefined
      gameId = undefined

      try {
        await deps.store.record(
          recordedGameId,
          { occurredAt, durationSeconds },
          deps.thresholdSeconds !== undefined
            ? { thresholdSeconds: deps.thresholdSeconds }
            : undefined,
        )
      } catch (error) {
        deps.onError?.(error)
      }
    },
  }
}
