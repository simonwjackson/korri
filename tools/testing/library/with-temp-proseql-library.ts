import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GameRecord } from "@shared/fixtures/games/game"
import type { ProfileBackedLaunchTargetRecord } from "@shared/library/launcher-config/launch-target"
import type { LauncherProfileRecord } from "@shared/library/launcher-config/launcher-profile"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Effect } from "effect"

export interface TempProseqlLibrarySeed {
  readonly games?: readonly GameRecord[]
  readonly launcherProfiles?: readonly LauncherProfileRecord[]
  readonly launchTargets?: readonly ProfileBackedLaunchTargetRecord[]
}

export interface TempProseqlLibrary {
  readonly root: string
  readonly cleanup: () => Promise<void>
  readonly [Symbol.asyncDispose]: () => Promise<void>
}

export async function withTempProseqlLibrary(
  seed: TempProseqlLibrarySeed = {},
): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-library-"))
  let success = false

  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)

          for (const game of seed.games ?? []) {
            yield* repository.upsertGame(game)
          }
          for (const profile of seed.launcherProfiles ?? []) {
            yield* repository.upsertLauncherProfile(profile)
          }
          for (const target of seed.launchTargets ?? []) {
            yield* repository.upsertLaunchTarget(target)
          }

          yield* Effect.promise(() => db.flush())
        }),
      ),
    )
    success = true
  } finally {
    if (!success) await rm(root, { recursive: true, force: true })
  }

  const cleanup = async () => {
    await rm(root, { recursive: true, force: true })
  }

  return { root, cleanup, [Symbol.asyncDispose]: cleanup }
}
