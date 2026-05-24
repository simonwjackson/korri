import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import type { ConnectionStateSnapshot } from "./connection-state-snapshot"
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

function connectedSnapshot(hostId = "server-1"): ConnectionStateSnapshot {
  return {
    status: "connected",
    server: { hostId, controlUrl: `http://${hostId}.local:3001` },
  }
}

function searchingSnapshot(
  options: { helpAfterMsFromNow?: number } = {},
): ConnectionStateSnapshot {
  const now = Date.now()
  return {
    status: "searching",
    since: new Date(now).toISOString(),
    helpAfter: new Date(
      now + (options.helpAfterMsFromNow ?? 30_000),
    ).toISOString(),
  }
}

function reconnectingSnapshot(
  hostId = "aka",
  options: { helpAfterMsFromNow?: number } = {},
): ConnectionStateSnapshot {
  const now = Date.now()
  return {
    status: "reconnecting",
    server: { hostId, controlUrl: `http://${hostId}.local:3001` },
    since: new Date(now).toISOString(),
    helpAfter: new Date(
      now + (options.helpAfterMsFromNow ?? 30_000),
    ).toISOString(),
  }
}

const alwaysConnected = () => connectedSnapshot()

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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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

describe("connection-aware serve branch", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-app-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("GET / while searching returns the waiting page", async () => {
    await writeFixture("index.html", "<html>React Shell</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(request("/"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    const body = await response.text()
    expect(body).toContain("Looking for a Korri server")
    expect(body).not.toBe("<html>React Shell</html>")
  })

  test("GET / while reconnecting names the remembered host", async () => {
    await writeFixture("index.html", "<html>React Shell</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => reconnectingSnapshot("aka"),
    })

    const response = await app.fetch(request("/"))

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("Looking for aka")
  })

  test("GET /games/123 (SPA-style route) while searching returns the waiting page", async () => {
    await writeFixture("index.html", "<html>React Shell</html>")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(request("/games/123"))

    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain("Looking for a Korri server")
  })

  test("GET /assets/missing.js while searching returns 404, never the waiting page", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(request("/assets/missing.js"))

    expect(response.status).toBe(404)
    expect(response.headers.get("content-type") ?? "").not.toContain(
      "text/html",
    )
  })

  test("GET /assets/app.js while searching serves the asset from disk if present", async () => {
    await writeFixture("assets/app.js", "globalThis.portal = true")
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(request("/assets/app.js"))

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe("globalThis.portal = true")
  })

  test("GET /api/health while searching returns 503 from the forwarder (branch does not interfere)", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(request("/api/health"))

    expect(response.status).toBe(503)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe("no upstream")
  })

  test("POST /__korri/desktop/launch while searching returns 503 from the launch bridge", async () => {
    // No `launchBridge` configured: the route's fallback returns 503 with
    // a structured "host-unavailable" payload. The new connection-aware
    // branch must not interfere with this.
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(
      request("/__korri/desktop/launch", {
        method: "POST",
        body: JSON.stringify({ id: "x" }),
      }),
    )

    expect(response.status).toBe(503)
  })

  test("waiting page omits help block when helpAfter is in the future", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () =>
        searchingSnapshot({ helpAfterMsFromNow: 60_000 }),
    })

    const response = await app.fetch(request("/"))
    const body = await response.text()

    expect(body).not.toContain("Still searching")
  })

  test("waiting page includes help block when helpAfter is in the past", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () =>
        searchingSnapshot({ helpAfterMsFromNow: -1_000 }),
    })

    const response = await app.fetch(request("/"))
    const body = await response.text()

    expect(body).toContain("Still searching")
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
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
      getConnectionState: alwaysConnected,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const body = await (await app.fetch(request("/"))).text()
    // Should contain exactly one closing </script>, the one closing
    // the inlined runtime-config script.
    expect(body.match(/<\/script>/g)?.length).toBe(1)
  })
})

describe("/__korri/desktop/connection-status", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-app-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("returns the searching snapshot as JSON with ISO timestamps", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => searchingSnapshot(),
    })

    const response = await app.fetch(
      request("/__korri/desktop/connection-status"),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type") ?? "").toContain(
      "application/json",
    )
    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe("searching")
    expect(typeof body.since).toBe("string")
    expect(typeof body.helpAfter).toBe("string")
    expect(Number.isFinite(Date.parse(body.since as string))).toBe(true)
    expect(Number.isFinite(Date.parse(body.helpAfter as string))).toBe(true)
  })

  test("returns the reconnecting snapshot with server record and ISO timestamps", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => reconnectingSnapshot("aka"),
    })

    const response = await app.fetch(
      request("/__korri/desktop/connection-status"),
    )

    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe("reconnecting")
    const server = body.server as Record<string, unknown>
    expect(server.hostId).toBe("aka")
    expect(typeof server.controlUrl).toBe("string")
    expect(typeof body.since).toBe("string")
    expect(typeof body.helpAfter).toBe("string")
  })

  test("returns the connected snapshot with server record and no timestamps", async () => {
    const app = createDesktopApp({
      assetRoot,
      getUpstream: noUpstream,
      getConnectionState: () => connectedSnapshot("server-1"),
    })

    const response = await app.fetch(
      request("/__korri/desktop/connection-status"),
    )

    const body = (await response.json()) as Record<string, unknown>
    expect(body.status).toBe("connected")
    const server = body.server as Record<string, unknown>
    expect(server.hostId).toBe("server-1")
    expect(typeof server.controlUrl).toBe("string")
    expect(body.since).toBeUndefined()
    expect(body.helpAfter).toBeUndefined()
  })
})
