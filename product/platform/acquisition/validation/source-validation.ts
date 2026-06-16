import type {
  ProviderHealth,
  ValidateProvidersRequest,
  ValidateProvidersResponse,
} from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import type { AcquisitionError } from "../errors"
import { validatePluginProviderHealthOutput } from "../plugin-contract-codecs"
import { runPluginOperation } from "../plugin-operation-harness"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import {
  type AcquisitionPluginRegistry,
  selectAcquisitionPlugins,
} from "../plugins/registry"

export interface ValidateAcquisitionProvidersOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: ValidateProvidersRequest
}

export function validateAcquisitionProviders({
  registry,
  context,
  request,
}: ValidateAcquisitionProvidersOptions): Effect.Effect<
  ValidateProvidersResponse,
  AcquisitionError
> {
  return Effect.gen(function* () {
    const checkedAt = context.clock.nowIso()
    const plugins = yield* selectAcquisitionPlugins(
      registry,
      request.providerIds,
    )
    const providers = yield* Effect.all(
      plugins.map(plugin => {
        const validateProvider = plugin.validateProvider
        if (!validateProvider) {
          return Effect.succeed<ProviderHealth>({
            _tag: "UnhealthyProvider",
            providerId: plugin.metadata.providerId,
            checkedAt,
            reason: "defective-provider",
            message: "No safe validation probe is configured.",
          })
        }
        return runPluginOperation({
          providerId: plugin.metadata.providerId,
          operation: "validateProvider",
          context,
          run: () =>
            validateProvider({
              ...context,
              checkedAt,
            }),
          validate: validatePluginProviderHealthOutput,
        })
      }),
    )
    return { providers }
  })
}
