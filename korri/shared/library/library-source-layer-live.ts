import { logger } from "@shared/logger/logger"
import { Effect, Layer } from "effect"
import { LibraryError, LibrarySource } from "./library-services"
import {
  createRocknixSource,
  defaultRocknixConfig,
  type RocknixConfig,
} from "./rocknix/rocknix-source"

export const LibrarySourceLayerLive = Layer.succeed(LibrarySource)({
  list: () =>
    Effect.tryPromise({
      try: () => createRocknixSource(buildRocknixConfigFromEnv()).list(),
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
  launchSpecFor: id =>
    Effect.tryPromise({
      try: () =>
        createRocknixSource(buildRocknixConfigFromEnv()).launchSpecFor(id),
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
})

function buildRocknixConfigFromEnv(): RocknixConfig {
  const rootsRaw = process.env.KORRI_ROCKNIX_GAMELIST_ROOTS
  const esSystemsPathRaw = process.env.KORRI_ROCKNIX_ES_SYSTEMS
  const mediaRootRaw = process.env.KORRI_ROCKNIX_MEDIA_ROOT

  const defaults = defaultRocknixConfig()
  const gamelistRoots =
    rootsRaw && rootsRaw.trim() !== ""
      ? rootsRaw
          .split(":")
          .map(s => s.trim())
          .filter(s => s.length > 0)
      : defaults.gamelistRoots
  const esSystemsPath =
    esSystemsPathRaw && esSystemsPathRaw.trim() !== ""
      ? esSystemsPathRaw.trim()
      : defaults.esSystemsPath

  const mediaRoot =
    mediaRootRaw && mediaRootRaw.trim() !== ""
      ? mediaRootRaw.trim()
      : defaults.mediaRoot

  logger.info(
    { sourceKind: "rocknix" },
    "library-source-layer-live: built from env",
  )
  return { gamelistRoots, esSystemsPath, mediaRoot }
}
