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
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  normalize,
  resolve as resolvePath,
} from "node:path"
import type { LibraryItemPayload } from "@platform/library/config/records/library-item"
import type { StorageRecord } from "@platform/library/config/records/storage"
import {
  defaultReleaseContentIdentityResolver,
  type ReleaseHashIdentityTag,
  releaseHashIdentityForContent,
} from "@platform/library/content-identity/release-content-identity"
import { resolveAllConfigGraphRoots } from "@platform/library/library-source-layer-live"
import {
  type KorriConfigGraphRoot,
  openKorriConfigGraph,
} from "@platform/library/proseql/config-graph-db"
import type {
  FileDiscoveryDescriptor,
  ReleaseDiscoveryObservation,
  ReleaseDiscoveryProvider,
} from "@platform/plugin/discovery"
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
      readonly backfills: readonly ReleaseIdentityBackfill[]
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
  readonly deduplicated: number
  readonly unclaimed: number
  readonly conflicting: number
  readonly bySystem: Readonly<Record<string, number>>
  readonly reasons: Readonly<Record<string, number>>
  readonly samples: readonly RomScanSample[]
}

export interface RomScanSample {
  readonly path: string
  readonly tag:
    | RomScanClassification["_tag"]
    | "Deduplicated"
    | "Conflicting"
    | "Malformed"
    | "ProviderFailed"
  readonly detail?: string
}

interface RomScanArgs {
  readonly root: string
  readonly storage: string
  readonly findBinary?: string
  readonly timeoutMs?: number
  readonly reservedLibraryIds?: Set<string>
  readonly now?: () => string
  readonly claimedIndex?: ClaimedContentIndex
  readonly discoveryProviders?: readonly ReleaseDiscoveryProvider[]
}

export interface MergeReleaseCandidateConfigArgs {
  readonly path: string
  readonly candidateYaml: string
  readonly mergeStorage?: boolean
  readonly identityBackfills?: readonly ReleaseIdentityBackfill[]
}

export interface MergeReleaseCandidateConfigResult {
  readonly path: string
  readonly storageAdded: number
  readonly storageSkipped: number
  readonly libraryAdded: number
  readonly librarySkipped: number
  readonly libraryDeduplicated: number
  readonly identityBackfilled: number
  readonly identityBackfillSkipped: number
}

export interface ScanConfiguredReleaseCandidatesArgs {
  readonly configPath: string
  readonly roots?: readonly KorriConfigGraphRoot[]
  readonly env?: NodeJS.ProcessEnv
  readonly findBinary?: string
  readonly timeoutMs?: number
  readonly now?: () => string
  readonly discoveryProviders?: readonly ReleaseDiscoveryProvider[]
}

