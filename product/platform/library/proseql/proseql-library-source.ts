import { resolvedLaunchSpecOrUndefined } from "@platform/library/library-error-mapping"
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
        resolvedLaunchSpecOrUndefined(repository.resolveLaunchForGame(id)),
      ),
    canResolveLaunchForGame: (id, inputs?: ResolveLaunchInputs) =>
      Effect.runPromise(repository.canResolveLaunchForGame(id, inputs)),
    resolveLaunchForGame: (id, inputs?: ResolveLaunchInputs) =>
      Effect.runPromise(repository.resolveLaunchForGame(id, inputs)),
  }
}
