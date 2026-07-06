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

export interface RemoteCatalogSourceService {
  readonly search: (
    request: SearchRequest,
  ) => Effect.Effect<SearchResponse, RemoteCatalogError>
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
})

/**
 * In-memory layer for tests and samples: case-insensitive title-contains
 * matching over a fixed claim set, echoing the shape a plugin search returns.
 */
export function makeInMemoryRemoteCatalogSourceLayer(
  claims: SearchResponse["claims"],
) {
  return Layer.succeed(RemoteCatalogSource)({
    search: request => {
      const query = request.query.trim().toLowerCase()
      return Effect.succeed({
        claims: claims.filter(claim =>
          claim.title.toLowerCase().includes(query),
        ),
      })
    },
  })
}

/** Always-failing layer for exercising the search error state. */
export function makeFailingRemoteCatalogSourceLayer(message: string) {
  return Layer.succeed(RemoteCatalogSource)({
    search: () =>
      Effect.fail(new RemoteCatalogError({ reason: "unavailable", message })),
  })
}
