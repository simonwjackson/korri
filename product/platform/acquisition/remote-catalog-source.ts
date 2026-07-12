/**
 * Remote catalog source — the client-side seam for searching the remote
 * catalogs the acquisition plugins expose.
 *
 * Mirrors `CatalogFactsSource`: a small Context service the UI reads through
 * atoms, with the transport (RPC over the platform bridge, in-memory fixtures
 * in tests) provided by the composition root as a Layer. The server-side
 * counterpart is `searchProviders` behind `app.acquisition.search`, which fans
 * a query out to every registered plugin with a `search` capability and
 * returns their normalized `ProviderClaim`s.
 */
import type {
  SearchRequest,
  SearchResponse,
} from "@platform/protocol/acquisition/claim"
import { Context, Effect, Layer, Schema } from "effect"

export class RemoteCatalogError extends Schema.TaggedErrorClass<RemoteCatalogError>()(
  "RemoteCatalogError",
  {
    reason: Schema.Literals(["unavailable", "invalid"]),
    message: Schema.optional(Schema.String),
  },
) {}

/** Client-side view of an acquire job: mirrors app.acquisition.acquire. */
export interface RemoteCatalogAcquireRequest {
  readonly providerId: string
  readonly id: string
  readonly url?: string
  readonly fileName?: string
}

export interface RemoteCatalogAcquireStatus {
  readonly jobId: string
  readonly providerId: string
  readonly id: string
  readonly state: "acquiring" | "staged" | "failed"
  readonly fileName?: string
  readonly stagedPath?: string
  readonly system?: string
  readonly message?: string
}

export interface RemoteCatalogSourceService {
  readonly search: (
    request: SearchRequest,
  ) => Effect.Effect<SearchResponse, RemoteCatalogError>
  readonly acquire: (
    request: RemoteCatalogAcquireRequest,
  ) => Effect.Effect<RemoteCatalogAcquireStatus, RemoteCatalogError>
  readonly acquireStatus: (
    jobId: string,
  ) => Effect.Effect<RemoteCatalogAcquireStatus, RemoteCatalogError>
}

export class RemoteCatalogSource extends Context.Service<
  RemoteCatalogSource,
  RemoteCatalogSourceService
>()("RemoteCatalogSource") {}

/** Default layer: parks readers on loading until a real transport is seeded. */
export const loadingForeverRemoteCatalogSourceLayer = Layer.succeed(
  RemoteCatalogSource,
)({
  search: () => Effect.never,
  acquire: () => Effect.never,
  acquireStatus: () => Effect.never,
})

/**
 * In-memory layer for tests and samples: case-insensitive title-contains
 * matching over a fixed claim set, echoing the shape a plugin search returns.
 */
export function makeInMemoryRemoteCatalogSourceLayer(
  claims: SearchResponse["claims"],
) {
  let jobSequence = 0
  const jobs = new Map<string, RemoteCatalogAcquireStatus>()
  return Layer.succeed(RemoteCatalogSource)({
    search: request => {
      const query = request.query.trim().toLowerCase()
      return Effect.succeed({
        claims: claims.filter(claim =>
          claim.title.toLowerCase().includes(query),
        ),
      })
    },
    // Acquires resolve immediately in-memory: one poll observes "staged".
    acquire: request => {
      const jobId = `in-memory-${++jobSequence}`
      const status: RemoteCatalogAcquireStatus = {
        jobId,
        providerId: request.providerId,
        id: request.id,
        state: "staged",
        fileName: request.fileName ?? `${request.id}.bin`,
        stagedPath: `/tmp/in-memory-staging/${jobId}`,
      }
      jobs.set(jobId, status)
      return Effect.succeed(status)
    },
    acquireStatus: jobId => {
      const status = jobs.get(jobId)
      return status
        ? Effect.succeed(status)
        : Effect.fail(
            new RemoteCatalogError({
              reason: "invalid",
              message: `unknown in-memory acquire job ${jobId}`,
            }),
          )
    },
  })
}

/** Always-failing layer for exercising the search error state. */
export function makeFailingRemoteCatalogSourceLayer(message: string) {
  const fail = () =>
    Effect.fail(new RemoteCatalogError({ reason: "unavailable", message }))
  return Layer.succeed(RemoteCatalogSource)({
    search: fail,
    acquire: fail,
    acquireStatus: fail,
  })
}
