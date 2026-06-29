import { Buffer } from "node:buffer"
import { spawn } from "node:child_process"
import { constants } from "node:fs"
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, isAbsolute } from "node:path"
import type { StorageRecord } from "@platform/library/config/records/storage"
import { resolveAllConfigGraphRoots } from "@platform/library/library-source-layer-live"
import {
  type KorriConfigGraphRoot,
  openKorriConfigGraph,
} from "@platform/library/proseql/config-graph-db"
import { Effect } from "effect"
import { parse, stringify } from "yaml"
import {
  classifyRomScanPath,
  createRomLibraryCandidatesFromClassifications,
  type RomScanCandidate,
  type RomScanClassification,
} from "./rom-scan-classifier"

export type RomScanResult =
  | {
      readonly status: "ok"
      readonly root: string
      readonly storage: string
      readonly report: RomScanReport
      readonly yaml: string
    }
  | {
      readonly status: "diagnostic"
      readonly reason: "ScanFailed"
      readonly message: string
    }

export interface RomScanReport {
  readonly files: number
  readonly candidates: number
  readonly excluded: number
  readonly unsupported: number
  readonly ignored: number
  readonly ambiguous: number
  readonly bySystem: Readonly<Record<string, number>>
  readonly reasons: Readonly<Record<string, number>>
  readonly samples: readonly RomScanSample[]
}

export interface RomScanSample {
  readonly path: string
  readonly tag: RomScanClassification["_tag"]
  readonly detail?: string
}

interface RomScanArgs {
  readonly root: string
  readonly storage: string
  readonly findBinary?: string
  readonly timeoutMs?: number
  readonly reservedLibraryIds?: Set<string>
}

export interface MergeReleaseCandidateConfigArgs {
  readonly path: string
  readonly candidateYaml: string
  readonly mergeStorage?: boolean
}

export interface MergeReleaseCandidateConfigResult {
  readonly path: string
  readonly storageAdded: number
  readonly storageSkipped: number
  readonly libraryAdded: number
  readonly librarySkipped: number
}

export interface ScanConfiguredReleaseCandidatesArgs {
  readonly configPath: string
  readonly roots?: readonly KorriConfigGraphRoot[]
  readonly env?: NodeJS.ProcessEnv
  readonly findBinary?: string
  readonly timeoutMs?: number
}

export type ConfiguredStorageScanResult =
  | {
      readonly storage: string
      readonly root: string
      readonly status: "scanned"
      readonly report: RomScanReport
      readonly merge: MergeReleaseCandidateConfigResult
    }
  | {
      readonly storage: string
      readonly root: string
      readonly status: "skipped"
      readonly reason: ConfiguredStorageSkipReason
      readonly message: string
    }
  | {
      readonly storage: string
      readonly root: string
      readonly status: "failed"
      readonly reason: "ScanFailed"
      readonly message: string
    }

export type ConfiguredStorageSkipReason =
  | "missing"
  | "non-directory"
  | "non-absolute"
  | "unreadable"
  | "unresolved-template"

export type ScanConfiguredReleaseCandidatesResult =
  | {
      readonly status: "ok"
      readonly config: string
      readonly scanned: number
      readonly skipped: number
      readonly failed: number
      readonly results: readonly ConfiguredStorageScanResult[]
    }
  | {
      readonly status: "diagnostic"
      readonly reason: "ConfigLoadFailed" | "ScanFailed" | "MergeFailed"
      readonly message: string
      readonly results?: readonly ConfiguredStorageScanResult[]
    }

interface MutableReport {
  files: number
  candidates: number
  excluded: number
  unsupported: number
  ignored: number
  ambiguous: number
  bySystem: Map<string, number>
  reasons: Map<string, number>
  samples: RomScanSample[]
}