export type ConfiguredStorageScanResult =
  | {
      readonly storage: string
      readonly root: string
      readonly status: "scanned"
      readonly report: RomScanReport
      readonly merge: MergeReleaseCandidateConfigResult
      readonly overlapWarnings: readonly string[]
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

export interface ScanAndMergeReleaseCandidatesArgs {
  readonly root: string
  readonly storage: string
  readonly configPath: string
  readonly roots?: readonly KorriConfigGraphRoot[]
  readonly env?: NodeJS.ProcessEnv
  readonly findBinary?: string
  readonly timeoutMs?: number
  readonly discoveryProviders?: readonly ReleaseDiscoveryProvider[]
}

export type ScanAndMergeReleaseCandidatesResult =
  | {
      readonly status: "ok"
      readonly root: string
      readonly storage: string
      readonly config: string
      readonly report: RomScanReport
      readonly merge: MergeReleaseCandidateConfigResult
      readonly yaml: string
    }
  | {
      readonly status: "diagnostic"
      readonly reason: "ConfigLoadFailed" | "ScanFailed" | "MergeFailed"
      readonly message: string
    }

interface MutableReport {
  files: number
  candidates: number
  excluded: number
  unsupported: number
  ignored: number
  ambiguous: number
  deduplicated: number
  unclaimed: number
  conflicting: number
  bySystem: Map<string, number>
  reasons: Map<string, number>
  samples: RomScanSample[]
}

type ReleaseMatchKind =
  | "storage-path"
  | "absolute-path"
  | "hash"
  | "provider-ref"

export interface ClaimedRelease {
  readonly libraryId: string
  readonly releaseId: string
  readonly storage: string
  readonly path: string
  readonly absolutePath?: string
  readonly identity?: ReleaseHashIdentityTag
  readonly effectiveRecord: LibraryItemPayload
}

interface ClaimedContentIndex {
  readonly byStoragePath: Map<string, ClaimedRelease>
  readonly byAbsolutePath: Map<string, ClaimedRelease>
  readonly byHash: Map<string, ClaimedRelease>
  readonly byProviderRef: Map<string, ClaimedRelease>
}

export interface ReleaseIdentityBackfill {
  readonly claim: ClaimedRelease
  readonly identity?: ReleaseHashIdentityTag
  readonly skipped?: boolean
  readonly reason?: string
}

function createClaimedContentIndex(): ClaimedContentIndex {
  return {
    byStoragePath: new Map(),
    byAbsolutePath: new Map(),
    byHash: new Map(),
    byProviderRef: new Map(),
  }
}

export async function scanReleaseCandidates(
  args: RomScanArgs,
): Promise<RomScanResult> {
  const report = emptyReport()
  const foundPaths: string[] = []
  const findBinary = args.findBinary ?? "find"
  const firstSeenAt = (args.now ?? currentIsoTimestamp)()
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
      foundPaths.push(path)
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
    foundPaths.push(pending.toString("utf8"))
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

  const descriptors = foundPaths.map(path => fileDescriptorForPath(path, args))
  const candidates = await discoverRomCandidates(descriptors, args, report)
  const reconciled = await reconcileRomCandidates(candidates, args, report)
  const candidateRecords = createRomLibraryCandidatesFromClassifications(
    reconciled.candidates,
    {
      storage: args.storage,
      reservedIds: args.reservedLibraryIds,
      firstSeenAt,
    },
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
    backfills: reconciled.backfills,
  }
}

export async function scanAndMergeReleaseCandidates(
  args: ScanAndMergeReleaseCandidatesArgs,
): Promise<ScanAndMergeReleaseCandidatesResult> {
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
  const claimedIndex = cloneClaimedContentIndex(snapshot.claimedIndex)
  const scan = await scanReleaseCandidates({
    root: args.root,
    storage: args.storage,
    findBinary: args.findBinary,
    timeoutMs: args.timeoutMs,
    reservedLibraryIds,
    claimedIndex,
    discoveryProviders: args.discoveryProviders,
  })
  if (scan.status === "diagnostic") return scan

  try {
    const merge = await mergeReleaseCandidateConfig({
      path: args.configPath,
      candidateYaml: scan.yaml,
      identityBackfills: canBackfillToTarget(args.configPath, roots)
        ? scan.backfills
        : scan.backfills.map(backfill => ({
            ...backfill,
            skipped: true,
            reason: "target config is not part of the effective config roots",
          })),
    })
    return {
      status: "ok",
      root: args.root,
      storage: args.storage,
      config: args.configPath,
      report: scan.report,
      merge,
      yaml: scan.yaml,
    }
  } catch (error) {
    return {
      status: "diagnostic",
      reason: "MergeFailed",
      message: errorMessage(error),
    }
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
  const firstSeenAt = (args.now ?? currentIsoTimestamp)()
  for (const id of await targetLibraryIds(args.configPath)) {
    reservedLibraryIds.delete(id)
  }

  const claimedIndex = cloneClaimedContentIndex(snapshot.claimedIndex)
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
      now: () => firstSeenAt,
      claimedIndex,
      discoveryProviders: args.discoveryProviders,
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
        identityBackfills: canBackfillToTarget(args.configPath, roots)
          ? scan.backfills
          : scan.backfills.map(backfill => ({
              ...backfill,
              skipped: true,
              reason: "target config is not part of the effective config roots",
            })),
      })
      addCandidateYamlClaims(claimedIndex, scan.yaml, snapshot.storageRootById)
      addBackfillClaims(claimedIndex, scan.backfills)
      results.push({
        storage: storage.id,
        root: storage.root,
        status: "scanned",
        report: scan.report,
        merge,
        overlapWarnings:
          snapshot.overlapWarningsByStorage.get(storage.id) ?? [],
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
  readonly claimedIndex: ClaimedContentIndex
  readonly storageRootById: ReadonlyMap<string, string>
  readonly overlapWarningsByStorage: ReadonlyMap<string, readonly string[]>
}

async function readConfiguredScanSnapshot(
  roots: readonly KorriConfigGraphRoot[],
): Promise<ConfiguredScanSnapshot> {
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriConfigGraph({ roots })
        return yield* Effect.tryPromise({
          try: async () => {
            const storages = await db.storage.query().runPromise
            const libraryItems = await db.library.query().runPromise
            const storageRootById = new Map(
              storages.map(storage => [storage.id, storage.root] as const),
            )
            return {
              storages,
              libraryIds: libraryItems.map(item => item.id),
              claimedIndex: buildClaimedContentIndex(
                libraryItems as readonly (LibraryItemPayload & {
                  readonly id: string
                })[],
                storageRootById,
              ),
              storageRootById,
              overlapWarningsByStorage: detectStorageOverlapWarnings(storages),
            }
          },
          catch: error => new Error(errorMessage(error)),
        })
      }),
    ),
  )
}

