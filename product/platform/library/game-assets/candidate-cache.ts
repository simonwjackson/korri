import { createHash } from "node:crypto"
import type { Dirent } from "node:fs"
import { lstat, readdir, readFile, realpath } from "node:fs/promises"
import { isAbsolute, normalize, resolve, sep } from "node:path"
import {
  DataError,
  NotFoundError,
  ValidationError,
} from "@platform/api/rpc/errors"
import { korriCachePath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type { GameAssetSource } from "@platform/library/config/records/game-asset"
import type { GameAssetRole } from "@platform/library/config/records/game-asset-assignment"
import { Effect } from "effect"

export interface CandidateCacheOptions {
  readonly env: XdgPathEnv
}

export interface ListCandidatesInput {
  readonly gameId?: string
  readonly role?: GameAssetRole
}

export interface GameAssetCandidate {
  readonly candidateId: string
  readonly gameId: string
  readonly role: GameAssetRole
  readonly width: number
  readonly height: number
  readonly source: GameAssetSource
}

export interface CandidateCacheEntry extends GameAssetCandidate {
  readonly cacheRelativePath: string
}

export interface CandidateCache {
  readonly listCandidates: (
    input?: ListCandidatesInput,
  ) => Effect.Effect<readonly GameAssetCandidate[], DataError>
  readonly resolveCandidate: (
    candidateId: string,
  ) => Effect.Effect<CandidateCacheEntry, DataError | NotFoundError>
  readonly resolveCandidateFilePath: (
    candidate: CandidateCacheEntry,
  ) => Effect.Effect<string, ValidationError | DataError>
}

export function createCandidateCache(
  options: CandidateCacheOptions,
): CandidateCache {
  const root = korriCachePath(options.env, "game-assets", "candidates")

  return {
    listCandidates: input =>
      readCandidates(root).pipe(
        Effect.map(candidates =>
          candidates
            .filter(
              candidate =>
                input?.gameId === undefined ||
                candidate.gameId === input.gameId,
            )
            .filter(
              candidate =>
                input?.role === undefined || candidate.role === input.role,
            )
            .map(toPublicCandidate),
        ),
      ),

    resolveCandidate: candidateId =>
      readCandidates(root).pipe(
        Effect.flatMap(candidates => {
          const candidate = candidates.find(
            item => item.candidateId === candidateId,
          )
          return candidate
            ? Effect.succeed(candidate)
            : Effect.fail(
                new NotFoundError({
                  message: "game asset candidate not found",
                }),
              )
        }),
      ),

    resolveCandidateFilePath: candidate =>
      resolveCandidateFilePath(root, candidate.cacheRelativePath),
  }
}

function readCandidates(
  root: string,
): Effect.Effect<readonly CandidateCacheEntry[], DataError> {
  return Effect.tryPromise({
    try: async () => {
      const manifests = await findManifestFiles(root)
      const entries: CandidateCacheEntry[] = []

      for (const manifest of manifests) {
        const text = await readFile(manifest, "utf8")
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim()
          if (trimmed.length === 0) continue
          const parsed = parseManifestLine(trimmed)
          if (!parsed) continue
          entries.push(parsed)
        }
      }

      return entries
    },
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message: `failed to read game asset candidate manifest: ${stringifyError(error)}`,
      }),
  })
}

async function findManifestFiles(root: string): Promise<readonly string[]> {
  const found: string[] = []

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return
      throw error
    }

    for (const entry of entries) {
      const path = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
      } else if (entry.isFile() && entry.name === "manifest.jsonl") {
        found.push(path)
      }
    }
  }

  await walk(root)
  return found.sort()
}

function parseManifestLine(line: string): CandidateCacheEntry | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }

  if (typeof value !== "object" || value === null) return undefined
  const record = value as Readonly<Record<string, unknown>>
  const gameId = readNonEmptyString(record.gameId)
  const role =
    readRole(record.role) ?? roleFromRatio(readNonEmptyString(record.ratio))
  const dimensions = readDimensions(record)
  const cacheRelativePath =
    readNonEmptyString(record.file) ??
    readNonEmptyString(record.path) ??
    readNonEmptyString(record.filePath)
  const provider =
    readProvider(record.provider) ??
    (record.imageId || record.sgdbId ? "steamgriddb" : undefined)

  if (!gameId || !role || !dimensions || !cacheRelativePath || !provider)
    return undefined

  const sourceId =
    readNonEmptyString(record.imageId) ??
    readNonEmptyString(record.sourceId) ??
    readNonEmptyString(record.id)
  const sourceUrl = sanitizeSourceUrl(
    readNonEmptyString(record.url) ?? readNonEmptyString(record.sourceUrl),
  )
  const source: GameAssetSource = {
    provider,
    ...(sourceId ? { id: sourceId } : {}),
    ...(sourceUrl ? { url: sourceUrl } : {}),
  }

  return {
    candidateId: makeCandidateId({ gameId, role, sourceId, cacheRelativePath }),
    gameId,
    role,
    width: dimensions.width,
    height: dimensions.height,
    source,
    cacheRelativePath,
  }
}

