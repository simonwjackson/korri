import { logger } from "@platform/logger"
import { sanitizeSteamEvidenceExcerpt } from "./evidence-sanitizer"
import {
  initialSteamLaunchObserverState,
  projectSteamLaunchSnapshot,
  reduceSteamLogSignal,
  type SteamLaunchCorrelation,
  type SteamLaunchObserverState,
  type SteamLaunchSnapshot,
} from "./launch-state"
import {
  clampSteamLifecycleEvents,
  createSteamLifecycleEvent,
  type SteamLifecycleEvent,
  type SteamLifecycleSummary,
  summaryFromSteamSnapshot,
} from "./lifecycle-events"
import { parseSteamLogLine, type SteamRawLogLine } from "./log-signals"
import {
  createSteamLogTailer,
  DEFAULT_STEAM_LOG_FILES,
  type SteamLogTailerStatus,
  type TailedSteamLogLine,
} from "./log-tailer"

export interface SteamObserverHealth {
  readonly state:
    | "unavailable"
    | "starting"
    | "running"
    | "degraded"
    | "stopped"
  readonly logDir?: string
  readonly watchedFiles: readonly string[]
  readonly activeFiles: readonly string[]
  readonly missingFiles: readonly string[]
  readonly lastError?: string
  readonly lastLineAt?: string
}

export interface SteamObserverStatus {
  readonly health: SteamObserverHealth
  readonly active?: SteamLaunchSnapshot
  readonly latest?: SteamLaunchSnapshot
  readonly recentEvidence: SteamLaunchObserverState["recentEvidence"]
  readonly lifecycleEvents?: readonly SteamLifecycleEvent[]
  readonly lifecycleSummary?: SteamLifecycleSummary
}

export interface SteamObserverTailer {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
  readonly status: () => Pick<
    SteamLogTailerStatus,
    | "state"
    | "logDir"
    | "watchedFiles"
    | "activeFiles"
    | "missingFiles"
    | "lastError"
  >
}

export interface CreateSteamObserverTailerOptions {
  readonly logDir: string
  readonly files: readonly string[]
  readonly onLine: (line: TailedSteamLogLine) => void
}

export interface SteamLogObserverHandle {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
  readonly status: () => SteamObserverStatus
  readonly ingestLine: (line: SteamRawLogLine) => void
  readonly openCorrelation: (correlation: SteamLaunchCorrelation) => void
  readonly collectLifecycle: (
    input?: SteamLifecycleCollectInput,
  ) => SteamLifecycleCollectResult
}

export interface SteamLifecycleCollectInput {
  readonly appId?: string
  readonly launchId?: string
  readonly sinceSequence?: number
  readonly limit?: number
}

export interface SteamLifecycleCollectResult {
  readonly observer: SteamObserverHealth
  readonly summary?: SteamLifecycleSummary
  readonly events: readonly SteamLifecycleEvent[]
}

export interface SteamLogObserverDaemonHandle {
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
}

export interface CreateSteamLogObserverOptions {
  readonly logDir?: string
  readonly env?: NodeJS.ProcessEnv
  readonly stuckThresholdMs?: number
  readonly now?: () => string
  readonly createTailer?: (
    options: CreateSteamObserverTailerOptions,
  ) => SteamObserverTailer
}

const DEFAULT_LOG_DIR = "/var/lib/korri/steam/logs"
const DEFAULT_STUCK_THRESHOLD_MS = 60_000

let installedObserver:
  | {
      readonly owner: symbol
      readonly read: () => SteamObserverStatus
      readonly openCorrelation?: (correlation: SteamLaunchCorrelation) => void
      readonly collectLifecycle?: (
        input?: SteamLifecycleCollectInput,
      ) => SteamLifecycleCollectResult
    }
  | undefined

export function resolveSteamLogDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.KORRI_STEAM_LOG_DIR) return env.KORRI_STEAM_LOG_DIR
  if (env.KORRI_STEAM_HOME) return `${env.KORRI_STEAM_HOME}/logs`
  return DEFAULT_LOG_DIR
}

