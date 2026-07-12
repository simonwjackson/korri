import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { AcquireArtifactRequest } from "@platform/protocol/acquisition/artifact-acquisition"
import { Effect } from "effect"
import { startAcquireJob } from "./acquire-jobs"

export const handleAcquisitionAcquire = (payload: AcquireArtifactRequest) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    return yield* startAcquireJob(acquisition, payload)
  })
