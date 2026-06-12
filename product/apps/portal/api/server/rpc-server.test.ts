import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { GameAssetRecord } from "@platform/library/config/records/game-asset"
import { gameAssetBlobPath } from "@platform/library/game-assets/game-assets-service"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { Effect } from "effect"
import { appRpcGroup } from "../app-rpc-group"
import { createHonoApp } from "../hono-app"
import { serverRpcGroup } from "./rpc-group"
import { serverRpcHandler } from "./rpc-server"

const cleanups: Array<() => Promise<void>> = []
const originalEnv = {
  KORRI_LIBRARY_ROOT: process.env.KORRI_LIBRARY_ROOT,
  KORRI_MEDIA_ROOT: process.env.KORRI_MEDIA_ROOT,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  HOME: process.env.HOME,
}

const assetBytes = "image"
const asset: GameAssetRecord = {
  id: `sha256:${createHash("sha256").update(assetBytes).digest("hex")}`,
  type: "image",
  mimeType: "image/webp",
  extension: "webp",
  width: 1,
  height: 1,
  byteSize: 5,
  pixelCount: 1,
  storage: { strategy: "content-addressed" },
}

afterEach(async () => {
  restoreEnv("KORRI_LIBRARY_ROOT", originalEnv.KORRI_LIBRARY_ROOT)
  restoreEnv("KORRI_MEDIA_ROOT", originalEnv.KORRI_MEDIA_ROOT)
  restoreEnv("XDG_DATA_HOME", originalEnv.XDG_DATA_HOME)
  restoreEnv("HOME", originalEnv.HOME)

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

async function configureGameAssetEnvironment() {
  const root = await mkdtemp(join(tmpdir(), "korri-hono-game-assets-"))
  cleanups.push(() => rm(root, { recursive: true, force: true }))

  const libraryRoot = join(root, "library")
  const dataRoot = join(root, "data")
  await mkdir(libraryRoot, { recursive: true })
  process.env.KORRI_LIBRARY_ROOT = libraryRoot
  process.env.XDG_DATA_HOME = dataRoot
  process.env.HOME = root

  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: libraryRoot,
          writeDebounce: 1,
        })
        yield* db["game-assets"].upsert({
          where: { id: asset.id },
          create: asset,
          update: asset,
        })
        yield* Effect.promise(() => db.flush())
      }),
    ),
  )

  const blobPath = gameAssetBlobPath(process.env, asset)
  await mkdir(dirname(blobPath), { recursive: true })
  await writeFile(blobPath, assetBytes)

  return root
}

describe("headless server RPC group", () => {
  it("exposes the headless control-plane surface including library methods the renderer calls", () => {
    const tags = Array.from(serverRpcGroup.requests.keys()).sort()

    expect(tags).toEqual([
      "app.acquisition.details",
      "app.acquisition.plugins",
      "app.acquisition.resolve-download",
      "app.acquisition.search",
      "app.acquisition.validate-sources",
      "app.game-assets.assign",
      "app.game-assets.candidates.list",
      "app.game-assets.unassign",
      "app.hello.get",
      "app.library.launch",
      "app.library.list",
      "app.server.status",
      "app.server.stream.prepare",
      "app.session.status",
      "app.session.stop",
      "app.source.list",
      "app.source.status",
      "app.stream-control.config.get",
      "app.stream-control.gamescope-filter.set",
      "app.stream-control.gamescope-fps.set",
      "app.stream-control.gamescope-mode.set",
      "app.stream-control.gamescope-sharpness.set",
      "app.stream-control.moonlight-bitrate.set",
      "app.stream-control.moonlight-fps.set",
      "app.stream-control.moonlight-resolution.set",
      "app.stream-control.state.get",
      "app.stream.prepare",
    ])
  })

  it("rejects non-json posts on the headless server RPC surface", async () => {
    const app = createHonoApp({
      rpcHandler: serverRpcHandler,
      rpcSurface: "server",
    })

    const response = await app.request("/api/rpc", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    })

    expect(response.status).toBe(415)
  })

  it("exposes library methods on both surfaces so the desktop client can drive them via the system server", () => {
    const serverTags = Array.from(serverRpcGroup.requests.keys())
    const appTags = Array.from(appRpcGroup.requests.keys())

    expect(appTags).toContain("app.library.list")
    expect(appTags).toContain("app.library.launch")
    expect(appTags).toContain("app.game-assets.candidates.list")
    expect(appTags).toContain("app.game-assets.assign")
    expect(appTags).toContain("app.game-assets.unassign")
    expect(serverTags).toContain("app.library.list")
    expect(serverTags).toContain("app.library.launch")
    expect(serverTags).toContain("app.game-assets.candidates.list")
    expect(serverTags).toContain("app.game-assets.assign")
    expect(serverTags).toContain("app.game-assets.unassign")
  })

  it("keeps acquisition RPCs off the portal/app RPC group", () => {
    const appTags = Array.from(appRpcGroup.requests.keys())

    expect(appTags).not.toContain("app.acquisition.search")
    expect(appTags).not.toContain("app.acquisition.details")
    expect(appTags).not.toContain("app.acquisition.plugins")
    expect(appTags).not.toContain("app.acquisition.validate-sources")
    expect(appTags).not.toContain("app.acquisition.resolve-download")
  })

  it("mounts narrow durable game-asset bytes instead of arbitrary media files", async () => {
    const root = await configureGameAssetEnvironment()
    const mediaRoot = join(root, "media")
    process.env.KORRI_MEDIA_ROOT = mediaRoot
    await mkdir(mediaRoot, { recursive: true })
    await writeFile(join(mediaRoot, "old-cover.png"), "old")

    const app = createHonoApp({ rpcHandler: serverRpcHandler })

    const assetResponse = await app.request(`/api/game-assets/${asset.id}`)
    const oldMediaResponse = await app.request("/api/media/old-cover.png")

    expect(assetResponse.status).toBe(200)
    expect(assetResponse.headers.get("content-type")).toBe("image/webp")
    expect(await assetResponse.text()).toBe(assetBytes)
    expect(oldMediaResponse.status).toBe(404)
  })
})
