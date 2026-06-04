import {
  gameAssetByteRoutePrefix,
  hasValidGameAssetBytes,
} from "@platform/api/http/game-asset-bytes"
import { makeLocalEntrySource } from "@platform/api/rpc/entry-source"
import { DataError } from "@platform/api/rpc/errors"
import { korriDataPath, type XdgPathEnv } from "@platform/config/xdg-paths"
import type {
  ResolvedGameMedia,
  ResolvedGameRecord,
} from "@platform/fixtures/games/game"
import type { GameAssetRecord } from "@platform/library/config/records/game-asset"
import type {
  GameAssetAssignmentRecord,
  GameAssetRole,
} from "@platform/library/config/records/game-asset-assignment"
import {
  type LibraryError,
  LibrarySource,
} from "@platform/library/library-services"
import {
  type KorriLibraryDb,
  openKorriLibraryDb,
} from "@platform/library/proseql/library-db"
import { logger } from "@platform/logger/logger"
import { PeerDiscovery } from "@product/apps/portal/peers/peer-discovery"
import { PeerSourceFetcher } from "@product/apps/portal/peers/peer-source-fetcher"
import { Effect, type Scope, SubscriptionRef } from "effect"

import {
  type LibraryEntry,
  type ListLibraryPayload,
  ListLibraryResponse,
} from "./list.rpc"

/**
 * Returns the full library from whatever LibrarySource is provided by
 * the host (proseql, manual, etc.).
 *
 * Federation v1: every library-bearing korri-server returns the union
 * of local entries plus each LAN peer's source catalog (see U4 fan-out).
 * Source-only vs full-library is no longer an env-gated distinction
 * — it's structural via the `source` tag on every entry.
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
    const localTagged: readonly LibraryEntry[] = resolvedGames.map(game => ({
      ...game,
      source: localSource,
    }))

    // Federate: union local entries with each LAN peer's source
    // catalog. Per-peer failures collapse to empty arrays inside
    // `PeerSourceFetcher` so the federated response degrades
    // gracefully (R9). Peer discovery is read once per call as a
    // snapshot from the SubscriptionRef.
    const peerDiscovery = yield* PeerDiscovery
    const peerFetcher = yield* PeerSourceFetcher
    const peerSnapshot = yield* SubscriptionRef.get(peerDiscovery.peers)
    const peers = Array.from(peerSnapshot.values())
    const remoteResults = yield* Effect.all(
      peers.map(peer => peerFetcher.fetchPeerCatalog(peer)),
      { concurrency: "unbounded" },
    )
    const remoteTagged = remoteResults.flat()

    return new ListLibraryResponse({
      games: [...localTagged, ...remoteTagged],
    })
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
      return yield* Effect.forEach(args.games, game =>
        resolveGameRecord({ ...args, game, catalog }),
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
      return resolvedMedia(args.assignment.role, asset)
    }),
  )
}

function resolvedMedia(
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
    url: gameAssetUrl(asset.id),
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

function gameAssetUrl(assetId: string): string {
  return `${gameAssetByteRoutePrefix}${encodeURIComponent(assetId)}`
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
