import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { createDesktopApp } from "./create-desktop-app"

let assetRoot: string

async function writeFixture(relativePath: string, body: string) {
  const filePath = join(assetRoot, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, body)
}

function request(pathname: string, init?: RequestInit) {
  return new Request(`http://desktop.local${pathname}`, init)
}

const noUpstream = () => undefined

describe("desktop app composition", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-app-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("returns 503 from /api/* when no upstream is connected", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })

    const response = await app.fetch(request("/api/health"))

    expect(response.status).toBe(503)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe("no upstream")
  })

  test("serves the portal root from static assets", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })

    const response = await app.fetch(request("/"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toBe("<html>Portal</html>")
  })

  test("serves portal assets without routing them to the API", async () => {
    await writeFixture("assets/app.js", "globalThis.portal = true")
    const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })

    const response = await app.fetch(request("/assets/app.js"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe("globalThis.portal = true")
  })

  test("uses SPA fallback for non-file routes", async () => {
    await writeFixture("index.html", "<html>Route Shell</html>")
    const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })

    const response = await app.fetch(request("/games/123"))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("<html>Route Shell</html>")
  })

  test("does not serve index.html for missing assets", async () => {
    await writeFixture("index.html", "<html>Route Shell</html>")
    const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })

    const response = await app.fetch(request("/assets/missing.js"))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("Not Found")
  })

  test("keeps RPC posts on the API forwarder instead of static fallback", async () => {
    await writeFixture("index.html", "<html>Route Shell</html>")
    const app = createDesktopApp({ assetRoot, getUpstream: noUpstream })

    const response = await app.fetch(
      request("/api/rpc", { method: "POST", body: "not-json" }),
    )

    // With no upstream the forwarder returns a JSON error — not the SPA
    // shell. The important guarantee is that /api/* never falls through
    // to static assets.
    expect(response.headers.get("content-type") ?? "").not.toContain(
      "text/html",
    )
    expect(await response.text()).not.toBe("<html>Route Shell</html>")
    expect(response.status).toBe(503)
  })
})