interface ProviderCandidate {
  readonly providerId: string
  readonly candidate: RomScanCandidate
}

function fileDescriptorForPath(
  path: string,
  args: Pick<RomScanArgs, "root" | "storage">,
): FileDiscoveryDescriptor {
  const diagnosticPath = classifyRomScanPath(path, { root: args.root }).path
  return {
    storageId: args.storage,
    rootPath: args.root,
    absolutePath: path,
    relativePath: diagnosticPath,
    name: basename(diagnosticPath),
    extension: extname(diagnosticPath).toLowerCase(),
  }
}

async function discoverRomCandidates(
  descriptors: readonly FileDiscoveryDescriptor[],
  args: RomScanArgs,
  report: MutableReport,
): Promise<readonly RomScanCandidate[]> {
  const providers = args.discoveryProviders ?? []
  const observations = await collectProviderCandidates(
    providers,
    descriptors,
    args,
    report,
  )
  const byPath = new Map<string, ProviderCandidate[]>()
  for (const observation of observations) {
    const current = byPath.get(observation.candidate.path) ?? []
    current.push(observation)
    byPath.set(observation.candidate.path, current)
  }

  const candidates: RomScanCandidate[] = []
  const claimedProviderRefs = new Set<string>()
  for (const descriptor of descriptors) {
    const classification = classifyRomScanPath(descriptor.absolutePath, {
      root: args.root,
    })
    const providerCandidates = byPath.get(descriptor.relativePath)
    if (
      providerCandidates === undefined ||
      providerCandidates.length === 0 ||
      classification._tag === "Excluded" ||
      classification._tag === "Ambiguous" ||
      classification._tag === "Unsupported"
    ) {
      recordClassification(report, classification)
      continue
    }

    report.files += 1
    const uniqueByProvider = new Map<string, RomScanCandidate>()
    let providerConflict: string | undefined
    for (const providerCandidate of providerCandidates) {
      const current = uniqueByProvider.get(providerCandidate.providerId)
      if (current !== undefined) {
        if (sameRomScanCandidate(current, providerCandidate.candidate)) {
          report.deduplicated += 1
          addSample(report, {
            path: descriptor.relativePath,
            tag: "Deduplicated",
            detail: `provider-duplicate:${providerCandidate.providerId}`,
          })
          continue
        }
        providerConflict = providerCandidate.providerId
        continue
      }
      uniqueByProvider.set(
        providerCandidate.providerId,
        providerCandidate.candidate,
      )
    }

    if (providerConflict !== undefined) {
      report.conflicting += 1
      addSample(report, {
        path: descriptor.relativePath,
        tag: "Conflicting",
        detail: providerConflict,
      })
      continue
    }

    if (uniqueByProvider.size > 1) {
      report.conflicting += 1
      addSample(report, {
        path: descriptor.relativePath,
        tag: "Conflicting",
        detail: [...uniqueByProvider.keys()].sort().join(","),
      })
      continue
    }

    const candidate = [...uniqueByProvider.values()][0]
    if (candidate === undefined) continue
    if (candidate.providerRef !== undefined) {
      const key = providerRefKey(
        candidate.providerRef.provider,
        candidate.providerRef.ref,
      )
      if (claimedProviderRefs.has(key)) {
        report.deduplicated += 1
        addSample(report, {
          path: candidate.path,
          tag: "Deduplicated",
          detail: `provider-ref:${key}`,
        })
        continue
      }
      claimedProviderRefs.add(key)
    }
    report.candidates += 1
    bump(report.bySystem, candidate.system)
    addSample(report, { path: candidate.path, tag: "Candidate" })
    candidates.push(candidate)
  }

  return candidates
}

