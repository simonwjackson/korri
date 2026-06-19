import { sanitizeSteamEvidenceExcerpt } from "./evidence-sanitizer"
import type { SteamLaunchSnapshot, SteamLaunchStatus } from "./launch-state"
import type {
  SteamLogSignal,
  SteamSignalConfidence,
  SteamSignalEvidence,
} from "./log-signals"

export type SteamLifecyclePhase =
  | "preparing"
  | "downloading"
  | "shader-preparing"
  | "install-script"
  | "cloud-sync"
  | "waiting-user-prompt"
  | "creating-process"
  | "waiting-window"
  | "running"
  | "stopping"
  | "cleanup"
  | "stopped"
  | "failed"
  | "stuck"

export type SteamLifecycleStatus =
  | "active"
  | "blocked"
  | "terminal"
  | "failed"
  | "stuck"

export type SteamLifecycleSeverity = "info" | "warning" | "error"

export type SteamLifecycleNextActionHint =
  | "wait"
  | "interact-with-steam"
  | "retry"
  | "inspect-diagnostics"
  | "none"

export const KORRI_STEAM_LIFECYCLE_PROVIDER_ID = "@korri:steam" as const

export interface SteamLifecycleEvent {
  readonly providerId: typeof KORRI_STEAM_LIFECYCLE_PROVIDER_ID
  readonly sequence: number
  readonly observedAt: string
  readonly appId: string
  readonly launchId?: string
  readonly playableId?: string
  readonly phase: SteamLifecyclePhase
  readonly status: SteamLifecycleStatus
  readonly confidence: SteamSignalConfidence
  readonly severity: SteamLifecycleSeverity
  readonly displayMessage: string
  readonly nextActionHint: SteamLifecycleNextActionHint
  readonly source: SteamSignalEvidence["source"]
  readonly evidence: SteamSignalEvidence
  readonly steam: {
    readonly task?: string
    readonly actionId?: string
    readonly appState?: string
    readonly pid?: number
    readonly exitCode?: number
    readonly evidenceKind?: string
  }
}

export interface SteamLifecycleSummary {
  readonly providerId: typeof KORRI_STEAM_LIFECYCLE_PROVIDER_ID
  readonly observerHealth:
    | "unavailable"
    | "starting"
    | "running"
    | "degraded"
    | "stopped"
  readonly lifecycleStatus: SteamLifecycleStatus
  readonly providerPhase: SteamLifecyclePhase
  readonly displayMessage: string
  readonly confidence: SteamSignalConfidence
  readonly nextActionHint: SteamLifecycleNextActionHint
  readonly appId?: string
  readonly launchId?: string
  readonly playableId?: string
  readonly lastProgressAt?: string
}

const RESPONSE_EXCERPT_LIMIT = 240

export function createSteamLifecycleEvent(input: {
  readonly sequence: number
  readonly signal: SteamLogSignal
  readonly snapshot: SteamLaunchSnapshot | undefined
  readonly correlation?: {
    readonly launchId: string
    readonly playableId?: string
  }
}): SteamLifecycleEvent | undefined {
  if (input.signal._tag === "RawEvidence") return undefined
  const appId = "appId" in input.signal ? input.signal.appId : undefined
  if (!appId) return undefined
  const snapshotPhase = phaseFromSnapshot(input.snapshot)
  const phase = phaseFromSignal(input.signal, snapshotPhase)
  const status = lifecycleStatusForPhase(phase)
  const nextActionHint = nextActionHintForPhase(phase)
  const severity = severityForStatus(status)
  const evidence = sanitizeEvidence(input.signal.evidence)

  return omitUndefined({
    providerId: KORRI_STEAM_LIFECYCLE_PROVIDER_ID,
    sequence: input.sequence,
    observedAt: input.signal.evidence.observedAt,
    appId,
    launchId: input.snapshot?.launchId ?? input.correlation?.launchId,
    playableId: input.snapshot?.playableId ?? input.correlation?.playableId,
    phase,
    status,
    confidence: input.signal.evidence.confidence,
    severity,
    displayMessage: messageForPhase(phase, input.signal),
    nextActionHint,
    source: input.signal.evidence.source,
    evidence,
    steam: steamFacet(input.signal, input.snapshot),
  })
}

