import type { GameRecord } from "@shared/fixtures/games/game"
import { getGameDisplayName } from "@shared/fixtures/games/game"
import type {
  LibraryError,
  LibrarySourceService,
} from "@shared/library/library-services"
import { Cause, Effect, Exit } from "effect"
import type { StreamHostCandidate } from "./lan-stream-discovery"
import type {
  RemoteSourceGame,
  RemoteSourceStatus,
  RemoteStreamControlClient,
} from "./remote-stream-control-client"

export type SourceAwareEntry = LocalSourceEntry | RemoteSourceEntry

export interface LocalSourceEntry {
  readonly source: {
    readonly kind: "local"
    readonly id: "local"
    readonly name: "This device"
  }
  readonly game: GameRecord
  readonly choice: GameRecord
}

export interface RemoteSourceEntry {
  readonly source: {
    readonly kind: "remote"
    readonly id: string
    readonly name: string
    readonly host: StreamHostCandidate
    readonly status: Extract<
      RemoteSourceStatus,
      { readonly status: "available" }
    >
  }
  readonly game: RemoteSourceGame
  readonly choice: GameRecord
}

export interface SourceDiagnostic {
  readonly sourceKind: "local" | "remote"
  readonly sourceId: string
  readonly sourceName: string
  readonly category:
    | "library-unavailable"
    | "host-unavailable"
    | "stream-unavailable"
    | "catalog-unavailable"
  readonly message: string
}

export interface LoadSourceAwareGamesOptions {
  readonly localSource: LibrarySourceService
  readonly remoteHosts?: readonly StreamHostCandidate[]
  readonly clientForHost?: (
    host: StreamHostCandidate,
  ) => RemoteStreamControlClient
}

export interface SourceAwareGamesResult {
  readonly entries: readonly SourceAwareEntry[]
  readonly diagnostics: readonly SourceDiagnostic[]
}

export async function loadSourceAwareGames(
  options: LoadSourceAwareGamesOptions,
): Promise<SourceAwareGamesResult> {
  const entries: SourceAwareEntry[] = []
  const diagnostics: SourceDiagnostic[] = []

  await appendLocalEntries(options.localSource, entries, diagnostics)

  for (const host of options.remoteHosts ?? []) {
    const client = options.clientForHost?.(host)
    if (client) await appendRemoteEntries(host, client, entries, diagnostics)
  }

  return { entries, diagnostics }
}

async function appendLocalEntries(
  localSource: LibrarySourceService,
  entries: SourceAwareEntry[],
  diagnostics: SourceDiagnostic[],
): Promise<void> {
  const local = await runLibraryEffect(localSource.list())
  if (!local.ok) {
    diagnostics.push({
      sourceKind: "local",
      sourceId: "local",
      sourceName: "This device",
      category: "library-unavailable",
      message: local.error.message ?? "Local Korri library is unavailable",
    })
    return
  }

  for (const game of local.value) entries.push(localEntry(game, entries.length))
}

async function appendRemoteEntries(
  host: StreamHostCandidate,
  client: RemoteStreamControlClient,
  entries: SourceAwareEntry[],
  diagnostics: SourceDiagnostic[],
): Promise<void> {
  const status = await client.sourceStatus()
  const unavailable = unavailableRemoteDiagnostic(host, status)
  if (unavailable) {
    diagnostics.push(unavailable)
    return
  }

  try {
    const games = await client.listSourceGames()
    for (const game of games.filter(game => game.streamable)) {
      entries.push(
        remoteEntry(
          host,
          status as Extract<
            RemoteSourceStatus,
            { readonly status: "available" }
          >,
          game,
          entries.length,
        ),
      )
    }
  } catch (error) {
    diagnostics.push(
      remoteDiagnostic(
        host,
        "catalog-unavailable",
        error instanceof Error ? error.message : String(error),
      ),
    )
  }
}

function unavailableRemoteDiagnostic(
  host: StreamHostCandidate,
  status: RemoteSourceStatus,
): SourceDiagnostic | undefined {
  if (status.status === "unavailable") {
    return remoteDiagnostic(host, "host-unavailable", status.message)
  }
  if (status.status === "stream-unavailable") {
    return remoteDiagnostic(
      host,
      "stream-unavailable",
      status.message ?? "Remote stream control is unavailable",
    )
  }
  if (status.catalog !== "available") {
    return remoteDiagnostic(
      host,
      "catalog-unavailable",
      "Remote catalog is unavailable",
    )
  }
  return undefined
}

export function findEntryForChoice(
  entries: readonly SourceAwareEntry[],
  choice: GameRecord,
): SourceAwareEntry | undefined {
  return entries.find(entry => entry.choice.id === choice.id)
}

function localEntry(game: GameRecord, index: number): LocalSourceEntry {
  return {
    source: { kind: "local", id: "local", name: "This device" },
    game,
    choice: choiceGame(
      `choice-${index}`,
      `${getGameDisplayName(game)} · local`,
      game.id,
    ),
  }
}

function remoteEntry(
  host: StreamHostCandidate,
  status: Extract<RemoteSourceStatus, { readonly status: "available" }>,
  game: RemoteSourceGame,
  index: number,
): RemoteSourceEntry {
  return {
    source: {
      kind: "remote",
      id: host.id,
      name: host.name,
      host,
      status,
    },
    game,
    choice: choiceGame(
      `choice-${index}`,
      `${game.displayName} · ${host.name}`,
      game.id,
    ),
  }
}

function choiceGame(
  id: string,
  name: string,
  sourceGameId: string,
): GameRecord {
  return {
    id,
    metadata: {
      name,
      description: sourceGameId,
    },
  }
}

function remoteDiagnostic(
  host: StreamHostCandidate,
  category: SourceDiagnostic["category"],
  message: string,
): SourceDiagnostic {
  return {
    sourceKind: "remote",
    sourceId: host.id,
    sourceName: host.name,
    category,
    message,
  }
}

async function runLibraryEffect<T>(
  effect: Effect.Effect<T, LibraryError>,
): Promise<
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: LibraryError }
> {
  const exit = await Effect.runPromiseExit(effect)
  if (Exit.isSuccess(exit)) return { ok: true, value: exit.value }
  return { ok: false, error: Cause.squash(exit.cause) as LibraryError }
}
