import type {
  KorriNativeBridgeSurface,
  LaunchAppResult,
  Launchable,
  LaunchLocalResult,
  LocalLaunchSpec,
  OpenNotificationSettingsResult,
  BackgroundNoticeResult,
  RequestBackgroundNoticeResult,
  OpenPairingResult,
  OpenStorageSettingsResult,
  QueryLaunchablesResult,
  QueryStreamAppsResult,
  QueryStreamHostsResult,
  StartStreamResult,
  StorageAccessResult,
  StreamApp,
  StreamHost,
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
  launchLocal(spec: LocalLaunchSpec): Promise<LaunchLocalResult>
  queryStreamHosts(): Promise<QueryStreamHostsResult>
  queryStreamApps(hostUuid: string): Promise<QueryStreamAppsResult>
  startStream(hostUuid: string, appId: number): Promise<StartStreamResult>
  /** Whether Korri may use the storage its settings and plugins live in. */
  storageAccess(): Promise<StorageAccessResult>
  /** Take the user to the system screen where that access is granted. */
  openStorageAccessSettings(): Promise<OpenStorageSettingsResult>
  /** Whether the user can see that Korri is running in the background. */
  backgroundNotice(): Promise<BackgroundNoticeResult>
  /** Ask Android for permission to show that notice. */
  requestBackgroundNotice(): Promise<RequestBackgroundNoticeResult>
  /** Take the user to the system screen where the notice is shown or hidden. */
  openNotificationSettings(): Promise<OpenNotificationSettingsResult>
  /** Take the user to the native pairing screen. */
  openPairing(): Promise<OpenPairingResult>
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
    async launchLocal(spec) {
      try {
        return JSON.parse(surface.launchLocal(JSON.stringify(spec))) as LaunchLocalResult
      } catch (error) {
        return {
          _tag: "LaunchFailed",
          reason: "StartFailed",
          message: describe(error),
        }
      }
    },
    async queryStreamHosts() {
      try {
        return JSON.parse(surface.queryStreamHosts()) as QueryStreamHostsResult
      } catch (error) {
        return { _tag: "QueryFailed", message: describe(error) }
      }
    },
    async queryStreamApps(hostUuid) {
      try {
        return JSON.parse(
          surface.queryStreamApps(hostUuid),
        ) as QueryStreamAppsResult
      } catch (error) {
        return { _tag: "QueryFailed", message: describe(error) }
      }
    },
    async startStream(hostUuid, appId) {
      try {
        return JSON.parse(
          surface.startStream(hostUuid, appId),
        ) as StartStreamResult
      } catch (error) {
        return {
          _tag: "StreamFailed",
          reason: "StartFailed",
          message: describe(error),
        }
      }
    },
    async storageAccess() {
      try {
        return JSON.parse(surface.storageAccess()) as StorageAccessResult
      } catch (error) {
        return { _tag: "QueryFailed", message: describe(error) }
      }
    },
    async openStorageAccessSettings() {
      try {
        return JSON.parse(
          surface.openStorageAccessSettings(),
        ) as OpenStorageSettingsResult
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
    async backgroundNotice() {
      try {
        return JSON.parse(surface.backgroundNotice()) as BackgroundNoticeResult
      } catch {
        // A shell too old to answer is not hiding anything.
        return { _tag: "Hidden" } as BackgroundNoticeResult
      }
    },
    async requestBackgroundNotice() {
      try {
        return JSON.parse(
          surface.requestBackgroundNotice(),
        ) as RequestBackgroundNoticeResult
      } catch {
        return { _tag: "Unprompted" } as RequestBackgroundNoticeResult
      }
    },
    async openNotificationSettings() {
      try {
        return JSON.parse(
          surface.openNotificationSettings(),
        ) as OpenNotificationSettingsResult
      } catch (error) {
        return { _tag: "Unavailable", reason: describe(error) }
      }
    },
    async openPairing() {
      try {
        return JSON.parse(surface.openPairing()) as OpenPairingResult
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
  }
}

export interface InMemoryLauncherBridgeConfig {
  readonly behavior?:
    | "ok"
    | "query-fail"
    | "launch-fail"
    | "local-launch-fail"
    | "stream-hosts-fail"
    | "stream-start-fail"
    | "storage-denied"
    | "storage-settings-unavailable"
  readonly items?: readonly Launchable[]
  readonly streamHosts?: readonly StreamHost[]
  readonly streamApps?: Readonly<Record<string, readonly StreamApp[]>>
  readonly delayMs?: number
}

const sampleItems: readonly Launchable[] = [
  { packageName: "com.korri.retroarch", label: "Korri RetroArch" },
  { packageName: "org.ppsspp.ppsspp", label: "PPSSPP" },
  { packageName: "com.android.settings", label: "Settings" },
]

const sampleHosts: readonly StreamHost[] = [
  { uuid: "host-1", name: "Office PC", paired: true },
]

const sampleApps: Readonly<Record<string, readonly StreamApp[]>> = {
  "host-1": [
    { id: 1, name: "Desktop" },
    { id: 2, name: "Steam Big Picture" },
  ],
}

export function createInMemoryLauncherBridge(
  config: InMemoryLauncherBridgeConfig = {},
): LauncherBridge {
  const behavior = config.behavior ?? "ok"
  const items = config.items ?? sampleItems
  const streamHosts = config.streamHosts ?? sampleHosts
  const streamApps = config.streamApps ?? sampleApps
  const delayMs = config.delayMs ?? 0
  const delay = () => new Promise(resolve => setTimeout(resolve, delayMs))
  const storageAccessResult: StorageAccessResult =
    behavior === "storage-denied" ? { _tag: "Denied" } : { _tag: "Granted" }

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
    async launchLocal(spec) {
      await delay()
      if (behavior === "local-launch-fail") {
        return {
          _tag: "LaunchFailed",
          reason: "NotInstalled",
          message: `no local launcher ${spec.launcherId}`,
        }
      }
      return { _tag: "Launched" }
    },
    async queryStreamHosts() {
      await delay()
      if (behavior === "stream-hosts-fail") {
        return { _tag: "QueryFailed", message: "configured to fail" }
      }
      return { _tag: "StreamHosts", items: streamHosts }
    },
    async queryStreamApps(hostUuid) {
      await delay()
      return { _tag: "StreamApps", items: streamApps[hostUuid] ?? [] }
    },
    async startStream(hostUuid, appId) {
      await delay()
      const apps = streamApps[hostUuid]
      if (behavior === "stream-start-fail" || apps === undefined) {
        return {
          _tag: "StreamFailed",
          reason: "HostUnreachable",
          message: `cannot reach ${hostUuid}`,
        }
      }
      if (!apps.some(app => app.id === appId)) {
        return {
          _tag: "StreamFailed",
          reason: "AppNotFound",
          message: `no app ${appId} on ${hostUuid}`,
        }
      }
      return { _tag: "StreamStarted" }
    },
    async storageAccess() {
      await delay()
      return storageAccessResult
    },
    async openStorageAccessSettings() {
      await delay()
      // Browser dev has no system settings screen; the portal has to render
      // that honestly rather than pretend the grant flow started.
      return behavior === "storage-settings-unavailable"
        ? { _tag: "Unavailable", message: "no settings screen in browser dev" }
        : { _tag: "Opened" }
    },
    async openPairing() {
      await delay()
      // Browser dev has no native pairing screen to reach.
      return behavior === "storage-settings-unavailable"
        ? { _tag: "Unavailable", message: "no pairing screen in browser dev" }
        : { _tag: "Opened" }
    },
    async backgroundNotice() {
      await delay()
      // A browser tab keeps nothing alive, so there is nothing to notice.
      return { _tag: "Hidden" }
    },
    async requestBackgroundNotice() {
      await delay()
      return { _tag: "Unprompted" }
    },
    async openNotificationSettings() {
      await delay()
      return behavior === "storage-settings-unavailable"
        ? { _tag: "Unavailable", reason: "no settings screen in browser dev" }
        : { _tag: "Opened" }
    },
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
