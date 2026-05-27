import { Effect, Layer } from "effect"
import { Launcher, LibraryError } from "./library-services"
import { createSessionLauncherFromEnv } from "./session-launcher"
import { createShellLauncher } from "./shell-launcher"

export const LauncherLayerLive = Layer.succeed(Launcher)({
  run: spec =>
    Effect.tryPromise({
      try: () =>
        (createSessionLauncherFromEnv() ?? createShellLauncher()).run(spec),
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
  spawn: spec =>
    Effect.tryPromise({
      try: () => {
        const launcher = createSessionLauncherFromEnv() ?? createShellLauncher()
        if (!launcher.spawn) {
          throw new Error("configured launcher does not support managed spawn")
        }
        return launcher.spawn(spec)
      },
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
})
