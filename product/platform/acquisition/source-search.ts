import type {
  SearchRequest,
  SearchResponse,
} from "@platform/protocol/acquisition/claim"
import { Effect } from "effect"
import type { AcquisitionError } from "./errors"
import { validatePluginSearchOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import {
  type AcquisitionPluginRegistry,
  selectAcquisitionPlugins,
} from "./plugins/registry"

export interface SearchProvidersOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: SearchRequest
}

export function searchProviders({
  registry,
  context,
  request,
}: SearchProvidersOptions): Effect.Effect<SearchResponse, AcquisitionError> {
  return Effect.gen(function* () {
    const plugins = yield* selectAcquisitionPlugins(
      registry,
      request.providerIds,
    )
    const chunks = yield* Effect.all(
      plugins.map(plugin => {
        const search = plugin.search
        if (!search) return Effect.succeed([])
        return runPluginOperation({
          providerId: plugin.metadata.providerId,
          operation: "search",
          context,
          run: () =>
            search(context, {
              query: request.query,
              platforms: request.platforms,
            }),
          validate: validatePluginSearchOutput,
        })
      }),
    )
    return { claims: chunks.flat() }
  })
}
