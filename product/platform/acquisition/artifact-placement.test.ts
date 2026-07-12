import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AcquiredArtifact } from "@platform/protocol/acquisition/artifact-acquisition"
import { placeAcquiredArtifact } from "./artifact-placement"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-artifact-placement-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function stagedArtifact(
  root: string,
  bytes: Buffer,
  fileName: string,
): Promise<AcquiredArtifact> {
  const stagedPath = join(root, "staging", fileName)
  await mkdir(join(root, "staging"), { recursive: true })
  await writeFile(stagedPath, bytes)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  return {
    id: `sha256:${sha256}`,
    kind: "content",
    format: { id: "gba" },
    file: { name: fileName, extension: "gba" },
    stagedPath,
    digests: { sha256 },
  } as unknown as AcquiredArtifact
}

describe("artifact placement", () => {
  it("copies the staged artifact into the preferred storage under the system dir", async () => {
    await withTempRoot(async root => {
      const bytes = Buffer.from("gba rom bytes")
      const artifact = await stagedArtifact(root, bytes, "Drill Dozer (U).gba")
      const romsRoot = join(root, "roms")
      await mkdir(romsRoot, { recursive: true })

      const placed = await placeAcquiredArtifact({
        artifact,
        storages: [{ id: "roms", root: romsRoot }],
        system: "gba",
      })

      expect(placed.storageId).toBe("roms")
      expect(placed.relativePath).toBe("gba/Drill Dozer (U).gba")
      expect(placed.alreadyPresent).toBe(false)
      expect(await readFile(placed.absolutePath)).toEqual(bytes)
    })
  })

  it("treats identical existing bytes as already placed", async () => {
    await withTempRoot(async root => {
      const bytes = Buffer.from("same bytes")
      const artifact = await stagedArtifact(root, bytes, "game.gba")
      const romsRoot = join(root, "roms")
      await mkdir(join(romsRoot, "gba"), { recursive: true })
      await writeFile(join(romsRoot, "gba", "game.gba"), bytes)

      const placed = await placeAcquiredArtifact({
        artifact,
        storages: [{ id: "roms", root: romsRoot }],
        system: "gba",
      })
      expect(placed.alreadyPresent).toBe(true)
    })
  })

  it("uniquifies the name when different bytes already exist", async () => {
    await withTempRoot(async root => {
      const artifact = await stagedArtifact(
        root,
        Buffer.from("new bytes"),
        "game.gba",
      )
      const romsRoot = join(root, "roms")
      await mkdir(join(romsRoot, "gba"), { recursive: true })
      await writeFile(join(romsRoot, "gba", "game.gba"), "old bytes")

      const placed = await placeAcquiredArtifact({
        artifact,
        storages: [{ id: "roms", root: romsRoot }],
        system: "gba",
      })
      expect(placed.relativePath).toBe("gba/game (1).gba")
    })
  })

  it("falls back to another storage when the preferred root is missing", async () => {
    await withTempRoot(async root => {
      const artifact = await stagedArtifact(root, Buffer.from("x"), "a.gba")
      const backupRoot = join(root, "backup")
      await mkdir(backupRoot, { recursive: true })

      const placed = await placeAcquiredArtifact({
        artifact,
        storages: [
          { id: "roms", root: join(root, "missing-card") },
          { id: "backup", root: backupRoot },
        ],
      })
      expect(placed.storageId).toBe("backup")
      expect(placed.relativePath).toBe("downloads/a.gba")
    })
  })

  it("fails clearly when no storage root exists", async () => {
    await withTempRoot(async root => {
      const artifact = await stagedArtifact(root, Buffer.from("x"), "a.gba")
      await expect(
        placeAcquiredArtifact({
          artifact,
          storages: [{ id: "roms", root: join(root, "missing") }],
        }),
      ).rejects.toThrow("no configured library storage root")
    })
  })
})
