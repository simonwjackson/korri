import { describe, expect, it } from "bun:test"
import { mkdir, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { ZIP_DEFLATED, ZIP_STORED } from "@platform/archive/zip"
import { inspectGmloaderPayload } from "./payload"

describe("GMLoader payload inspection", () => {
  it("classifies arm64 GameMaker APKs by payload shape", async () => {
    const apk = await writeArchive("game.apk", [
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
      {
        path: "lib/arm64-v8a/libc++_shared.so",
        bytes: Buffer.from("cxx"),
        method: ZIP_STORED,
      },
    ])

    const result = await inspectGmloaderPayload({ sourcePath: apk })

    expect(result._tag).toBe("Supported")
    if (result._tag !== "Supported") throw new Error("expected supported")
    expect(result.profile.abis).toEqual(["arm64-v8a"])
    expect(result.profile.gameDroid.stored).toBe(true)
    expect(result.profile.transformsRequired).toContain("extract-arm64-runner")
    expect(result.profile.transformsRequired).not.toContain("store-game-droid")
  })

  it("marks deflated game.droid as requiring stored normalization", async () => {
    const apk = await writeArchive("compressed.apk", [
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

    const result = await inspectGmloaderPayload({ sourcePath: apk })

    expect(result._tag).toBe("Supported")
    if (result._tag !== "Supported") throw new Error("expected supported")
    expect(result.profile.gameDroid.stored).toBe(false)
    expect(result.profile.transformsRequired).toContain("store-game-droid")
    expect(result.profile.transformsRequired).toContain(
      "seed-android-shim-libs",
    )
  })

  it("rejects 32-bit-only GameMaker payloads before launch", async () => {
    const apk = await writeArchive("arm32.apk", [
      {
        path: "assets/game.droid",
        bytes: Buffer.from("game"),
        method: ZIP_STORED,
      },
      {
        path: "lib/armeabi-v7a/libyoyo.so",
        bytes: Buffer.from("runner"),
        method: ZIP_STORED,
      },
    ])

    const result = await inspectGmloaderPayload({ sourcePath: apk })

    expect(result._tag).toBe("Rejected")
    if (result._tag !== "Rejected") throw new Error("expected rejected")
    expect(result.rejection.reason).toBe("arm32-only")
  })

  it("classifies extracted directories the same way as archives", async () => {
    const root = await mktemp()
    await mkdir(join(root, "assets"), { recursive: true })
    await mkdir(join(root, "lib", "arm64-v8a"), { recursive: true })
    await writeFile(join(root, "assets", "game.droid"), "game")
    await writeFile(join(root, "lib", "arm64-v8a", "libyoyo.so"), "runner")

    const result = await inspectGmloaderPayload({ sourcePath: root })

    expect(result._tag).toBe("Supported")
    if (result._tag !== "Supported") throw new Error("expected supported")
    expect(result.profile.kind).toBe("directory")
    expect(result.profile.gameDroid.stored).toBe(true)
  })

  it("rejects non-GameMaker and corrupt inputs with distinct reasons", async () => {
    const zip = await writeArchive("not-gm.zip", [
      { path: "index.html", bytes: Buffer.from("html"), method: ZIP_STORED },
    ])
    const corrupt = join(await mktemp(), "bad.apk")
    await writeFile(corrupt, "not a zip")

    const notGameMaker = await inspectGmloaderPayload({ sourcePath: zip })
    const corruptResult = await inspectGmloaderPayload({ sourcePath: corrupt })

    expect(notGameMaker._tag).toBe("Rejected")
    if (notGameMaker._tag !== "Rejected") throw new Error("expected rejected")
    expect(notGameMaker.rejection.reason).toBe("not-gamemaker")
    expect(corruptResult._tag).toBe("Rejected")
    if (corruptResult._tag !== "Rejected") throw new Error("expected rejected")
    expect(corruptResult.rejection.reason).toBe("corrupt-archive")
  })

  it("enforces directory intake limits", async () => {
    const root = await mktemp()
    await mkdir(join(root, "assets"), { recursive: true })
    await mkdir(join(root, "lib", "arm64-v8a"), { recursive: true })
    await writeFile(join(root, "assets", "game.droid"), "game")
    await writeFile(join(root, "lib", "arm64-v8a", "libyoyo.so"), "runner")

    const result = await inspectGmloaderPayload({
      sourcePath: root,
      limits: { maxEntries: 1 },
    })

    expect(result._tag).toBe("Rejected")
    if (result._tag !== "Rejected") throw new Error("expected rejected")
    expect(result.rejection.reason).toBe("limit-exceeded")
  })

  it("rejects in-tree directory symlink loops", async () => {
    const root = await mktemp()
    await symlink(root, join(root, "loop"))

    const result = await inspectGmloaderPayload({ sourcePath: root })

    expect(result._tag).toBe("Rejected")
    if (result._tag !== "Rejected") throw new Error("expected rejected")
    expect(result.rejection.reason).toBe("unsafe-source")
  })

  it("rejects directory symlinks that escape the selected source tree", async () => {
    const root = await mktemp()
    const outside = join(await mktemp(), "outside")
    await writeFile(outside, "secret")
    await symlink(outside, join(root, "escape"))

    const result = await inspectGmloaderPayload({ sourcePath: root })

    expect(result._tag).toBe("Rejected")
    if (result._tag !== "Rejected") throw new Error("expected rejected")
    expect(result.rejection.reason).toBe("unsafe-source")
  })
})

interface TestZipEntry {
  readonly path: string
  readonly bytes: Buffer
  readonly method: number
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
  return await import("node:fs/promises").then(fs =>
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
