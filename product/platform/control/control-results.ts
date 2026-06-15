import type { LaunchFailureKind, LaunchSpec } from "@platform/library/launcher"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import type {
  SessiondManagedLaunchMode,
  SessiondManagedLaunchPhase,
} from "@platform/library/sessiond-managed-launch-protocol"

export type ControlCliOutcomeClass =
  | "success"
  | "usage"
  | "not-found"
  | "configuration"
  | "host-unavailable"
  | "failed"

export interface ControlResultSemantics {
  readonly cliOutcome: ControlCliOutcomeClass
  readonly piIsError: boolean
  readonly mutates: boolean
  readonly requiresConfirmation: boolean
}

export interface ControlGameSummary {
  readonly id: string
  readonly title?: string
  readonly sourceId?: string
}

export interface ControlLaunchSelection {
  readonly id: string
  readonly releaseId?: string
  readonly appId?: string
  readonly userId?: string
  readonly profileId?: string
}

export type ControlListGamesResult =
  | {
      readonly _tag: "GamesListed"
      readonly games: readonly PlayableLibraryEntry[]
    }
  | { readonly _tag: "ListGamesUnavailable"; readonly message?: string }

export type ControlFindGameResult =
  | {
      readonly _tag: "GameFound"
      readonly game: PlayableLibraryEntry
      readonly match: "exact-id" | "id" | "title"
    }
  | {
      readonly _tag: "AmbiguousGame"
      readonly query: string
      readonly candidates: readonly ControlGameSummary[]
    }
  | {
      readonly _tag: "GameNotFound"
      readonly query: string
      readonly candidates: readonly ControlGameSummary[]
    }
  | { readonly _tag: "HostUnavailable"; readonly message?: string }
  | { readonly _tag: "MissingQuery" }

export type ControlSessionReadiness =
  | { readonly _tag: "SessionReady"; readonly mode?: SessiondManagedLaunchMode }
  | { readonly _tag: "SessionBusy"; readonly mode: SessiondManagedLaunchMode }
  | { readonly _tag: "SessiondNotConfigured" }
  | { readonly _tag: "HostUnavailable"; readonly message?: string }

export type ControlDryRunLaunchResult =
  | {
      readonly _tag: "LaunchDryRunOk"
      readonly selection: ControlLaunchSelection
      readonly spec: LaunchSpec
      readonly readiness: ControlSessionReadiness
      readonly caveats: readonly string[]
    }
  | {
      readonly _tag: "LaunchConfigFailed"
      readonly selection: ControlLaunchSelection
      readonly message: string
      readonly diagnostic?: string
    }
  | { readonly _tag: "HostUnavailable"; readonly message?: string }
  | Extract<ControlFindGameResult, { readonly _tag: "GameNotFound" }>

export type ControlLaunchResult =
  | { readonly _tag: "Launched"; readonly selection: ControlLaunchSelection }
  | {
      readonly _tag: "PreflightRejected"
      readonly selection: ControlLaunchSelection
      readonly message: string
    }
  | {
      readonly _tag: "DaemonRejected"
      readonly selection: ControlLaunchSelection
      readonly message: string
    }
  | {
      readonly _tag: "HostUnavailable"
      readonly selection: ControlLaunchSelection
      readonly message: string
    }
  | {
      readonly _tag: "LaunchFailed"
      readonly selection: ControlLaunchSelection
      readonly exitCode: number
      readonly failureKind?: LaunchFailureKind
      readonly stderrTail?: string
    }
  | Extract<ControlDryRunLaunchResult, { readonly _tag: "LaunchConfigFailed" }>
  | Extract<ControlFindGameResult, { readonly _tag: "GameNotFound" }>

export interface ControlSessionActive {
  readonly launchId: string
  readonly mode: SessiondManagedLaunchMode
  readonly phase?: SessiondManagedLaunchPhase
  readonly gameId?: string
  readonly title?: string
}

export type ControlSessionStatusResult =
  | {
      readonly _tag: "SessionStatus"
      readonly configured: true
      readonly mode: SessiondManagedLaunchMode
      readonly active?: ControlSessionActive
      readonly restoreAttempts: number
      readonly failureReason?: string
    }
  | { readonly _tag: "SessiondNotConfigured" }
  | { readonly _tag: "HostUnavailable"; readonly message?: string }

export type ControlStopSessionResult =
  | {
      readonly _tag: "Stopped"
      readonly launchId: string
      readonly force: boolean
    }
  | {
      readonly _tag: "StopPending"
      readonly launchId: string
      readonly force: boolean
      readonly mode?: SessiondManagedLaunchMode
      readonly phase?: SessiondManagedLaunchPhase
      readonly message?: string
    }
  | { readonly _tag: "NothingToStop" }
  | { readonly _tag: "SessiondNotConfigured" }
  | { readonly _tag: "HostUnavailable"; readonly message?: string }
  | {
      readonly _tag: "ConfirmationRequired"
      readonly action: "stop-session" | "force-stop-session"
    }

export type ControlDaemonStatusResult =
  | {
      readonly _tag: "DaemonAvailable"
      readonly serverId: string
      readonly displayName: string
    }
  | { readonly _tag: "DaemonUnavailable"; readonly message: string }

export type ControlStreamRuntimeSettingsStatusResult =
  | { readonly _tag: "StreamRuntimeSettingsAvailable"; readonly state: unknown }
  | {
      readonly _tag: "StreamRuntimeSettingsUnavailable"
      readonly message: string
    }

export type ControlResult =
  | ControlListGamesResult
  | ControlFindGameResult
  | ControlDryRunLaunchResult
  | ControlLaunchResult
  | ControlSessionStatusResult
  | ControlStopSessionResult
  | ControlDaemonStatusResult
  | ControlStreamRuntimeSettingsStatusResult

export function semanticsForControlResult(
  result: ControlResult,
): ControlResultSemantics {
  switch (result._tag) {
    case "GamesListed":
    case "GameFound":
    case "LaunchDryRunOk":
    case "Launched":
    case "SessionStatus":
    case "Stopped":
    case "NothingToStop":
    case "DaemonAvailable":
    case "StreamRuntimeSettingsAvailable":
      return successSemantics(
        result._tag === "Launched" || result._tag === "Stopped",
      )
    case "AmbiguousGame":
    case "MissingQuery":
    case "ConfirmationRequired":
      return {
        cliOutcome: "usage",
        piIsError: true,
        mutates: false,
        requiresConfirmation: result._tag === "ConfirmationRequired",
      }
    case "GameNotFound":
      return failureSemantics("not-found")
    case "LaunchConfigFailed":
      return failureSemantics("configuration")
    case "StopPending":
    case "HostUnavailable":
    case "ListGamesUnavailable":
    case "SessiondNotConfigured":
    case "DaemonUnavailable":
    case "StreamRuntimeSettingsUnavailable":
      return failureSemantics("host-unavailable")
    case "PreflightRejected":
    case "DaemonRejected":
    case "LaunchFailed":
      return failureSemantics("failed")
  }
}

function successSemantics(mutates: boolean): ControlResultSemantics {
  return {
    cliOutcome: "success",
    piIsError: false,
    mutates,
    requiresConfirmation: mutates,
  }
}

function failureSemantics(
  cliOutcome: ControlCliOutcomeClass,
): ControlResultSemantics {
  return {
    cliOutcome,
    piIsError: true,
    mutates: false,
    requiresConfirmation: false,
  }
}
