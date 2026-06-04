import { Effect } from "effect"
import { AcquisitionError } from "./errors"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import { redactCredentialText } from "./security"

export type AcquisitionPluginOperationName =
  | "search"
  | "details"
  | "validateSource"
  | "resolveDownload"

export interface PluginOperationHarnessOptions<A> {
  readonly sourceName: string
  readonly operation: AcquisitionPluginOperationName
  readonly context: AcquisitionPluginContext
  readonly run: () => Effect.Effect<A, AcquisitionError>
  readonly validate: (value: A) => A
}

export function runPluginOperation<A>({
  sourceName,
  operation,
  run,
  validate,
}: PluginOperationHarnessOptions<A>): Effect.Effect<A, AcquisitionError> {
  return Effect.gen(function* () {
    const operationEffect = yield* Effect.try({
      try: run,
      catch: error => toAcquisitionError(sourceName, operation, error),
    })
    const value = yield* Effect.mapError(operationEffect, error =>
      toAcquisitionError(sourceName, operation, error),
    )
    return yield* Effect.try({
      try: () => validate(value),
      catch: error => toAcquisitionError(sourceName, operation, error),
    })
  })
}

function toAcquisitionError(
  sourceName: string,
  operation: AcquisitionPluginOperationName,
  error: unknown,
): AcquisitionError {
  if (error instanceof AcquisitionError) {
    return new AcquisitionError({
      reason: error.reason,
      message: redactCredentialText(error.message),
      sourceName: error.sourceName ?? sourceName,
    })
  }
  return new AcquisitionError({
    reason: "defective-source",
    message: `${operation} failed for ${sourceName}: ${redactCredentialText(
      error instanceof Error ? error.message : String(error),
    )}`,
    sourceName,
  })
}