export function createSteamLogObserverDaemon(
  options: CreateSteamLogObserverOptions = {},
): SteamLogObserverDaemonHandle {
  const observer = createSteamLogObserver(options)
  const owner = Symbol("steam-log-observer-daemon")
  let install: { readonly uninstall: () => void } | undefined

  return {
    start: async () => {
      install = installSteamLogObserverStatus(owner, observer.status, {
        openCorrelation: observer.openCorrelation,
        collectLifecycle: observer.collectLifecycle,
      })
      await observer.start()
    },
    stop: async () => {
      await observer.stop()
      install?.uninstall()
      install = undefined
    },
  }
}

export function createSteamLogObserver(
  options: CreateSteamLogObserverOptions = {},
): SteamLogObserverHandle {
  const logDir = options.logDir ?? resolveSteamLogDir(options.env)
  const now = options.now ?? (() => new Date().toISOString())
  const stuckThresholdMs =
    options.stuckThresholdMs ?? DEFAULT_STUCK_THRESHOLD_MS
  let reducerState: SteamLaunchObserverState = initialSteamLaunchObserverState
  let lifecycleSequence = 0
  let lifecycleEvents: readonly SteamLifecycleEvent[] = []
  const correlations = new Map<string, SteamLaunchCorrelation>()
  let health: SteamObserverHealth = {
    state: "stopped",
    logDir,
    watchedFiles: [...DEFAULT_STEAM_LOG_FILES],
    activeFiles: [],
    missingFiles: [...DEFAULT_STEAM_LOG_FILES],
  }
  let tailer: SteamObserverTailer | undefined
  let started = false

  const ingestLine = (line: SteamRawLogLine) => {
    try {
      const signal = parseSteamLogLine(line)
      reducerState = reduceSteamLogSignal(reducerState, signal, {
        correlations: [...correlations.values()],
      })
      const appId = "appId" in signal ? signal.appId : undefined
      const snapshot = appId
        ? reducerState.active?.appId === appId
          ? reducerState.active
          : reducerState.latest?.appId === appId
            ? reducerState.latest
            : undefined
        : undefined
      const correlation = appId ? correlations.get(appId) : undefined
      const event = createSteamLifecycleEvent({
        sequence: ++lifecycleSequence,
        signal,
        snapshot,
        ...(correlation ? { correlation } : {}),
      })
      if (event)
        lifecycleEvents = clampSteamLifecycleEvents(
          [...lifecycleEvents, event],
          200,
        )
      health = { ...health, lastLineAt: line.observedAt }
    } catch (error) {
      health = {
        ...health,
        state: "degraded",
        lastError: sanitizeSteamEvidenceExcerpt(error),
      }
    }
  }

  return {
    start: async () => {
      if (started) return
      started = true
      health = { ...health, state: "starting" }
      try {
        const createTailer =
          options.createTailer ??
          ((tailerOptions: CreateSteamObserverTailerOptions) =>
            createSteamLogTailer({
              ...tailerOptions,
              now,
              intervalMs: 1000,
              logger,
            }))
        tailer = createTailer({
          logDir,
          files: DEFAULT_STEAM_LOG_FILES,
          onLine: line => ingestLine(line),
        })
        await tailer.start()
        health = mergeTailerHealth(tailer.status(), health)
      } catch (error) {
        health = {
          ...health,
          state: "degraded",
          lastError: sanitizeSteamEvidenceExcerpt(error),
        }
      }
    },
    stop: async () => {
      if (!started) return
      started = false
      try {
        await tailer?.stop()
      } finally {
        health = { ...health, state: "stopped" }
      }
    },
    status: () => {
      if (tailer && started) health = mergeTailerHealth(tailer.status(), health)
      return {
        health,
        ...(reducerState.active
          ? {
              active: projectSteamLaunchSnapshot(reducerState.active, {
                now: now(),
                stuckThresholdMs,
              }),
            }
          : {}),
        ...(reducerState.latest
          ? {
              latest: projectSteamLaunchSnapshot(reducerState.latest, {
                now: now(),
                stuckThresholdMs,
              }),
            }
          : {}),
        recentEvidence: reducerState.recentEvidence,
        lifecycleEvents,
        ...lifecycleSummaryForStatus(
          health,
          reducerState,
          now,
          stuckThresholdMs,
        ),
      }
    },
    ingestLine,
    openCorrelation: correlation => {
      correlations.set(correlation.appId, correlation)
    },
    collectLifecycle: input => {
      const status = {
        health,
        ...(reducerState.active
          ? {
              active: projectSteamLaunchSnapshot(reducerState.active, {
                now: now(),
                stuckThresholdMs,
              }),
            }
          : {}),
        ...(reducerState.latest
          ? {
              latest: projectSteamLaunchSnapshot(reducerState.latest, {
                now: now(),
                stuckThresholdMs,
              }),
            }
          : {}),
        recentEvidence: reducerState.recentEvidence,
        lifecycleEvents,
        ...lifecycleSummaryForStatus(
          health,
          reducerState,
          now,
          stuckThresholdMs,
        ),
      } satisfies SteamObserverStatus
      return {
        observer: status.health,
        ...(status.lifecycleSummary
          ? { summary: status.lifecycleSummary }
          : {}),
        events: filterLifecycleEvents(status.lifecycleEvents ?? [], input),
      }
    },
  }
}

