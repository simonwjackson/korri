import {
  gameAssetByteRoutePrefix,
  hasValidGameAssetBytes,
} from "@shared/api/http/game-asset-bytes"
import { makeLocalEntrySource } from "@shared/api/rpc/entry-source"
import { DataError } from "@shared/api/rpc/errors"
import { korriDataPath, type XdgPathEnv } from "@shared/config/xdg-paths"
import type {
  ResolvedGameMedia,
  ResolvedGameRecord,
} from "@shared/fixtures/games/game"
import type { GameAssetRecord } from "@shared/library/config/records/game-asset"
import type {
  GameAssetAssignmentRecord,
  GameAssetRole,
} from "@shared/library/config/records/game-asset-assignment"
import {
  type LibraryError,
  LibrarySource,
} from "@shared/library/library-services"
import {
  type KorriLibraryDb,
  openKorriLibraryDb,
} from "@shared/library/proseql/library-db"
import { logger } from "@shared/logger/logger"
import { Effect, type Scope } from "effect"

import {
  type LibraryEntry,
  type ListLibraryPayload,
  ListLibraryResponse,
} from "./list.rpc"

/**
 * Returns the full library from whatever LibrarySource is provided by
 * the host (proseql, manual, etc.).
 *
 * The legacy `KORRI_HEADLESS_SOURCE_ONLY` gate that used to reject this
 * RPC has been retired: the desktop-as-server-client refactor exposes
 * `app.library.list` from the unified server RPC group, so a deployment
 * that runs the server is meant to BE the library. Source-only deploys
 * still expose `app.source.list` separately, but they're no longer
 * special-cased here.
 */
export const handleListLibrary = (_payload: typeof ListLibraryPayload.Type) =>
  Effect.gen(function* () {
    const source = yield* LibrarySource
    const games = yield* source.list().pipe(Effect.mapError(toDataError))
    const resolvedGames = yield* resolveGameAssets({
      games,
      env: process.env,
    })
    const localSource = makeLocalEntrySource(process.env)
    const taggedGames: readonly LibraryEntry[] = resolvedGames.map(game => ({
      ...game,
      source: localSource,
    }))
    return new ListLibraryResponse({ games: taggedGames })
  })

interface CatalogAssignment {
  readonly role: GameAssetRole
  readonly assetId: string
}

interface GameAssetCatalog {
  readonly assetById: ReadonlyMap<string, GameAssetRecord>
  readonly assignmentsByGameId: ReadonlyMap<
    string,
    readonly CatalogAssignment[]
  >
}

function resolveGameAssets(args: {
  readonly games: readonly ResolvedGameRecord[]
  readonly env: XdgPathEnv
}): Effect.Effect<readonly ResolvedGameRecord[], DataError> {
  if (args.games.length === 0) return Effect.succeed(args.games)

  return Effect.scoped(
    Effect.gen(function* () {
      const db = yield* openGameAssetCatalog(args.env)
      const catalog = yield* readGameAssetCatalog(db)
      if (!hasAssignmentsForGames(args.games, catalog)) {
        return args.games
      }
      const publicApiBaseUrl = yield* resolvePublicApiBaseUrl(args.env)
      return yield* Effect.forEach(args.games, game =>
        resolveGameRecord({ ...args, game, catalog, publicApiBaseUrl }),
      )
    }),
  )
}

function openGameAssetCatalog(
  env: XdgPathEnv,
): Effect.Effect<KorriLibraryDb, DataError, Scope.Scope> {
  return openKorriLibraryDb({
    root: libraryRootFromEnv(env),
    writeDebounce: 1,
  }).pipe(
    Effect.mapError(
      error =>
        new DataError({
          reason: "ReadFailed",
          message: `failed to open game assets catalog: ${stringifyError(error)}`,
        }),
    ),
  )
}

function readGameAssetCatalog(
  db: KorriLibraryDb,
): Effect.Effect<GameAssetCatalog, DataError> {
  return Effect.all([readGameAssets(db), readGameAssetAssignments(db)]).pipe(
    Effect.map(([assets, assignments]) => ({
      assetById: new Map(
        assets.map(asset => [asset.id, asset as GameAssetRecord] as const),
      ),
      assignmentsByGameId: groupAssignmentsByGameId(assignments),
    })),
  )
}

function readGameAssets(
  db: KorriLibraryDb,
): Effect.Effect<readonly GameAssetRecord[], DataError> {
  return Effect.tryPromise({
    try: () => db["game-assets"].query().runPromise,
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message: `failed to read game assets catalog: ${stringifyError(error)}`,
      }),
  }).pipe(Effect.map(assets => assets as readonly GameAssetRecord[]))
}

