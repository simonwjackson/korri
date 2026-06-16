import { Effect } from "effect"
import { AcquisitionError } from "./errors"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import { redactCredentialText } from "./security"

export type AcquisitionPluginOperationName =
  | "search"
  | "details"
  | "validateProvider"
  | "resolveDownload"
  | "acquireArtifact"

export interface PluginOperationHarnessOptions<A> {
  readonly providerId: string
  readonly operation: AcquisitionPluginOperationName
  readonly context: AcquisitionPluginContext
  readonly run: () => Effect.Effect<A, AcquisitionError>
  readonly validate: (value: A) => A
}

export function runPluginOperation<A>({
  providerId,
  operation,
  run,
  validate,
}: PluginOperationHarnessOptions<A>): Effect.Effect<A, AcquisitionError> {
  return Effect.gen(function* () {
    const operationEffect = yield* Effect.try({
      try: run,
      catch: error => toAcquisitionError(providerId, operation, error),
    })
    const value = yield* Effect.mapError(operationEffect, error =>
      toAcquisitionError(providerId, operation, error),
    )
    return yield* Effect.try({
      try: () => validate(value),
      catch: error => toAcquisitionError(providerId, operation, error),
    })
  })
}

function toAcquisitionError(
  providerId: string,
  operation: AcquisitionPluginOperationName,
  error: unknown,
): AcquisitionError {
  if (error instanceof AcquisitionError) {
    return new AcquisitionError({
      reason: error.reason,
      message: redactCredentialText(error.message),
      providerId: error.providerId ?? providerId,
    })
  }
  return new AcquisitionError({
    reason: "defective-provider",
    message: `${operation} failed for ${providerId}: ${redactCredentialText(
      error instanceof Error ? error.message : String(error),
    )}`,
    providerId,
  })
}
