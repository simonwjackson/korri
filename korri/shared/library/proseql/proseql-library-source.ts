import type { LibrarySource } from "@shared/library/library-source"
import { Effect } from "effect"
import type { LibraryRepository } from "./library-repository"

export function createProseqlLibrarySource(
  repository: LibraryRepository,
): LibrarySource {
  return {
    list: () => Effect.runPromise(repository.listGames()),
    launchSpecFor: id => Effect.runPromise(repository.launchSpecForGame(id)),
  }
}
