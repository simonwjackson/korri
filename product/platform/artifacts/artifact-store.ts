import { createHash, randomUUID } from "node:crypto"
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, join } from "node:path"

import { korriDataPath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type { ArtifactRecord } from "@platform/protocol/artifact/artifact"

/**
 * Resolves the on-disk root directory that holds durable imported artifacts.
 *
 * Precedence:
 *  1. `KORRI_ARTIFACTS_ROOT` env (explicit override).
 *  2. Sibling of `KORRI_LIBRARY_ROOT` (`<libraryRoot>/../artifacts`).
 *  3. `<XDG_DATA_HOME>/korri/artifacts` via `korriDataPath`.
 */
export function artifactsRoot(env: XdgPathEnv): string {
  const explicit = env.KORRI_ARTIFACTS_ROOT?.trim()
  if (explicit && explicit.length > 0) return explicit
  const libraryRoot = env.KORRI_LIBRARY_ROOT?.trim()
  if (libraryRoot && libraryRoot.length > 0) {
    return join(dirname(libraryRoot), "artifacts")
  }
  return korriDataPath(env, "artifacts")
}

export function artifactBlobPath(
  env: XdgPathEnv,
  artifact: Pick<ArtifactRecord, "id" | "file">,
): string {
  if (typeof artifact.id !== "string") {
    throw new TypeError(
      `artifact id must be a string, received ${JSON.stringify(artifact)}`,
    )
  }
  const match = artifact.id.match(/^sha256:([a-f0-9]{64})$/)
  if (!match) {
    throw new TypeError(
      `artifact id must be a canonical sha256 digest: ${artifact.id}`,
    )
  }
  const digest = match[1]
  const extension = artifact.file.extension ? `.${artifact.file.extension}` : ""
  return join(
    artifactsRoot(env),
    "blobs",
    "sha256",
    digest.slice(0, 2),
    `${digest}${extension}`,
  )
}

export async function promoteArtifactBytes(
  env: XdgPathEnv,
  artifact: Pick<ArtifactRecord, "id" | "file">,
  bytes: Uint8Array,
): Promise<void> {
  const expectedId = `sha256:${createHash("sha256").update(bytes).digest("hex")}`
  if (artifact.id !== expectedId) {
    throw new Error("artifact id does not match promoted bytes")
  }

  const target = artifactBlobPath(env, artifact)
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
