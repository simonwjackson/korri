import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { findRepresentativeAsset, runDesktopSmoke } from "./desktop-smoke"

let assetRoot: string

async function writeFixture(relativePath: string, body: string) {
  const filePath = join(assetRoot, relativePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, body)
}

describe("desktop smoke", () => {
  beforeEach(async () => {
    assetRoot = await mkdtemp(join(tmpdir(), "korri-desktop-smoke-"))
  })

  afterEach(async () => {
    await rm(assetRoot, { recursive: true, force: true })
  })

  test("finds a representative built asset", async () => {
    await writeFixture("assets/app.js", "globalThis.app = true")

    expect(await findRepresentativeAsset(assetRoot)).toBe("/assets/app.js")
  })

  test("verifies root, the API forwarder mount, and a representative asset", async () => {
    await writeFixture("index.html", "<html>Portal</html>")
    await writeFixture("assets/app.js", "globalThis.app = true")

    const report = await runDesktopSmoke({ assetRoot })

    expect(report.ok).toBe(true)
    expect(report.checks).toEqual([
      { name: "portal root", status: "pass", message: "GET / returned 200" },
      {
        name: "API forwarder mounted",
        status: "pass",
        message: "GET /api/health returned 503 { error: 'no upstream' }",
      },
      {
        name: "representative asset",
        status: "pass",
        message: "GET /assets/app.js returned 200",
      },
    ])
  })

  test("skips the asset check when the build has no assets", async () => {
    await writeFixture("index.html", "<html>Portal</html>")

    const report = await runDesktopSmoke({ assetRoot })

    expect(report.ok).toBe(true)
    expect(report.checks.at(-1)).toEqual({
      name: "representative asset",
      status: "skip",
      message:
        "No assets directory file found; root and API checks still passed.",
    })
  })

  test("fails clearly when the portal build is missing", async () => {
    const missingRoot = join(assetRoot, "missing")

    const report = await runDesktopSmoke({ assetRoot: missingRoot })

    expect(report.ok).toBe(false)
    expect(report.checks).toEqual([
      {
        name: "portal build",
        status: "fail",
        message: `Missing portal index at ${join(missingRoot, "index.html")}`,
      },
    ])
  })
})
