import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { ValidateSourcesRequest } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"

export const handleAcquisitionValidateSources = (
  payload: ValidateSourcesRequest,
) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* acquisition
      .validateSources(payload)
      .pipe(Effect.mapError(toAcquisitionRpcError))
  })
