import { Acquisition } from "@platform/acquisition/acquisition-service"
import type { AcquireArtifactRequest } from "@platform/protocol/acquisition/artifact-acquisition"
import { createFirstPartyPluginState } from "@product/plugin-host/state"
import { Effect } from "effect"
import { startAcquireJob } from "./acquire-jobs"
import { createAcquirePlacementRunner } from "./acquire-placement"

export const handleAcquisitionAcquire = (payload: AcquireArtifactRequest) =>
  Effect.gen(function* () {
    const acquisition = yield* Acquisition
    const placement = createAcquirePlacementRunner({
      discoveryProviders:
        createFirstPartyPluginState().registry.discoveryProviders,
    })
    return yield* startAcquireJob(acquisition, payload, placement)
  })
