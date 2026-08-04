import type {
  KorriNativeBridgeSurface,
  LaunchLocalResult,
  LocalLaunchSpec,
  MoonlightLaunchSpec,
  OpenNotificationSettingsResult,
  BackgroundNoticeResult,
  RequestBackgroundNoticeResult,
  OpenOverlaySettingsResult,
  OpenPairingResult,
  OpenStorageSettingsResult,
  OverlayPermissionResult,
  QueryStreamAppsResult,
  QueryStreamHostsResult,
  StartStreamResult,
  StorageAccessResult,
  SystemInfoResult,
  StreamApp,
  StreamHost,
} from "@contracts/bridge/korri-native-bridge"
import type {
  MoonlightLaunchPrepareOutcome,
  MoonlightResolveOutcome,
} from "@contracts/generated/korrid"

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
  launchLocal(spec: LocalLaunchSpec): Promise<LaunchLocalResult>
  queryStreamHosts(): Promise<QueryStreamHostsResult>
  queryStreamApps(hostUuid: string): Promise<QueryStreamAppsResult>
  startStream(spec: MoonlightLaunchSpec): Promise<StartStreamResult>
  /** Whether Korri may use the storage its settings and plugins live in. */
  storageAccess(): Promise<StorageAccessResult>
  /** Take the user to the system screen where that access is granted. */
  openStorageAccessSettings(): Promise<OpenStorageSettingsResult>
  /** Actual gameplay-overlay accessibility grant state. */
  overlayPermission(): Promise<OverlayPermissionResult>
  /** Open Android accessibility settings; this does not imply a grant. */
  openOverlaySettings(): Promise<OpenOverlaySettingsResult>
  /** Whether the user can see that Korri is running in the background. */
  backgroundNotice(): Promise<BackgroundNoticeResult>
  /** Ask Android for permission to show that notice. */
  requestBackgroundNotice(): Promise<RequestBackgroundNoticeResult>
  /** Take the user to the system screen where the notice is shown or hidden. */
  openNotificationSettings(): Promise<OpenNotificationSettingsResult>
  /** Take the user to the native pairing screen. */
  openPairing(): Promise<OpenPairingResult>
  /** Android and app identity for System information. */
  systemInfo(): Promise<SystemInfoResult>
}

export interface ResolvedMoonlightStreamSource {
  readonly host: StreamHost
  readonly apps: QueryStreamAppsResult
}

export interface ResolvedMoonlightDiscovery {
  readonly resolution: MoonlightResolveOutcome
  readonly streams: readonly ResolvedMoonlightStreamSource[]
  readonly hostsResult?: QueryStreamHostsResult
}

/** Native discovery is reachable only through an enabled, platform-resolved
 * Moonlight declaration. Artemis remains the implementation of these effects. */
export async function discoverResolvedMoonlight(
  resolution: MoonlightResolveOutcome,
  bridge: Pick<LauncherBridge, "queryStreamHosts" | "queryStreamApps">,
): Promise<ResolvedMoonlightDiscovery> {
  if (resolution._tag !== "Available") {
    return { resolution, streams: [] }
  }
  const hostsResult = await bridge.queryStreamHosts()
  if (hostsResult._tag !== "StreamHosts") {
    return { resolution, streams: [], hostsResult }
  }
  const streams = await Promise.all(
    hostsResult.items
      .filter(host => host.paired)
      .map(async host => ({
        host,
        apps: await bridge.queryStreamApps(host.uuid),
      })),
  )
  return { resolution, streams, hostsResult }
}

interface MoonlightLaunchPreparer {
  moonlightLaunchPrepare(
    hostUuid: string,
    appId: number,
    gameId?: string,
    title?: string,
  ): Promise<MoonlightLaunchPrepareOutcome>
}

/** Obtain korrid's current signed launch instruction. Native startup remains
 * explicit in the state owner so every intervening await has a cancellation
 * checkpoint before Artemis can start. */
export async function reserveResolvedMoonlightLaunch(
  resolution: MoonlightResolveOutcome,
  preparer: MoonlightLaunchPreparer,
  hostUuid: string,
  appId: number,
  gameId?: string,
  title?: string,
): Promise<MoonlightLaunchPrepareOutcome> {
  return resolution._tag === "Available"
    ? preparer.moonlightLaunchPrepare(hostUuid, appId, gameId, title)
    : { _tag: "Err", payload: resolution.payload }
}