export async function scanReleaseCandidates(
  args: RomScanArgs,
): Promise<RomScanResult> {
  const report = emptyReport()
  const candidates: RomScanCandidate[] = []
  const findBinary = args.findBinary ?? "find"
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(findBinary, [args.root, "-type", "f", "-print0"], {
      stdio: ["ignore", "pipe", "pipe"],
    })
  } catch (error) {
    return {
      status: "diagnostic",
      reason: "ScanFailed",
      message: `failed to start ${findBinary}: ${errorMessage(error)}`,
    }
  }

  if (child.stdout === null || child.stderr === null) {
    return {
      status: "diagnostic",
      reason: "ScanFailed",
      message: `${findBinary} did not provide scan output streams`,
    }
  }

  let pending: Buffer<ArrayBufferLike> = Buffer.alloc(0)
  let stderr = ""
  let stderrTruncated = false
  child.stdout.on("data", (chunk: unknown) => {
    if (!Buffer.isBuffer(chunk)) return
    pending = processChunk(Buffer.concat([pending, chunk]), path => {
      const classification = classifyRomScanPath(path, { root: args.root })
      recordClassification(report, classification)
      if (classification._tag === "Candidate") {
        candidates.push(classification)
      }
    })
  })
  child.stderr.on("data", (chunk: unknown) => {
    const next = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk)
    const appended = appendBounded(stderr, next, 64 * 1024)
    stderr = appended.value
    stderrTruncated = stderrTruncated || appended.truncated
  })

  let timedOut = false
  const timeout = args.timeoutMs ?? 10 * 60 * 1000
  const exit = await new Promise<number | null | Error>(resolve => {
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
    }, timeout)
    child.on("error", error => {
      clearTimeout(timer)
      resolve(error)
    })
    child.on("close", code => {
      clearTimeout(timer)
      resolve(code)
    })
  })
  if (pending.length > 0) {
    const path = pending.toString("utf8")
    const classification = classifyRomScanPath(path, { root: args.root })
    recordClassification(report, classification)
    if (classification._tag === "Candidate") candidates.push(classification)
  }

  if (timedOut) {
    return {
      status: "diagnostic",
      reason: "ScanFailed",
      message: `${findBinary} timed out after ${timeout}ms`,
    }
  }

  if (exit instanceof Error) {
    return {
      status: "diagnostic",
      reason: "ScanFailed",
      message: `failed to start ${findBinary}: ${errorMessage(exit)}`,
    }
  }

  if (exit !== 0) {
    return {
      status: "diagnostic",
      reason: "ScanFailed",
      message: `${findBinary} failed with exit code ${exit ?? "unknown"}${
        stderr.trim() ? `: ${stderr.trim()}${stderrTruncated ? "…" : ""}` : ""
      }`,
    }
  }

  const candidateRecords = createRomLibraryCandidatesFromClassifications(
    candidates,
    { storage: args.storage, reservedIds: args.reservedLibraryIds },
  )
  return {
    status: "ok",
    root: args.root,
    storage: args.storage,
    report: freezeReport(report),
    yaml: renderCandidateYaml(candidateRecords, {
      root: args.root,
      storage: args.storage,
    }),
  }
}

export async function scanConfiguredReleaseCandidates(
  args: ScanConfiguredReleaseCandidatesArgs,
): Promise<ScanConfiguredReleaseCandidatesResult> {
  const roots = args.roots ?? resolveAllConfigGraphRoots(args.env)
  let snapshot: ConfiguredScanSnapshot
  try {
    snapshot = await readConfiguredScanSnapshot(roots)
  } catch (error) {
    return {
      status: "diagnostic",
      reason: "ConfigLoadFailed",
      message: errorMessage(error),
    }
  }

  const reservedLibraryIds = new Set(snapshot.libraryIds)
  for (const id of await targetLibraryIds(args.configPath)) {
    reservedLibraryIds.delete(id)
  }

  const results: ConfiguredStorageScanResult[] = []
  for (const storage of snapshot.storages) {
    const eligible = await storageScanEligibility(storage)
    if (eligible.status === "skipped") {
      results.push(eligible)
      continue
    }

    const scan = await scanReleaseCandidates({
      root: storage.root,
      storage: storage.id,
      findBinary: args.findBinary,
      timeoutMs: args.timeoutMs,
      reservedLibraryIds,
    })
    if (scan.status === "diagnostic") {
      results.push({
        storage: storage.id,
        root: storage.root,
        status: "failed",
        reason: "ScanFailed",
        message: scan.message,
      })
      continue
    }

    try {
      const merge = await mergeReleaseCandidateConfig({
        path: args.configPath,
        candidateYaml: scan.yaml,
        mergeStorage: false,
      })
      results.push({
        storage: storage.id,
        root: storage.root,
        status: "scanned",
        report: scan.report,
        merge,
      })
    } catch (error) {
      return {
        status: "diagnostic",
        reason: "MergeFailed",
        message: `storage '${storage.id}' merge failed: ${errorMessage(error)}`,
        results,
      }
    }
  }

  return {
    status: "ok",
    config: args.configPath,
    scanned: results.filter(result => result.status === "scanned").length,
    skipped: results.filter(result => result.status === "skipped").length,
    failed: results.filter(result => result.status === "failed").length,
    results,
  }
}

