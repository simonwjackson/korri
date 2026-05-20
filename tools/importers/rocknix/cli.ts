#!/usr/bin/env bun
import { korriDataPath } from "@shared/config/xdg-paths"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { logger } from "@shared/logger"
import { Effect } from "effect"
import { importRocknixLibrary } from "./rocknix-importer"

const DEFAULT_GAMELIST_ROOTS = "/storage/roms"
const DEFAULT_ES_SYSTEMS = "/storage/.config/emulationstation/es_systems.cfg"

const program = Effect.scoped(
  Effect.gen(function* () {
    const libraryRoot =
      process.env.KORRI_LIBRARY_ROOT ??
      process.argv[2] ??
      korriDataPath(process.env, "library")
    const gamelistRoots = (
      process.env.KORRI_ROCKNIX_GAMELIST_ROOTS ?? DEFAULT_GAMELIST_ROOTS
    )
      .split(":")
      .map(root => root.trim())
      .filter(root => root.length > 0)
    const esSystemsPath =
      process.env.KORRI_ROCKNIX_ES_SYSTEMS ?? DEFAULT_ES_SYSTEMS
    const mediaRoot = process.env.KORRI_ROCKNIX_MEDIA_ROOT
    const launchCommand = process.env.KORRI_ROCKNIX_LAUNCH_COMMAND

    const db = yield* openKorriLibraryDb({ root: libraryRoot })
    const summary = yield* Effect.promise(() =>
      importRocknixLibrary({
        repository: createLibraryRepository(db),
        gamelistRoots,
        esSystemsPath,
        mediaRoot,
        launchCommand,
      }),
    )
    yield* Effect.promise(() => db.flush())
    return summary
  }),
)

try {
  const summary = await Effect.runPromise(program)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
} catch (error) {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "rocknix-importer: failed",
  )
  process.exitCode = 1
}
