import type { ForegroundSessionStatusSnapshot } from "@platform/stream/foreground-session-status"
import type {
  SessiondManagedLaunchCapabilities,
  SessiondManagedLaunchMode,
  SessiondManagedLaunchPhase,
  SessiondManagedLaunchStatus,
} from "./sessiond-managed-launch-protocol"

export interface SessiondManagedLaunchStatusProjectionInput {
  readonly mode: SessiondManagedLaunchMode
  readonly idleModeLabel: "home" | "idle"
  readonly active?: {
    readonly launchId: string
    readonly mode: SessiondManagedLaunchMode
  }
  readonly phase?: SessiondManagedLaunchPhase
  readonly failureReason?: string
  readonly restoreAttempts: number
  readonly capabilities: SessiondManagedLaunchCapabilities
}

export interface SessiondLifecycleActiveProjection {
  readonly launchId: string
  readonly mode: SessiondManagedLaunchMode
  readonly phase?: SessiondManagedLaunchPhase
}

export interface SessiondLifecycleSummaryProjection {
  readonly mode: SessiondManagedLaunchMode
  readonly active?: SessiondLifecycleActiveProjection
  readonly restoreAttempts: number
  readonly failureReason?: string
}

export function projectManagedLaunchStatus(
  input: SessiondManagedLaunchStatusProjectionInput,
): SessiondManagedLaunchStatus {
  return {
    schemaVersion: 1,
    mode: roleAwareMode(input.mode, input.idleModeLabel),
    capabilities: input.capabilities,
    ...(input.active
      ? {
          active: {
            launchId: input.active.launchId,
            mode: roleAwareMode(input.active.mode, input.idleModeLabel),
            ...(input.phase ? { phase: input.phase } : {}),
          },
        }
      : {}),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    restoreAttempts: input.restoreAttempts,
  }
}

export function projectSessiondLifecycleSummary(
  status: SessiondManagedLaunchStatus,
  options: { readonly failureReason?: (value: string) => string } = {},
): SessiondLifecycleSummaryProjection {
  return {
    mode: status.mode,
    restoreAttempts: status.restoreAttempts,
    ...(status.active
      ? {
          active: {
            launchId: status.active.launchId,
            mode: status.active.mode,
            ...(status.active.phase ? { phase: status.active.phase } : {}),
          },
        }
      : {}),
    ...(status.failureReason
      ? {
          failureReason: options.failureReason
            ? options.failureReason(status.failureReason)
            : status.failureReason,
        }
      : {}),
  }
}

export function snapshotStateFromSessiondMode(
  mode: SessiondManagedLaunchMode,
): ForegroundSessionStatusSnapshot["state"] {
  switch (mode) {
    case "home":
    case "idle":
    case "starting":
    case "stopped":
      return "IdleReady"
    case "launching":
      return "Spawning"
    case "game":
      return "Running"
    case "restoring":
      return "TearingDown"
    case "recovering":
      return "Recovering"
  }
}

export function projectForegroundSessionStatusSnapshot(options: {
  readonly sessiond: SessiondLifecycleSummaryProjection | undefined
  readonly serverTimestamp?: string
}): ForegroundSessionStatusSnapshot {
  const serverTimestamp = options.serverTimestamp ?? new Date().toISOString()
  if (!options.sessiond) {
    return {
      schemaVersion: 1,
      serverTimestamp,
      state: "IdleReady",
      recentEvents: [],
    }
  }

  const sessiond = options.sessiond
  const active = sessiond.active
    ? {
        requestId: sessiond.active.launchId,
        gameId: sessiond.active.launchId,
      }
    : undefined

  return {
    schemaVersion: 1,
    serverTimestamp,
    state: snapshotStateFromSessiondMode(sessiond.mode),
    ...(active ? { active } : {}),
    recentEvents: [],
    ...(sessiond.failureReason
      ? {
          lastFailure: {
            stage: "sessiond",
            message: sessiond.failureReason,
          },
        }
      : {}),
  }
}

function roleAwareMode(
  mode: SessiondManagedLaunchMode,
  idleModeLabel: "home" | "idle",
): SessiondManagedLaunchMode {
  return mode === "home" ? idleModeLabel : mode
}
