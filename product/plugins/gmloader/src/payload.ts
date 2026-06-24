import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises"
import { basename, extname, join, relative, resolve } from "node:path"
import {
  readZipCentralDirectory,
  readZipEntryBytes,
  ZIP_STORED,
  type ZipCentralDirectoryEntry,
  ZipArchiveError,
} from "@platform/archive/zip"

export type GmloaderPayloadKind = "archive" | "directory"
export type GmloaderAbi = "arm64-v8a" | "armeabi-v7a" | "armeabi" | "x86" | "x86_64"

export type GmloaderPayloadRejectionKind =
  | "missing-source"
  | "unsafe-source"
  | "unsupported-source"
  | "corrupt-archive"
  | "not-gamemaker"
  | "missing-game-droid"
  | "missing-libyoyo"
  | "arm32-only"
  | "no-supported-abi"
  | "limit-exceeded"

export interface GmloaderPayloadRejection {
  readonly _tag: "GmloaderPayloadRejection"
  readonly reason: GmloaderPayloadRejectionKind
  readonly sourcePath: string
  readonly evidence: readonly string[]
  readonly message: string
}

export interface GmloaderDetectedFile {
  readonly path: string
  readonly sizeBytes: number
  readonly compressionMethod?: number
}

export interface GmloaderPayloadProfile {
  readonly _tag: "GmloaderPayloadProfile"
  readonly sourcePath: string
  readonly kind: GmloaderPayloadKind
  readonly title: string
  readonly idHint: string
  readonly gameDroid: GmloaderDetectedFile & { readonly stored: boolean }
  readonly libyoyo: GmloaderDetectedFile & { readonly abi: GmloaderAbi }
  readonly abis: readonly GmloaderAbi[]
  readonly supportLibraries: readonly GmloaderDetectedFile[]
  readonly transformsRequired: readonly GmloaderPayloadTransform[]
  readonly evidence: readonly string[]
}

export type GmloaderPayloadTransform =
  | "store-game-droid"
  | "extract-arm64-runner"
  | "seed-android-shim-libs"

export type GmloaderPayloadInspection =
  | { readonly _tag: "Supported"; readonly profile: GmloaderPayloadProfile }
  | { readonly _tag: "Rejected"; readonly rejection: GmloaderPayloadRejection }

export interface InspectGmloaderPayloadOptions {
  readonly sourcePath: string
  readonly limits?: {
    readonly maxEntries?: number
    readonly maxSourceBytes?: number
    readonly maxExpandedBytes?: number
  }
}

const DEFAULT_MAX_ENTRIES = 20_000
const DEFAULT_MAX_SOURCE_BYTES = 2_000_000_000
const DEFAULT_MAX_EXPANDED_BYTES = 4_000_000_000
const GAME_DROID_PATH = "assets/game.droid"
const LIBYOYO_RE = /^lib\/([^/]+)\/libyoyo\.so$/
const ABI_ORDER: readonly GmloaderAbi[] = ["arm64-v8a", "armeabi-v7a", "armeabi", "x86_64", "x86"]

