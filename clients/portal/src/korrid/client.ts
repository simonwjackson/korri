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
  LocalGame,
  LocalGameLaunchOutcome,
  LocalGamesListOutcome,
  RpcRequest,
  RpcResponse,
  SessionPrepareOutcome,
  SessionStatusOutcome,
  SessionStopOutcome,
} from "@contracts/generated/korrid"
import { SessionStopPhase } from "@contracts/generated/korrid"

export type RpcResponseFor<Request extends RpcRequest> = Extract<
  RpcResponse,
  { readonly _tag: Request["_tag"] }
>

export interface KorridClient {
  health(): Promise<HealthOutcome>
  catalogSnapshot(): Promise<CatalogSnapshotOutcome>
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
    | "prepare-fail"
    | "local-list-fail"
    | "local-launch-fail"
    | "status-fail"
    | "stop-fail"
  readonly games?: readonly Game[]
  readonly localGames?: readonly LocalGame[]
  /** Seed an active host session for now-playing flows. */
  readonly activeSession?: ActiveSession
}

const sampleGames: readonly Game[] = [
  { id: "skate3", title: "Skate 3" },
  { id: "neverball", title: "Neverball" },
]

const sampleLocalGames: readonly LocalGame[] = [
  { id: "wl4", title: "Wario Land 4", system: "Game Boy Advance" },
]

export function createInMemoryKorridClient(
  config: InMemoryKorridClientConfig = {},
): KorridClient {
  const behavior = config.behavior ?? "ok"
  const games = config.games ?? sampleGames
  const localGames = config.localGames ?? sampleLocalGames
  let activeSession = config.activeSession
  return {
    async health() {
      return { _tag: "Ok", payload: { version: "korrid-in-memory" } }
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
      return { _tag: "Ok", payload: { games: [...localGames] } }
    },
    async localGameLaunch(gameId) {
      if (
        behavior === "local-launch-fail" ||
        !localGames.some(game => game.id === gameId)
      ) {
        return {
          _tag: "Err",
          payload: { code: "LocalRomMissing", message: `cannot launch ${gameId}` },
        }
      }
      return {
        _tag: "Ok",
        payload: {
          launcherId: "retroarch",
          component: {
            packageName: "com.retroarch.aarch64",
            className:
              "com.retroarch.browser.retroactivity.RetroActivityFuture",
          },
          extras: {
            ROM: "/browser-dev/korri-retro/roms/wl4.gba",
            LIBRETRO:
              "/data/data/com.retroarch.aarch64/cores/mgba_libretro_android.so",
            CONFIGFILE: "/browser-dev/korri-retro/retroarch.cfg",
          },
          directories: [],
          files: [],
          integrity: "browser-dev-only",
        },
      }
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
      return { _tag: "Ok", payload: { gameId } }
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
