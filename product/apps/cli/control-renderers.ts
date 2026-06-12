import type {
  ControlDryRunLaunchResult,
  ControlFindGameResult,
  ControlLaunchResult,
  ControlListGamesResult,
  ControlSessionReadiness,
  ControlSessionStatusResult,
  ControlStopSessionResult,
} from "@platform/control/control-results"

export function renderGamesList(result: ControlListGamesResult): string {
  if (result._tag === "ListGamesUnavailable") {
    return `games unavailable${result.message ? `: ${result.message}` : ""}`
  }
  if (result.games.length === 0) return "no games found"
  return result.games
    .map(game => `${game.id}${game.title ? `\t${game.title}` : ""}`)
    .join("\n")
}

export function gamesListExitCode(result: ControlListGamesResult): number {
  return result._tag === "ListGamesUnavailable" ? 124 : 0
}

export function renderFindGame(result: ControlFindGameResult): string {
  switch (result._tag) {
    case "GameFound":
      return `${result.game.id}${result.game.title ? `\t${result.game.title}` : ""}`
    case "AmbiguousGame":
      return [
        `ambiguous game query: ${result.query}`,
        ...result.candidates.map(
          candidate =>
            `  ${candidate.id}${candidate.title ? `\t${candidate.title}` : ""}`,
        ),
      ].join("\n")
    case "GameNotFound":
      return `game not found: ${result.query}`
    case "HostUnavailable":
      return `games unavailable${result.message ? `: ${result.message}` : ""}`
    case "MissingQuery":
      return "game query is required"
  }
}

export function gameFindExitCode(result: ControlFindGameResult): number {
  switch (result._tag) {
    case "GameFound":
      return 0
    case "MissingQuery":
    case "AmbiguousGame":
      return 64
    case "GameNotFound":
      return 2
    case "HostUnavailable":
      return 124
  }
}

export function renderDryRunLaunch(result: ControlDryRunLaunchResult): string {
  switch (result._tag) {
    case "LaunchDryRunOk":
      return [
        `dry-run ok: ${result.selection.id}`,
        `command: ${shellLine(result.spec.command, result.spec.args)}`,
        `readiness: ${renderSessionReadiness(result.readiness)}`,
        ...result.caveats.map(caveat => `caveat: ${caveat}`),
      ].join("\n")
    case "LaunchConfigFailed":
      return `launch configuration failed: ${result.message}`
    case "HostUnavailable":
      return `host unavailable${result.message ? `: ${result.message}` : ""}`
    case "GameNotFound":
      return `game not found: ${result.query}`
  }
}

export function dryRunLaunchExitCode(
  result: ControlDryRunLaunchResult,
): number {
  switch (result._tag) {
    case "LaunchDryRunOk":
      return 0
    case "LaunchConfigFailed":
      return 78
    case "HostUnavailable":
      return 124
    case "GameNotFound":
      return 2
  }
}

export function renderLaunchGame(result: ControlLaunchResult): string {
  switch (result._tag) {
    case "Launched":
      return `launched: ${result.selection.id}`
    case "PreflightRejected":
    case "DaemonRejected":
    case "HostUnavailable":
      return `${launchFailureLabel(result._tag)}: ${result.message}`
    case "LaunchFailed":
      return `launch failed: exit=${result.exitCode}${result.stderrTail ? ` ${result.stderrTail}` : ""}`
    case "LaunchConfigFailed":
      return `launch configuration failed: ${result.message}`
    case "GameNotFound":
      return `game not found: ${result.query}`
  }
}

export function launchGameExitCode(result: ControlLaunchResult): number {
  switch (result._tag) {
    case "Launched":
      return 0
    case "GameNotFound":
      return 2
    case "HostUnavailable":
      return 124
    case "LaunchConfigFailed":
      return 78
    case "PreflightRejected":
    case "DaemonRejected":
      return 121
    case "LaunchFailed":
      return result.exitCode
  }
}

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

function renderSessionReadiness(result: ControlSessionReadiness): string {
  switch (result._tag) {
    case "SessionReady":
      return result.mode ? `ready (${result.mode})` : "ready"
    case "SessionBusy":
      return `busy (${result.mode})`
    case "SessiondNotConfigured":
      return "sessiond not configured"
    case "HostUnavailable":
      return `unavailable${result.message ? `: ${result.message}` : ""}`
  }
}

function shellLine(command: string, args: readonly string[]): string {
  return [command, ...args].map(shellToken).join(" ")
}

function shellToken(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : JSON.stringify(value)
}

function launchFailureLabel(tag: ControlLaunchResult["_tag"]): string {
  switch (tag) {
    case "PreflightRejected":
      return "launch preflight rejected"
    case "DaemonRejected":
      return "launch daemon rejected"
    case "HostUnavailable":
      return "host unavailable"
    default:
      return "launch failed"
  }
}
