import { describe, expect, it } from "bun:test"
import { deflateRawSync } from "node:zlib"
import {
  readZipCentralDirectory,
  readZipEntries,
  safeZipPath,
  ZIP_DEFLATED,
  ZIP_STORED,
  ZipArchiveError,
} from "./zip"

describe("zip archive reader", () => {
  it("reports stored and deflated entries with compression methods", () => {
    const archive = createZip([
      { path: "assets/game.droid", bytes: Buffer.from("game"), method: ZIP_STORED },
      { path: "lib/arm64-v8a/libyoyo.so", bytes: Buffer.from("runner"), method: ZIP_DEFLATED },
    ])

    const directory = readZipCentralDirectory(archive)
    expect(directory.map(entry => [entry.path, entry.compressionMethod])).toEqual([
      ["assets/game.droid", ZIP_STORED],
      ["lib/arm64-v8a/libyoyo.so", ZIP_DEFLATED],
    ])

    const entries = readZipEntries(archive)
    expect(entries.find(entry => entry.path === "assets/game.droid")?.bytes.toString()).toBe("game")
    expect(entries.find(entry => entry.path === "lib/arm64-v8a/libyoyo.so")?.bytes.toString()).toBe("runner")
  })

  it("marks unsafe member paths without returning them as safe", () => {
    expect(safeZipPath("../escape")).toBeNull()
    expect(safeZipPath("/escape")).toBeNull()
    expect(safeZipPath("C:/escape")).toBeNull()
    expect(safeZipPath("assets/game.droid")).toBe("assets/game.droid")
  })

  it("rejects corrupt archives distinctly", () => {
    expect(() => readZipCentralDirectory(Buffer.from("not a zip"))).toThrow(ZipArchiveError)
  })

  it("enforces archive intake limits before extraction", () => {
    const archive = createZip([
      { path: "a", bytes: Buffer.alloc(10), method: ZIP_STORED },
      { path: "b", bytes: Buffer.alloc(10), method: ZIP_STORED },
    ])

    expect(() => readZipCentralDirectory(archive, { maxEntries: 1 })).toThrow(/entry count/)
    expect(() => readZipCentralDirectory(archive, { maxUncompressedBytes: 10 })).toThrow(/expanded size/)
  })
})

interface TestZipEntry {
  readonly path: string
  readonly bytes: Buffer
  readonly method: number
}

function createZip(entries: readonly TestZipEntry[]): Buffer {
  const fileRecords: Buffer[] = []
  const centralRecords: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.path)
    const compressed = entry.method === ZIP_DEFLATED ? deflateRawSync(entry.bytes) : entry.bytes
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
