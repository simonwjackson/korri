import { NotFoundError } from "@platform/api/rpc/errors"
import { Effect } from "effect"
import { getAcquireJob } from "./acquire-jobs"
import type { AcquireStatusRequest } from "./acquire-status.rpc"

export const handleAcquisitionAcquireStatus = (payload: AcquireStatusRequest) =>
  Effect.gen(function* () {
    const job = getAcquireJob(payload.jobId)
    if (!job) {
      return yield* Effect.fail(
        new NotFoundError({
          message: `Unknown acquire job: ${payload.jobId}`,
        }),
      )
    }
    return job
  })
