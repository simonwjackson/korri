import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { GameRecord } from "@platform/library/config/records/game"
import {
  LibraryError,
  type LibrarySourceService,
} from "@platform/library/library-services"
import type {
  PlayableLibraryEntry,
  PlayableReleaseEntry,
} from "@platform/library/playable-library"
import type { KorriLibraryDb } from "@platform/library/proseql/library-db-core"
import { openInMemoryKorriLibraryDb } from "@platform/library/proseql/library-db-core"
import type { DevGameMedia } from "@product/surfaces/web/shift/dev-game-media"
import { Effect } from "effect"

export function mediaForSeedGame(game: DevGameMedia) {
  return [
    {
      role: "tile" as const,
      type: "image" as const,
      width: 600,
      height: 900,
      assetId: `${game.id}-tile`,
      url: game.gridUrl,
    },
    {
      role: "banner" as const,
      type: "image" as const,
      width: 1920,
      height: 620,
      assetId: `${game.id}-hero`,
      url: game.heroUrl,
    },
  ]
}

const SEED_NOW = Date.UTC(2026, 5, 24, 12, 0, 0)
const recentMinutes = [12, 95, 300, 1560, 3000, 60 * 24 * 3] as const

function seededUserData(index: number): GameRecord["userData"] {
  const recent = recentMinutes[index]
  return {
    lastPlayed:
      recent === undefined ? undefined : new Date(SEED_NOW - recent * 60_000),
    playtime: index < 9 ? (index + 1) * 180 + 40 : undefined,
    favorite: index % 4 === 0,
  }
}

export function gameRecordForSeedGame(
  game: DevGameMedia,
  index = 0,
): GameRecord {
  return {
    id: game.id,
    system: "steam",
    contentPath: `/library/${game.id}`,
    metadata: {
      name: game.title,
      developer: game.developer,
      genre: [game.genre],
    },
    userData: seededUserData(index),
  }
}

export async function makeSeededProseqlLibrarySource(
  games: readonly DevGameMedia[],
): Promise<LibrarySourceService> {
  const db = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const opened = yield* openInMemoryKorriLibraryDb()
        for (const [index, game] of games.entries()) {
          yield* seedGame(opened, gameRecordForSeedGame(game, index))
        }
        yield* Effect.promise(() => opened.flush())
        return opened
      }),
    ),
  )
  const mediaById = new Map(
    games.map(game => [game.id, mediaForSeedGame(game)]),
  )

  const listPlayableEntries = () =>
    readSeededEntries(db).pipe(
      Effect.map(entries =>
        entries.map(entry => ({
          ...entry,
          ...(mediaById.has(entry.id)
            ? { media: mediaById.get(entry.id) }
            : {}),
        })),
      ),
    )

  return {
    list: () =>
      listPlayableEntries().pipe(
        Effect.map(entries => entries.map(toResolvedGameRecord)),
      ),
    listPlayableEntries,
    launchSpecFor: id =>
      listPlayableEntries().pipe(
        Effect.map(entries =>
          entries.some(entry => entry.id === id)
            ? { command: "in-memory-launcher", args: [id] }
            : undefined,
        ),
      ),
    canResolveLaunchForGame: id =>
      listPlayableEntries().pipe(
        Effect.map(entries => entries.some(entry => entry.id === id)),
      ),
    resolveLaunchForGame: id =>
      listPlayableEntries().pipe(
        Effect.flatMap(entries => {
          const entry = entries.find(candidate => candidate.id === id)
          if (!entry) {
            return Effect.fail(
              new LibraryError({
                reason: "config",
                message: `Seeded ProseQL library has no playable ${id}`,
              }),
            )
          }
          return Effect.succeed({
            spec: { command: "in-memory-launcher", args: [id] },
            playable: {
              id: entry.id,
              itemId: entry.itemId,
              title: entry.title,
            },
            release: entry.releases[0],
          })
        }),
      ),
  }
}

function seedGame(db: KorriLibraryDb, game: GameRecord) {
  const target = game.contentPath?.replace(/^\/+/, "")
  const release = {
    id: "default",
    system: game.system,
    ...(target
      ? {
          target: {
            kind: "file" as const,
            storage: "seed-files",
            path: target,
          },
        }
      : {}),
  }
  return Effect.all([
    db.storage.upsert({
      where: { id: "seed-files" },
      create: { id: "seed-files", root: "/" },
      update: { id: "seed-files", root: "/" },
    }),
    db.library.upsert({
      where: { id: game.id },
      create: {
        id: game.id,
        title: game.metadata?.name ?? game.id,
        ...(game.metadata ? { metadata: game.metadata } : {}),
        ...(game.userData ? { userData: game.userData } : {}),
        releases: [release],
      },
      update: {
        id: game.id,
        title: game.metadata?.name ?? game.id,
        ...(game.metadata ? { metadata: game.metadata } : {}),
        ...(game.userData ? { userData: game.userData } : {}),
        releases: [release],
      },
    }),
  ]).pipe(Effect.as(game))
}

function readSeededEntries(db: KorriLibraryDb) {
  return Effect.tryPromise({
    try: async () => {
      const items = await db.library.query().runPromise
      return items.map(item => {
        const release = item.releases[0]
        const playableRelease: PlayableReleaseEntry = {
          id: release?.id ?? "default",
          system: release?.system ?? "unknown",
          ...(release?.target ? { target: release.target } : {}),
          launchable: true,
        }
        return {
          id: item.id,
          itemId: item.id,
          title: item.title ?? item.id,
          releases: [playableRelease],
          launchable: true,
          system: playableRelease.system,
          ...(item.metadata ? { metadata: item.metadata } : {}),
          ...(item.userData ? { userData: item.userData } : {}),
        } satisfies PlayableLibraryEntry
      })
    },
    catch: error =>
      error instanceof LibraryError
        ? error
        : new LibraryError({
            reason: "io",
            message: error instanceof Error ? error.message : String(error),
          }),
  })
}

function toResolvedGameRecord(entry: PlayableLibraryEntry): ResolvedGameRecord {
  const release = entry.releases[0]
  return {
    id: entry.id,
    system: release?.system ?? entry.system ?? "unknown",
    contentPath:
      release?.target?.kind === "file" ? release.target.path : undefined,
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
    ...(entry.userData ? { userData: entry.userData } : {}),
    media: entry.media,
  }
}
