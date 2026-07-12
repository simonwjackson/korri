import { ApiError } from "@platform/api/rpc/errors"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"
import { AcquireJobStatus } from "./acquire.rpc"

export const AcquireStatusRequest = Schema.Struct({
  jobId: Schema.String,
})
export type AcquireStatusRequest = Schema.Schema.Type<
  typeof AcquireStatusRequest
>

export const AcquisitionAcquireStatusRpc = Rpc.make(
  "app.acquisition.acquire-status",
  {
    payload: AcquireStatusRequest,
    success: AcquireJobStatus,
    error: ApiError,
  },
)
