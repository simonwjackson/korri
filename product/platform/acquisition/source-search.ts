import type {
  SearchRequest,
  SearchResponse,
} from "@platform/protocol/acquisition/candidate"
import { Effect } from "effect"
import type { AcquisitionError } from "./errors"
import { validatePluginSearchOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import {
  type AcquisitionPluginRegistry,
  selectAcquisitionPlugins,
} from "./plugins/registry"

export interface SearchSourcesOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: SearchRequest
}

export function searchSources({
  registry,
  context,
  request,
}: SearchSourcesOptions): Effect.Effect<SearchResponse, AcquisitionError> {
  return Effect.gen(function* () {
    const plugins = yield* selectAcquisitionPlugins(
      registry,
      request.sourceNames,
    )
    const chunks = yield* Effect.all(
      plugins.map(plugin => {
        const search = plugin.search
        if (!search) return Effect.succeed([])
        return runPluginOperation({
          sourceName: plugin.metadata.sourceName,
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
    return { candidates: chunks.flat() }
  })
}