function sameRomScanCandidate(
  left: RomScanCandidate,
  right: RomScanCandidate,
): boolean {
  return (
    left.path === right.path &&
    left.system === right.system &&
    left.confidence === right.confidence &&
    left.app === right.app &&
    (left.runtime ?? "") === (right.runtime ?? "") &&
    (left.releaseId ?? left.system) === (right.releaseId ?? right.system) &&
    (left.title ?? "") === (right.title ?? "") &&
    (left.providerRef?.provider ?? "") ===
      (right.providerRef?.provider ?? "") &&
    (left.providerRef?.ref ?? "") === (right.providerRef?.ref ?? "")
  )
}

async function collectProviderCandidates(
  providers: readonly ReleaseDiscoveryProvider[],
  descriptors: readonly FileDiscoveryDescriptor[],
  args: RomScanArgs,
  report: MutableReport,
): Promise<readonly ProviderCandidate[]> {
  const candidates: ProviderCandidate[] = []
  const descriptorByPath = new Map(
    descriptors.map(
      descriptor => [descriptor.relativePath, descriptor] as const,
    ),
  )
  for (const provider of providers) {
    let observations: readonly ReleaseDiscoveryObservation[]
    try {
      observations = await normalizePluginResult(
        provider.discover({
          pluginId: pluginIdForDiscoveryProvider(provider.id),
          storageId: args.storage,
          rootPath: args.root,
          files: descriptors,
          readText: readTextOrUndefined,
        }),
      )
    } catch (error) {
      addSample(report, {
        path: args.root,
        tag: "ProviderFailed",
        detail: `${provider.id}:${errorMessage(error)}`,
      })
      bump(report.reasons, `provider:${provider.id}:failed`)
      continue
    }

    for (const observation of observations) {
      const candidate = candidateFromObservation(
        provider.id,
        observation,
        descriptorByPath,
        report,
      )
      if (candidate !== undefined) candidates.push(candidate)
    }
  }
  return candidates
}

function candidateFromObservation(
  providerId: string,
  observation: ReleaseDiscoveryObservation,
  descriptors: ReadonlyMap<string, FileDiscoveryDescriptor>,
  report: MutableReport,
): ProviderCandidate | undefined {
  const descriptor = descriptors.get(observation.source.relativePath)
  if (descriptor === undefined) {
    addSample(report, {
      path: observation.source.relativePath,
      tag: "Malformed",
      detail: `${providerId}:source-not-in-scan`,
    })
    bump(report.reasons, `provider:${providerId}:malformed`)
    return undefined
  }

  if (observation.kind === "file-release") {
    const release = observation.release
    if (
      release.id.length === 0 ||
      release.system.length === 0 ||
      release.app.length === 0 ||
      (release.runtime !== undefined && release.runtime.length === 0)
    ) {
      addSample(report, {
        path: descriptor.relativePath,
        tag: "Malformed",
        detail: `${providerId}:missing-release-field`,
      })
      bump(report.reasons, `provider:${providerId}:malformed`)
      return undefined
    }
    return {
      providerId,
      candidate: {
        _tag: "Candidate",
        path: descriptor.relativePath,
        system: release.system,
        confidence: observation.confidence,
        app: release.app,
        ...(release.runtime !== undefined ? { runtime: release.runtime } : {}),
        releaseId: release.id,
        ...(release.title !== undefined ? { title: release.title } : {}),
      },
    }
  }

  const release = observation.release
  const target = observation.target
  const launch = observation.launch
  if (
    release.id.length === 0 ||
    release.system.length === 0 ||
    target.provider.length === 0 ||
    target.ref.length === 0 ||
    launch.use.length === 0 ||
    (launch.runtime !== undefined && launch.runtime.length === 0)
  ) {
    addSample(report, {
      path: descriptor.relativePath,
      tag: "Malformed",
      detail: `${providerId}:missing-release-field`,
    })
    bump(report.reasons, `provider:${providerId}:malformed`)
    return undefined
  }
  return {
    providerId,
    candidate: {
      _tag: "Candidate",
      path: descriptor.relativePath,
      system: release.system,
      confidence: observation.confidence,
      app: launch.use,
      ...(launch.runtime !== undefined ? { runtime: launch.runtime } : {}),
      releaseId: release.id,
      ...(release.title !== undefined ? { title: release.title } : {}),
      providerRef: { provider: target.provider, ref: target.ref },
    },
  }
}

