import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError } from "@platform/library/library-services"
import type {
  LibrarySource,
  ResolveLaunchInputs,
} from "@platform/library/library-source"
import { Effect } from "effect"
import type { LibraryRepository } from "./library-repository"

export function createProseqlLibrarySource(
  repository: LibraryRepository,
): LibrarySource {
  return {
    list: () => Effect.runPromise(repository.listGames()),
    launchSpecFor: id =>
      Effect.runPromise(
        repository.resolveLaunchForGame(id).pipe(
          Effect.matchEffect({
            onSuccess: out =>
              Effect.succeed(out.spec as LaunchSpec | undefined),
            onFailure: error =>
              // GameNotFound is the legacy "unknown id → undefined" path;
              // any other cascade or library error surfaces as a config
              // failure so the launch handler can render a diagnostic.
              "_tag" in error && error._tag === "GameNotFound"
                ? Effect.succeed(undefined as LaunchSpec | undefined)
                : Effect.fail(
                    new LibraryError({
                      reason: "config",
                      message: cascadeErrorMessage(error),
                    }),
                  ),
          }),
        ),
      ),
    resolveLaunchForGame: (id, inputs?: ResolveLaunchInputs) =>
      Effect.runPromise(repository.resolveLaunchForGame(id, inputs)),
  }
}

function cascadeErrorMessage(error: unknown): string {
  if (typeof error === "object" && error && "_tag" in error) {
    const tag = (error as { _tag: string })._tag
    if (tag === "LauncherUnresolvable") {
      return "missing launcher profile for game"
    }
    if (tag === "CoreNotConfigured") return "missing required core for game"
    if (tag === "PresetNotFound") return "unknown preset for game"
    if (tag === "UserNotFound") return "unknown user"
    if (tag === "MissingRequiredValue") {
      return "launch template references missing value"
    }
    if (tag === "UnresolvedPlaceholder") {
      return "launch template references an unsupported placeholder"
    }
    if (tag === "DisallowedCommand") return "launch command not allowed"
    return `cascade error: ${tag}`
  }
  return error instanceof Error ? error.message : String(error)
}
