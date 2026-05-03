import { Effect, Layer } from "effect"
import { Launcher, LibraryError } from "./library-services"
import { createShellLauncher } from "./shell-launcher"

export const LauncherLayerLive = Layer.succeed(Launcher)({
  run: spec =>
    Effect.tryPromise({
      try: () => createShellLauncher().run(spec),
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
})
