import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { createReleaseContentIdentityResolver } from "./release-content-identity"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-release-identity-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function sha256ArtifactId(bytes: string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

async function eventually<T>(fn: () => Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + 1000
  let last: T | undefined
  while (Date.now() < deadline) {
    last = await fn()
    if (last !== undefined) return last
    await sleep(10)
  }
  throw new Error(`condition did not settle; last=${String(last)}`)
}

describe("release content identity", () => {
  it("hashes a local file in place as a sha256 identity tag", async () => {
    await withTempRoot(async root => {
      const file = join(root, "rom.sfc")
      await writeFile(file, "same bytes")
      const resolver = createReleaseContentIdentityResolver()

      await expect(resolver.resolveFileHash(file)).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("same bytes"),
      })
    })
  })

  it("queues uncached files without waiting and returns the cached tag later", async () => {
    await withTempRoot(async root => {
      const file = join(root, "queued.sfc")
      await writeFile(file, "queued bytes")
      const resolver = createReleaseContentIdentityResolver()

      await expect(
        resolver.cachedFileHashOrQueue(file),
      ).resolves.toBeUndefined()
      await expect(
        eventually(() => resolver.cachedFileHashOrQueue(file)),
      ).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("queued bytes"),
      })
    })
  })

  it("uses the stat-keyed cache for an unchanged file", async () => {
    await withTempRoot(async root => {
      const file = join(root, "cached.gba")
      await writeFile(file, "cached bytes")
      let hashStarts = 0
      const resolver = createReleaseContentIdentityResolver({
        onHashStart: () => {
          hashStarts += 1
        },
      })

      await resolver.resolveFileHash(file)
      await resolver.resolveFileHash(file)

      expect(hashStarts).toBe(1)
    })
  })

  it("persists cached file hashes across resolver instances", async () => {
    await withTempRoot(async root => {
      const file = join(root, "persistent.gba")
      const cachePath = join(root, "cache", "release-content-identity.json")
      await writeFile(file, "persistent bytes")

      const first = createReleaseContentIdentityResolver({ cachePath })
      await expect(first.resolveFileHash(file)).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("persistent bytes"),
      })
      await eventually(async () => {
        try {
          const text = await readFile(cachePath, "utf8")
          return text.includes(sha256ArtifactId("persistent bytes"))
            ? true
            : undefined
        } catch {
          return undefined
        }
      })

      let hashStarts = 0
      const second = createReleaseContentIdentityResolver({
        cachePath,
        onHashStart: () => {
          hashStarts += 1
        },
      })

      await expect(second.cachedFileHashOrQueue(file)).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("persistent bytes"),
      })
      expect(hashStarts).toBe(0)
    })
  })

  it("ignores persisted entries when the file stat key changes", async () => {
    await withTempRoot(async root => {
      const file = join(root, "persistent-changed.gba")
      const cachePath = join(root, "cache", "release-content-identity.json")
      await writeFile(file, "before")

      const first = createReleaseContentIdentityResolver({ cachePath })
      await first.resolveFileHash(file)
      await eventually(async () => {
        try {
          return (await readFile(cachePath, "utf8")).includes(
            sha256ArtifactId("before"),
          )
            ? true
            : undefined
        } catch {
          return undefined
        }
      })

      await writeFile(file, "after!")
      const current = await stat(file)
      await utimes(file, current.atime, new Date(current.mtimeMs + 2000))

      let hashStarts = 0
      const second = createReleaseContentIdentityResolver({
        cachePath,
        onHashStart: () => {
          hashStarts += 1
        },
      })
      await expect(second.resolveFileHash(file)).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("after!"),
      })
      expect(hashStarts).toBe(1)
    })
  })

  it("recomputes when the path size or mtime changes", async () => {
    await withTempRoot(async root => {
      const file = join(root, "changed.gba")
      await writeFile(file, "before")
      let hashStarts = 0
      const resolver = createReleaseContentIdentityResolver({
        onHashStart: () => {
          hashStarts += 1
        },
      })

      await expect(resolver.resolveFileHash(file)).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("before"),
      })

      await writeFile(file, "after!")
      const current = await stat(file)
      await utimes(file, current.atime, new Date(current.mtimeMs + 2000))

      await expect(resolver.resolveFileHash(file)).resolves.toEqual({
        kind: "hash",
        value: sha256ArtifactId("after!"),
      })
      expect(hashStarts).toBe(2)
    })
  })

  it("single-flights concurrent hashes for the same stat key", async () => {
    await withTempRoot(async root => {
      const file = join(root, "concurrent.nds")
      await writeFile(file, "concurrent bytes")
      let hashStarts = 0
      const resolver = createReleaseContentIdentityResolver({
        onHashStart: () => {
          hashStarts += 1
        },
      })

      const results = await Promise.all(
        Array.from({ length: 12 }, () => resolver.resolveFileHash(file)),
      )

      expect(new Set(results.map(result => result?.value))).toEqual(
        new Set([sha256ArtifactId("concurrent bytes")]),
      )
      expect(hashStarts).toBe(1)
    })
  })

  it("returns no identity for missing files", async () => {
    await withTempRoot(async root => {
      await mkdir(join(root, "missing-parent"))
      const resolver = createReleaseContentIdentityResolver()

      await expect(
        resolver.resolveFileHash(join(root, "missing-parent", "missing.rom")),
      ).resolves.toBeUndefined()
    })
  })
})
