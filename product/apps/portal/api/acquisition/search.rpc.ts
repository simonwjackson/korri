import { ApiError } from "@platform/api/rpc/errors"
import {
  SearchRequest,
  SearchResponse,
} from "@platform/protocol/acquisition/candidate"
import { Rpc } from "effect/unstable/rpc"

export const AcquisitionSearchRpc = Rpc.make("app.acquisition.search", {
  payload: SearchRequest,
  success: SearchResponse,
  error: ApiError,
})
