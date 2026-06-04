import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { SearchRequest } from "@platform/protocol/acquisition/candidate"
import { Effect } from "effect"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"

export const handleAcquisitionSearch = (payload: SearchRequest) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* acquisition
      .search(payload)
      .pipe(Effect.mapError(toAcquisitionRpcError))
  })
