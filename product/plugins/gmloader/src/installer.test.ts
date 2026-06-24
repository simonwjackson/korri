import { describe, expect, it } from "bun:test"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { ZIP_DEFLATED, ZIP_STORED } from "@platform/archive/zip"
import {
  GMLOADER_READY_MARKER,
  ensureGmloaderPayloadInstalled,
  installGmloaderPayload,
} from "./installer"
import { decodeGmloaderInstalledManifest } from "./manifest"

describe("GMLoader installer", () => {
  it("normalizes a supported APK into a canonical run directory and manifest", async () => {
    const sourcePath = await writeArchive("Sample Game.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])
    const installRoot = await mktemp()

    const manifest = await installGmloaderPayload({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
      installedAt: "2026-06-24T00:00:00.000Z",
    })

    expect(manifest.id).toStartWith("sample-game-")
    expect(
      await readFile(join(manifest.gameRoot, "assets", "game.droid"), "utf8"),
    ).toBe("game")
    expect(
      await readFile(
        join(manifest.gameRoot, "lib", "arm64-v8a", "libyoyo.so"),
        "utf8",
      ),
    ).toBe("runner")
    expect(
      JSON.parse(
        await readFile(join(manifest.gameRoot, "gmloader.json"), "utf8"),
      ),
    ).toMatchObject({
      apk_directory: ".",
      main_apk: "assets/game.droid",
      force_platform: "os_linux",
    })
    const decoded = decodeGmloaderInstalledManifest(
      JSON.parse(await readFile(manifest.manifestPath, "utf8")),
      "@korri:gmloader",
    )
    expect(decoded?.id).toBe(manifest.id)
  })

  it("records stored normalization for deflated game.droid", async () => {
    const sourcePath = await writeArchive("Compressed.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_DEFLATED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])

    const manifest = await installGmloaderPayload({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot: await mktemp(),
    })

    expect(
      await readFile(join(manifest.gameRoot, "assets", "game.droid"), "utf8"),
    ).toBe("game")
    expect(manifest.compatibility.transformsApplied).toContain(
      "store-game-droid",
    )
  })

  it("uses real file contents when deriving directory payload IDs", async () => {
    const left = await writeDirectoryPayload("left")
    const right = await writeDirectoryPayload("right")

    const leftManifest = await installGmloaderPayload({
      providerId: "@korri:gmloader",
      sourcePath: left,
      installRoot: await mktemp(),
    })
    const rightManifest = await installGmloaderPayload({
      providerId: "@korri:gmloader",
      sourcePath: right,
      installRoot: await mktemp(),
    })

    expect(leftManifest.id).not.toBe(rightManifest.id)
    expect(leftManifest.source.sha256).not.toBe(rightManifest.source.sha256)
  })

  it("reuses a complete cached install when ensuring the same payload twice", async () => {
    const sourcePath = await writeArchive("Cache Hit.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])
    const installRoot = await mktemp()

    const first = await ensureGmloaderPayloadInstalled({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
      installedAt: "2026-06-24T00:00:00.000Z",
    })
    const before = await stat(first.manifest.gameRoot)
    const second = await ensureGmloaderPayloadInstalled({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
      installedAt: "2026-06-25T00:00:00.000Z",
    })
    const after = await stat(second.manifest.gameRoot)

    expect(first.status).toBe("materialized")
    expect(second.status).toBe("cache-hit")
    expect(second.manifest.id).toBe(first.manifest.id)
    expect(second.manifest.installedAt).toBe(first.manifest.installedAt)
    expect(after.mtimeMs).toBe(before.mtimeMs)
  })

  it("repairs an incomplete cached install instead of launching it", async () => {
    const sourcePath = await writeArchive("Repair.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game-v1"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])
    const installRoot = await mktemp()
    const first = await ensureGmloaderPayloadInstalled({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
    })
    await rm(join(first.manifest.gameRoot, GMLOADER_READY_MARKER))
    await writeFile(join(first.manifest.gameRoot, "assets", "game.droid"), "broken")

    const repaired = await ensureGmloaderPayloadInstalled({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
    })

    expect(repaired.status).toBe("materialized")
    expect(repaired.manifest.id).toBe(first.manifest.id)
    expect(
      await readFile(
        join(repaired.manifest.gameRoot, "assets", "game.droid"),
        "utf8",
      ),
    ).toBe("game-v1")
  })

  it("serializes concurrent ensure calls for the same payload", async () => {
    const sourcePath = await writeArchive("Concurrent.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])
    const installRoot = await mktemp()

    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        ensureGmloaderPayloadInstalled({
          providerId: "@korri:gmloader",
          sourcePath,
          installRoot,
        }),
      ),
    )

    expect(new Set(results.map(result => result.manifest.id)).size).toBe(1)
    expect(results.filter(result => result.status === "materialized")).toHaveLength(
      1,
    )
    expect(results.filter(result => result.status === "cache-hit")).toHaveLength(
      3,
    )
  })

  it("refuses to clobber an existing install without overwrite", async () => {
    const sourcePath = await writeArchive("Same.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])
    const installRoot = await mktemp()
    await installGmloaderPayload({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
    })

    await expect(
      installGmloaderPayload({
        providerId: "@korri:gmloader",
        sourcePath,
        installRoot,
      }),
    ).rejects.toThrow(/already exists/)
  })

  it("preserves write confinement when archive members try to escape", async () => {
    const sourcePath = await writeArchive("Safe.apk", [
      { path: "../escape", bytes: Buffer.from("bad"), method: ZIP_STORED },
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/arm64-v8a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])
    const installRoot = await mktemp()

    const manifest = await installGmloaderPayload({
      providerId: "@korri:gmloader",
      sourcePath,
      installRoot,
    })

    expect(manifest.run.files.map(file => file.path)).not.toContain("../escape")
  })
})

interface TestZipEntry {
  readonly path: string
  readonly bytes: Buffer
  readonly method: number
}

async function writeDirectoryPayload(gameContents: string): Promise<string> {
  const root = await mktemp()
  await mkdir(join(root, "assets"), { recursive: true })
  await mkdir(join(root, "lib", "arm64-v8a"), { recursive: true })
  await writeFile(join(root, "assets", "game.droid"), gameContents)
  await writeFile(join(root, "lib", "arm64-v8a", "libyoyo.so"), "runner")
  return root
}

async function writeArchive(
  name: string,
  entries: readonly TestZipEntry[],
): Promise<string> {
  const path = join(await mktemp(), name)
  await writeFile(path, createZip(entries))
  return path
}

async function mktemp(): Promise<string> {
  return import("node:fs/promises").then(fs =>
    fs.mkdtemp(join(tmpdir(), "korri-gmloader-")),
  )
}

function createZip(entries: readonly TestZipEntry[]): Buffer {
  const fileRecords: Buffer[] = []
  const centralRecords: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.path)
    const compressed =
      entry.method === ZIP_DEFLATED ? deflateRawSync(entry.bytes) : entry.bytes
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(entry.method, 8)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(entry.bytes.length, 22)
    local.writeUInt16LE(name.length, 26)
    fileRecords.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(entry.method, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(entry.bytes.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centralRecords.push(central, name)
    offset += local.length + name.length + compressed.length
  }

  const centralOffset = offset
  const central = Buffer.concat(centralRecords)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(central.length, 12)
  eocd.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([...fileRecords, central, eocd])
}
