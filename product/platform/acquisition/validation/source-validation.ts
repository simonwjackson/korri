import type {
  SourceHealth,
  ValidateSourcesRequest,
  ValidateSourcesResponse,
} from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import type { AcquisitionError } from "../errors"
import { validatePluginSourceHealthOutput } from "../plugin-contract-codecs"
import { runPluginOperation } from "../plugin-operation-harness"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import {
  type AcquisitionPluginRegistry,
  selectAcquisitionPlugins,
} from "../plugins/registry"

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
    const plugins = yield* selectAcquisitionPlugins(
      registry,
      request.sourceNames,
    )
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
