/**
 * In-memory acquire job store.
 *
 * `app.acquisition.acquire` starts a background pipeline — stage the artifact
 * through the Acquisition service, place it into a configured library
 * storage, then run the configured Scout scan so the release imports — and
 * returns immediately with a job snapshot; `app.acquisition.acquire-status`
 * polls it. Mirrors the plugin-install request/status pattern: acquisitions
 * outlive the RPC that started them, and repeated Get presses on the same
 * claim reuse the running job instead of downloading twice.
 *
 * Terminal states: `imported` (in the library), `staged` (downloaded but
 * import unavailable/failed — message says why, bytes are kept), `failed`.
 */
import { randomUUID } from "node:crypto"
import type { AcquisitionService } from "@platform/acquisition/acquisition-service"
import type { PlacedArtifact } from "@platform/acquisition/artifact-placement"
import type {
  AcquireArtifactRequest,
  AcquiredArtifact,
} from "@platform/protocol/acquisition/artifact-acquisition"
import { Effect } from "effect"

export type AcquireJobState = "acquiring" | "staged" | "imported" | "failed"

export interface AcquireJobSnapshot {
  readonly jobId: string
  readonly providerId: string
  readonly id: string
  readonly state: AcquireJobState
  readonly fileName?: string
  readonly stagedPath?: string
  readonly placedPath?: string
  readonly system?: string
  readonly message?: string
}

/** Placement + import step, injected by the composition root. */
export interface PlaceAndImportResult {
  readonly placed: PlacedArtifact
  /** True only when a library entry actually references the placed file. */
  readonly imported: boolean
}

export interface AcquirePlacementRunner {
  readonly placeAndImport: (
    artifact: AcquiredArtifact,
    request: AcquireArtifactRequest,
  ) => Promise<PlaceAndImportResult>
}

interface AcquireJobStore {
  readonly jobs: Map<string, AcquireJobSnapshot>
  readonly activeByClaim: Map<string, string>
}

const defaultStore: AcquireJobStore = {
  jobs: new Map(),
  activeByClaim: new Map(),
}

const claimKey = (request: AcquireArtifactRequest): string =>
  `${request.providerId}\u0000${request.id}`

export function getAcquireJob(
  jobId: string,
  store: AcquireJobStore = defaultStore,
): AcquireJobSnapshot | undefined {
  return store.jobs.get(jobId)
}

export function startAcquireJob(
  acquisition: Pick<AcquisitionService, "acquireArtifact">,
  request: AcquireArtifactRequest,
  placement: AcquirePlacementRunner | undefined,
  store: AcquireJobStore = defaultStore,
): Effect.Effect<AcquireJobSnapshot> {
  return Effect.gen(function* () {
    const key = claimKey(request)
    const activeJobId = store.activeByClaim.get(key)
    if (activeJobId) {
      const active = store.jobs.get(activeJobId)
      if (active && active.state === "acquiring") return active
    }

    const jobId = randomUUID()
    const job: AcquireJobSnapshot = {
      jobId,
      providerId: request.providerId,
      id: request.id,
      state: "acquiring",
      ...(request.fileName ? { fileName: request.fileName } : {}),
    }
    store.jobs.set(jobId, job)
    store.activeByClaim.set(key, jobId)

    const pipeline = Effect.gen(function* () {
      const artifact = yield* acquisition.acquireArtifact(request)
      const staged: AcquireJobSnapshot = {
        ...job,
        state: "staged",
        fileName: artifact.file.name,
        stagedPath: artifact.stagedPath,
        ...(artifact.system ? { system: artifact.system } : {}),
      }
      store.jobs.set(jobId, staged)

      if (!placement) {
        store.jobs.set(jobId, {
          ...staged,
          message: "Downloaded; library import is not configured on this host.",
        })
        return
      }

      const imported = yield* Effect.tryPromise(() =>
        placement.placeAndImport(artifact, request),
      ).pipe(
        Effect.map(
          (result): AcquireJobSnapshot =>
            result.imported
              ? {
                  ...staged,
                  state: "imported",
                  placedPath: result.placed.absolutePath,
                }
              : {
                  ...staged,
                  placedPath: result.placed.absolutePath,
                  message:
                    "Downloaded, but the Library did not recognize it as a playable game.",
                },
        ),
        Effect.catchCause(cause =>
          Effect.succeed<AcquireJobSnapshot>({
            ...staged,
            message: `Downloaded, but library import failed: ${summarizeAcquireFailure(cause)}`,
          }),
        ),
      )
      store.jobs.set(jobId, imported)
    }).pipe(
      Effect.catchCause(cause =>
        Effect.sync(() => {
          store.jobs.set(jobId, {
            ...job,
            state: "failed",
            message: summarizeAcquireFailure(cause),
          })
        }),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (store.activeByClaim.get(key) === jobId) {
            store.activeByClaim.delete(key)
          }
        }),
      ),
    )

    yield* Effect.forkDetach(pipeline)
    return job
  })
}

function summarizeAcquireFailure(cause: unknown): string {
  const rendered = String(cause)
  const match = rendered.match(/message:\s*"([^"]+)"/)
  if (match?.[1]) return match[1]
  return rendered.slice(0, 300)
}

/** Test seam: fresh isolated store. */
export function makeAcquireJobStore(): AcquireJobStore {
  return { jobs: new Map(), activeByClaim: new Map() }
}
