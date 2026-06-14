import { clampSteamEvidenceArray } from "./steam-evidence-sanitizer"
import type {
  SteamLogSignal,
  SteamLogSource,
  SteamSignalConfidence,
  SteamSignalEvidence,
} from "./steam-log-signals"

export type SteamLaunchStatus =
  | { readonly _tag: "Preparing" }
  | { readonly _tag: "Launching" }
  | { readonly _tag: "Running" }
  | { readonly _tag: "Stopping" }
  | { readonly _tag: "Stopped" }
  | { readonly _tag: "Stuck" }

export type SteamObservationOwnership = "korri-correlated" | "steam-only"

export interface SteamRemovedPid {
  readonly pid: number
  readonly exitCode: number
}

export interface SteamLaunchFacet {
  readonly appState?: string
  readonly running?: boolean
  readonly actionId?: string
  readonly lastTask?: string
  readonly taskHistory: readonly string[]
  readonly trackedPids: readonly number[]
  readonly removedPids: readonly SteamRemovedPid[]
  readonly commandExcerpt?: string
}

export interface SteamLaunchSnapshot {
  readonly appId: string
  readonly status: SteamLaunchStatus
  readonly confidence: SteamSignalConfidence
  readonly ownership: SteamObservationOwnership
  readonly firstObservedAt: string
  readonly lastObservedAt: string
  readonly lastProgressAt: string
  readonly steam: SteamLaunchFacet
  readonly evidence: readonly SteamSignalEvidence[]
}

export interface SteamLaunchObserverState {
  readonly active?: SteamLaunchSnapshot
  readonly latest?: SteamLaunchSnapshot
  readonly recentEvidence: readonly SteamSignalEvidence[]
}

export interface SteamReducerOptions {
  readonly evidenceLimit?: number
}

export interface SteamProjectionOptions {
  readonly now: string
  readonly stuckThresholdMs: number
}

export const initialSteamLaunchObserverState: SteamLaunchObserverState = {
  recentEvidence: [],
}

const SOURCE_PRIORITY: Record<SteamLogSource, number> = {
  content_log: 0,
  gameprocess_log: 1,
  console_log: 2,
  shader_log: 3,
  compat_log: 4,
  appinfo_log: 5,
  guest_log: 6,
  wrapper_log: 7,
  auxiliary_log: 8,
}

export function sortSteamLogSignalsForReplay(
  signals: readonly SteamLogSignal[],
): readonly SteamLogSignal[] {
  return [...signals].sort((left, right) => {
    const leftTime = signalTime(left)
    const rightTime = signalTime(right)
    if (leftTime !== rightTime) return leftTime.localeCompare(rightTime)
    const leftPriority = SOURCE_PRIORITY[left.evidence.source]
    const rightPriority = SOURCE_PRIORITY[right.evidence.source]
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return left.evidence.sequence - right.evidence.sequence
  })
}

export function reduceSteamLogSignals(
  state: SteamLaunchObserverState,
  signals: readonly SteamLogSignal[],
  options: SteamReducerOptions = {},
): SteamLaunchObserverState {
  return signals.reduce(
    (next, signal) => reduceSteamLogSignal(next, signal, options),
    state,
  )
}

export function reduceSteamLogSignal(
  state: SteamLaunchObserverState,
  signal: SteamLogSignal,
  options: SteamReducerOptions = {},
): SteamLaunchObserverState {
  const evidenceLimit = options.evidenceLimit ?? 50
  const recentEvidence = appendEvidence(
    state.recentEvidence,
    signal.evidence,
    evidenceLimit,
  )

  if (signal._tag === "RawEvidence") return { ...state, recentEvidence }

  const appId = "appId" in signal ? signal.appId : undefined
  if (!appId) return { ...state, recentEvidence }

  const current = pickWindow(state, appId, signal)
  if (!current && isContextOnlySignal(signal)) {
    return { ...state, recentEvidence }
  }
  const updated = applySignalToSnapshot(current, signal, evidenceLimit)

  if (updated.status._tag === "Stopped") {
    const active =
      state.active?.appId === updated.appId ? undefined : state.active
    return active
      ? { active, latest: updated, recentEvidence }
      : { latest: updated, recentEvidence }
  }
  return { active: updated, latest: updated, recentEvidence }
}

