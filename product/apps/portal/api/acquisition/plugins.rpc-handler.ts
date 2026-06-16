import { Acquisition } from "@platform/acquisition/acquisition-service"
import { Effect } from "effect"
import { toAcquisitionRpcError } from "./acquisition-rpc-errors"
import type { AcquisitionPluginsPayload } from "./plugins.rpc"

export const handleAcquisitionPlugins = (_payload: AcquisitionPluginsPayload) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* acquisition
      .providers()
      .pipe(Effect.mapError(toAcquisitionRpcError))
  })
