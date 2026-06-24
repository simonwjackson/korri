import { normalize, sep } from "node:path"
import { inflateRawSync } from "node:zlib"

export const ZIP_STORED = 0
export const ZIP_DEFLATED = 8

const ZIP_LOCAL_HEADER = 0x04034b50
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50

export class ZipArchiveError extends Error {
  readonly reason: "corrupt" | "unsupported-compression" | "limit-exceeded"

  constructor(reason: ZipArchiveError["reason"], message: string) {
    super(message)
    this.name = "ZipArchiveError"
    this.reason = reason
  }
}

export interface ZipReadLimits {
  readonly maxEntries?: number
  readonly maxCompressedBytes?: number
  readonly maxUncompressedBytes?: number
}

export interface ZipCentralDirectoryEntry {
  readonly path: string
  readonly safePath: string | null
  readonly compressionMethod: number
  readonly compressedSize: number
  readonly uncompressedSize: number
  readonly localHeaderOffset: number
  readonly directory: boolean
}

export interface ZipEntry extends ZipCentralDirectoryEntry {
  readonly bytes: Buffer
}

export function readZipCentralDirectory(
  archive: Buffer,
  limits: ZipReadLimits = {},
): readonly ZipCentralDirectoryEntry[] {
  if (
    limits.maxCompressedBytes !== undefined &&
    archive.length > limits.maxCompressedBytes
  ) {
    throw new ZipArchiveError(
      "limit-exceeded",
      `Zip archive exceeds maximum compressed size: ${archive.length}`,
    )
  }

  const eocdOffset = findEndOfCentralDirectory(archive)
  const entryCount = archive.readUInt16LE(eocdOffset + 10)
  if (limits.maxEntries !== undefined && entryCount > limits.maxEntries) {
    throw new ZipArchiveError(
      "limit-exceeded",
      `Zip archive entry count exceeds limit: ${entryCount}`,
    )
  }

  const centralDirectoryOffset = archive.readUInt32LE(eocdOffset + 16)
  const entries: ZipCentralDirectoryEntry[] = []
  let offset = centralDirectoryOffset
  let expandedBytes = 0

  for (let index = 0; index < entryCount; index += 1) {
    ensureReadable(archive, offset, 46, "bad central directory")
    if (archive.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_HEADER) {
      throw new ZipArchiveError("corrupt", "Bad zip central directory")
    }

    const compressionMethod = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const uncompressedSize = archive.readUInt32LE(offset + 24)
    const fileNameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const localHeaderOffset = archive.readUInt32LE(offset + 42)
    const fileNameStart = offset + 46
    ensureReadable(
      archive,
      fileNameStart,
      fileNameLength + extraLength + commentLength,
      "truncated central directory entry",
    )
    const path = archive
      .subarray(fileNameStart, fileNameStart + fileNameLength)
      .toString("utf8")

    expandedBytes += uncompressedSize
    if (
      limits.maxUncompressedBytes !== undefined &&
      expandedBytes > limits.maxUncompressedBytes
    ) {
      throw new ZipArchiveError(
        "limit-exceeded",
        `Zip archive expanded size exceeds limit: ${expandedBytes}`,
      )
    }

    entries.push({
      path,
      safePath: safeZipPath(path),
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      directory: path.endsWith("/"),
    })

    offset = fileNameStart + fileNameLength + extraLength + commentLength
  }

  return entries
}

export function readZipEntries(
  archive: Buffer,
  limits: ZipReadLimits = {},
): readonly ZipEntry[] {
  return readZipCentralDirectory(archive, limits)
    .filter(entry => !entry.directory)
    .map(entry => ({ ...entry, bytes: readZipEntryBytes(archive, entry) }))
}

export function readZipEntryBytes(
  archive: Buffer,
  entry: ZipCentralDirectoryEntry,
): Buffer {
  const offset = entry.localHeaderOffset
  ensureReadable(archive, offset, 30, `truncated zip entry: ${entry.path}`)
  if (archive.readUInt32LE(offset) !== ZIP_LOCAL_HEADER) {
    throw new ZipArchiveError("corrupt", `Bad zip local header: ${entry.path}`)
  }

  const fileNameLength = archive.readUInt16LE(offset + 26)
  const extraLength = archive.readUInt16LE(offset + 28)
  const dataStart = offset + 30 + fileNameLength + extraLength
  ensureReadable(
    archive,
    dataStart,
    entry.compressedSize,
    `truncated zip entry data: ${entry.path}`,
  )
  const compressed = archive.subarray(
    dataStart,
    dataStart + entry.compressedSize,
  )

  if (entry.compressionMethod === ZIP_STORED) return Buffer.from(compressed)
  if (entry.compressionMethod === ZIP_DEFLATED) {
    const inflated = inflateRawSync(compressed)
    if (inflated.length !== entry.uncompressedSize) {
      throw new ZipArchiveError(
        "corrupt",
        `Zip entry size mismatch: ${entry.path}`,
      )
    }
    return inflated
  }

  throw new ZipArchiveError(
    "unsupported-compression",
    `Unsupported zip compression method ${entry.compressionMethod}: ${entry.path}`,
  )
}

export function safeZipPath(path: string): string | null {
  const normalized = normalize(path.replaceAll("\\", "/"))
  if (
    normalized === "." ||
    normalized.startsWith("..") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes(`..${sep}`) ||
    normalized.includes("\0")
  ) {
    return null
  }
  return normalized
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const minOffset = Math.max(0, archive.length - 65557)
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (
      offset >= 0 &&
      archive.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY
    ) {
      return offset
    }
  }
  throw new ZipArchiveError("corrupt", "Missing zip central directory")
}

function ensureReadable(
  buffer: Buffer,
  offset: number,
  length: number,
  message: string,
): void {
  if (offset < 0 || length < 0 || offset + length > buffer.length) {
    throw new ZipArchiveError("corrupt", message)
  }
}
