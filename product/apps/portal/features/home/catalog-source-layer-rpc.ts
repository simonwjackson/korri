import { RpcClientLive } from "@platform/api/rpc/client"
import {
  CatalogFactsError,
  CatalogFactsSource,
  type CatalogSnapshotScope,
} from "@platform/catalog/catalog-facts-source"
import { appRpcGroup } from "@product/apps/portal/api/app-rpc-group"
import { Effect, Layer } from "effect"
import { RpcClient } from "effect/unstable/rpc"

export const CatalogFactsSourceLayerRpc = Layer.effect(CatalogFactsSource)(
  RpcClient.make(appRpcGroup).pipe(
    Effect.map(client => ({
      snapshot: (scope: CatalogSnapshotScope = "fabric") =>
        client["app.catalog.snapshot"]({ scope }).pipe(
          Effect.catchCause(cause => Effect.fail(toCatalogFactsError(cause))),
        ),
    })),
  ),
).pipe(Layer.provide(RpcClientLive))

function toCatalogFactsError(error: unknown): CatalogFactsError {
  return new CatalogFactsError({
    reason: "unavailable",
    message: error instanceof Error ? error.message : String(error),
  })
}
