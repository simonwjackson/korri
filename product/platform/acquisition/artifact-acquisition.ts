import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

import { korriCachePath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type {
  AcquireArtifactRequest,
  AcquiredArtifact,
  PluginAcquireOutput,
} from "@platform/protocol/acquisition/artifact-acquisition"
import { decodeAcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"
import { Effect } from "effect"
import { acquisitionTry } from "./effect"
import { AcquisitionError } from "./errors"
import { validatePluginAcquireOutput } from "./plugin-contract-codecs"
import { runPluginOperation } from "./plugin-operation-harness"
import type { AcquisitionPluginContext } from "./plugin-runtime"
import type { AcquisitionPluginRegistry } from "./plugins/registry"

export interface AcquireArtifactOptions {
  readonly registry: AcquisitionPluginRegistry
  readonly context: AcquisitionPluginContext
  readonly request: AcquireArtifactRequest
  readonly stagingRoot: string
}

/**
 * Resolves the acquisition-owned staging root for source-native artifacts.
 *
 * Precedence:
 *  1. `KORRI_ACQUISITION_STAGING_ROOT` env override.
 *  2. Sibling of explicit `KORRI_LIBRARY_ROOT`.
 *  3. `<XDG_CACHE_HOME>/korri/acquisition/artifacts`.
 */
export function acquisitionArtifactStagingRoot(env: XdgPathEnv): string {
  const explicit = env.KORRI_ACQUISITION_STAGING_ROOT?.trim()
  if (explicit && explicit.length > 0) return explicit
  const libraryRoot = env.KORRI_LIBRARY_ROOT?.trim()
  if (libraryRoot && libraryRoot.length > 0) {
    return join(dirname(libraryRoot), "acquisition-staging")
  }
  return korriCachePath(env, "acquisition", "artifacts")
}

export function acquireArtifact({
  registry,
  context,
  request,
  stagingRoot,
}: AcquireArtifactOptions): Effect.Effect<AcquiredArtifact, AcquisitionError> {
  return Effect.gen(function* () {
    const plugin = yield* acquisitionTry(() => registry.get(request.sourceName))
    const pluginAcquireArtifact = plugin.acquireArtifact
    if (!pluginAcquireArtifact) {
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "defective-source",
          message: `${plugin.metadata.sourceName} does not implement acquireArtifact`,
          sourceName: plugin.metadata.sourceName,
        }),
      )
    }

    const output = yield* runPluginOperation({
      sourceName: plugin.metadata.sourceName,
      operation: "acquireArtifact",
      context,
      run: () => pluginAcquireArtifact(context, request),
      validate: validatePluginAcquireOutput,
    })
    return yield* stagePluginAcquireOutput({
      output,
      stagingRoot,
      sourceName: plugin.metadata.sourceName,
    })
  })
}

function stagePluginAcquireOutput({
  output,
  stagingRoot,
  sourceName,
}: {
  readonly output: PluginAcquireOutput
  readonly stagingRoot: string
  readonly sourceName: string
}): Effect.Effect<AcquiredArtifact, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const bytes = Buffer.from(output.bytesBase64, "base64")
      const sha256 = createHash("sha256").update(bytes).digest("hex")
      const id = `sha256:${sha256}`
      const digests = verifyExpectedDigests(bytes, output.expectedDigests)
      const stagedPath = stagedArtifactPath(
        stagingRoot,
        sha256,
        output.file.extension,
      )
      const acquired = decodeAcquiredArtifact({
        id,
        kind: output.kind,
        system: output.system,
        format: output.format,
        file: output.file,
        stagedPath,
        digests,
        expectedDigests: output.expectedDigests,
        facets: output.facets,
        provenance: output.provenance,
        externalIds: output.externalIds,
        sourceData: output.sourceData,
      })
      await promoteStagedBytes(acquired.stagedPath, bytes)
      return acquired
    },
    catch: error =>
      error instanceof AcquisitionError
        ? new AcquisitionError({
            reason: error.reason,
            message: error.message,
            sourceName: error.sourceName ?? sourceName,
          })
        : new AcquisitionError({
            reason: "infrastructure",
            message: `failed to stage acquired artifact: ${stringifyError(error)}`,
            sourceName,
          }),
  })
}

function stagedArtifactPath(
  stagingRoot: string,
  sha256: string,
  extension: string | undefined,
): string {
  const suffix = extension ? `.${extension}` : ""
  return join(stagingRoot, "sha256", sha256.slice(0, 2), `${sha256}${suffix}`)
}

async function promoteStagedBytes(
  target: string,
  bytes: Buffer,
): Promise<void> {
  const targetDir = dirname(target)
  await mkdir(targetDir, { recursive: true })
  const tempPath = join(
    targetDir,
    `.${basename(target)}.${process.pid}.${randomUUID()}.tmp`,
  )
  try {
    await writeFile(tempPath, bytes, { flag: "wx" })
    await rename(tempPath, target)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

type SupportedDigestAlgorithm = "sha256" | "sha1" | "md5"

function verifyExpectedDigests(
  bytes: Buffer,
  expectedDigests: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const digests: Record<string, string> = {
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
  for (const [algorithm, expected] of Object.entries(expectedDigests ?? {})) {
    if (!isSupportedDigestAlgorithm(algorithm)) {
      throw new AcquisitionError({
        reason: "defective-source",
        message: `unsupported expected digest algorithm: ${algorithm}`,
      })
    }
    const actual = createHash(algorithm).update(bytes).digest("hex")
    if (actual !== expected) {
      throw new AcquisitionError({
        reason: "defective-source",
        message: `expected ${algorithm} digest does not match acquired artifact bytes`,
      })
    }
    digests[algorithm] = actual
  }
  return digests
}

function isSupportedDigestAlgorithm(
  algorithm: string,
): algorithm is SupportedDigestAlgorithm {
  return algorithm === "sha256" || algorithm === "sha1" || algorithm === "md5"
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
