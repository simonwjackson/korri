import { ApiError } from "@platform/api/rpc/errors"
import { AcquireArtifactRequest } from "@platform/protocol/acquisition/artifact-acquisition"
import { Schema } from "effect"
import { Rpc } from "effect/unstable/rpc"

export const AcquireJobStatus = Schema.Struct({
  jobId: Schema.String,
  providerId: Schema.String,
  id: Schema.String,
  state: Schema.Literals(["acquiring", "staged", "imported", "failed"]),
  fileName: Schema.optional(Schema.String),
  stagedPath: Schema.optional(Schema.String),
  placedPath: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
})
export type AcquireJobStatus = Schema.Schema.Type<typeof AcquireJobStatus>

export const AcquisitionAcquireRpc = Rpc.make("app.acquisition.acquire", {
  payload: AcquireArtifactRequest,
  success: AcquireJobStatus,
  error: ApiError,
})