interface ConfiguredScanSnapshot {
  readonly storages: readonly StorageRecord[]
  readonly libraryIds: readonly string[]
}

async function readConfiguredScanSnapshot(
  roots: readonly KorriConfigGraphRoot[],
): Promise<ConfiguredScanSnapshot> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriConfigGraph({ roots })
        return yield* Effect.tryPromise({
          try: async () => ({
            storages: await db.storage.query().runPromise,
            libraryIds: (await db.library.query().runPromise).map(
              item => item.id,
            ),
          }),
          catch: error => new Error(errorMessage(error)),
        })
      }),
    ),
  )
}

async function targetLibraryIds(path: string): Promise<readonly string[]> {
  try {
    const document = await readExistingReadableDocument(path)
    return Object.keys(document.library ?? {})
  } catch {
    return []
  }
}

async function storageScanEligibility(
  storage: StorageRecord,
): Promise<ConfiguredStorageScanResult | { readonly status: "eligible" }> {
  if (looksLikeUnresolvedTemplate(storage.root)) {
    return skippedStorage(
      storage,
      "unresolved-template",
      "storage root contains an unresolved template expression",
    )
  }
  if (!isAbsolute(storage.root)) {
    return skippedStorage(
      storage,
      "non-absolute",
      "storage root is not absolute",
    )
  }

  let info: Awaited<ReturnType<typeof stat>>
  try {
    info = await stat(storage.root)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return skippedStorage(storage, "missing", "storage root does not exist")
    }
    return skippedStorage(storage, "unreadable", errorMessage(error))
  }
  if (!info.isDirectory()) {
    return skippedStorage(
      storage,
      "non-directory",
      "storage root is not a directory",
    )
  }
  try {
    await access(storage.root, constants.R_OK)
  } catch (error) {
    return skippedStorage(storage, "unreadable", errorMessage(error))
  }
  return { status: "eligible" }
}

function skippedStorage(
  storage: StorageRecord,
  reason: ConfiguredStorageSkipReason,
  message: string,
): ConfiguredStorageScanResult {
  return {
    storage: storage.id,
    root: storage.root,
    status: "skipped",
    reason,
    message,
  }
}

function looksLikeUnresolvedTemplate(path: string): boolean {
  return /\{[^}]+\}/.test(path)
}

export async function mergeReleaseCandidateConfig(
  args: MergeReleaseCandidateConfigArgs,
): Promise<MergeReleaseCandidateConfigResult> {
  const candidates = readableDocumentFromYaml(args.candidateYaml)
  const existing = await readExistingReadableDocument(args.path)
  const storage = ensureRecordSection(existing, "storage")
  const library = ensureRecordSection(existing, "library")
  let storageAdded = 0
  let storageSkipped = 0
  let libraryAdded = 0
  let librarySkipped = 0

  for (const [id, payload] of Object.entries(
    args.mergeStorage === false ? {} : (candidates.storage ?? {}),
  )) {
    const current = storage[id]
    if (current === undefined) {
      storage[id] = payload
      storageAdded += 1
      continue
    }
    if (!sameJsonValue(current, payload)) {
      throw new Error(
        `storage '${id}' already exists with different values; choose another --storage id or --config file`,
      )
    }
    storageSkipped += 1
  }

  for (const [id, payload] of Object.entries(candidates.library ?? {})) {
    if (library[id] === undefined) {
      library[id] = payload
      libraryAdded += 1
    } else {
      librarySkipped += 1
    }
  }

  await writeFileAtomically(args.path, stringify(existing))
  return {
    path: args.path,
    storageAdded,
    storageSkipped,
    libraryAdded,
    librarySkipped,
  }
}

type ReadableDocument = Record<string, unknown> & {
  storage?: Record<string, unknown>
  library?: Record<string, unknown>
}