function readGameAssetAssignments(
  db: KorriLibraryDb,
): Effect.Effect<readonly GameAssetAssignmentRecord[], DataError> {
  return Effect.tryPromise({
    try: () => db["game-asset-assignments"].query().runPromise,
    catch: error =>
      new DataError({
        reason: "ReadFailed",
        message: `failed to read game asset assignments: ${stringifyError(error)}`,
      }),
  }).pipe(
    Effect.map(
      assignments => assignments as readonly GameAssetAssignmentRecord[],
    ),
    Effect.flatMap(validateAssignments),
  )
}

function validateAssignments(
  assignments: readonly GameAssetAssignmentRecord[],
): Effect.Effect<readonly GameAssetAssignmentRecord[], DataError> {
  const seen = new Set<string>()
  for (const assignment of assignments) {
    const expectedId = `${assignment.gameId}:${assignment.role}`
    if (assignment.id !== expectedId) {
      return Effect.fail(
        new DataError({
          reason: "ReadFailed",
          message: `invalid game asset assignment id '${assignment.id}' for ${expectedId}`,
        }),
      )
    }
    if (seen.has(expectedId)) {
      return Effect.fail(
        new DataError({
          reason: "ReadFailed",
          message: `duplicate game asset assignment for ${expectedId}`,
        }),
      )
    }
    seen.add(expectedId)
  }
  return Effect.succeed(assignments)
}

function groupAssignmentsByGameId(
  assignments: readonly {
    readonly gameId: string
    readonly role: GameAssetRole
    readonly assetId: string
  }[],
): ReadonlyMap<string, readonly CatalogAssignment[]> {
  const byGameId = new Map<string, CatalogAssignment[]>()
  for (const assignment of assignments) {
    const bucket = byGameId.get(assignment.gameId) ?? []
    bucket.push({ role: assignment.role, assetId: assignment.assetId })
    byGameId.set(assignment.gameId, bucket)
  }
  return byGameId
}

function hasAssignmentsForGames(
  games: readonly ResolvedGameRecord[],
  catalog: GameAssetCatalog,
): boolean {
  return games.some(game =>
    (catalog.assignmentsByGameId.get(game.id) ?? []).some(assignment =>
      catalog.assetById.has(assignment.assetId),
    ),
  )
}

function resolveGameRecord(args: {
  readonly game: ResolvedGameRecord
  readonly catalog: GameAssetCatalog
  readonly env: XdgPathEnv
  readonly publicApiBaseUrl: URL
}): Effect.Effect<ResolvedGameRecord, never> {
  const assignments = sortAssignments(
    args.catalog.assignmentsByGameId.get(args.game.id) ?? [],
  )

  return Effect.forEach(assignments, assignment =>
    resolveMediaEntry({ ...args, assignment }),
  ).pipe(
    Effect.map(entries => entries.filter(isDefined)),
    Effect.map(media =>
      media.length > 0 ? { ...args.game, media } : args.game,
    ),
  )
}

function resolveMediaEntry(args: {
  readonly game: ResolvedGameRecord
  readonly catalog: GameAssetCatalog
  readonly env: XdgPathEnv
  readonly publicApiBaseUrl: URL
  readonly assignment: CatalogAssignment
}): Effect.Effect<ResolvedGameMedia | undefined, never> {
  const asset = args.catalog.assetById.get(args.assignment.assetId)
  if (!asset) {
    logOmittedAsset(args, "missing-record")
    return Effect.succeed(undefined)
  }

  if (asset.type !== "image" || !isSupportedImageMime(asset.mimeType)) {
    logOmittedAsset({ ...args, asset }, "unsupported")
    return Effect.succeed(undefined)
  }

  return Effect.promise(() => hasValidGameAssetBytes(args.env, asset)).pipe(
    Effect.map(isValid => {
      if (!isValid) {
        logOmittedAsset({ ...args, asset }, "missing-bytes")
        return undefined
      }
      return resolvedMedia(args.publicApiBaseUrl, args.assignment.role, asset)
    }),
  )
}

function resolvedMedia(
  publicApiBaseUrl: URL,
  role: GameAssetRole,
  asset: GameAssetRecord,
): ResolvedGameMedia {
  return {
    role,
    type: asset.type,
    width: asset.width,
    height: asset.height,
    ...(asset.source ? { source: asset.source } : {}),
    assetId: asset.id,
    url: gameAssetUrl(publicApiBaseUrl, asset.id),
  }
}

function logOmittedAsset(
  args: {
    readonly game: ResolvedGameRecord
    readonly assignment: CatalogAssignment
    readonly asset?: GameAssetRecord
  },
  reason: "missing-record" | "missing-bytes" | "unsupported",
): void {
  const messages = {
    "missing-record":
      "app.library.list: omitting assignment with missing game asset record",
    "missing-bytes": "app.library.list: omitting game asset with missing bytes",
    unsupported: "app.library.list: omitting unsupported game asset",
  }
  logger.warn(
    {
      gameId: args.game.id,
      role: args.assignment.role,
      assetId: args.asset?.id ?? args.assignment.assetId,
    },
    messages[reason],
  )
}

