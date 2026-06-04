import type {
  SourceHealth,
  ValidateSourcesRequest,
  ValidateSourcesResponse,
} from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { AcquisitionError } from "../errors"
import { validatePluginSourceHealthOutput } from "../plugin-contract-codecs"
import { runPluginOperation } from "../plugin-operation-harness"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import type { AcquisitionPluginRegistry } from "../plugins/registry"
import { validateKnownSourceName } from "../source-names"

export interface ValidateAcquisitionSourcesOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: ValidateSourcesRequest
}

export function validateAcquisitionSources({
  registry,
  context,
  request,
}: ValidateAcquisitionSourcesOptions): Effect.Effect<
  ValidateSourcesResponse,
  AcquisitionError
> {
  return Effect.gen(function* () {
    const checkedAt = context.clock.nowIso()
    const plugins = yield* selectedPlugins(registry, request.sourceNames)
    const sources = yield* Effect.all(
      plugins.map(plugin => {
        const validateSource = plugin.validateSource
        if (!validateSource) {
          return Effect.succeed<SourceHealth>({
            _tag: "UnhealthySource",
            sourceName: plugin.metadata.sourceName,
            checkedAt,
            reason: "defective-source",
            message: "No safe validation probe is configured.",
          })
        }
        return runPluginOperation({
          sourceName: plugin.metadata.sourceName,
          operation: "validateSource",
          context,
          run: () =>
            validateSource({
              ...context,
              checkedAt,
            }),
          validate: validatePluginSourceHealthOutput,
        })
      }),
    )
    return { sources }
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
