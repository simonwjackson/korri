import type { ProviderClaim } from "@platform/protocol/acquisition/claim"
import { Context, Effect, Layer } from "effect"
import type { AcquisitionError } from "../errors"

export interface ProviderClaimStoreService {
  readonly putMany: (
    claims: readonly ProviderClaim[],
  ) => Effect.Effect<readonly ProviderClaim[], AcquisitionError>
  readonly query: (filter?: {
    readonly providerId?: string
  }) => Effect.Effect<readonly ProviderClaim[], AcquisitionError>
  readonly wipe: (filter?: {
    readonly providerId?: string
  }) => Effect.Effect<void, AcquisitionError>
}

export class ProviderClaimStore extends Context.Service<
  ProviderClaimStore,
  ProviderClaimStoreService
>()("ProviderClaimStore") {}

export function makeInMemoryProviderClaimStoreLayer(
  seed: readonly ProviderClaim[] = [],
): Layer.Layer<ProviderClaimStore> {
  const claims = new Map<string, ProviderClaim>()
  const keyFor = (claim: ProviderClaim) =>
    `${claim.providerId}\u0000${claim.id}`
  for (const claim of seed) claims.set(keyFor(claim), claim)
  return Layer.succeed(ProviderClaimStore, {
    putMany: next =>
      Effect.sync(() => {
        for (const claim of next) claims.set(keyFor(claim), claim)
        return next
      }),
    query: filter =>
      Effect.sync(() =>
        [...claims.values()].filter(claim =>
          filter?.providerId ? claim.providerId === filter.providerId : true,
        ),
      ),
    wipe: filter =>
      Effect.sync(() => {
        if (!filter?.providerId) {
          claims.clear()
          return
        }
        for (const [key, claim] of claims) {
          if (claim.providerId === filter.providerId) claims.delete(key)
        }
      }),
  })
}
