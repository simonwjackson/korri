/**
 * Tracks whether a foreground game/stream session is active, and whether that
 * session is a Moonlight stream, so inputd can:
 *   1. Scope the quit chord/overlay to an actual session (never arm on the hub).
 *   2. Pick the right decision-menu options (local vs stream).
 *
 * The decision logic is pure and unit-tested; the live probe (sessiond status +
 * a /proc scan for a moonlight process) is a thin injected adapter. inputd polls
 * refresh() on its existing interval and reads the cached getters synchronously
 * from the hot input path.
 */
import type { SessiondManagedLaunchStatus } from "@platform/library/sessiond-managed-launch-protocol"

/**
 * A session counts as an active game/stream when sessiond reports an active
 * launch in game mode. The coarse `mode` stays "game" across the running /
 * wait-monitor / anchored sub-phases, so `active` presence + game mode is the
 * signal; the hub / idle / home modes are explicitly not a session.
 */
export function isGameSessionActive(
  status: SessiondManagedLaunchStatus | null,
): boolean {
  if (!status) return false
  const active = status.active
  if (!active) return false
  return active.mode === "game"
}

export interface OverlaySessionSnapshot {
  readonly active: boolean
  readonly stream: boolean
}

export interface OverlaySessionProbe {
  /** Re-read the live state; safe to call on a poll interval. */
  readonly refresh: () => Promise<void>
  /** A foreground game/stream session is active. */
  readonly isActive: () => boolean
  /** The active session is a Moonlight stream (vs a local game). */
  readonly isStream: () => boolean
}

export interface OverlaySessionProbeDeps {
  /** Read the current sessiond managed-launch status, or null when unavailable. */
  readonly readStatus: () => Promise<SessiondManagedLaunchStatus | null>
  /** Whether a Moonlight stream client process is currently running. */
  readonly isMoonlightRunning: () => Promise<boolean>
}

export function createOverlaySessionProbe(
  deps: OverlaySessionProbeDeps,
): OverlaySessionProbe {
  let active = false
  let stream = false
  return {
    async refresh() {
      let status: SessiondManagedLaunchStatus | null = null
      try {
        status = await deps.readStatus()
      } catch {
        status = null
      }
      const nextActive = isGameSessionActive(status)
      // Only a live session can be a stream; probe moonlight only when active to
      // avoid scanning /proc on the hub.
      let nextStream = false
      if (nextActive) {
        try {
          nextStream = await deps.isMoonlightRunning()
        } catch {
          nextStream = false
        }
      }
      active = nextActive
      stream = nextStream
    },
    isActive: () => active,
    isStream: () => stream,
  }
}
