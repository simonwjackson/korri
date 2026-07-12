import { describe, expect, it } from "bun:test"
import { AcquisitionError } from "@platform/acquisition/errors"
import type { AcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"
import { Deferred, Effect } from "effect"
import {
  getAcquireJob,
  makeAcquireJobStore,
  startAcquireJob,
} from "./acquire-jobs"

const request = {
  providerId: "@local:fixture-roms",
  id: "drill-dozer",
  url: "https://roms.example.com/roms/drill-dozer",
} as const

const artifact = {
  id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  kind: "content",
  format: { id: "gba" },
  file: { name: "Drill Dozer (U).gba", extension: "gba" },
  stagedPath: "/tmp/staging/sha256/aa/file.gba",
  digests: {
    sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  },
} as unknown as AcquiredArtifact

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe("acquire job store", () => {
  it("stages a job and exposes the artifact fields", async () => {
    const store = makeAcquireJobStore()
    const job = await Effect.runPromise(
      startAcquireJob(
        { acquireArtifact: () => Effect.succeed(artifact) },
        request,
        store,
      ),
    )
    expect(job.state).toBe("acquiring")

    await settle()
    const finished = getAcquireJob(job.jobId, store)
    expect(finished?.state).toBe("staged")
    expect(finished?.fileName).toBe("Drill Dozer (U).gba")
    expect(finished?.stagedPath).toBe("/tmp/staging/sha256/aa/file.gba")
  })

  it("records failures with a readable message", async () => {
    const store = makeAcquireJobStore()
    const job = await Effect.runPromise(
      startAcquireJob(
        {
          acquireArtifact: () =>
            Effect.fail(
              new AcquisitionError({
                reason: "infrastructure",
                message: "download failed: HTTP 503",
              }),
            ),
        },
        request,
        store,
      ),
    )

    await settle()
    const finished = getAcquireJob(job.jobId, store)
    expect(finished?.state).toBe("failed")
    expect(finished?.message).toContain("download failed: HTTP 503")
  })

  it("reuses the running job for repeated requests on the same claim", async () => {
    const store = makeAcquireJobStore()
    const gate = await Effect.runPromise(Deferred.make<AcquiredArtifact>())
    const acquisition = {
      acquireArtifact: () => Deferred.await(gate),
    }

    const first = await Effect.runPromise(
      startAcquireJob(acquisition, request, store),
    )
    const second = await Effect.runPromise(
      startAcquireJob(acquisition, request, store),
    )
    expect(second.jobId).toBe(first.jobId)

    await Effect.runPromise(Deferred.succeed(gate, artifact))
    await settle()
    expect(getAcquireJob(first.jobId, store)?.state).toBe("staged")

    const third = await Effect.runPromise(
      startAcquireJob(acquisition, request, store),
    )
    expect(third.jobId).not.toBe(first.jobId)
  })
})
