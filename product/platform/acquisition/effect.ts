import { Effect } from "effect"
import { AcquisitionError } from "./errors"

export function acquisitionTry<A>(
  run: () => A,
): Effect.Effect<A, AcquisitionError> {
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