export function projectSteamLaunchSnapshot(
  snapshot: SteamLaunchSnapshot | undefined,
  options: SteamProjectionOptions,
): SteamLaunchSnapshot | undefined {
  if (!snapshot) return undefined
  if (
    snapshot.status._tag !== "Preparing" &&
    snapshot.status._tag !== "Launching"
  ) {
    return snapshot
  }
  const now = Date.parse(options.now)
  const lastProgress = Date.parse(snapshot.lastProgressAt)
  if (!Number.isFinite(now) || !Number.isFinite(lastProgress)) return snapshot
  if (now - lastProgress < options.stuckThresholdMs) return snapshot
  return { ...snapshot, status: { _tag: "Stuck" } }
}

// fallow-ignore-next-line complexity
function applySignalToSnapshot(
  snapshot: SteamLaunchSnapshot | undefined,
  signal: Exclude<SteamLogSignal, { readonly _tag: "RawEvidence" }>,
  evidenceLimit: number,
): SteamLaunchSnapshot {
  const base = snapshot ?? createSnapshot(signal)
  const evidence = appendEvidence(base.evidence, signal.evidence, evidenceLimit)
  const observedAt = signal.evidence.observedAt
  const steam = { ...base.steam }
  let status = base.status
  let confidence = base.confidence
  let lastProgressAt = base.lastProgressAt

  const preserveStopped =
    base.status._tag === "Stopped" && !isNewLaunchSignal(signal)

  switch (signal._tag) {
    case "SteamAppStateChanged": {
      steam.appState = signal.appState
      steam.running = signal.running
      confidence = signal.running || baseHasProgress(base) ? "confirmed" : "low"
      status = signal.running
        ? { _tag: "Running" }
        : baseHasProgress(base)
          ? { _tag: "Stopped" }
          : { _tag: "Stopped" }
      lastProgressAt = observedAt
      break
    }
    case "TrackedPidAdded": {
      steam.trackedPids = addUniqueBounded(steam.trackedPids, signal.pid, 50)
      if (signal.commandExcerpt) steam.commandExcerpt = signal.commandExcerpt
      if (!preserveStopped && status._tag !== "Running")
        status = { _tag: "Launching" }
      lastProgressAt = observedAt
      break
    }
    case "TrackedPidRemoved": {
      steam.trackedPids = steam.trackedPids.filter(pid => pid !== signal.pid)
      steam.removedPids = addRemovedPid(steam.removedPids, {
        pid: signal.pid,
        exitCode: signal.exitCode,
      })
      if (
        !preserveStopped &&
        base.status._tag !== "Stopped" &&
        baseHasProgress(base)
      ) {
        status = { _tag: "Stopping" }
      }
      lastProgressAt = observedAt
      break
    }
    case "RunningListRemoved": {
      if (
        !preserveStopped &&
        base.status._tag !== "Stopped" &&
        baseHasProgress(base)
      ) {
        status = { _tag: "Stopping" }
      }
      lastProgressAt = observedAt
      break
    }
    case "ExecCommandLine": {
      steam.commandExcerpt = signal.commandExcerpt
      if (!preserveStopped && status._tag !== "Running")
        status = { _tag: "Preparing" }
      lastProgressAt = observedAt
      break
    }
    case "LaunchTaskChanged": {
      steam.actionId = signal.actionId
      steam.lastTask = signal.task
      steam.taskHistory = addUniqueBounded(steam.taskHistory, signal.task, 20)
      if (!preserveStopped && status._tag !== "Running")
        status = { _tag: signal.projection }
      lastProgressAt = observedAt
      break
    }
    case "InstallScriptProgress": {
      if (!preserveStopped && status._tag !== "Running")
        status = { _tag: "Preparing" }
      lastProgressAt = observedAt
      break
    }
    case "LaunchUserPrompt": {
      steam.actionId = signal.actionId
      steam.lastTask = signal.task || steam.lastTask
      if (!preserveStopped && status._tag !== "Running")
        status = { _tag: "Launching" }
      lastProgressAt = observedAt
      break
    }
    case "ConsoleProcessEvidence": {
      if (signal.commandExcerpt) steam.commandExcerpt = signal.commandExcerpt
      if (!preserveStopped && status._tag !== "Running")
        status = { _tag: "Launching" }
      lastProgressAt = observedAt
      break
    }
    case "ShaderEvidence": {
      break
    }
  }

  return omitUndefined({
    ...base,
    status,
    confidence,
    lastObservedAt: observedAt,
    lastProgressAt,
    steam,
    evidence,
  })
}

