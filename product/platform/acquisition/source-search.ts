import type {
  SearchRequest,
  SearchResponse,
} from "@platform/protocol/acquisition/candidate"
import { Effect } from "effect"
import { AcquisitionError } from "./errors"
import { validatePluginSearchOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"
import { validateKnownSourceName } from "./source-names"

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
    const plugins = yield* selectedPlugins(registry, request.sourceNames)
    const chunks = yield* Effect.all(
      plugins.map(plugin => {
        const search = plugin.search
        if (!search) return Effect.succeed([])
        return runPluginOperation({
          sourceName: plugin.metadata.sourceName,
          operation: "search",
          context,
          run: () => search(context, { query: request.query }),
          validate: validatePluginSearchOutput,
        })
      }),
    )
    return { candidates: chunks.flat() }
  })
}

function selectedPlugins(
  registry: AcquisitionPluginRegistry,
  sourceNames?: readonly string[],
): Effect.Effect<
  readonly AcquisitionPluginRegistry["plugins"][number][],
  AcquisitionError
> {
  return Effect.try({
    try: () => {
      if (!sourceNames || sourceNames.length === 0) return registry.plugins
      return sourceNames.map(sourceName =>
        registry.get(validateKnownSourceName(sourceName, registry.sourceNames)),
      )
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "caller",
            message: error instanceof Error ? error.message : String(error),
          }),
  })
}
