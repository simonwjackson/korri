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

export const KORRI_STREAM_METADATA_PROVIDER_ID = "@korri:stream"

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
  readonly sourceControlUrl?: string
}

export interface OverlaySessionProbe {
  /** Re-read the live state; safe to call on a poll interval. */
  readonly refresh: () => Promise<void>
  /** A foreground game/stream session is active. */
  readonly isActive: () => boolean
  /** The active session is a Moonlight stream (vs a local game). */
  readonly isStream: () => boolean
  /** Remote-source control URL for the active stream, when sessiond advertised it. */
  readonly sourceControlUrl: () => string | undefined
  /** The active session's game is frozen (local phase, or host state for streams). */
  readonly isFrozen: () => boolean
  /** Freeze/resume can be offered for the active session. */
  readonly freezeAvailable: () => boolean
  /** Active managed launch id from the last refresh, when one exists. */
  readonly activeLaunchId: () => string | undefined
  /**
   * Record the outcome of a remote freeze/thaw so the toggle reflects it
   * immediately instead of waiting for the next host read.
   */
  readonly noteRemoteFrozen: (frozen: boolean) => void
}

export interface OverlaySessionProbeDeps {
  /** Read the current sessiond managed-launch status, or null when unavailable. */
  readonly readStatus: () => Promise<SessiondManagedLaunchStatus | null>
  /** Whether a Moonlight stream client process is currently running. */
  readonly isMoonlightRunning: () => Promise<boolean>
  /**
   * Read the stream host's freeze capability and frozen state via its
   * controlUrl. Returns null when unknown (unreachable); the probe then keeps
   * the last known outcome. Optional: without it, stream frozen state relies
   * solely on noteRemoteFrozen and availability on controlUrl presence.
   */
  readonly readRemoteFreeze?: (controlUrl: string) => Promise<{
    readonly freezeCapable: boolean
    readonly frozen: boolean | null
  } | null>
}

export function createOverlaySessionProbe(
  deps: OverlaySessionProbeDeps,
): OverlaySessionProbe {
  let active = false
  let stream = false
  let sourceControlUrl: string | undefined
  let frozen = false
  let freezeAvailable = false
  let activeLaunchId: string | undefined
  // Streams: last known host frozen state and freeze capability, kept across
  // refreshes when the host read is unavailable or answers unknown (null).
  let remoteFrozen = false
  let remoteFreezeCapable: boolean | undefined
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
      activeLaunchId = nextActive ? status?.active?.launchId : undefined
      sourceControlUrl =
        nextActive && nextStream
          ? streamSourceControlUrlFromStatus(status)
          : undefined

      if (!nextActive) {
        frozen = false
        freezeAvailable = false
        remoteFrozen = false
        remoteFreezeCapable = undefined
        return
      }
      if (nextStream) {
        // The local phase describes the Moonlight client, not the host game.
        // Read the host's capability + frozen state when a reader is wired;
        // keep the last known outcome when the host answers unknown. The
        // option requires a reachable control URL, and a host that does not
        // advertise "session.freeze" (older build) hides the toggle. Until
        // the first successful read, capability is optimistic -- the action
        // path degrades gracefully on unsupported hosts.
        if (deps.readRemoteFreeze && sourceControlUrl) {
          try {
            const remote = await deps.readRemoteFreeze(sourceControlUrl)
            if (remote !== null) {
              remoteFreezeCapable = remote.freezeCapable
              if (remote.frozen !== null) remoteFrozen = remote.frozen
            }
          } catch {
            // Keep last known outcome.
          }
        }
        freezeAvailable =
          sourceControlUrl !== undefined && (remoteFreezeCapable ?? true)
        frozen = remoteFrozen
        return
      }
      freezeAvailable = status?.capabilities.launchFreeze === true
      frozen = freezeAvailable && status?.active?.phase === "frozen"
      remoteFrozen = false
      remoteFreezeCapable = undefined
    },
    isActive: () => active,
    isStream: () => stream,
    sourceControlUrl: () => sourceControlUrl,
    isFrozen: () => frozen,
    freezeAvailable: () => freezeAvailable,
    activeLaunchId: () => activeLaunchId,
    noteRemoteFrozen(nextFrozen) {
      remoteFrozen = nextFrozen
      if (stream) frozen = nextFrozen
    },
  }
}

export function streamSourceControlUrlFromStatus(
  status: SessiondManagedLaunchStatus | null,
): string | undefined {
  const annotation =
    status?.active?.launchMetadata?.annotations?.[
      KORRI_STREAM_METADATA_PROVIDER_ID
    ]
  if (!isRecord(annotation)) return undefined
  const controlUrl = annotation.controlUrl
  if (typeof controlUrl !== "string") return undefined
  const trimmed = controlUrl.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
