import { ApiError } from "@platform/api/rpc/errors"
import {
  ValidateProvidersRequest,
  ValidateProvidersResponse,
} from "@platform/protocol/acquisition/source-health"
import { Rpc } from "effect/unstable/rpc"

export const AcquisitionValidateProvidersRpc = Rpc.make(
  "app.acquisition.validate-providers",
  {
    payload: ValidateProvidersRequest,
    success: ValidateProvidersResponse,
    error: ApiError,
  },
)
