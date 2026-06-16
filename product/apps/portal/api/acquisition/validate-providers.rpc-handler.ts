import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { ValidateProvidersRequest } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"

export const handleAcquisitionValidateProviders = (
  payload: ValidateProvidersRequest,
) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* acquisition
      .validateProviders(payload)
      .pipe(Effect.mapError(toAcquisitionRpcError))
  })