function readDimensions(
  record: Readonly<Record<string, unknown>>,
): { readonly width: number; readonly height: number } | undefined {
  const width = readPositiveInt(record.width)
  const height = readPositiveInt(record.height)
  if (width && height) return { width, height }

  const dimensions = readNonEmptyString(record.dimensions)
  const match = dimensions?.match(/^(\d+)x(\d+)$/)
  if (!match) return undefined
  const parsedWidth = Number(match[1])
  const parsedHeight = Number(match[2])
  return Number.isSafeInteger(parsedWidth) &&
    parsedWidth > 0 &&
    Number.isSafeInteger(parsedHeight) &&
    parsedHeight > 0
    ? { width: parsedWidth, height: parsedHeight }
    : undefined
}

function readPositiveInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : undefined
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined
}

function readRole(value: unknown): GameAssetRole | undefined {
  if (
    value === "tile" ||
    value === "banner" ||
    value === "poster" ||
    value === "hero" ||
    value === "logo" ||
    value === "screenshot"
  ) {
    return value
  }
  return undefined
}

function roleFromRatio(ratio: string | undefined): GameAssetRole | undefined {
  switch (ratio) {
    case "1x1":
      return "tile"
    case "92x43":
      return "banner"
    case "2x3":
      return "poster"
    default:
      return undefined
  }
}

function readProvider(value: unknown): GameAssetSource["provider"] | undefined {
  if (
    value === "korri" ||
    value === "manual" ||
    value === "rocknix" ||
    value === "steamgriddb"
  )
    return value
  return undefined
}

function sanitizeSourceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    url.username = ""
    url.password = ""
    url.search = ""
    url.hash = ""
    return url.toString()
  } catch {
    return undefined
  }
}

function makeCandidateId(input: {
  readonly gameId: string
  readonly role: GameAssetRole
  readonly sourceId: string | undefined
  readonly cacheRelativePath: string
}): string {
  const digest = createHash("sha256")
    .update(input.gameId)
    .update("\0")
    .update(input.role)
    .update("\0")
    .update(input.sourceId ?? "")
    .update("\0")
    .update(input.cacheRelativePath)
    .digest("hex")
  return `candidate:${digest}`
}

function toPublicCandidate(candidate: CandidateCacheEntry): GameAssetCandidate {
  return {
    candidateId: candidate.candidateId,
    gameId: candidate.gameId,
    role: candidate.role,
    width: candidate.width,
    height: candidate.height,
    source: candidate.source,
  }
}

function resolveCandidateFilePath(
  root: string,
  cacheRelativePath: string,
): Effect.Effect<string, ValidationError | DataError> {
  return Effect.tryPromise({
    try: async () => {
      if (cacheRelativePath.includes("\0")) {
        throw new UnsafeCandidatePathError("candidate path contains NUL")
      }
      if (isAbsolute(cacheRelativePath)) {
        throw new UnsafeCandidatePathError(
          "candidate path must be cache-relative",
        )
      }

      const normalized = normalize(cacheRelativePath)
      if (
        normalized === "." ||
        normalized.startsWith("..") ||
        normalized.includes(`${sep}..${sep}`)
      ) {
        throw new UnsafeCandidatePathError(
          "candidate path must stay under the candidate cache root",
        )
      }

      const candidatePath = resolve(root, normalized)
      if (!isPathInside(candidatePath, root)) {
        throw new UnsafeCandidatePathError(
          "candidate path escapes the candidate cache root",
        )
      }

      const candidateStat = await lstat(candidatePath)
      if (candidateStat.isSymbolicLink()) {
        throw new UnsafeCandidatePathError(
          "candidate path must not be a symlink",
        )
      }
      if (!candidateStat.isFile()) {
        throw new UnsafeCandidatePathError(
          "candidate path must be a regular file",
        )
      }

      const [realRoot, realCandidate] = await Promise.all([
        realpath(root),
        realpath(candidatePath),
      ])
      if (!isPathInside(realCandidate, realRoot)) {
        throw new UnsafeCandidatePathError(
          "candidate path escapes the candidate cache root",
        )
      }

      return candidatePath
    },
    catch: error => {
      if (error instanceof UnsafeCandidatePathError) {
        return new ValidationError({ message: error.message })
      }
      return new DataError({
        reason: "ReadFailed",
        message: `failed to resolve game asset candidate file: ${stringifyError(error)}`,
      })
    },
  })
}

function isPathInside(path: string, root: string): boolean {
  const resolvedRoot = resolve(root)
  const resolvedPath = resolve(path)
  return (
    resolvedPath === resolvedRoot ||
    resolvedPath.startsWith(`${resolvedRoot}${sep}`)
  )
}

class UnsafeCandidatePathError extends Error {}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
