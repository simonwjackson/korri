/**
 * Portal seam to the korrid brain. Two real implementations: an HTTP
 * client for the embedded (or remote) Rust server, and an in-memory
 * variant for browser dev and tests. Types come from the Rust-owned
 * generated treaty; the shared operation tag correlates each request
 * with its response without a hand-maintained map.
 */
import type {
  ActiveSession,
  CatalogSnapshotOutcome,
  Game,
  HealthOutcome,
  LaunchSpec,
  LocalGame,
  LocalGameLaunchOutcome,
  LocalGamesListOutcome,
  MoonlightLaunchPrepareOutcome,
  MoonlightResolveOutcome,
  RpcRequest,
  RpcResponse,
  SessionPrepareOutcome,
  SessionStatusOutcome,
  SessionStopOutcome,
  SettingsSnapshot,
  SettingsSnapshotOutcome,
  SettingsUpdateOutcome,
} from "@contracts/generated/korrid"
import { SessionStopPhase } from "@contracts/generated/korrid"

export type RpcResponseFor<Request extends RpcRequest> = Extract<
  RpcResponse,
  { readonly _tag: Request["_tag"] }
>

export interface KorridClient {
  health(): Promise<HealthOutcome>
  settingsSnapshot(): Promise<SettingsSnapshotOutcome>
  updateSetting(
    expectedRevision: string,
    settingId: string,
    value: string,
  ): Promise<SettingsUpdateOutcome>
  catalogSnapshot(): Promise<CatalogSnapshotOutcome>
  moonlightResolve(): Promise<MoonlightResolveOutcome>
  moonlightLaunchPrepare(
    hostUuid: string,
    appId: number,
  ): Promise<MoonlightLaunchPrepareOutcome>
  localGames(): Promise<LocalGamesListOutcome>
  localGameLaunch(gameId: string): Promise<LocalGameLaunchOutcome>
  sessionPrepare(gameId: string, host?: string): Promise<SessionPrepareOutcome>
  sessionStatus(timeoutMs?: number): Promise<SessionStatusOutcome>
  sessionStop(): Promise<SessionStopOutcome>
}

const RPC_TIMEOUT_MS = 25_000

