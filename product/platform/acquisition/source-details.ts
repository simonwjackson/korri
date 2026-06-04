import type {
  DetailsRequest,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import { Effect } from "effect"
import { AcquisitionError } from "./errors"
import { validatePluginDetailsOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"

export interface GetSourceDetailsOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: DetailsRequest
}

export function getSourceDetails({
  registry,
  context,
  request,
}: GetSourceDetailsOptions): Effect.Effect<SourceDetails, AcquisitionError> {
  return Effect.gen(function* () {
    const plugin = yield* acquisitionTry(() => registry.get(request.sourceName))
    const details = plugin.details
    if (!details) {
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "defective-source",
          message: `${plugin.metadata.sourceName} does not implement details`,
          sourceName: plugin.metadata.sourceName,
        }),
      )
    }
    return yield* runPluginOperation({
      sourceName: plugin.metadata.sourceName,
      operation: "details",
      context,
      run: () => details(context, request),
      validate: validatePluginDetailsOutput,
    })
  })
}

function acquisitionTry<A>(run: () => A): Effect.Effect<A, AcquisitionError> {
  return Effect.try({
    try: run,
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "caller",
            message: error instanceof Error ? error.message : String(error),
          }),
  })
}