function resolvePublicApiBaseUrl(
  env: XdgPathEnv,
): Effect.Effect<URL, DataError> {
  return Effect.try({
    try: () => {
      const explicit = env.KORRI_PUBLIC_API_BASE_URL?.trim()
      if (explicit && explicit.length > 0)
        return validatePublicApiBaseUrl(explicit)
      if (env.NODE_ENV === "test" || env.NODE_ENV === "development") {
        return new URL("http://127.0.0.1:3001/")
      }
      throw new Error(
        "KORRI_PUBLIC_API_BASE_URL is required for server deployments that return game asset URLs",
      )
    },
    catch: error =>
      new DataError({
        reason: "Unavailable",
        message: stringifyError(error),
      }),
  })
}

function validatePublicApiBaseUrl(raw: string): URL {
  rejectPublicApiBaseUrlWhitespace(raw)
  const url = new URL(raw)
  rejectUnsafePublicApiBaseUrlParts(url)
  rejectUnsafePublicApiBaseUrlScheme(url)
  return withTrailingSlash(url)
}

function rejectPublicApiBaseUrlWhitespace(raw: string): void {
  if (/\s/.test(raw)) {
    throw new Error("KORRI_PUBLIC_API_BASE_URL must not contain whitespace")
  }
}

function rejectUnsafePublicApiBaseUrlParts(url: URL): void {
  if (url.username !== "" || url.password !== "") {
    throw new Error("KORRI_PUBLIC_API_BASE_URL must not contain credentials")
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error(
      "KORRI_PUBLIC_API_BASE_URL must not contain query or fragment data",
    )
  }
}

function rejectUnsafePublicApiBaseUrlScheme(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("KORRI_PUBLIC_API_BASE_URL must use http or https")
  }
  if (url.protocol === "http:" && !isPrivateNetworkHostname(url.hostname)) {
    throw new Error(
      "KORRI_PUBLIC_API_BASE_URL must use https outside loopback or RFC1918 private networks",
    )
  }
}

function withTrailingSlash(url: URL): URL {
  if (!url.pathname.endsWith("/")) url.pathname = `${url.pathname}/`
  return url
}

/**
 * Returns true for hostnames that are safe to address over plain http:
 *  - loopback (localhost / 127.0.0.0/8 / [::1])
 *  - RFC1918 private IPv4 (10/8, 172.16/12, 192.168/16)
 *  - link-local IPv4 (169.254/16)
 *  - mDNS .local (and conventional .lan) hostnames
 *
 * Public DNS names and routable IPs still require https.
 */
function isPrivateNetworkHostname(hostname: string): boolean {
  if (hostname === "localhost") return true
  if (hostname === "[::1]") return true
  const lower = hostname.toLowerCase()
  if (lower.endsWith(".local") || lower.endsWith(".lan")) return true
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!ipv4) return false
  const octets = ipv4.slice(1, 5).map(Number)
  if (octets.some(o => o < 0 || o > 255)) return false
  const [a, b] = octets
  if (a === 127) return true
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

const roleOrder: ReadonlyMap<GameAssetRole, number> = new Map([
  ["tile", 0],
  ["banner", 1],
  ["poster", 2],
  ["hero", 3],
  ["logo", 4],
  ["screenshot", 5],
])

function sortAssignments<T extends { readonly role: GameAssetRole }>(
  assignments: readonly T[],
): readonly T[] {
  return [...assignments].sort(
    (a, b) => (roleOrder.get(a.role) ?? 99) - (roleOrder.get(b.role) ?? 99),
  )
}

function gameAssetUrl(baseUrl: URL, assetId: string): string {
  return new URL(
    `${gameAssetByteRoutePrefix.slice(1)}${encodeURIComponent(assetId)}`,
    baseUrl,
  ).toString()
}

function isSupportedImageMime(mimeType: string): boolean {
  return (
    mimeType === "image/png" ||
    mimeType === "image/jpeg" ||
    mimeType === "image/webp"
  )
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function libraryRootFromEnv(env: XdgPathEnv): string {
  const explicit = env.KORRI_LIBRARY_ROOT?.trim()
  return explicit && explicit.length > 0
    ? explicit
    : korriDataPath(env, "library")
}

function toDataError(error: LibraryError): DataError {
  const message = error.message ?? "library list failed"
  logger.error({ error: message }, "app.library.list: source.list() rejected")
  return new DataError({
    reason: "ReadFailed",
    message,
  })
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
