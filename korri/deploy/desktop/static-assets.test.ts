import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { getContentType, serveStaticAsset } from "./static-assets"

let assetRoot: string

async function writeFixture(relativePath: string, body: string) {
  const filePath = join(assetRoot, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, body)
}

function request(pathname: string) {
  return new Request(`http://desktop.local${pathname}`)
}

describe("static desktop assets", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-assets-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("returns index.html for the root route", async () => {
    await writeFixture("index.html", "<html>Korri</html>")

    const response = await serveStaticAsset(request("/"), { assetRoot })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toBe("<html>Korri</html>")
  })

  test("serves existing asset files with content types", async () => {
    await writeFixture("assets/app.js", "globalThis.loaded = true")

    const response = await serveStaticAsset(request("/assets/app.js"), {
      assetRoot,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/javascript")
    expect(await response.text()).toBe("globalThis.loaded = true")
  })

  test("falls back to index.html for route-like missing paths", async () => {
    await writeFixture("index.html", "<html>SPA</html>")

    const response = await serveStaticAsset(request("/games/123"), {
      assetRoot,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/html")
    expect(await response.text()).toBe("<html>SPA</html>")
  })

  test("returns 404 for missing file-like asset paths", async () => {
    await writeFixture("index.html", "<html>SPA</html>")

    const response = await serveStaticAsset(request("/assets/missing.js"), {
      assetRoot,
    })

    expect(response.status).toBe(404)
    expect(await response.text()).toBe("Not Found")
  })

  test("rejects traversal outside the asset root", async () => {
    await writeFixture("index.html", "<html>SPA</html>")

    const response = await serveStaticAsset(request("/..%2Fsecret.txt"), {
      assetRoot,
    })

    expect(response.status).toBe(400)
    expect(await response.text()).toBe("Bad Request")
  })

  test("maps common Vite asset content types", () => {
    expect(getContentType("index.html")).toBe("text/html; charset=utf-8")
    expect(getContentType("assets/app.css")).toBe("text/css; charset=utf-8")
    expect(getContentType("assets/app.js")).toBe(
      "text/javascript; charset=utf-8",
    )
    expect(getContentType("assets/logo.svg")).toBe("image/svg+xml")
  })
})
