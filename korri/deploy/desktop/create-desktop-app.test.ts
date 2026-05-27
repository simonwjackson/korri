import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { decodeForegroundSessionStatusSnapshot } from "@shared/stream/foreground-session-status"
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
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

    const response = await app.fetch(request("/api/health"))

    expect(response.status).toBe(503)
    const payload = (await response.json()) as { error: string }
    expect(payload.error).toBe("no upstream")
  })

  test("serves the portal root from static assets", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

    const response = await app.fetch(request("/"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toBe("<html>Portal</html>")
  })

  test("serves portal assets without routing them to the API", async () => {
    await writeFixture("assets/app.js", "globalThis.portal = true")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

    const response = await app.fetch(request("/assets/app.js"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe("globalThis.portal = true")
  })

  test("uses SPA fallback for non-file routes", async () => {
    await writeFixture("index.html", "<html>Route Shell</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

    const response = await app.fetch(request("/games/123"))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("<html>Route Shell</html>")
  })

  test("does not serve index.html for missing assets", async () => {
    await writeFixture("index.html", "<html>Route Shell</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

    const response = await app.fetch(request("/assets/missing.js"))

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("Not Found")
  })

  test("keeps RPC posts on the API forwarder instead of static fallback", async () => {
    await writeFixture("index.html", "<html>Route Shell</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

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


describe("connected serve inlines runtime-config", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-app-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("GET /: runtime-config script with desktopInput: true is injected into index.html", async () => {
    await writeFixture(
      "index.html",
      `<!doctype html><html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/assets/app.js"></script></body></html>`,
    )
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const response = await app.fetch(request("/"))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(response.headers.get("cache-control")).toContain("no-store")
    expect(body).toMatch(
      /window\.__korriRuntimeConfig\s*=\s*\{[^}]*"desktopInput"\s*:\s*true/,
    )
    // App's own module script preserved.
    expect(body).toContain('src="/assets/app.js"')
  })

  test("GET /: runtime-config script with desktopInput: false is injected", async () => {
    await writeFixture(
      "index.html",
      `<!doctype html><html><head><title>x</title></head><body></body></html>`,
    )
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getRuntimeConfig: () => ({ desktopInput: false }),
    })

    const response = await app.fetch(request("/"))
    const body = await response.text()

    expect(body).toMatch(
      /window\.__korriRuntimeConfig\s*=\s*\{[^}]*"desktopInput"\s*:\s*false/,
    )
  })

  test("GET /: inlined script appears before any module script in <head>", async () => {
    await writeFixture(
      "index.html",
      `<!doctype html><html><head><title>x</title></head><body><div id="app"></div><script type="module" src="/assets/app.js"></script></body></html>`,
    )
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const body = await (await app.fetch(request("/"))).text()

    const injectedAt = body.indexOf("__korriRuntimeConfig")
    const moduleAt = body.indexOf("/assets/app.js")
    expect(injectedAt).toBeGreaterThan(-1)
    expect(moduleAt).toBeGreaterThan(-1)
    expect(injectedAt).toBeLessThan(moduleAt)
  })

  test("non-html assets are not rewritten", async () => {
    await writeFixture("assets/app.js", "console.log('hi')")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const response = await app.fetch(request("/assets/app.js"))
    const body = await response.text()

    expect(body).toBe("console.log('hi')")
    expect(body).not.toContain("__korriRuntimeConfig")
  })

  test("missing index.html returns 404 (existing behavior preserved)", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const response = await app.fetch(request("/"))

    expect(response.status).toBe(404)
  })

  test("runtime-config values are HTML-safe (no script-tag escape)", async () => {
    // Forward-compat hardening: even today's boolean-only shape goes
    // through JSON.stringify; pinning the no-`</script>` invariant
    // means a future string field can't accidentally break out of the
    // inlined script tag.
    await writeFixture(
      "index.html",
      `<!doctype html><html><head></head><body></body></html>`,
    )
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const body = await (await app.fetch(request("/"))).text()
    // Should contain exactly one closing </script>, the one closing
    // the inlined runtime-config script.
    expect(body.match(/<\/script>/g)?.length).toBe(1)
  })
})

describe("/__korri/desktop/foreground-session-status", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-app-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("returns the configured foreground session status as no-store JSON", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getForegroundSessionStatus: () => ({
        schemaVersion: 1,
        serverTimestamp: "2026-05-26T12:00:00.000Z",
        state: "IdleReady",
        recentEvents: [],
      }),
    })

    const response = await app.fetch(
      request("/__korri/desktop/foreground-session-status"),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type") ?? "").toContain(
      "application/json",
    )
    expect(response.headers.get("cache-control") ?? "").toContain("no-store")
    const body = await response.json()
    expect(decodeForegroundSessionStatusSnapshot(body)).toEqual({
      schemaVersion: 1,
      serverTimestamp: "2026-05-26T12:00:00.000Z",
      state: "IdleReady",
      recentEvents: [],
    })
  })

  test("returns a bounded error when foreground session status accessor fails", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getForegroundSessionStatus: () => {
        throw new Error("owner status failed")
      },
    })

    const response = await app.fetch(
      request("/__korri/desktop/foreground-session-status"),
    )

    expect(response.status).toBe(500)
    expect(response.headers.get("cache-control") ?? "").toContain("no-store")
    const body = (await response.json()) as { readonly error: string }
    expect(body.error).toContain("owner status failed")
  })

  test("returns 503 when foreground session status is not configured", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
    })

    const response = await app.fetch(
      request("/__korri/desktop/foreground-session-status"),
    )

    expect(response.status).toBe(503)
    const body = (await response.json()) as { readonly error: string }
    expect(body.error).toContain("Foreground session status not configured")
  })
})