export async function inspectGmloaderPayload(
  options: InspectGmloaderPayloadOptions,
): Promise<GmloaderPayloadInspection> {
  const sourcePath = resolve(options.sourcePath)
  if (sourcePath.includes("\0")) {
    return rejected("unsafe-source", sourcePath, ["source path contains NUL"], "Source path is not safe")
  }

  const metadata = await stat(sourcePath).catch(() => null)
  if (!metadata) {
    return rejected("missing-source", sourcePath, ["source path does not exist"], "Source path does not exist")
  }

  if (metadata.isDirectory()) {
    return inspectDirectory(sourcePath, {
      maxEntries: options.limits?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      maxExpandedBytes: options.limits?.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES,
    })
  }

  if (!metadata.isFile()) {
    return rejected("unsupported-source", sourcePath, ["source is not a regular file or directory"], "Source path must be a file or directory")
  }

  if (metadata.size > (options.limits?.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES)) {
    return rejected("limit-exceeded", sourcePath, [`source size ${metadata.size} exceeds limit`], "Source file is too large")
  }

  const extension = extname(sourcePath).toLowerCase()
  if (![".apk", ".zip", ".port"].includes(extension)) {
    return rejected("unsupported-source", sourcePath, [`unsupported extension ${extension || "<none>"}`], "Source file must be an APK, ZIP, or .port archive")
  }

  const archive = await readFile(sourcePath)
  try {
    const entries = readZipCentralDirectory(archive, {
      maxEntries: options.limits?.maxEntries ?? DEFAULT_MAX_ENTRIES,
      maxCompressedBytes: options.limits?.maxSourceBytes ?? DEFAULT_MAX_SOURCE_BYTES,
      maxUncompressedBytes: options.limits?.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES,
    }).filter(entry => !entry.directory && entry.safePath)
    return classifyEntries({
      sourcePath,
      kind: "archive",
      title: titleFromPath(sourcePath),
      entries: entries.map(entry => archiveFileFromEntry(archive, entry)),
    })
  } catch (error) {
    if (error instanceof ZipArchiveError && error.reason === "limit-exceeded") {
      return rejected("limit-exceeded", sourcePath, [error.message], error.message)
    }
    return rejected("corrupt-archive", sourcePath, [error instanceof Error ? error.message : String(error)], "Archive is corrupt or unsupported")
  }
}

interface PayloadFile {
  readonly path: string
  readonly sizeBytes: number
  readonly compressionMethod?: number
  readonly readBytes: () => Promise<Buffer>
}

async function inspectDirectory(
  sourcePath: string,
  limits: { readonly maxEntries: number; readonly maxExpandedBytes: number },
): Promise<GmloaderPayloadInspection> {
  const rootRealPath = await realpath(sourcePath)
  const files: PayloadFile[] = []
  const unsafe: string[] = []
  const visitedDirectories = new Set<string>()
  let expandedBytes = 0

  async function visit(dir: string): Promise<void> {
    const dirRealPath = await realpath(dir)
    if (visitedDirectories.has(dirRealPath)) return
    visitedDirectories.add(dirRealPath)
    for (const name of await readdir(dir)) {
      const absolute = join(dir, name)
      const linkMetadata = await lstat(absolute)
      if (linkMetadata.isSymbolicLink()) {
        const target = await realpath(absolute).catch(() => null)
        if (!target || !isContained(rootRealPath, target)) {
          unsafe.push(relative(sourcePath, absolute))
          continue
        }
        const targetMetadata = await stat(absolute)
        if (targetMetadata.isDirectory()) {
          unsafe.push(`${relative(sourcePath, absolute)} -> directory symlink`)
          continue
        }
      }
      const metadata = await stat(absolute)
      if (metadata.isDirectory()) {
        await visit(absolute)
        continue
      }
      if (!metadata.isFile()) continue
      if (files.length + 1 > limits.maxEntries) {
        unsafe.push(`directory entry count exceeds limit: ${limits.maxEntries}`)
        return
      }
      expandedBytes += metadata.size
      if (expandedBytes > limits.maxExpandedBytes) {
        unsafe.push(`directory expanded size exceeds limit: ${limits.maxExpandedBytes}`)
        return
      }
      const path = relative(sourcePath, absolute).replaceAll("\\", "/")
      files.push({
        path,
        sizeBytes: metadata.size,
        readBytes: () => readFile(absolute),
      })
    }
  }

  await visit(sourcePath)
  if (unsafe.length > 0) {
    const limitFailure = unsafe.find(item => item.includes("exceeds limit"))
    return rejected(
      limitFailure ? "limit-exceeded" : "unsafe-source",
      sourcePath,
      unsafe,
      limitFailure ?? "Directory payload contains unsafe symlinks",
    )
  }

  return classifyEntries({
    sourcePath,
    kind: "directory",
    title: titleFromPath(sourcePath),
    entries: files,
  })
}

function archiveFileFromEntry(
  archive: Buffer,
  entry: ZipCentralDirectoryEntry,
): PayloadFile {
  return {
    path: entry.safePath ?? entry.path,
    sizeBytes: entry.uncompressedSize,
    compressionMethod: entry.compressionMethod,
    readBytes: async () => readZipEntryBytes(archive, entry),
  }
}