async function normalizePluginResult<T>(
  value: T | PromiseLike<T> | Effect.Effect<T, unknown, never>,
): Promise<T> {
  if (Effect.isEffect(value)) return Effect.runPromise(value)
  if (isPromiseLike(value)) return value
  return value
}

function pluginIdForDiscoveryProvider(
  providerId: string,
): `@${string}:${string}` {
  const separator = providerId.indexOf("/")
  return (
    separator > 0 ? providerId.slice(0, separator) : providerId
  ) as `@${string}:${string}`
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
  let libraryDeduplicated = 0
  let identityBackfilled = 0
  let identityBackfillSkipped = 0

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

  const backfilledPayloads = new Map<string, LibraryItemPayload>()
  for (const backfill of args.identityBackfills ?? []) {
    libraryDeduplicated += 1
    if (backfill.skipped === true || backfill.identity === undefined) {
      identityBackfillSkipped += 1
      continue
    }
    const base =
      backfilledPayloads.get(backfill.claim.libraryId) ??
      libraryPayloadForBackfill(
        library[backfill.claim.libraryId],
        backfill.claim.effectiveRecord,
      )
    const updated = payloadWithIdentity(
      base,
      backfill.claim.releaseId,
      backfill.identity,
    )
    if (updated === undefined) {
      identityBackfillSkipped += 1
      continue
    }
    backfilledPayloads.set(backfill.claim.libraryId, updated)
    identityBackfilled += 1
  }
  for (const [id, payload] of backfilledPayloads) {
    library[id] = payload
  }

  await writeFileAtomically(args.path, stringify(existing))
  return {
    path: args.path,
    storageAdded,
    storageSkipped,
    libraryAdded,
    librarySkipped,
    libraryDeduplicated,
    identityBackfilled,
    identityBackfillSkipped,
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

async function reconcileRomCandidates(
  candidates: readonly RomScanCandidate[],
  args: RomScanArgs,
  report: MutableReport,
): Promise<{
  readonly candidates: readonly RomScanCandidate[]
  readonly backfills: readonly ReleaseIdentityBackfill[]
}> {
  const claimedIndex = args.claimedIndex
  if (claimedIndex === undefined) return { candidates, backfills: [] }

  const kept: RomScanCandidate[] = []
  const backfills: ReleaseIdentityBackfill[] = []
  for (const candidate of candidates) {
    const match = await matchCandidate(candidate, args, claimedIndex)
    if (match === undefined) {
      kept.push(candidate)
      continue
    }
    report.deduplicated += 1
    addSample(report, {
      path: candidate.path,
      tag: "Deduplicated",
      detail: `${match.kind}:${match.claim.libraryId}/${match.claim.releaseId}`,
    })
    if (match.kind === "provider-ref") continue
    if (match.claim.identity === undefined) {
      const identity = await resolveFreshFileHash(
        join(args.root, candidate.path),
      )
      backfills.push({
        claim: match.claim,
        ...(identity === undefined
          ? { skipped: true, reason: "content identity unavailable" }
          : { identity }),
      })
      if (identity !== undefined && args.claimedIndex !== undefined) {
        addClaim(args.claimedIndex, { ...match.claim, identity })
      }
    }
  }
  return { candidates: kept, backfills }
}

async function matchCandidate(
  candidate: RomScanCandidate,
  args: RomScanArgs,
  index: ClaimedContentIndex,
): Promise<
  | { readonly kind: ReleaseMatchKind; readonly claim: ClaimedRelease }
  | undefined
> {
  if (candidate.providerRef !== undefined) {
    const claim = index.byProviderRef.get(
      providerRefKey(candidate.providerRef.provider, candidate.providerRef.ref),
    )
    if (claim !== undefined) return { kind: "provider-ref", claim }
    return undefined
  }

  const storagePath = storagePathKey(args.storage, candidate.path)
  const byStoragePath = index.byStoragePath.get(storagePath)
  if (byStoragePath !== undefined) {
    return { kind: "storage-path", claim: byStoragePath }
  }

  const absolutePath = absoluteFilePath(args.root, candidate.path)
  const byAbsolutePath = index.byAbsolutePath.get(absolutePath)
  if (byAbsolutePath !== undefined) {
    return { kind: "absolute-path", claim: byAbsolutePath }
  }

  if (index.byHash.size > 0) {
    const identity =
      await defaultReleaseContentIdentityResolver.resolveFileHash(absolutePath)
    if (identity !== undefined) {
      const byHash = index.byHash.get(identity.value)
      if (byHash !== undefined) return { kind: "hash", claim: byHash }
    }
  }
  return undefined
}

function buildClaimedContentIndex(
  items: readonly (LibraryItemPayload & { readonly id: string })[],
  storageRootById: ReadonlyMap<string, string>,
): ClaimedContentIndex {
  const index = createClaimedContentIndex()
  for (const item of items) {
    item.releases.forEach(release => {
      const target = release.target
      if (target?.kind === "provider-ref") {
        addProviderRefClaim(index, {
          libraryId: item.id,
          releaseId: release.id,
          storage: "",
          path: "",
          effectiveRecord: libraryPayloadFromRecord(item),
          providerRef: { provider: target.provider, ref: target.ref },
        })
        return
      }
      if (target?.kind !== "file") return
      addClaim(index, {
        libraryId: item.id,
        releaseId: release.id,
        storage: target.storage,
        path: normalizeTargetPath(target.path),
        absolutePath: absolutePathForStorageTarget(
          storageRootById,
          target.storage,
          target.path,
        ),
        identity: release.identity,
        effectiveRecord: libraryPayloadFromRecord(item),
      })
    })
  }
  return index
}

function addClaim(index: ClaimedContentIndex, claim: ClaimedRelease): void {
  index.byStoragePath.set(storagePathKey(claim.storage, claim.path), claim)
  if (claim.absolutePath !== undefined) {
    index.byAbsolutePath.set(claim.absolutePath, claim)
  }
  if (claim.identity !== undefined) {
    index.byHash.set(claim.identity.value, claim)
  }
}

function addProviderRefClaim(
  index: ClaimedContentIndex,
  claim: ClaimedRelease & {
    readonly providerRef: { readonly provider: string; readonly ref: string }
  },
): void {
  index.byProviderRef.set(
    providerRefKey(claim.providerRef.provider, claim.providerRef.ref),
    claim,
  )
}

function cloneClaimedContentIndex(
  index: ClaimedContentIndex,
): ClaimedContentIndex {
  return {
    byStoragePath: new Map(index.byStoragePath),
    byAbsolutePath: new Map(index.byAbsolutePath),
    byHash: new Map(index.byHash),
    byProviderRef: new Map(index.byProviderRef),
  }
}

function addCandidateYamlClaims(
  index: ClaimedContentIndex,
  yaml: string,
  storageRootById: ReadonlyMap<string, string>,
): void {
  const document = readableDocumentFromYaml(yaml)
  for (const [libraryId, rawPayload] of Object.entries(
    document.library ?? {},
  )) {
    const payload = structuredClone(rawPayload) as LibraryItemPayload
    payload.releases?.forEach(release => {
      const target = release.target
      if (target?.kind === "provider-ref") {
        addProviderRefClaim(index, {
          libraryId,
          releaseId: release.id,
          storage: "",
          path: "",
          effectiveRecord: payload,
          providerRef: { provider: target.provider, ref: target.ref },
        })
        return
      }
      if (target?.kind !== "file") return
      addClaim(index, {
        libraryId,
        releaseId: release.id,
        storage: target.storage,
        path: normalizeTargetPath(target.path),
        absolutePath: absolutePathForStorageTarget(
          storageRootById,
          target.storage,
          target.path,
        ),
        identity: release.identity,
        effectiveRecord: payload,
      })
    })
  }
}

function addBackfillClaims(
  index: ClaimedContentIndex,
  backfills: readonly ReleaseIdentityBackfill[],
): void {
  for (const backfill of backfills) {
    if (backfill.identity === undefined) continue
    addClaim(index, { ...backfill.claim, identity: backfill.identity })
  }
}

function payloadWithIdentity(
  record: LibraryItemPayload,
  releaseId: string,
  identity: ReleaseHashIdentityTag,
): LibraryItemPayload | undefined {
  const next = structuredClone(record) as LibraryItemPayload
  const releases = [...next.releases]
  const releaseIndex = releases.findIndex(release => release.id === releaseId)
  const release = releases[releaseIndex]
  if (release === undefined) return undefined
  releases[releaseIndex] = { ...release, identity }
  return { ...next, releases }
}

function libraryPayloadForBackfill(
  existing: unknown,
  effective: LibraryItemPayload,
): LibraryItemPayload {
  if (isLibraryPayload(existing)) return structuredClone(existing)
  return structuredClone(effective)
}

function isLibraryPayload(value: unknown): value is LibraryItemPayload {
  if (typeof value !== "object" || value === null) return false
  const record = value as { readonly releases?: unknown }
  return Array.isArray(record.releases)
}

async function resolveFreshFileHash(
  path: string,
): Promise<ReleaseHashIdentityTag | undefined> {
  try {
    const content = await readFile(path)
    return releaseHashIdentityForContent(content)
  } catch {
    return undefined
  }
}

async function readTextOrUndefined(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function libraryPayloadFromRecord(
  record: LibraryItemPayload & { readonly id: string },
): LibraryItemPayload {
  const clone = structuredClone(record) as LibraryItemPayload & { id?: string }
  delete clone.id
  return clone
}

function storagePathKey(storage: string, path: string): string {
  return `${storage}:${normalizeTargetPath(path)}`
}

function providerRefKey(provider: string, ref: string): string {
  return `${provider}:${ref}`
}

function normalizeTargetPath(path: string): string {
  return normalize(path).replace(/\\/g, "/").replace(/^\.\//, "")
}

function absolutePathForStorageTarget(
  storageRootById: ReadonlyMap<string, string>,
  storage: string,
  path: string,
): string | undefined {
  const root = storageRootById.get(storage)
  if (root === undefined || !isAbsolute(root)) return undefined
  return absoluteFilePath(root, path)
}

function absoluteFilePath(root: string, path: string): string {
  return normalize(join(root, normalizeTargetPath(path)))
}

function canBackfillToTarget(
  configPath: string,
  roots: readonly KorriConfigGraphRoot[],
): boolean {
  const configRoot = normalize(resolvePath(dirname(configPath)))
  return roots.some(root => {
    const graphRoot = normalize(resolvePath(root.root))
    return configRoot === graphRoot || configRoot.startsWith(`${graphRoot}/`)
  })
}

function detectStorageOverlapWarnings(
  storages: readonly StorageRecord[],
): ReadonlyMap<string, readonly string[]> {
  const warnings = new Map<string, string[]>()
  for (let leftIndex = 0; leftIndex < storages.length; leftIndex += 1) {
    const left = storages[leftIndex]
    if (left === undefined || !isAbsolute(left.root)) continue
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < storages.length;
      rightIndex += 1
    ) {
      const right = storages[rightIndex]
      if (right === undefined || !isAbsolute(right.root)) continue
      if (!rootsOverlap(left.root, right.root)) continue
      const message = `storage '${left.id}' root overlaps storage '${right.id}' root`
      pushWarning(warnings, left.id, message)
      pushWarning(warnings, right.id, message)
    }
  }
  return warnings
}

function rootsOverlap(leftRoot: string, rightRoot: string): boolean {
  const left = normalize(leftRoot)
  const right = normalize(rightRoot)
  return (
    left === right ||
    left.startsWith(`${right}/`) ||
    right.startsWith(`${left}/`)
  )
}

function pushWarning(
  warnings: Map<string, string[]>,
  storage: string,
  message: string,
): void {
  const current = warnings.get(storage) ?? []
  current.push(message)
  warnings.set(storage, current)
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
    case "Unclaimed":
      report.unclaimed += 1
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
  return `# Generated by Korri release scan candidates. Review before adding to authored config.\n# Do not hand-edit generated candidates; regenerate or copy entries into authored config.\n${stringify(
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
    deduplicated: 0,
    unclaimed: 0,
    conflicting: 0,
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
    deduplicated: report.deduplicated,
    unclaimed: report.unclaimed,
    conflicting: report.conflicting,
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

function currentIsoTimestamp(): string {
  return new Date().toISOString()
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { readonly then?: unknown }).then === "function"
  )
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
