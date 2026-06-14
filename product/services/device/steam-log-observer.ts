import { logger } from "@platform/logger"
import { sanitizeSteamEvidenceExcerpt } from "./steam-evidence-sanitizer"
import {
  initialSteamLaunchObserverState,
  projectSteamLaunchSnapshot,
  reduceSteamLogSignal,
  type SteamLaunchObserverState,
  type SteamLaunchSnapshot,
} from "./steam-launch-state"
import { parseSteamLogLine, type SteamRawLogLine } from "./steam-log-signals"
import {
  createSteamLogTailer,
  DEFAULT_STEAM_LOG_FILES,
  type SteamLogTailerStatus,
  type TailedSteamLogLine,
} from "./steam-log-tailer"

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
  | { readonly owner: symbol; readonly read: () => SteamObserverStatus }
  | undefined

export function resolveSteamLogDir(
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (env.KORRI_STEAM_LOG_DIR) return env.KORRI_STEAM_LOG_DIR
  if (env.KORRI_STEAM_HOME) return `${env.KORRI_STEAM_HOME}/logs`
  return DEFAULT_LOG_DIR
}

export function createSteamLogObserver(
  options: CreateSteamLogObserverOptions = {},
): SteamLogObserverHandle {
  const logDir = options.logDir ?? resolveSteamLogDir(options.env)
  const now = options.now ?? (() => new Date().toISOString())
  const stuckThresholdMs =
    options.stuckThresholdMs ?? DEFAULT_STUCK_THRESHOLD_MS
  let reducerState: SteamLaunchObserverState = initialSteamLaunchObserverState
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
      reducerState = reduceSteamLogSignal(reducerState, signal)
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
      }
    },
    ingestLine,
  }
}

export function installSteamLogObserverStatus(
  owner: symbol,
  read: () => SteamObserverStatus,
): { readonly uninstall: () => void } {
  installedObserver = { owner, read }
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
    }
  }
  return installedObserver.read()
}

export function resetSteamLogObserverStatusForTests(): void {
  installedObserver = undefined
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
