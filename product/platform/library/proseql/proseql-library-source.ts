import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type {
  LibrarySource,
  ResolveLaunchInputs,
} from "@platform/library/library-source"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Effect } from "effect"
import type { LibraryRepository } from "./library-repository"

export function createProseqlLibrarySource(
  repository: LibraryRepository,
): LibrarySource {
  return {
    list: async () =>
      (await Effect.runPromise(repository.listPlayableEntries())).map(
        toCompatGameRecord,
      ),
    listPlayableEntries: () =>
      Effect.runPromise(repository.listPlayableEntries()),
    launchSpecFor: (id, releaseId) =>
      repository.asLibrarySource().launchSpecFor(id, releaseId),
    canResolveLaunchForGame: (id, inputs?: ResolveLaunchInputs) =>
      Effect.runPromise(repository.canResolveLaunchForPlayable(id, inputs)),
    resolveLaunchForGame: (id, inputs?: ResolveLaunchInputs) =>
      Effect.runPromise(repository.resolveLaunchForPlayable(id, inputs)),
  }
}

function toCompatGameRecord(entry: PlayableLibraryEntry): ResolvedGameRecord {
  const release = entry.releases[0]
  return {
    id: entry.id,
    system: release?.system ?? "unknown",
    metadata: { name: entry.title ?? entry.id },
  }
}
