import { ApiError } from "@platform/api/rpc/errors"
import {
  DetailsRequest,
  SourceDetails,
} from "@platform/protocol/acquisition/candidate"
import { Rpc } from "effect/unstable/rpc"

export const AcquisitionDetailsRpc = Rpc.make("app.acquisition.details", {
  payload: DetailsRequest,
  success: SourceDetails,
  error: ApiError,
})
