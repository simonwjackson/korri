import { ApiError } from "@platform/api/rpc/errors"
import {
  ValidateSourcesRequest,
  ValidateSourcesResponse,
} from "@platform/protocol/acquisition/source-health"
import { Rpc } from "effect/unstable/rpc"

export const AcquisitionValidateSourcesRpc = Rpc.make(
  "app.acquisition.validate-sources",
  {
    payload: ValidateSourcesRequest,
    success: ValidateSourcesResponse,
    error: ApiError,
  },
)
