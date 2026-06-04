import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { XdgPathEnv } from "@platform/config/xdg-paths"
import type { GameAssetRecord } from "@platform/library/config/records/game-asset"
import { gameAssetBlobPath } from "@platform/library/game-assets/game-assets-service"

import { serveGameAssetBytes } from "./game-asset-bytes"

const cleanups: Array<() => Promise<void>> = []

const assetBytes = "image"
const assetId = `sha256:${sha256(assetBytes)}`
const missingAssetId = `sha256:${"b".repeat(64)}`
const unsupportedAssetId = `sha256:${"c".repeat(64)}`

const asset: GameAssetRecord = {
  id: assetId,
  type: "image",
  mimeType: "image/png",
  extension: "png",
  width: 1,
  height: 1,
  byteSize: 5,
  pixelCount: 1,
  storage: { strategy: "content-addressed" },
}

const missingFileAsset: GameAssetRecord = {
  ...asset,
  id: missingAssetId,
}

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

async function withAssetEnvironment(): Promise<XdgPathEnv> {
  const root = await mkdtemp(join(tmpdir(), "korri-game-asset-bytes-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const libraryRoot = join(root, "library")
  const dataRoot = join(root, "data")
  await mkdir(libraryRoot, { recursive: true })
  return {
    KORRI_LIBRARY_ROOT: libraryRoot,
    XDG_DATA_HOME: dataRoot,
    HOME: root,
  }
}

async function writeAssetCatalog(
  env: XdgPathEnv,
  assets: readonly GameAssetRecord[],
): Promise<void> {
  const libraryRoot = env.KORRI_LIBRARY_ROOT
  if (!libraryRoot) throw new Error("test library root missing")
  await writeFile(
    join(libraryRoot, "library.yaml"),
    [
      "game-assets:",
      ...assets.flatMap(item => [
        `  ${JSON.stringify(item.id)}:`,
        `    type: ${item.type}`,
        `    mimeType: ${item.mimeType}`,
        `    extension: ${item.extension}`,
        `    width: ${item.width}`,
        `    height: ${item.height}`,
        `    byteSize: ${item.byteSize}`,
        `    pixelCount: ${item.pixelCount}`,
        "    storage:",
        `      strategy: ${item.storage.strategy}`,
      ]),
      "",
    ].join("\n"),
    "utf8",
  )
}

async function writeUnsupportedAssetCatalog(env: XdgPathEnv): Promise<void> {
  const libraryRoot = env.KORRI_LIBRARY_ROOT
  if (!libraryRoot) throw new Error("test library root missing")
  await writeFile(
    join(libraryRoot, "library.yaml"),
    [
      "game-assets:",
      `  ${JSON.stringify(unsupportedAssetId)}:`,
      "    type: image",
      "    mimeType: image/svg+xml",
      "    extension: png",
      "    width: 1",
      "    height: 1",
      "    byteSize: 5",
      "    pixelCount: 1",
      "    storage:",
      "      strategy: content-addressed",
      "",
    ].join("\n"),
    "utf8",
  )
}

async function writeDurableBlob(
  env: XdgPathEnv,
  item: Pick<GameAssetRecord, "id" | "extension">,
  bytes: Uint8Array | string,
): Promise<void> {
  const blobPath = gameAssetBlobPath(env, item)
  await mkdir(dirname(blobPath), { recursive: true })
  await writeFile(blobPath, bytes)
}

function request(path: string, method = "GET"): Request {
  return new Request(`http://api.local${path}`, { method })
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex")
}

describe("serveGameAssetBytes", () => {
  it("serves known durable game assets with validated image headers", async () => {
    const env = await withAssetEnvironment()
    await writeAssetCatalog(env, [asset])
    await writeDurableBlob(env, asset, assetBytes)

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${asset.id}`),
      { env },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(response.headers.get("x-content-type-options")).toBe("nosniff")
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    )
    expect(await response.text()).toBe(assetBytes)
  })

  it("returns headers without a body for HEAD", async () => {
    const env = await withAssetEnvironment()
    await writeAssetCatalog(env, [asset])
    await writeDurableBlob(env, asset, assetBytes)

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${asset.id}`, "HEAD"),
      { env },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/png")
    expect(await response.text()).toBe("")
  })

  it("returns 404 for unknown durable asset ids", async () => {
    const env = await withAssetEnvironment()
    await writeAssetCatalog(env, [asset])

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${missingAssetId}`),
      { env },
    )

    expect(response.status).toBe(404)
  })

  it("rejects malformed ids before resolving files", async () => {
    const env = await withAssetEnvironment()
    const malformedPaths = [
      "/api/game-assets/sha256:not-a-digest",
      `/api/game-assets/${asset.id}/suffix`,
      `/api/game-assets/${asset.id}%2Fsuffix`,
      "/api/game-assets/..%2Fsecret.png",
      "/api/game-assets/%00",
      `/api/game-assets/${asset.id}.png`,
    ]

    for (const path of malformedPaths) {
      const response = await serveGameAssetBytes(request(path), { env })
      expect(response.status).toBe(400)
    }
  })

  it("returns 404 when a known asset record has no durable file", async () => {
    const env = await withAssetEnvironment()
    await writeAssetCatalog(env, [missingFileAsset])

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${missingFileAsset.id}`),
      { env },
    )

    expect(response.status).toBe(404)
  })

  it("returns 404 when durable bytes do not match the content-addressed id", async () => {
    const env = await withAssetEnvironment()
    await writeAssetCatalog(env, [asset])
    await writeDurableBlob(env, asset, "xxxxx")

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${asset.id}`),
      { env },
    )

    expect(response.status).toBe(404)
  })

  it("does not serve asset records with unsupported MIME data", async () => {
    const env = await withAssetEnvironment()
    await writeUnsupportedAssetCatalog(env)

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${unsupportedAssetId}`),
      { env },
    )

    expect([415, 500]).toContain(response.status)
  })

  it("rejects mutation methods", async () => {
    const env = await withAssetEnvironment()

    const response = await serveGameAssetBytes(
      request(`/api/game-assets/${asset.id}`, "POST"),
      { env },
    )

    expect(response.status).toBe(405)
    expect(response.headers.get("allow")).toBe("GET, HEAD")
  })
})
