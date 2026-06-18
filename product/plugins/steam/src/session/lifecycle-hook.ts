import type {
  KorriSessionLifecycleHook,
  KorriSessionLifecycleHookCleanupRequest,
  KorriSessionLifecycleHookStartRequest,
} from "@platform/plugin/session-lifecycle"
import { KORRI_STEAM_PLUGIN_ID } from "../plugin"
import {
  cleanupSteamForegroundProcesses,
  type SteamForegroundCleanupLogger,
  type SteamForegroundProcessScanner,
  type SteamForegroundProcessSignaler,
  scanCurrentUserProcesses,
  signalProcessByPid,
} from "./foreground-processes"

export interface SteamSessionLifecycleHookOptions {
  readonly processScanner?: SteamForegroundProcessScanner
  readonly signalProcess?: SteamForegroundProcessSignaler
  readonly graceMs?: number
  readonly logger?: SteamForegroundCleanupLogger
}

export interface SteamLaunchCleanupMetadata {
  readonly appId: string
}

export function steamLaunchCleanupMetadata(input: {
  readonly appId: string
}): SteamLaunchCleanupMetadata {
  return { appId: input.appId }
}

export function createSteamSessionLifecycleHook(
  options: SteamSessionLifecycleHookOptions = {},
): KorriSessionLifecycleHook {
  const processScanner = options.processScanner ?? scanCurrentUserProcesses
  const signalProcess = options.signalProcess ?? signalProcessByPid
  const graceMs = options.graceMs ?? 1500
  const launchAppIds = new Map<string, string>()

  return {
    id: KORRI_STEAM_PLUGIN_ID,
    afterChildRunning: async request => {
      const metadata = steamCleanupMetadataFromStartRequest(request)
      if (metadata) launchAppIds.set(request.launchId, metadata.appId)
      return undefined
    },
    cleanup: async request => {
      const appId =
        steamCleanupMetadataFromCleanupRequest(request)?.appId ??
        launchAppIds.get(request.launchId)
      launchAppIds.delete(request.launchId)
      if (!appId) return { cleaned: [], residual: [] }

      const outcome = await cleanupSteamForegroundProcesses({
        processScanner,
        signalProcess,
        appId,
        graceMs,
        logger: options.logger,
      })
      return { cleaned: outcome.killed, residual: outcome.residual }
    },
  }
}

function steamCleanupMetadataFromStartRequest(
  request: KorriSessionLifecycleHookStartRequest,
): SteamLaunchCleanupMetadata | undefined {
  return steamCleanupMetadataFromLaunchMetadata(request.launchMetadata)
}

function steamCleanupMetadataFromCleanupRequest(
  request: KorriSessionLifecycleHookCleanupRequest,
): SteamLaunchCleanupMetadata | undefined {
  return steamCleanupMetadataFromLaunchMetadata(request.launchMetadata)
}

function steamCleanupMetadataFromLaunchMetadata(
  launchMetadata: KorriSessionLifecycleHookStartRequest["launchMetadata"],
): SteamLaunchCleanupMetadata | undefined {
  const annotation = launchMetadata?.annotations?.[KORRI_STEAM_PLUGIN_ID]
  if (!isRecord(annotation)) return undefined

  const cleanup = annotation.foregroundCleanup
  if (isRecord(cleanup) && isDecimalString(cleanup.appId)) {
    return { appId: cleanup.appId }
  }

  if (isDecimalString(annotation.appId)) return { appId: annotation.appId }
  return undefined
}

function isDecimalString(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
