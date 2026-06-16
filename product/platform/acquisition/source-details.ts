import type {
  DetailsRequest,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import { Effect } from "effect"
import { acquisitionTry } from "./effect"
import { AcquisitionError } from "./errors"
import { validatePluginDetailsOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"

export interface GetProviderDetailsOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: DetailsRequest
}

export function getProviderDetailsByUrl({
  registry,
  context,
  url,
}: Omit<GetProviderDetailsOptions, "request"> & {
  readonly url: string
}): Effect.Effect<ProviderClaimDetails, AcquisitionError> {
  return Effect.gen(function* () {
    for (const plugin of registry.providers) {
      const id = yield* acquisitionTry(
        () => plugin.parseCandidateUrl?.(url) ?? null,
      )
      if (id) {
        return yield* getProviderDetails({
          registry,
          context,
          request: { providerId: plugin.metadata.providerId, id },
        })
      }
    }

    return yield* Effect.fail(
      new AcquisitionError({
        reason: "caller",
        message: `No provider found that can handle URL: ${url}`,
      }),
    )
  })
}

export function getProviderDetails({
  registry,
  context,
  request,
}: GetProviderDetailsOptions): Effect.Effect<
  ProviderClaimDetails,
  AcquisitionError
> {
  return Effect.gen(function* () {
    const plugin = yield* acquisitionTry(() => registry.get(request.providerId))
    const details = plugin.details
    if (!details) {
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "defective-provider",
          message: `${plugin.metadata.providerId} does not implement details`,
          providerId: plugin.metadata.providerId,
        }),
      )
    }
    return yield* runPluginOperation({
      providerId: plugin.metadata.providerId,
      operation: "details",
      context,
      run: () => details(context, request),
      validate: validatePluginDetailsOutput,
    })
  })
}