async function classifyEntries(input: {
  readonly sourcePath: string
  readonly kind: GmloaderPayloadKind
  readonly title: string
  readonly entries: readonly PayloadFile[]
}): Promise<GmloaderPayloadInspection> {
  const byPath = new Map(input.entries.map(entry => [entry.path, entry]))
  const evidence: string[] = [`inspected ${input.entries.length} payload files`]
  const gameDroid = byPath.get(GAME_DROID_PATH)
  if (!gameDroid) {
    const hasGameMakerHints = input.entries.some(entry => LIBYOYO_RE.test(entry.path))
    return rejected(
      hasGameMakerHints ? "missing-game-droid" : "not-gamemaker",
      input.sourcePath,
      evidence,
      hasGameMakerHints ? "GameMaker runner found but assets/game.droid is missing" : "Payload does not look like a GameMaker Android export",
    )
  }
  evidence.push(`found ${GAME_DROID_PATH}`)

  const libyoyos = input.entries
    .map(entry => ({ entry, match: entry.path.match(LIBYOYO_RE) }))
    .filter((candidate): candidate is { readonly entry: PayloadFile; readonly match: RegExpMatchArray } => Boolean(candidate.match))
  if (libyoyos.length === 0) {
    return rejected("missing-libyoyo", input.sourcePath, evidence, "GameMaker payload is missing lib/<abi>/libyoyo.so")
  }
  const abis = ABI_ORDER.filter(abi => libyoyos.some(candidate => candidate.match[1] === abi))
  evidence.push(`found libyoyo ABIs: ${abis.join(", ")}`)
  const selected = libyoyos.find(candidate => candidate.match[1] === "arm64-v8a")
  if (!selected) {
    return rejected(
      abis.some(abi => abi === "armeabi-v7a" || abi === "armeabi") ? "arm32-only" : "no-supported-abi",
      input.sourcePath,
      evidence,
      abis.some(abi => abi === "armeabi-v7a" || abi === "armeabi") ? "Payload is GameMaker but only includes 32-bit ARM runner libraries" : "Payload does not include an arm64 GameMaker runner",
    )
  }

  const supportLibraries = input.entries
    .filter(entry => entry.path.startsWith("lib/arm64-v8a/") && entry.path !== selected.entry.path)
    .map(toDetectedFile)
  const transformsRequired: GmloaderPayloadTransform[] = ["extract-arm64-runner"]
  const stored = input.kind === "directory" || gameDroid.compressionMethod === ZIP_STORED
  if (!stored) transformsRequired.push("store-game-droid")
  if (!supportLibraries.some(file => file.path.endsWith("libc++_shared.so"))) {
    transformsRequired.push("seed-android-shim-libs")
  }

  return {
    _tag: "Supported",
    profile: {
      _tag: "GmloaderPayloadProfile",
      sourcePath: input.sourcePath,
      kind: input.kind,
      title: input.title,
      idHint: idHintFromTitle(input.title),
      gameDroid: { ...toDetectedFile(gameDroid), stored },
      libyoyo: { ...toDetectedFile(selected.entry), abi: "arm64-v8a" },
      abis,
      supportLibraries,
      transformsRequired,
      evidence,
    },
  }
}

function toDetectedFile(entry: PayloadFile): GmloaderDetectedFile {
  return {
    path: entry.path,
    sizeBytes: entry.sizeBytes,
    ...(entry.compressionMethod !== undefined ? { compressionMethod: entry.compressionMethod } : {}),
  }
}

function rejected(
  reason: GmloaderPayloadRejectionKind,
  sourcePath: string,
  evidence: readonly string[],
  message: string,
): GmloaderPayloadInspection {
  return {
    _tag: "Rejected",
    rejection: {
      _tag: "GmloaderPayloadRejection",
      reason,
      sourcePath,
      evidence,
      message,
    },
  }
}

function titleFromPath(path: string): string {
  return basename(path, extname(path)).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || "GameMaker Game"
}

function idHintFromTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "gamemaker-game"
}

function isContained(root: string, child: string): boolean {
  const rel = relative(root, child)
  return rel === "" || (!rel.startsWith("..") && !resolve(rel).startsWith("/"))
}
