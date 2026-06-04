import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { ResolveDownloadRequest } from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"

export const handleAcquisitionResolveDownload = (
  payload: ResolveDownloadRequest,
) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* acquisition
      .resolveDownload(payload)
      .pipe(Effect.mapError(toAcquisitionRpcError))
  })
