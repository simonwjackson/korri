import { describe, expect, it } from "bun:test"
import type { PlacedArtifact } from "@platform/acquisition/artifact-placement"
import { AcquisitionError } from "@platform/acquisition/errors"
import type { AcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"
import { Deferred, Effect } from "effect"
import {
  type AcquirePlacementRunner,
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

const placed: PlacedArtifact = {
  storageId: "roms",
  storageRoot: "/run/media/korri/card/roms",
  relativePath: "gba/Drill Dozer (U).gba",
  absolutePath: "/run/media/korri/card/roms/gba/Drill Dozer (U).gba",
  alreadyPresent: false,
}

const importingPlacement: AcquirePlacementRunner = {
  placeAndImport: async () => placed,
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe("acquire job store", () => {
  it("imports a job through placement and exposes the placed path", async () => {
    const store = makeAcquireJobStore()
    const job = await Effect.runPromise(
      startAcquireJob(
        { acquireArtifact: () => Effect.succeed(artifact) },
        request,
        importingPlacement,
        store,
      ),
    )
    expect(job.state).toBe("acquiring")

    await settle()
    const finished = getAcquireJob(job.jobId, store)
    expect(finished?.state).toBe("imported")
    expect(finished?.fileName).toBe("Drill Dozer (U).gba")
    expect(finished?.stagedPath).toBe("/tmp/staging/sha256/aa/file.gba")
    expect(finished?.placedPath).toBe(placed.absolutePath)
  })

  it("settles as staged with a message when placement fails", async () => {
    const store = makeAcquireJobStore()
    const job = await Effect.runPromise(
      startAcquireJob(
        { acquireArtifact: () => Effect.succeed(artifact) },
        request,
        {
          placeAndImport: async () => {
            throw new Error("no configured library storage root is available")
          },
        },
        store,
      ),
    )

    await settle()
    const finished = getAcquireJob(job.jobId, store)
    expect(finished?.state).toBe("staged")
    expect(finished?.message).toContain("library import failed")
    expect(finished?.stagedPath).toBe("/tmp/staging/sha256/aa/file.gba")
  })

  it("settles as staged with a message when placement is not configured", async () => {
    const store = makeAcquireJobStore()
    const job = await Effect.runPromise(
      startAcquireJob(
        { acquireArtifact: () => Effect.succeed(artifact) },
        request,
        undefined,
        store,
      ),
    )

    await settle()
    const finished = getAcquireJob(job.jobId, store)
    expect(finished?.state).toBe("staged")
    expect(finished?.message).toContain("not configured")
  })

  it("records download failures with a readable message", async () => {
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
        importingPlacement,
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
      startAcquireJob(acquisition, request, importingPlacement, store),
    )
    const second = await Effect.runPromise(
      startAcquireJob(acquisition, request, importingPlacement, store),
    )
    expect(second.jobId).toBe(first.jobId)

    await Effect.runPromise(Deferred.succeed(gate, artifact))
    await settle()
    expect(getAcquireJob(first.jobId, store)?.state).toBe("imported")

    const third = await Effect.runPromise(
      startAcquireJob(acquisition, request, importingPlacement, store),
    )
    expect(third.jobId).not.toBe(first.jobId)
  })
})
