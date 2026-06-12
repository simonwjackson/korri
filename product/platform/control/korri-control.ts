import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import type { Effect } from "effect"
import { Context } from "effect"
import type {
  ControlDaemonStatusRequest,
  ControlDryRunLaunchRequest,
  ControlFindGameRequest,
  ControlLaunchRequest,
  ControlListGamesRequest,
  ControlStopSessionRequest,
  ControlStreamRuntimeSettingsStatusRequest,
} from "./control-requests"
import type {
  ControlDaemonStatusResult,
  ControlDryRunLaunchResult,
  ControlFindGameResult,
  ControlLaunchResult,
  ControlListGamesResult,
  ControlSessionStatusResult,
  ControlStopSessionResult,
  ControlStreamRuntimeSettingsStatusResult,
} from "./control-results"

export interface KorriControlService {
  readonly listGames: (
    request?: ControlListGamesRequest,
  ) => Effect.Effect<ControlListGamesResult, never>
  readonly findGame: (
    request: ControlFindGameRequest,
  ) => Effect.Effect<ControlFindGameResult, never>
  readonly dryRunLaunch: (
    request: ControlDryRunLaunchRequest,
  ) => Effect.Effect<ControlDryRunLaunchResult, never>
  readonly launchGame: (
    request: ControlLaunchRequest,
  ) => Effect.Effect<ControlLaunchResult, never>
  readonly sessionStatus: () => Effect.Effect<ControlSessionStatusResult, never>
  readonly stopSession: (
    request: ControlStopSessionRequest,
  ) => Effect.Effect<ControlStopSessionResult, never>
  readonly daemonStatus: (
    request?: ControlDaemonStatusRequest,
  ) => Effect.Effect<ControlDaemonStatusResult, never>
  readonly streamRuntimeSettingsStatus: (
    request?: ControlStreamRuntimeSettingsStatusRequest,
  ) => Effect.Effect<ControlStreamRuntimeSettingsStatusResult, never>
}

export class KorriControl extends Context.Service<
  KorriControl,
  KorriControlService
>()("KorriControl") {}

export function findPlayableEntry(
  entries: readonly PlayableLibraryEntry[],
  request: ControlFindGameRequest,
): ControlFindGameResult {
  const query = request.query.trim()
  if (query.length === 0) return { _tag: "MissingQuery" }

  const exactId = entries.find(entry => entry.id === query)
  if (exactId) return { _tag: "GameFound", game: exactId, match: "exact-id" }

  const normalizedQuery = query.toLocaleLowerCase()
  const matches = entries.filter(entry => {
    const title = entry.title?.toLocaleLowerCase() ?? ""
    return (
      entry.id.toLocaleLowerCase().includes(normalizedQuery) ||
      title.includes(normalizedQuery)
    )
  })

  if (matches.length === 1) {
    const game = matches[0]
    return {
      _tag: "GameFound",
      game,
      match: game.id.toLocaleLowerCase().includes(normalizedQuery)
        ? "id"
        : "title",
    }
  }

  const candidates = matches.map(entry => ({
    id: entry.id,
    ...(entry.title ? { title: entry.title } : {}),
  }))

  if (matches.length > 1) {
    return { _tag: "AmbiguousGame", query, candidates }
  }

  return { _tag: "GameNotFound", query, candidates: [] }
}
