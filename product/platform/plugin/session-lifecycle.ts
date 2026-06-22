import type { LaunchCompanionMap } from "@platform/library/config/inheritable-fields"
import type { LaunchSpec } from "@platform/library/launcher"
import type { PluginId } from "./index"
import type { LaunchMetadata } from "./launch-metadata"

export interface KorriSessionLifecycleHookStartRequest {
  readonly launchId: string
  readonly spec: LaunchSpec
  readonly launchMetadata?: LaunchMetadata
  readonly launchCompanions?: LaunchCompanionMap
  readonly terminateLaunch?: () => void
}

export interface KorriSessionLifecycleHookHandle {
  readonly label?: string
  readonly resource?: string
  readonly stopBeforeCleanup?: () => Promise<void>
}

export interface KorriSessionLifecycleHookCleanupRequest {
  readonly launchId: string
  readonly processGroupId?: number
  readonly launchMetadata?: LaunchMetadata
  readonly launchCompanions?: LaunchCompanionMap
}

export interface KorriSessionLifecycleHookCleanupResult {
  readonly cleaned?: readonly number[]
  readonly residual?: readonly number[]
}

export interface KorriSessionLifecycleHook {
  readonly id: PluginId | (string & {})
  readonly failurePolicy?: "fail-launch" | "warn"
  readonly afterChildRunning?: (
    request: KorriSessionLifecycleHookStartRequest,
  ) => Promise<KorriSessionLifecycleHookHandle | undefined>
  readonly cleanup?: (
    request: KorriSessionLifecycleHookCleanupRequest,
  ) => Promise<KorriSessionLifecycleHookCleanupResult | undefined>
}

export interface KorriSessionLifecycleHookFactoryOptions {
  readonly env?: NodeJS.ProcessEnv
}

export interface KorriSessionLifecycleHookFactory {
  readonly pluginId: PluginId
  readonly create: (
    options?: KorriSessionLifecycleHookFactoryOptions,
  ) => KorriSessionLifecycleHook
}
