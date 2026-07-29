import type {
  KorriNativeBridgeSurface,
  LaunchAppResult,
  Launchable,
  QueryLaunchablesResult,
} from "@contracts/bridge/korri-native-bridge"

/**
 * Async seam over the native launcher bridge. Two real implementations:
 * one backed by the injected `window.KorriNative` surface, one in-memory
 * with configurable behavior for browser dev and tests.
 *
 * This seam is where Effect layers land when the RPC slice brings Effect
 * in; the interface is deliberately shaped so that conversion is
 * mechanical.
 */
export interface LauncherBridge {
  queryLaunchables(): Promise<QueryLaunchablesResult>
  launchApp(packageName: string): Promise<LaunchAppResult>
}

export function createKorriNativeLauncherBridge(
  surface: KorriNativeBridgeSurface,
): LauncherBridge {
  return {
    async queryLaunchables() {
      try {
        return JSON.parse(surface.queryLaunchables()) as QueryLaunchablesResult
      } catch (error) {
        return { _tag: "QueryFailed", message: describe(error) }
      }
    },
    async launchApp(packageName) {
      try {
        return JSON.parse(surface.launchApp(packageName)) as LaunchAppResult
      } catch (error) {
        return {
          _tag: "LaunchFailed",
          reason: "StartFailed",
          message: describe(error),
        }
      }
    },
  }
}

export interface InMemoryLauncherBridgeConfig {
  readonly behavior?: "ok" | "query-fail" | "launch-fail"
  readonly items?: readonly Launchable[]
  readonly delayMs?: number
}

const sampleItems: readonly Launchable[] = [
  { packageName: "com.retroarch.aarch64", label: "RetroArch" },
  { packageName: "org.ppsspp.ppsspp", label: "PPSSPP" },
  { packageName: "com.android.settings", label: "Settings" },
]

export function createInMemoryLauncherBridge(
  config: InMemoryLauncherBridgeConfig = {},
): LauncherBridge {
  const behavior = config.behavior ?? "ok"
  const items = config.items ?? sampleItems
  const delayMs = config.delayMs ?? 0
  const delay = () => new Promise(resolve => setTimeout(resolve, delayMs))

  return {
    async queryLaunchables() {
      await delay()
      if (behavior === "query-fail") {
        return { _tag: "QueryFailed", message: "configured to fail" }
      }
      return { _tag: "Launchables", items }
    },
    async launchApp(packageName) {
      await delay()
      if (
        behavior === "launch-fail" ||
        !items.some(item => item.packageName === packageName)
      ) {
        return {
          _tag: "LaunchFailed",
          reason: "NotFound",
          message: `no launchable ${packageName}`,
        }
      }
      return { _tag: "Launched" }
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
