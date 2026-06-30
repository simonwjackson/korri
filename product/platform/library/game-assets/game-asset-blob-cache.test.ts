import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { XdgPathEnv } from "@platform/config/xdg-paths"
import type { GameAssetRecord } from "@platform/library/config/records/game-asset"
import {
  isGameAssetBlobValid,
  readValidatedGameAssetBytes,
  resetGameAssetBlobCache,
} from "./game-asset-blob-cache"
import { gameAssetBlobPath } from "./game-assets-service"

const cleanups: Array<() => Promise<void>> = []

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

const bytes = "image-bytes"
const asset: GameAssetRecord = {
  id: `sha256:${sha256(bytes)}`,
  type: "image",
  mimeType: "image/png",
  extension: "png",
  width: 1,
  height: 1,
  byteSize: Buffer.byteLength(bytes),
  pixelCount: 1,
  storage: { strategy: "content-addressed" },
}

async function withEnv(): Promise<XdgPathEnv> {
  const root = await mkdtemp(join(tmpdir(), "korri-asset-blob-cache-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  return { KORRI_LIBRARY_ROOT: join(root, "library"), HOME: root }
}

async function writeBlob(
  env: XdgPathEnv,
  item: Pick<GameAssetRecord, "id" | "extension">,
  content: string | Uint8Array,
): Promise<string> {
  const path = gameAssetBlobPath(env, item)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content)
  return path
}

beforeEach(() => resetGameAssetBlobCache())

afterEach(async () => {
  resetGameAssetBlobCache()
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("game asset blob cache", () => {
  it("returns the bytes of a blob that matches its content-addressed id", async () => {
    const env = await withEnv()
    await writeBlob(env, asset, bytes)

    const body = await readValidatedGameAssetBytes(env, asset)

    expect(body?.toString()).toBe(bytes)
    expect(await isGameAssetBlobValid(env, asset)).toBe(true)
  })

  it("rejects a blob whose bytes do not match the id", async () => {
    const env = await withEnv()
    // Same byte length as `bytes` so the size check passes and the digest
    // check is what rejects it.
    await writeBlob(env, asset, "wrong-bytess".slice(0, asset.byteSize))

    expect(await readValidatedGameAssetBytes(env, asset)).toBeNull()
    expect(await isGameAssetBlobValid(env, asset)).toBe(false)
  })

  it("returns null when the blob is missing", async () => {
    const env = await withEnv()
    expect(await readValidatedGameAssetBytes(env, asset)).toBeNull()
    expect(await isGameAssetBlobValid(env, asset)).toBe(false)
  })

  it("does not re-validate a blob after corruption when size and mtime are unchanged", async () => {
    const env = await withEnv()
    const path = await writeBlob(env, asset, bytes)

    // Prime the cache with a verified read.
    expect((await readValidatedGameAssetBytes(env, asset))?.toString()).toBe(
      bytes,
    )

    // Overwrite with different content of identical length, forcing the same
    // mtime by restoring it. The cache trusts (size, mtime), so the stale
    // verification is intentionally honored until the file's stat changes.
    const { stat, utimes } = await import("node:fs/promises")
    const before = await stat(path)
    await writeFile(path, "corruptbytes".slice(0, asset.byteSize))
    await utimes(path, before.atime, before.mtime)

    // Cache hit: bytes are returned without a fresh digest check.
    const cached = await readValidatedGameAssetBytes(env, asset)
    expect(cached).not.toBeNull()
    expect(await isGameAssetBlobValid(env, asset)).toBe(true)

    // After the cache is reset, the corruption is detected.
    resetGameAssetBlobCache()
    expect(await readValidatedGameAssetBytes(env, asset)).toBeNull()
    expect(await isGameAssetBlobValid(env, asset)).toBe(false)
  })
})
