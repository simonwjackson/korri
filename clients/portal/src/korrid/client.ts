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
  sessionPrepare(gameId: string): Promise<SessionPrepareOutcome>
  sessionStatus(): Promise<SessionStatusOutcome>
  sessionStop(): Promise<SessionStopOutcome>
}

export async function callKorrid<Request extends RpcRequest>(
  baseUrl: string,
  request: Request,
): Promise<RpcResponseFor<Request>> {
  const response = await fetch(`${baseUrl}/rpc`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
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

export function createHttpKorridClient(baseUrl: string): KorridClient {
  return {
    async health() {
      try {
        const response = await callKorrid(baseUrl, {
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
        const response = await callKorrid(baseUrl, {
          _tag: "app.catalog.snapshot",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async sessionPrepare(gameId) {
      try {
        const response = await callKorrid(baseUrl, {
          _tag: "app.session.prepare",
          payload: { gameId },
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async sessionStatus() {
      try {
        const response = await callKorrid(baseUrl, {
          _tag: "app.session.status",
          payload: {},
        })
        return response.outcome
      } catch (error) {
        return unreachable(error)
      }
    },
    async sessionStop() {
      try {
        const response = await callKorrid(baseUrl, {
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
    | "status-fail"
    | "stop-fail"
  readonly games?: readonly Game[]
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
    async sessionPrepare(gameId) {
      if (behavior === "prepare-fail" || !games.some(game => game.id === gameId)) {
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

export async function smokeKorrid(baseUrl: string) {
  const client = createHttpKorridClient(baseUrl)
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
