import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AppRecord } from "@shared/library/config/records/app"
import type { CollectionRecord } from "@shared/library/config/records/collection"
import type { GameRecord } from "@shared/library/config/records/game"
import type { GlobalConfigPayload } from "@shared/library/config/records/global"
import type { LauncherRecord } from "@shared/library/config/records/launcher"
import type { ModuleRecord } from "@shared/library/config/records/module"
import type { SystemRecord } from "@shared/library/config/records/system"
import type { UserRecord } from "@shared/library/config/records/user"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { Effect } from "effect"

/**
 * Seed shape for `withTempProseqlLibrary`. Mirrors the six collections
 * of the new library: a singleton `global` config, plus map-keyed
 * users, systems, launchers, games, collections. Presets are nested
 * under their owning record's `presets:` field — no top-level
 * `presets` seed; pass them as part of the relevant record instead.
 */
export interface TempProseqlLibrarySeed {
  readonly global?: GlobalConfigPayload
  readonly users?: readonly UserRecord[]
  readonly systems?: readonly SystemRecord[]
  readonly launchers?: readonly LauncherRecord[]
  readonly apps?: readonly AppRecord[]
  readonly modules?: readonly ModuleRecord[]
  readonly games?: readonly GameRecord[]
  readonly collections?: readonly CollectionRecord[]
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

          if (seed.global) {
            yield* db.config.upsert({
              where: { id: "global" },
              create: { id: "global", ...seed.global },
              update: { id: "global", ...seed.global },
            })
          }
          for (const user of seed.users ?? []) {
            yield* db.users.upsert({
              where: { id: user.id },
              create: user,
              update: user,
            })
          }
          for (const system of seed.systems ?? []) {
            yield* db.systems.upsert({
              where: { id: system.id },
              create: system,
              update: system,
            })
          }
          for (const launcher of seed.launchers ?? []) {
            yield* db.launchers.upsert({
              where: { id: launcher.id },
              create: launcher,
              update: launcher,
            })
          }
          for (const app of seed.apps ?? []) {
            yield* db.apps.upsert({
              where: { id: app.id },
              create: app,
              update: app,
            })
          }
          for (const module of seed.modules ?? []) {
            yield* db.modules.upsert({
              where: { id: module.id },
              create: module,
              update: module,
            })
          }
          for (const game of seed.games ?? []) {
            yield* db.games.upsert({
              where: { id: game.id },
              create: game,
              update: game,
            })
          }
          for (const collection of seed.collections ?? []) {
            yield* db.collections.upsert({
              where: { id: collection.id },
              create: collection,
              update: collection,
            })
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
