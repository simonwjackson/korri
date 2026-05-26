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
    await writeFixture(
      "index.html",
      '<html><head></head><body><div id="app"></div></body></html>',
    )
    await writeFixture("assets/app.js", "globalThis.app = true")

    const report = await runDesktopSmoke({ assetRoot })

    expect(report.ok).toBe(true)
    const names = report.checks.map(c => c.name)
    expect(names).toContain("portal root")
    expect(names).toContain("API forwarder mounted")
    expect(names).toContain("representative asset")
    expect(
      report.checks.find(c => c.name === "representative asset")?.status,
    ).toBe("pass")
  })

  test("skips the asset check when the build has no assets", async () => {
    await writeFixture(
      "index.html",
      '<html><head></head><body><div id="app"></div></body></html>',
    )

    const report = await runDesktopSmoke({ assetRoot })

    expect(report.ok).toBe(true)
    expect(report.checks.find(c => c.name === "representative asset")).toEqual({
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

  test("pins the waiting-page body when disconnected", async () => {
    await writeFixture(
      "index.html",
      '<html><head></head><body><div id="app"></div></body></html>',
    )

    const report = await runDesktopSmoke({ assetRoot })

    const waiting = report.checks.find(
      c => c.name === "waiting page served when disconnected",
    )
    expect(waiting?.status).toBe("pass")

    const reconnect = report.checks.find(
      c => c.name === "waiting page names remembered host when reconnecting",
    )
    expect(reconnect?.status).toBe("pass")
  })

  test("pins the help block visibility against helpAfter", async () => {
    await writeFixture("index.html", "<html><head></head><body></body></html>")

    const report = await runDesktopSmoke({ assetRoot })

    expect(
      report.checks.find(
        c =>
          c.name ===
          "waiting page omits help block when helpAfter is in the future",
      )?.status,
    ).toBe("pass")
    expect(
      report.checks.find(
        c =>
          c.name ===
          "waiting page includes help block when helpAfter is in the past",
      )?.status,
    ).toBe("pass")
  })

  test("pins inlined runtime-config body shape on the connected serve", async () => {
    await writeFixture(
      "index.html",
      '<html><head></head><body><div id="app"></div></body></html>',
    )

    const report = await runDesktopSmoke({ assetRoot })

    expect(
      report.checks.find(
        c =>
          c.name ===
          "connected serve inlines runtime-config (desktopInput: true)",
      )?.status,
    ).toBe("pass")
    expect(
      report.checks.find(
        c =>
          c.name ===
          "connected serve inlines runtime-config (desktopInput: false)",
      )?.status,
    ).toBe("pass")
  })

  test("pins the connection-status endpoint JSON shape", async () => {
    await writeFixture("index.html", "<html><head></head><body></body></html>")

    const report = await runDesktopSmoke({ assetRoot })

    expect(
      report.checks.find(
        c =>
          c.name ===
          "connection-status endpoint returns ISO timestamps when searching",
      )?.status,
    ).toBe("pass")
    expect(
      report.checks.find(
        c =>
          c.name ===
          "connection-status endpoint omits timestamps when connected",
      )?.status,
    ).toBe("pass")
  })

  test("pins that /api/* and /__korri/desktop/rpc still return 503 while disconnected", async () => {
    await writeFixture("index.html", "<html><head></head><body></body></html>")

    const report = await runDesktopSmoke({ assetRoot })

    expect(
      report.checks.find(
        c => c.name === "disconnected serve does not interfere with /api/*",
      )?.status,
    ).toBe("pass")
    expect(
      report.checks.find(
        c =>
          c.name ===
          "disconnected serve does not interfere with /__korri/desktop/rpc",
      )?.status,
    ).toBe("pass")
  })
})
