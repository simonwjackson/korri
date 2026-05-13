import type { GameRecord } from "@shared/fixtures/games/game"
import { decodeGameRecord } from "@shared/fixtures/games/game"
import type { LaunchSpec } from "@shared/library/launcher"
import {
  type LaunchResolutionError,
  resolveLaunchSpec,
} from "@shared/library/launcher-config/launch-resolver"
import {
  decodeLaunchTargetRecord,
  isLegacyLaunchTarget,
  isProfileBackedLaunchTarget,
  type LaunchTargetRecord,
  type ProfileBackedLaunchTargetRecord,
} from "@shared/library/launcher-config/launch-target"
import {
  decodeLauncherProfileRecord,
  type LauncherProfileRecord,
} from "@shared/library/launcher-config/launcher-profile"
import { LibraryError } from "@shared/library/library-services"
import { Effect } from "effect"
import type { KorriLibraryDb } from "./library-db"

export interface ImportedGameRecord {
  readonly game: GameRecord
  readonly launcherProfile: LauncherProfileRecord
  readonly launchTarget: ProfileBackedLaunchTargetRecord
}

export interface LibraryRepository {
  readonly listGames: () => Effect.Effect<readonly GameRecord[], unknown>
  readonly upsertGame: (game: GameRecord) => Effect.Effect<GameRecord, unknown>
  readonly upsertLauncherProfile: (
    profile: LauncherProfileRecord,
  ) => Effect.Effect<LauncherProfileRecord, unknown>
  readonly upsertLaunchTarget: (
    launchTarget: LaunchTargetRecord,
  ) => Effect.Effect<LaunchTargetRecord, unknown>
  readonly launchSpecForGame: (
    gameId: string,
  ) => Effect.Effect<LaunchSpec | undefined, unknown>
  readonly upsertImportedGame: (
    record: ImportedGameRecord,
  ) => Effect.Effect<void, unknown>
}

export function createLibraryRepository(db: KorriLibraryDb): LibraryRepository {
  return {
    listGames: () =>
      Effect.promise(() => db.games.query().runPromise).pipe(
        Effect.map(records =>
          records
            .map(record => decodeGameRecord(record))
            .sort(compareByLastPlayedDesc),
        ),
      ),

    upsertGame: game =>
      Effect.gen(function* () {
        const decoded = decodeGameRecord(game)
        const upserted = yield* db.games.upsert({
          where: { id: decoded.id },
          create: decoded,
          update: decoded,
        })
        return decodeGameRecord(upserted)
      }),

    upsertLauncherProfile: profile =>
      Effect.gen(function* () {
        const decoded = decodeLauncherProfileRecord(profile)
        const upserted = yield* db.launcherProfiles.upsert({
          where: { id: decoded.id },
          create: decoded,
          update: decoded,
        })
        return decodeLauncherProfileRecord(upserted)
      }),

    upsertLaunchTarget: launchTarget =>
      Effect.gen(function* () {
        const decoded = decodeLaunchTargetRecord(launchTarget)
        const upserted = yield* db.launchTargets.upsert({
          where: { id: decoded.id },
          create: decoded as never,
          update: decoded as never,
        })
        return decodeLaunchTargetRecord(upserted)
      }),

    launchSpecForGame: gameId =>
      Effect.gen(function* () {
        const target = yield* findLaunchTargetForGame(db, gameId)
        if (!target) return undefined
        if (isLegacyLaunchTarget(target)) {
          return yield* Effect.fail(
            configError(
              `Launch target for game ${gameId} uses the legacy resolved-spec format; reset or re-import profile-backed launch targets`,
              "LegacyLaunchTarget",
            ),
          )
        }

        const profile = yield* findLauncherProfile(db, target.profile)
        if (!profile) {
          return yield* Effect.fail(
            configError(
              `Launch target for game ${gameId} references missing launcher profile ${target.profile}`,
              "MissingLauncherProfile",
            ),
          )
        }

        const result = resolveLaunchSpec(profile, target)
        if (result._tag === "Failed") {
          return yield* Effect.fail(
            configError(
              formatResolutionError(gameId, target.profile, result.error),
              result.error._tag,
            ),
          )
        }

        return result.spec
      }),

    upsertImportedGame: record =>
      Effect.gen(function* () {
        const game = decodeGameRecord(record.game)
        const launcherProfile = decodeLauncherProfileRecord(
          record.launcherProfile,
        )
        const launchTarget = decodeLaunchTargetRecord(record.launchTarget)
        if (!isProfileBackedLaunchTarget(launchTarget)) {
          return yield* Effect.fail(
            configError(
              "Imported games must use profile-backed launch targets",
              "LegacyLaunchTarget",
            ),
          )
        }

        yield* db.$transaction(tx =>
          Effect.gen(function* () {
            yield* tx.games.upsert({
              where: { id: game.id },
              create: game,
              update: game,
            })
            yield* tx.launcherProfiles.upsert({
              where: { id: launcherProfile.id },
              create: launcherProfile,
              update: launcherProfile,
            })
            yield* tx.launchTargets.upsert({
              where: { id: launchTarget.id },
              create: launchTarget as never,
              update: launchTarget as never,
            })
          }),
        )
      }),
  }
}

function findLaunchTargetForGame(db: KorriLibraryDb, gameId: string) {
  return Effect.promise(async () => {
    const records = await db.launchTargets.query().runPromise
    return records
      .map(record => decodeLaunchTargetRecord(record))
      .find(record => {
        if (record.id === gameId) return true
        return isLegacyLaunchTarget(record) && record.gameId === gameId
      })
  })
}

function findLauncherProfile(db: KorriLibraryDb, profileId: string) {
  return Effect.promise(async () => {
    const records = await db.launcherProfiles.query().runPromise
    return records
      .map(record => decodeLauncherProfileRecord(record))
      .find(record => record.id === profileId)
  })
}

function configError(message: string, diagnostic: string): LibraryError {
  return new LibraryError({ reason: "config", message, diagnostic })
}

function formatResolutionError(
  gameId: string,
  profileId: string,
  error: LaunchResolutionError,
): string {
  switch (error._tag) {
    case "MissingRequiredValue":
      return `Launch target for game ${gameId} using profile ${profileId} is missing required value ${error.key}`
    case "UnresolvedPlaceholder":
      return `Launch target for game ${gameId} using profile ${profileId} has unresolved placeholder ${error.placeholder}`
    case "DisallowedCommand":
      return `Launch target for game ${gameId} using profile ${profileId} resolved disallowed command ${error.command}`
    case "InvalidLaunchConfig":
      return `Launch target for game ${gameId} using profile ${profileId} is invalid: ${error.message}`
  }
}

function compareByLastPlayedDesc(a: GameRecord, b: GameRecord): number {
  const ta = a.userData?.lastPlayed?.getTime()
  const tb = b.userData?.lastPlayed?.getTime()
  if (ta === undefined && tb === undefined) return 0
  if (ta === undefined) return 1
  if (tb === undefined) return -1
  return tb - ta
}
