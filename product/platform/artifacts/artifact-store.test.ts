import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, join } from "node:path"

import type { ArtifactRecord } from "@platform/protocol/artifact/artifact"

import {
  artifactBlobPath,
  artifactsRoot,
  promoteArtifactBytes,
} from "./artifact-store"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-artifact-store-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function artifactFor(bytes: Buffer, extension = "sfc"): ArtifactRecord {
  const digest = createHash("sha256").update(bytes).digest("hex")
  return {
    id: `sha256:${digest}`,
    kind: "content",
    system: "snes",
    format: { id: "sfc-rom" },
    file: { name: `game.${extension}`, extension },
    localPath: "/placeholder",
    digests: { sha256: digest },
  }
}

describe("artifact store", () => {
  it("derives artifact roots beside explicit library roots", () => {
    expect(
      artifactsRoot({
        KORRI_LIBRARY_ROOT: "/var/lib/korri/library",
      }),
    ).toBe("/var/lib/korri/artifacts")
    expect(
      artifactsRoot({
        KORRI_ARTIFACTS_ROOT: "/mnt/artifacts",
        KORRI_LIBRARY_ROOT: "/var/lib/korri/library",
      }),
    ).toBe("/mnt/artifacts")
    expect(artifactsRoot({ XDG_DATA_HOME: "/home/user/.local/share" })).toBe(
      "/home/user/.local/share/korri/artifacts",
    )
  })

  it("promotes bytes to a deterministic content-addressed blob path", async () => {
    await withTempRoot(async root => {
      const env = { KORRI_ARTIFACTS_ROOT: root }
      const bytes = Buffer.from("rom bytes")
      const artifact = artifactFor(bytes)
      const path = artifactBlobPath(env, artifact)

      await promoteArtifactBytes(env, artifact, bytes)

      expect(path).toBe(
        join(
          root,
          "blobs",
          "sha256",
          artifact.digests.sha256.slice(0, 2),
          `${artifact.digests.sha256}.sfc`,
        ),
      )
      expect(await readFile(path)).toEqual(bytes)
    })
  })

  it("rejects promotion when artifact id does not match bytes", async () => {
    await withTempRoot(async root => {
      const env = { KORRI_ARTIFACTS_ROOT: root }
      const artifact = artifactFor(Buffer.from("other bytes"))

      await expect(
        promoteArtifactBytes(env, artifact, Buffer.from("real bytes")),
      ).rejects.toThrow("artifact id does not match promoted bytes")
    })
  })

  it("stores extensionless artifacts without a trailing dot", async () => {
    await withTempRoot(async root => {
      const env = { KORRI_ARTIFACTS_ROOT: root }
      const bytes = Buffer.from("raw blob")
      const artifact = artifactFor(bytes)
      const extensionless = {
        ...artifact,
        file: { name: "rawblob" },
      }
      const path = artifactBlobPath(env, extensionless)

      await promoteArtifactBytes(env, extensionless, bytes)

      expect(path.endsWith(artifact.digests.sha256)).toBe(true)
      expect(path.endsWith(`${artifact.digests.sha256}.`)).toBe(false)
      expect(await readFile(path)).toEqual(bytes)
    })
  })

  it("is idempotent when promoting the same bytes to the same blob", async () => {
    await withTempRoot(async root => {
      const env = { KORRI_ARTIFACTS_ROOT: root }
      const bytes = Buffer.from("same bytes")
      const artifact = artifactFor(bytes)

      await promoteArtifactBytes(env, artifact, bytes)
      await promoteArtifactBytes(env, artifact, bytes)

      expect(await readFile(artifactBlobPath(env, artifact))).toEqual(bytes)
    })
  })

  it("removes temporary files when atomic promotion fails", async () => {
    await withTempRoot(async root => {
      const env = { KORRI_ARTIFACTS_ROOT: root }
      const bytes = Buffer.from("blocked target")
      const artifact = artifactFor(bytes)
      const target = artifactBlobPath(env, artifact)
      const targetDir = dirname(target)
      await mkdir(targetDir, { recursive: true })
      await mkdir(target)

      await expect(promoteArtifactBytes(env, artifact, bytes)).rejects.toThrow()

      const leftovers = (await readdir(targetDir)).filter(
        name =>
          name.startsWith(`.${basename(target)}.`) && name.endsWith(".tmp"),
      )
      expect(leftovers).toEqual([])
    })
  })
})