export function summaryFromSteamSnapshot(input: {
  readonly observerHealth: SteamLifecycleSummary["observerHealth"]
  readonly snapshot?: SteamLaunchSnapshot
}): SteamLifecycleSummary | undefined {
  const { snapshot } = input
  if (!snapshot) return undefined
  const phase = phaseFromSnapshot(snapshot)
  return omitUndefined({
    providerId: KORRI_STEAM_LIFECYCLE_PROVIDER_ID,
    observerHealth: input.observerHealth,
    lifecycleStatus: lifecycleStatusForPhase(phase),
    providerPhase: phase,
    displayMessage: messageForPhase(phase),
    confidence: snapshot.confidence,
    nextActionHint: nextActionHintForPhase(phase),
    appId: snapshot.appId,
    launchId: snapshot.launchId,
    playableId: snapshot.playableId,
    lastProgressAt: snapshot.lastProgressAt,
  })
}

export function clampSteamLifecycleEvents(
  events: readonly SteamLifecycleEvent[],
  limit: number,
): readonly SteamLifecycleEvent[] {
  if (events.length <= limit) return events
  return events.slice(events.length - limit)
}

function phaseFromSignal(
  signal: Exclude<SteamLogSignal, { readonly _tag: "RawEvidence" }>,
  fallback: SteamLifecyclePhase,
): SteamLifecyclePhase {
  switch (signal._tag) {
    case "LaunchTaskChanged":
      return phaseFromTask(signal.task)
    case "InstallScriptProgress":
      return "install-script"
    case "LaunchUserPrompt":
      return signal.prompt === "waiting" ? "waiting-user-prompt" : fallback
    case "ConsoleProcessEvidence":
      return signal.action === "added" || signal.action === "updated"
        ? "creating-process"
        : "stopping"
    case "TrackedPidAdded":
      return "creating-process"
    case "TrackedPidRemoved":
    case "RunningListRemoved":
      return "stopping"
    case "ShaderEvidence":
      return "shader-preparing"
    case "SteamAppStateChanged":
      return signal.running ? "running" : "stopped"
    case "ExecCommandLine":
      return "preparing"
  }
}

function phaseFromSnapshot(
  snapshot: SteamLaunchSnapshot | undefined,
): SteamLifecyclePhase {
  if (!snapshot) return "preparing"
  const taskPhase = snapshot.steam.lastTask
    ? phaseFromTask(snapshot.steam.lastTask)
    : undefined
  if (
    taskPhase &&
    snapshot.status._tag !== "Running" &&
    snapshot.status._tag !== "Stopped"
  )
    return taskPhase
  return phaseFromStatus(snapshot.status)
}

function phaseFromStatus(status: SteamLaunchStatus): SteamLifecyclePhase {
  switch (status._tag) {
    case "Preparing":
      return "preparing"
    case "Launching":
      return "waiting-window"
    case "Running":
      return "running"
    case "Stopping":
      return "stopping"
    case "Stopped":
      return "stopped"
    case "Stuck":
      return "stuck"
  }
}

function phaseFromTask(task: string): SteamLifecyclePhase {
  switch (task) {
    case "CheckShaderDepotManifest":
      return "shader-preparing"
    case "ProcessingInstallScript":
    case "RunningInstallScript":
      return "install-script"
    case "SynchronizingCloud":
    case "SynchronizingStats":
      return "cloud-sync"
    case "ShowInterstitials":
      return "waiting-user-prompt"
    case "CreatingProcess":
      return "creating-process"
    case "WaitingGameWindow":
      return "waiting-window"
    case "Completed":
      return "running"
    default:
      return "preparing"
  }
}