export function createKorriNativeLauncherBridge(
  surface: KorriNativeBridgeSurface,
): LauncherBridge {
  return {
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
    async startStream(spec) {
      try {
        return JSON.parse(
          surface.startStream(JSON.stringify(spec)),
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
        return decodeStorageAccess(JSON.parse(surface.storageAccess()))
      } catch (error) {
        return { _tag: "QueryFailed", message: describe(error) }
      }
    },
    async openStorageAccessSettings() {
      try {
        return decodeOpenStorageSettings(
          JSON.parse(surface.openStorageAccessSettings()),
        )
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
    async overlayPermission() {
      try {
        return decodeOverlayPermission(JSON.parse(surface.overlayPermission()))
      } catch {
        return { _tag: "RestrictedOrUnavailable" }
      }
    },
    async openOverlaySettings() {
      try {
        return decodeOpenOverlaySettings(
          JSON.parse(surface.openOverlaySettings()),
        )
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
    async backgroundNotice() {
      try {
        return decodeBackgroundNotice(JSON.parse(surface.backgroundNotice()))
      } catch {
        // A shell too old to answer is not hiding anything.
        return { _tag: "Hidden" }
      }
    },
    async requestBackgroundNotice() {
      try {
        return decodeRequestBackgroundNotice(
          JSON.parse(surface.requestBackgroundNotice()),
        )
      } catch {
        return { _tag: "Unprompted" }
      }
    },
    async openNotificationSettings() {
      try {
        return decodeOpenNotificationSettings(
          JSON.parse(surface.openNotificationSettings()),
        )
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
    async openPairing() {
      try {
        return decodeOpenPairing(JSON.parse(surface.openPairing()))
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
    async systemInfo() {
      try {
        return decodeSystemInfo(JSON.parse(surface.systemInfo()))
      } catch (error) {
        return { _tag: "Unavailable", message: describe(error) }
      }
    },
  }
}

export interface InMemoryLauncherBridgeConfig {
  readonly behavior?:
    | "ok"
    | "local-launch-fail"
    | "stream-hosts-fail"
    | "stream-start-fail"
    | "storage-denied"
    | "storage-settings-unavailable"
  readonly streamHosts?: readonly StreamHost[]
  readonly streamApps?: Readonly<Record<string, readonly StreamApp[]>>
  readonly delayMs?: number
}

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
  const streamHosts = config.streamHosts ?? sampleHosts
  const streamApps = config.streamApps ?? sampleApps
  const delayMs = config.delayMs ?? 0
  const delay = () => new Promise(resolve => setTimeout(resolve, delayMs))
  const storageAccessResult: StorageAccessResult =
    behavior === "storage-denied" ? { _tag: "Denied" } : { _tag: "Granted" }

  return {
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
    async startStream(spec) {
      await delay()
      const apps = streamApps[spec.hostUuid]
      if (behavior === "stream-start-fail" || apps === undefined) {
        return {
          _tag: "StreamFailed",
          reason: "HostUnreachable",
          message: `cannot reach ${spec.hostUuid}`,
        }
      }
      if (!apps.some(app => app.id === spec.appId && app.name === spec.sunshineApp)) {
        return {
          _tag: "StreamFailed",
          reason: "AppNotFound",
          message: `no matching app ${spec.appId} on ${spec.hostUuid}`,
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
    async overlayPermission() {
      await delay()
      return { _tag: "RestrictedOrUnavailable" }
    },
    async openOverlaySettings() {
      await delay()
      return {
        _tag: "Unavailable",
        message: "no accessibility settings in browser dev",
      }
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
        ? { _tag: "Unavailable", message: "no settings screen in browser dev" }
        : { _tag: "Opened" }
    },
    async systemInfo() {
      await delay()
      return {
        _tag: "SystemInfo",
        payload: {
          device: "Browser",
          manufacturer: "Korri",
          androidRelease: "Not Android",
          sdk: 0,
          appVersion: "development",
        },
      }
    },
  }
}

function decodeStorageAccess(value: unknown): StorageAccessResult {
  const payload = record(value, "StorageAccessResult")
  switch (payload._tag) {
    case "Granted":
    case "NotRequired":
    case "Denied":
      return { _tag: payload._tag }
    case "QueryFailed":
      return { _tag: payload._tag, message: stringField(payload, "message") }
    default:
      throw new Error("malformed StorageAccessResult")
  }
}

function decodeOpenStorageSettings(
  value: unknown,
): OpenStorageSettingsResult {
  const payload = record(value, "OpenStorageSettingsResult")
  switch (payload._tag) {
    case "Opened":
      return { _tag: payload._tag }
    case "Unavailable":
      return { _tag: payload._tag, message: stringField(payload, "message") }
    default:
      throw new Error("malformed OpenStorageSettingsResult")
  }
}

function decodeOverlayPermission(value: unknown): OverlayPermissionResult {
  const payload = record(value, "OverlayPermissionResult")
  switch (payload._tag) {
    case "Enabled":
    case "Disabled":
    case "RestrictedOrUnavailable":
      return { _tag: payload._tag }
    default:
      throw new Error("malformed OverlayPermissionResult")
  }
}

function decodeOpenOverlaySettings(value: unknown): OpenOverlaySettingsResult {
  const payload = record(value, "OpenOverlaySettingsResult")
  switch (payload._tag) {
    case "Opened":
      return { _tag: payload._tag }
    case "Unavailable":
      return { _tag: payload._tag, message: stringField(payload, "message") }
    default:
      throw new Error("malformed OpenOverlaySettingsResult")
  }
}

function decodeBackgroundNotice(value: unknown): BackgroundNoticeResult {
  const payload = record(value, "BackgroundNoticeResult")
  switch (payload._tag) {
    case "Visible":
    case "Hidden":
      return { _tag: payload._tag }
    default:
      throw new Error("malformed BackgroundNoticeResult")
  }
}

function decodeRequestBackgroundNotice(
  value: unknown,
): RequestBackgroundNoticeResult {
  const payload = record(value, "RequestBackgroundNoticeResult")
  switch (payload._tag) {
    case "Granted":
    case "Denied":
    case "Prompted":
    case "Unprompted":
      return { _tag: payload._tag }
    default:
      throw new Error("malformed RequestBackgroundNoticeResult")
  }
}

function decodeOpenNotificationSettings(
  value: unknown,
): OpenNotificationSettingsResult {
  const payload = record(value, "OpenNotificationSettingsResult")
  switch (payload._tag) {
    case "Opened":
      return { _tag: payload._tag }
    case "Unavailable":
      return { _tag: payload._tag, message: stringField(payload, "message") }
    default:
      throw new Error("malformed OpenNotificationSettingsResult")
  }
}

function decodeSystemInfo(value: unknown): SystemInfoResult {
  const result = record(value, "SystemInfoResult")
  if (result._tag === "Unavailable") {
    return { _tag: "Unavailable", message: stringField(result, "message") }
  }
  if (result._tag !== "SystemInfo") throw new Error("malformed SystemInfoResult")
  const payload = record(result.payload, "AndroidSystemInfo")
  const sdk = payload.sdk
  if (typeof sdk !== "number") throw new Error("malformed sdk")
  return {
    _tag: "SystemInfo",
    payload: {
      device: stringField(payload, "device"),
      manufacturer: stringField(payload, "manufacturer"),
      androidRelease: stringField(payload, "androidRelease"),
      sdk,
      appVersion: stringField(payload, "appVersion"),
    },
  }
}

function decodeOpenPairing(value: unknown): OpenPairingResult {
  const payload = record(value, "OpenPairingResult")
  switch (payload._tag) {
    case "Opened":
      return { _tag: payload._tag }
    case "Unavailable":
      return { _tag: payload._tag, message: stringField(payload, "message") }
    default:
      throw new Error("malformed OpenPairingResult")
  }
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error(`malformed ${name}`)
}

function stringField(
  payload: Record<string, unknown>,
  field: string,
): string {
  const value = payload[field]
  if (typeof value === "string") return value
  throw new Error(`malformed ${field}`)
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