export async function callKorrid<Request extends RpcRequest>(
  baseUrl: string,
  capability: string,
  request: Request,
  timeoutMs = RPC_TIMEOUT_MS,
): Promise<RpcResponseFor<Request>> {
  const response = await fetch(`${baseUrl}/rpc`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${capability}`,
    },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`korrid returned HTTP ${response.status}`)
  return (await response.json()) as RpcResponseFor<Request>
}

const unreachable = (error: unknown) => ({
  _tag: "Err" as const,
  payload: {
    code: "BrainUnreachable",
    message: error instanceof Error ? error.message : String(error),
  },
})

const statusUnavailable = (error: unknown): SessionStatusOutcome =>
  error instanceof DOMException && error.name === "TimeoutError"
    ? {
        _tag: "Err",
        payload: {
          code: "StatusTimeout",
          message: "session status timed out",
        },
      }
    : unreachable(error)

export function createHttpKorridClient(
  baseUrl: string,
  capability: string,
): KorridClient {
  return {
    async health() {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "system.health",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async settingsSnapshot() {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "system.settings.snapshot",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async updateSetting(expectedRevision, settingId, value) {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "system.settings.update",
          payload: { expectedRevision, settingId, value },
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async catalogSnapshot() {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.catalog.snapshot",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async moonlightResolve() {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.moonlight.resolve",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return {
          _tag: "Unavailable",
          payload: unreachable(error).payload,
        }
      }
    },
    async moonlightLaunchPrepare(hostUuid, appId) {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.moonlight.launch.prepare",
          payload: { hostUuid, appId },
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async localGames() {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.local-games.list",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async localGameLaunch(gameId) {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.local-games.launch",
          payload: { gameId },
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async sessionPrepare(gameId, host) {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.session.prepare",
          payload: host === undefined ? { gameId } : { gameId, host },
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async sessionStatus(timeoutMs) {
      try {
        const response = await callKorrid(
          baseUrl,
          capability,
          {
            _tag: "app.session.status",
            payload: {},
          },
          timeoutMs,
        )
        return response.outcome
      } catch (error) {
        return statusUnavailable(error)
      }
    },
    async sessionStop() {
      try {
        const response = await callKorrid(baseUrl, capability, {
          _tag: "app.session.stop",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
  }
}

export interface InMemoryKorridClientConfig {
  readonly behavior?:
    | "ok"
    | "catalog-fail"
    | "moonlight-unavailable"
    | "prepare-fail"
    | "local-list-fail"
    | "local-launch-fail"
    | "status-fail"
    | "stop-fail"
  readonly games?: readonly Game[]
  readonly moonlight?: MoonlightResolveOutcome
  readonly localGames?: readonly LocalGame[]
  readonly localLaunchSpecs?: Readonly<Record<string, LaunchSpec>>
  readonly localFailures?: readonly { readonly code: string; readonly message: string }[]
  /** Seed an active host session for now-playing flows. */
  readonly activeSession?: ActiveSession
}

const sampleGames: readonly Game[] = [
  { id: "skate3", title: "Skate 3" },
  { id: "neverball", title: "Neverball" },
]

export function createInMemoryKorridClient(
  config: InMemoryKorridClientConfig = {},
): KorridClient {
  const behavior = config.behavior ?? "ok"
  const games = config.games ?? sampleGames
  const moonlight = config.moonlight ?? {
    _tag: "Unavailable" as const,
    payload: {
      code: "MoonlightUnavailable",
      message: "Moonlight is not configured in this browser fixture",
    },
  }
  const localGames = config.localGames ?? []
  const localLaunchSpecs = config.localLaunchSpecs ?? {}
  const localFailures = config.localFailures
  let activeSession = config.activeSession
  let settings: SettingsSnapshot = {
    revision: "in-memory-0",
    deviceName: "Browser",
    plugins: [
      { id: "@korri:android-app", title: "Android", enabled: true },
      { id: "@korri:mgba", title: "mGBA", enabled: true },
      { id: "@korri:moonlight", title: "Moonlight", enabled: true },
      { id: "@korri:retroarch", title: "RetroArch", enabled: true },
    ],
  }
  let settingsRevision = 0
  let moonlightLaunchSequence = 0
  const currentMoonlight = (): MoonlightResolveOutcome => {
    const enabled = settings.plugins.some(
      plugin => plugin.id === "@korri:moonlight" && plugin.enabled,
    )
    if (behavior === "moonlight-unavailable" || !enabled) {
      return {
        _tag: "Unavailable",
        payload: {
          code: "MoonlightUnavailable",
          message: "Moonlight is disabled or Artemis is unavailable",
        },
      }
    }
    return moonlight
  }
  return {
    async health() {
      return { _tag: "Ok", payload: { version: "korrid-in-memory" } }
    },
    async settingsSnapshot() {
      return { _tag: "Ok", payload: settings }
    },
    async updateSetting(expectedRevision, settingId, value) {
      if (expectedRevision !== settings.revision) {
        return {
          _tag: "Err",
          payload: { code: "SettingsConflict", message: "reload and try again" },
        }
      }
      settingsRevision += 1
      settings = {
        ...settings,
        revision: `in-memory-${settingsRevision}`,
        ...(settingId === "device-name" ? { deviceName: value.trim() } : {}),
        plugins: settings.plugins.map(plugin =>
          plugin.id === settingId
            ? { ...plugin, enabled: value === "true" }
            : plugin,
        ),
      }
      return { _tag: "Ok", payload: settings }
    },
    async catalogSnapshot() {
      if (behavior === "catalog-fail") {
        return {
          _tag: "Err",
          payload: { code: "UpstreamUnreachable", message: "configured to fail" },
        }
      }
      return { _tag: "Ok", payload: { games: [...games] } }
    },
    async moonlightResolve() {
      return currentMoonlight()
    },
    async moonlightLaunchPrepare(hostUuid, appId) {
      const resolved = currentMoonlight()
      if (resolved._tag !== "Available") {
        return { _tag: "Err", payload: resolved.payload }
      }
      moonlightLaunchSequence += 1
      return {
        _tag: "Ok",
        payload: {
          launchId: `in-memory-moonlight-${moonlightLaunchSequence}`,
          transportId: resolved.payload.transportId,
          implementation: resolved.payload.implementation,
          sunshineApp: resolved.payload.sunshineApp,
          hostUuid,
          appId,
          integrity: "in-memory-integrity",
        },
      }
    },
    async localGames() {
      if (behavior === "local-list-fail") {
        return {
          _tag: "Err",
          payload: {
            code: "LocalStorageUnavailable",
            message: "configured to fail",
          },
        }
      }
      return {
        _tag: "Ok",
        payload: {
          games: [...localGames],
          ...(localFailures === undefined ? {} : { failures: [...localFailures] }),
        },
      }
    },
    async localGameLaunch(gameId) {
      const spec = localLaunchSpecs[gameId]
      if (
        behavior === "local-launch-fail" ||
        !localGames.some(game => game.id === gameId) ||
        spec === undefined
      ) {
        return {
          _tag: "Err",
          payload: { code: "LocalRomMissing", message: `cannot launch ${gameId}` },
        }
      }
      return { _tag: "Ok", payload: spec }
    },
    async sessionPrepare(gameId, host) {
      if (
        behavior === "prepare-fail" ||
        !games.some(
          game =>
            game.id === gameId &&
            (host === undefined || game.host === host),
        )
      ) {
        return {
          _tag: "Err",
          payload: { code: "UpstreamFailure", message: `cannot prepare ${gameId}` },
        }
      }
      return {
        _tag: "Ok",
        payload: { gameId, launchId: `in-memory:${host ?? "local"}:${gameId}` },
      }
    },
    async sessionStatus() {
      if (behavior === "status-fail") {
        return {
          _tag: "Err",
          payload: { code: "HostUnavailable", message: "configured to fail" },
        }
      }
      return activeSession === undefined
        ? { _tag: "Ok", payload: {} }
        : { _tag: "Ok", payload: { active: activeSession } }
    },
    async sessionStop() {
      if (behavior === "stop-fail") {
        return {
          _tag: "Err",
          payload: { code: "HostUnavailable", message: "configured to fail" },
        }
      }
      activeSession = undefined
      return { _tag: "Ok", payload: { phase: SessionStopPhase.Stopped } }
    },
  }
}

export async function smokeKorrid(baseUrl: string, capability: string) {
  const client = createHttpKorridClient(baseUrl, capability)
  const health = await client.health()
  if (health._tag !== "Ok") throw new Error(health.payload.message)

  // The catalog is federated from the upstream host, which may be offline
  // during a host-side check; report rather than fail.
  const catalog = await client.catalogSnapshot()
  return {
    version: health.payload.version,
    catalog:
      catalog._tag === "Ok"
        ? {
            games: catalog.payload.games.length,
            first: catalog.payload.games[0]?.title,
          }
        : { unavailable: catalog.payload.code },
  }
}