function lifecycleStatusForPhase(
  phase: SteamLifecyclePhase,
): SteamLifecycleStatus {
  switch (phase) {
    case "waiting-user-prompt":
      return "blocked"
    case "stopped":
    case "cleanup":
      return "terminal"
    case "failed":
      return "failed"
    case "stuck":
      return "stuck"
    default:
      return "active"
  }
}

function severityForStatus(
  status: SteamLifecycleStatus,
): SteamLifecycleSeverity {
  if (status === "failed") return "error"
  if (status === "blocked" || status === "stuck") return "warning"
  return "info"
}

function nextActionHintForPhase(
  phase: SteamLifecyclePhase,
): SteamLifecycleNextActionHint {
  switch (phase) {
    case "waiting-user-prompt":
      return "interact-with-steam"
    case "failed":
      return "retry"
    case "stuck":
      return "inspect-diagnostics"
    case "stopped":
    case "cleanup":
    case "running":
      return "none"
    default:
      return "wait"
  }
}

function messageForPhase(
  phase: SteamLifecyclePhase,
  signal?: SteamLogSignal,
): string {
  switch (phase) {
    case "downloading":
      return "Steam is downloading or updating the game."
    case "shader-preparing":
      return "Steam is checking shader cache metadata."
    case "install-script":
      return "Steam is processing install scripts."
    case "cloud-sync":
      return "Steam is synchronizing cloud or stats data."
    case "waiting-user-prompt":
      return "Steam is waiting for a user prompt."
    case "creating-process":
      return "Steam is creating the game process."
    case "waiting-window":
      return "Steam is waiting for the game window."
    case "running":
      return "Steam reports the game is running."
    case "stopping":
      return "Steam is stopping the game process."
    case "cleanup":
      return "Korri is cleaning up Steam launch state."
    case "stopped":
      return "Steam reports the game has stopped."
    case "failed":
      return "Steam launch evidence indicates a failure."
    case "stuck":
      return "Steam launch progress appears stuck."
    case "preparing":
      if (signal && signal._tag === "LaunchTaskChanged")
        return `Steam is running ${sanitizeSteamEvidenceExcerpt(signal.task, { maxLength: 80 })}.`
      return "Steam is preparing the launch."
  }
}

function steamFacet(
  signal: Exclude<SteamLogSignal, { readonly _tag: "RawEvidence" }>,
  snapshot: SteamLaunchSnapshot | undefined,
): SteamLifecycleEvent["steam"] {
  switch (signal._tag) {
    case "LaunchTaskChanged":
      return omitUndefined({ task: signal.task, actionId: signal.actionId })
    case "LaunchUserPrompt":
      return omitUndefined({ task: signal.task, actionId: signal.actionId })
    case "SteamAppStateChanged":
      return omitUndefined({ appState: signal.appState })
    case "TrackedPidAdded":
      return omitUndefined({ pid: signal.pid })
    case "TrackedPidRemoved":
      return omitUndefined({ pid: signal.pid, exitCode: signal.exitCode })
    case "ConsoleProcessEvidence":
      return omitUndefined({ pid: signal.procId })
    case "ShaderEvidence":
      return omitUndefined({ evidenceKind: signal.evidenceKind })
    case "InstallScriptProgress":
      return omitUndefined({
        task: snapshot?.steam.lastTask ?? "InstallScript",
      })
    case "RunningListRemoved":
    case "ExecCommandLine":
      return omitUndefined({ task: snapshot?.steam.lastTask })
  }
}

function sanitizeEvidence(evidence: SteamSignalEvidence): SteamSignalEvidence {
  return {
    ...evidence,
    logFile: sanitizeSteamEvidenceExcerpt(evidence.logFile, {
      maxLength: RESPONSE_EXCERPT_LIMIT,
    }),
    excerpt: sanitizeSteamEvidenceExcerpt(evidence.excerpt, {
      maxLength: RESPONSE_EXCERPT_LIMIT,
    }),
  }
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}
