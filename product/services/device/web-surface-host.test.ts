import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  createWebSurfaceHostApp,
  readWebSurfaceHostConfigFromEnv,
  startKorriWebSurfaceHost,
} from "./web-surface-host"

let assetRoot: string
const cleanup: Array<() => void | Promise<void>> = []

beforeEach(async () => {
  assetRoot = await mkdtemp(join(tmpdir(), "korri-web-surface-host-"))
})

afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose()
  await rm(assetRoot, { recursive: true, force: true })
})

async function writeFixture(relativePath: string, body: string) {
  const filePath = join(assetRoot, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, body)
}

function request(pathname: string, init?: RequestInit) {
  return new Request(`http://surface.local${pathname}`, init)
}

describe("web-surface host app", () => {
  it("serves the portal shell with inlined runtime config", async () => {
    await writeFixture(
      "index.html",
      `<!doctype html><html><head></head><body><script type="module" src="/assets/app.js"></script></body></html>`,
    )
    const app = createWebSurfaceHostApp({
      assetRoot,
      getUpstream: () => undefined,
      getRuntimeConfig: () => ({ desktopInput: true }),
    })

    const response = await app.fetch(request("/"))
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(body).toContain("window.__korriRuntimeConfig")
    expect(body).toContain('"desktopInput":true')
  })

  it("proxies /api requests to korrid when an upstream is available", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    const upstream = createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "text/plain",
        connection: "close",
      })
      res.end(
        `upstream:${new URL(req.url ?? "/", "http://fixture.local").pathname}`,
      )
    })
    await new Promise<void>(resolve =>
      upstream.listen(0, "127.0.0.1", resolve),
    )
    cleanup.push(
      () => new Promise<void>(resolve => upstream.close(() => resolve())),
    )
    const address = upstream.address()
    if (!address || typeof address === "string") {
      throw new Error("upstream did not bind")
    }
    const app = createWebSurfaceHostApp({
      assetRoot,
      getUpstream: () => `http://127.0.0.1:${address.port}`,
    })

    const response = await app.fetch(request("/api/health"))

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("upstream:/api/health")
  })

  it("surfaces 503 for /api requests when korrid is unavailable", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    const app = createWebSurfaceHostApp({
      assetRoot,
      getUpstream: () => undefined,
    })

    const response = await app.fetch(request("/api/health"))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: "no upstream" })
  })

  it("accepts a renderer readiness beacon without falling through to the SPA", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    const readyPayloads: unknown[] = []
    const app = createWebSurfaceHostApp({
      assetRoot,
      getUpstream: () => undefined,
      onRendererReady: payload => {
        readyPayloads.push(payload)
      },
    })

    const response = await app.fetch(
      request("/__korri/renderer-ready", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ href: "http://surface.local/" }),
      }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("content-type") ?? "").not.toContain("html")
    expect(readyPayloads).toEqual([{ href: "http://surface.local/" }])
  })
})

describe("web-surface host service", () => {
  it("reads loopback defaults from the environment", () => {
    expect(
      readWebSurfaceHostConfigFromEnv({ KORRI_ASSET_ROOT: "/portal" }),
    ).toMatchObject({
      assetRoot: "/portal",
      hostname: "127.0.0.1",
      port: 8099,
      upstreamBaseUrl: "http://127.0.0.1:3001",
    })
  })

  it("honors explicit host, port, upstream, and inputd URL env", () => {
    expect(
      readWebSurfaceHostConfigFromEnv({
        KORRI_ASSET_ROOT: "/portal",
        KORRI_WEB_SURFACE_HOST: "0.0.0.0",
        KORRI_WEB_SURFACE_PORT: "8123",
        KORRI_LOOPBACK_BASE_URL: "http://127.0.0.1:3009",
        KORRI_DESKTOP_INPUTD_URL: "ws://127.0.0.1:3010",
      }),
    ).toMatchObject({
      assetRoot: "/portal",
      hostname: "0.0.0.0",
      port: 8123,
      upstreamBaseUrl: "http://127.0.0.1:3009",
    })
  })

  it("throws when KORRI_ASSET_ROOT is missing", () => {
    expect(() => readWebSurfaceHostConfigFromEnv({})).toThrow(
      "KORRI_ASSET_ROOT is required",
    )
  })

  it("starts a server on the configured loopback surface", async () => {
    const seen: Array<{ hostname: string; port: number; idleTimeout: number }> =
      []
    let stopped = false

    const handle = startKorriWebSurfaceHost(
      {
        assetRoot,
        hostname: "127.0.0.1",
        port: 0,
        upstreamBaseUrl: "http://127.0.0.1:1",
      },
      {},
      options => {
        seen.push({
          hostname: options.hostname,
          port: options.port,
          idleTimeout: options.idleTimeout,
        })
        return { port: 4321, stop: () => void (stopped = true) }
      },
    )

    expect(handle.port).toBe(4321)
    expect(seen).toEqual([
      { hostname: "127.0.0.1", port: 0, idleTimeout: 255 },
    ])

    handle.stop()
    expect(stopped).toBe(true)
  })
})
