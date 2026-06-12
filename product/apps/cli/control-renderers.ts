import type {
  ControlSessionStatusResult,
  ControlStopSessionResult,
} from "@platform/control/control-results"

export function renderSessionStatus(
  result: ControlSessionStatusResult,
): string {
  switch (result._tag) {
    case "SessionStatus": {
      const active = result.active
        ? ` active=${result.active.launchId}`
        : " active=none"
      return `sessiond configured mode=${result.mode}${active} restoreAttempts=${result.restoreAttempts}`
    }
    case "SessiondNotConfigured":
      return "sessiond not configured"
    case "HostUnavailable":
      return `sessiond unavailable${result.message ? `: ${result.message}` : ""}`
  }
}

export function sessionStatusExitCode(
  result: ControlSessionStatusResult,
): number {
  return result._tag === "HostUnavailable" ? 124 : 0
}

export function sessionStopExitCode(result: ControlStopSessionResult): number {
  switch (result._tag) {
    case "Stopped":
    case "NothingToStop":
      return 0
    case "HostUnavailable":
      return 124
    case "ConfirmationRequired":
      return 64
    case "SessiondNotConfigured":
      return 2
  }
}

export function renderStopSession(result: ControlStopSessionResult): string {
  switch (result._tag) {
    case "Stopped":
      return result.force
        ? `force stop requested for ${result.launchId}`
        : `stop requested for ${result.launchId}`
    case "NothingToStop":
      return "no active session to stop"
    case "SessiondNotConfigured":
      return "sessiond not configured"
    case "HostUnavailable":
      return `sessiond unavailable${result.message ? `: ${result.message}` : ""}`
    case "ConfirmationRequired":
      return result.action === "force-stop-session"
        ? "force stop requires --yes"
        : "stop requires --yes"
  }
}