export function installSteamLogObserverStatus(
  owner: symbol,
  read: () => SteamObserverStatus,
  hooks: {
    readonly openCorrelation?: (correlation: SteamLaunchCorrelation) => void
    readonly collectLifecycle?: (
      input?: SteamLifecycleCollectInput,
    ) => SteamLifecycleCollectResult
  } = {},
): { readonly uninstall: () => void } {
  installedObserver = { owner, read, ...hooks }
  return {
    uninstall: () => {
      if (installedObserver?.owner === owner) installedObserver = undefined
    },
  }
}

export function getInstalledSteamLogObserverStatus(): SteamObserverStatus {
  if (!installedObserver) {
    return {
      health: {
        state: "unavailable",
        watchedFiles: [],
        activeFiles: [],
        missingFiles: [],
      },
      recentEvidence: [],
      lifecycleEvents: [],
    }
  }
  return installedObserver.read()
}

export function openInstalledSteamLaunchCorrelation(
  correlation: SteamLaunchCorrelation,
): void {
  installedObserver?.openCorrelation?.(correlation)
}

export function collectInstalledSteamLifecycle(
  input?: SteamLifecycleCollectInput,
): SteamLifecycleCollectResult {
  if (installedObserver?.collectLifecycle) {
    return installedObserver.collectLifecycle(input)
  }
  const status = getInstalledSteamLogObserverStatus()
  return {
    observer: status.health,
    ...(status.lifecycleSummary ? { summary: status.lifecycleSummary } : {}),
    events: filterLifecycleEvents(status.lifecycleEvents ?? [], input),
  }
}

export function resetSteamLogObserverStatusForTests(): void {
  installedObserver = undefined
}

function lifecycleSummaryForStatus(
  health: SteamObserverHealth,
  state: SteamLaunchObserverState,
  now: () => string,
  stuckThresholdMs: number,
): { readonly lifecycleSummary?: SteamLifecycleSummary } {
  const snapshot = projectSteamLaunchSnapshot(state.active, {
    now: now(),
    stuckThresholdMs,
  })
  const summary = summaryFromSteamSnapshot({
    observerHealth: health.state,
    ...(snapshot ? { snapshot } : {}),
  })
  return summary ? { lifecycleSummary: summary } : {}
}

function filterLifecycleEvents(
  events: readonly SteamLifecycleEvent[],
  input: SteamLifecycleCollectInput = {},
): readonly SteamLifecycleEvent[] {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
  const filtered = events.filter(event => {
    if (input.appId && event.appId !== input.appId) return false
    if (input.launchId && event.launchId !== input.launchId) return false
    if (
      input.sinceSequence !== undefined &&
      event.sequence <= input.sinceSequence
    ) {
      return false
    }
    return true
  })
  return clampSteamLifecycleEvents(filtered, limit)
}

function mergeTailerHealth(
  tailerStatus: Pick<
    SteamLogTailerStatus,
    | "state"
    | "logDir"
    | "watchedFiles"
    | "activeFiles"
    | "missingFiles"
    | "lastError"
  >,
  previous: SteamObserverHealth,
): SteamObserverHealth {
  const state = tailerStatus.state === "idle" ? "starting" : tailerStatus.state
  return {
    ...previous,
    state,
    logDir: tailerStatus.logDir,
    watchedFiles: tailerStatus.watchedFiles,
    activeFiles: tailerStatus.activeFiles,
    missingFiles: tailerStatus.missingFiles,
    ...(tailerStatus.lastError
      ? { lastError: sanitizeSteamEvidenceExcerpt(tailerStatus.lastError) }
      : {}),
  }
}
