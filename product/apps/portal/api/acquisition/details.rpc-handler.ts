import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { DetailsRequest } from "@platform/protocol/acquisition/candidate"
import { Effect } from "effect"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"

export const handleAcquisitionDetails = (payload: DetailsRequest) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* acquisition
      .details(payload)
      .pipe(Effect.mapError(toAcquisitionRpcError))
  })
