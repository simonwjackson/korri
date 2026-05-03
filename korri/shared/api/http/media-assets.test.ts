import { afterEach, describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { getMediaContentType, serveMediaAsset } from "./media-assets"

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

async function withMediaRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "korri-media-"))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

describe("serveMediaAsset", () => {
  it("serves files under /api/media from the configured media root", async () => {
    const root = await withMediaRoot()
    await Bun.write(join(root, "games/wii/mario/cover-1024.jpg"), "jpeg")

    const response = await serveMediaAsset(
      new Request("http://api.local/api/media/games/wii/mario/cover-1024.jpg"),
      { mediaRoot: root },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("image/jpeg")
    expect(await response.text()).toBe("jpeg")
  })

  it("rejects traversal outside the configured media root", async () => {
    const root = await withMediaRoot()

    const response = await serveMediaAsset(
      new Request("http://api.local/api/media/..%2Fsecret.jpg"),
      { mediaRoot: root },
    )

    expect(response.status).toBe(400)
  })

  it("returns 404 for missing files", async () => {
    const root = await withMediaRoot()

    const response = await serveMediaAsset(
      new Request("http://api.local/api/media/games/wii/missing.jpg"),
      { mediaRoot: root },
    )

    expect(response.status).toBe(404)
  })
})

describe("getMediaContentType", () => {
  it("returns image content types for supported sidecar art", () => {
    expect(getMediaContentType("cover.webp")).toBe("image/webp")
    expect(getMediaContentType("cover.png")).toBe("image/png")
    expect(getMediaContentType("cover.jpg")).toBe("image/jpeg")
  })
})