async function readExistingReadableDocument(
  path: string,
): Promise<ReadableDocument> {
  try {
    return readableDocumentFromYaml(await readFile(path, "utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}
    throw error
  }
}

function readableDocumentFromYaml(yaml: string): ReadableDocument {
  const parsed = parse(yaml) as unknown
  if (parsed === null) return {}
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("readable config must be a mapping")
  }
  return parsed as ReadableDocument
}

function ensureRecordSection(
  document: ReadableDocument,
  section: "storage" | "library",
): Record<string, unknown> {
  const current = document[section]
  if (current === undefined) {
    const next: Record<string, unknown> = {}
    document[section] = next
    return next
  }
  if (
    typeof current !== "object" ||
    current === null ||
    Array.isArray(current)
  ) {
    throw new Error(`readable config section '${section}' must be a mapping`)
  }
  return current as Record<string, unknown>
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function processChunk(
  buffer: Buffer<ArrayBufferLike>,
  recordPath: (path: string) => void,
): Buffer<ArrayBufferLike> {
  let start = 0
  let index = buffer.indexOf(0, start)
  while (index >= 0) {
    if (index > start)
      recordPath(buffer.subarray(start, index).toString("utf8"))
    start = index + 1
    index = buffer.indexOf(0, start)
  }
  return buffer.subarray(start)
}

function recordClassification(
  report: MutableReport,
  classification: RomScanClassification,
): void {
  report.files += 1
  switch (classification._tag) {
    case "Candidate":
      report.candidates += 1
      bump(report.bySystem, classification.system)
      addSample(report, { path: classification.path, tag: classification._tag })
      break
    case "Excluded":
      report.excluded += 1
      bump(report.reasons, classification.reason)
      addSample(report, {
        path: classification.path,
        tag: classification._tag,
        detail: classification.reason,
      })
      break
    case "Unsupported":
      report.unsupported += 1
      bump(report.bySystem, classification.system)
      bump(report.reasons, classification.reason)
      addSample(report, {
        path: classification.path,
        tag: classification._tag,
        detail: classification.reason,
      })
      break
    case "Ignored":
      report.ignored += 1
      bump(report.reasons, classification.reason)
      break
    case "Ambiguous":
      report.ambiguous += 1
      bump(report.reasons, classification.reason)
      addSample(report, {
        path: classification.path,
        tag: classification._tag,
        detail: classification.reason,
      })
      break
  }
}

function renderCandidateYaml(
  candidates: readonly ReturnType<
    typeof createRomLibraryCandidatesFromClassifications
  >[number][],
  args: RomScanArgs,
): string {
  return `# Generated by Korri Scout from release scan candidates. Review before adding to authored config.\n# Do not hand-edit generated candidates; regenerate or copy entries into authored config.\n${stringify(
    {
      storage: {
        [args.storage]: {
          root: args.root,
        },
      },
      library: Object.fromEntries(
        candidates.map(candidate => [candidate.id, candidate.record]),
      ),
    },
  )}`
}

function emptyReport(): MutableReport {
  return {
    files: 0,
    candidates: 0,
    excluded: 0,
    unsupported: 0,
    ignored: 0,
    ambiguous: 0,
    bySystem: new Map(),
    reasons: new Map(),
    samples: [],
  }
}

function freezeReport(report: MutableReport): RomScanReport {
  return {
    files: report.files,
    candidates: report.candidates,
    excluded: report.excluded,
    unsupported: report.unsupported,
    ignored: report.ignored,
    ambiguous: report.ambiguous,
    bySystem: Object.fromEntries(sortEntries(report.bySystem)),
    reasons: Object.fromEntries(sortEntries(report.reasons)),
    samples: report.samples,
  }
}

function sortEntries(
  map: ReadonlyMap<string, number>,
): readonly [string, number][] {
  return [...map.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )
}

function addSample(report: MutableReport, sample: RomScanSample): void {
  if (report.samples.length < 20) report.samples.push(sample)
}

async function writeFileAtomically(
  path: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tempPath, content, "utf8")
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, { force: true })
    throw error
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function appendBounded(
  current: string,
  next: string,
  maxLength: number,
): { readonly value: string; readonly truncated: boolean } {
  if (current.length >= maxLength) return { value: current, truncated: true }
  const combined = `${current}${next}`
  if (combined.length <= maxLength) {
    return { value: combined, truncated: false }
  }
  return { value: combined.slice(0, maxLength), truncated: true }
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}