function createSnapshot(
  signal: Exclude<SteamLogSignal, { readonly _tag: "RawEvidence" }>,
): SteamLaunchSnapshot {
  const observedAt = signal.evidence.observedAt
  return {
    appId: "appId" in signal ? (signal.appId ?? "unknown") : "unknown",
    status: { _tag: "Preparing" },
    confidence: signal.evidence.confidence,
    ownership: "steam-only",
    firstObservedAt: observedAt,
    lastObservedAt: observedAt,
    lastProgressAt: observedAt,
    steam: {
      taskHistory: [],
      trackedPids: [],
      removedPids: [],
    },
    evidence: [],
  }
}

function pickWindow(
  state: SteamLaunchObserverState,
  appId: string,
  signal: SteamLogSignal,
): SteamLaunchSnapshot | undefined {
  if (state.active?.appId === appId) return state.active
  if (state.latest?.appId === appId) {
    if (state.latest.status._tag === "Stopped" && isNewLaunchSignal(signal)) {
      return undefined
    }
    return state.latest
  }
  if (
    signal._tag === "TrackedPidRemoved" ||
    signal._tag === "RunningListRemoved"
  ) {
    return undefined
  }
  return undefined
}

function isNewLaunchSignal(signal: SteamLogSignal): boolean {
  return (
    signal._tag === "ExecCommandLine" ||
    signal._tag === "LaunchTaskChanged" ||
    signal._tag === "InstallScriptProgress"
  )
}

function isContextOnlySignal(signal: SteamLogSignal): boolean {
  return (
    signal._tag === "TrackedPidRemoved" ||
    signal._tag === "RunningListRemoved" ||
    signal._tag === "ShaderEvidence"
  )
}

function appendEvidence(
  evidence: readonly SteamSignalEvidence[],
  next: SteamSignalEvidence,
  limit: number,
): readonly SteamSignalEvidence[] {
  const deduped = evidence.some(
    existing =>
      existing.source === next.source &&
      existing.logFile === next.logFile &&
      existing.sequence === next.sequence &&
      existing.excerpt === next.excerpt,
  )
    ? evidence
    : [...evidence, next]
  return clampSteamEvidenceArray(deduped, limit)
}

function addUniqueBounded<T>(
  values: readonly T[],
  next: T,
  limit: number,
): readonly T[] {
  const updated = values.includes(next) ? values : [...values, next]
  return updated.length > limit
    ? updated.slice(updated.length - limit)
    : updated
}

function addRemovedPid(
  values: readonly SteamRemovedPid[],
  next: SteamRemovedPid,
): readonly SteamRemovedPid[] {
  const updated = values.some(value => value.pid === next.pid)
    ? values
    : [...values, next]
  return updated.length > 50 ? updated.slice(updated.length - 50) : updated
}

function baseHasProgress(snapshot: SteamLaunchSnapshot): boolean {
  return (
    snapshot.status._tag !== "Preparing" ||
    snapshot.steam.taskHistory.length > 0 ||
    snapshot.steam.trackedPids.length > 0 ||
    snapshot.steam.removedPids.length > 0 ||
    snapshot.steam.running === true
  )
}

function signalTime(signal: SteamLogSignal): string {
  return signal.evidence.steamTimestamp ?? signal.evidence.observedAt
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}
