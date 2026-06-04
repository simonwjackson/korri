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
  spawn: (spec, options) =>
    Effect.tryPromise({
      try: () => {
        const launcher = createSessionLauncherFromEnv() ?? createShellLauncher()
        if (!launcher.spawn) {
          throw new Error("configured launcher does not support managed spawn")
        }
        // task-014: thread `extras` through to the underlying launcher
        // so sessiond-backed launches receive lifecycle/wait hints.
        // Spec-shaped launchers (shell) ignore the field; sessiond
        // checks the `sessionLifecycle` capability before honoring
        // `lifecycle: "session"`.
        return launcher.spawn(spec, options?.extras)
      },
      catch: error =>
        new LibraryError({
          reason: "io",
          message: error instanceof Error ? error.message : String(error),
        }),
    }),
})
