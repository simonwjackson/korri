import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  LibraryError,
  type LibrarySourceService,
  type ResolvedLaunch,
} from "@platform/library/library-services"
import type {
  PlayableLibraryEntry,
  PlayableReleaseEntry,
} from "@platform/library/playable-library"
import { Effect } from "effect"

import type {
  ConfigRecord,
  ExecutablePluginResource,
  PluginCatalogItem,
  PluginId,
  ProcessPluginLaunch,
} from "./index"
import type { PluginRegistry } from "./registry"
import { configRecordContributions, executableResources } from "./registry"
import type { PluginExecutableResourceResolver } from "./resources"

export function withPluginLibrarySource(
  base: LibrarySourceService,
  registry: PluginRegistry,
  resolver: PluginExecutableResourceResolver,
): LibrarySourceService {
  const pluginEntries = pluginCatalogContributions(registry).map(entry => ({
    ...entry,
    playableEntry: playableEntryFromPluginCatalog(entry.pluginId, entry.item),
  }))
  return {
    ...base,
    list: () =>
      base
        .list()
        .pipe(
          Effect.map(games => [
            ...games,
            ...pluginEntries.map(entry =>
              compatGameFromPlayableEntry(entry.playableEntry),
            ),
          ]),
        ),
    listPlayableEntries: () =>
      listBasePlayableEntries(base).pipe(
        Effect.map(entries => [
          ...entries,
          ...pluginEntries.map(entry => entry.playableEntry),
        ]),
      ),
    launchSpecFor: (id, releaseId) => {
      const lookup = findPluginRelease(registry, id, releaseId)
      if (lookup._tag === "Miss") return base.launchSpecFor(id, releaseId)
      if (lookup._tag === "Invalid") return Effect.fail(lookup.error)
      return resolvePluginLaunch(lookup.contribution, resolver).pipe(
        Effect.map(resolved => resolved.spec),
        Effect.matchEffect({
          onSuccess: spec => Effect.succeed(spec),
          onFailure: error =>
            error.reason === "config"
              ? Effect.succeed(undefined)
              : Effect.fail(error),
        }),
      )
    },
    canResolveLaunchForGame: (id, inputs) => {
      const lookup = findPluginRelease(registry, id, inputs?.releaseId)
      if (lookup._tag === "Miss") {
        return base.canResolveLaunchForGame
          ? base.canResolveLaunchForGame(id, inputs)
          : base.launchSpecFor(id, inputs?.releaseId).pipe(Effect.map(Boolean))
      }
      if (lookup._tag === "Invalid") return Effect.fail(lookup.error)
      return resolvePluginLaunch(lookup.contribution, resolver).pipe(
        Effect.as(true),
        Effect.catch(() => Effect.succeed(false)),
      )
    },
    resolveLaunchForGame: (id, inputs) => {
      const lookup = findPluginRelease(registry, id, inputs?.releaseId)
      if (lookup._tag === "Miss") return base.resolveLaunchForGame(id, inputs)
      if (lookup._tag === "Invalid") return Effect.fail(lookup.error)
      return resolvePluginLaunch(lookup.contribution, resolver)
    },
  }
}

function listBasePlayableEntries(base: LibrarySourceService) {
  if (base.listPlayableEntries) return base.listPlayableEntries()
  return base
    .list()
    .pipe(Effect.map(games => games.map(compatGameToPlayableEntry)))
}

interface PluginCatalogContribution {
  readonly pluginId: PluginId
  readonly localId: string
  readonly item: PluginCatalogItem
}

function pluginCatalogContributions(
  registry: PluginRegistry,
): readonly PluginCatalogContribution[] {
  return configRecordContributions(registry.catalog).flatMap(contribution => {
    if (!isPluginCatalogItem(contribution.record)) return []
    return [
      {
        pluginId: contribution.pluginId,
        localId: contribution.localId,
        item: contribution.record,
      },
    ]
  })
}

function playableEntryFromPluginCatalog(
  pluginId: PluginId,
  item: PluginCatalogItem,
): PlayableLibraryEntry {
  return {
    id: `${pluginId}/${item.id}`,
    itemId: `${pluginId}/${item.id}`,
    title: item.title,
    launchable: true,
    system: "native",
    metadata: { name: item.title },
    userData: { pluginId, pluginItemId: item.id },
    releases: item.releases.map(release => ({
      id: release.id,
      system: "native",
      launchable: true,
      display: release.title ? { title: release.title } : undefined,
    })),
  }
}

function compatGameFromPlayableEntry(
  entry: PlayableLibraryEntry,
): ResolvedGameRecord {
  return {
    id: entry.id,
    system: entry.system ?? "native",
    metadata: { name: entry.title ?? entry.id },
    media: entry.media,
  }
}

function compatGameToPlayableEntry(
  game: ResolvedGameRecord,
): PlayableLibraryEntry {
  const title = game.metadata?.name ?? game.id
  return {
    id: game.id,
    itemId: game.id,
    title,
    launchable: true,
    system: game.system,
    metadata: { name: title },
    media: game.media,
    releases: [{ id: game.system, system: game.system, launchable: true }],
  }
}

interface PluginReleaseContribution {
  readonly pluginId: PluginId
  readonly item: PluginCatalogItem
  readonly release: PluginCatalogItem["releases"][number]
  readonly resource: ExecutablePluginResource
  readonly launch: ProcessPluginLaunch
  readonly playableEntry: PlayableLibraryEntry
  readonly releaseEntry: PlayableReleaseEntry
}

type PluginReleaseLookup =
  | { readonly _tag: "Found"; readonly contribution: PluginReleaseContribution }
  | { readonly _tag: "Invalid"; readonly error: LibraryError }
  | { readonly _tag: "Miss" }

function findPluginRelease(
  registry: PluginRegistry,
  playableId: string,
  releaseId: string | undefined,
): PluginReleaseLookup {
  for (const contribution of pluginCatalogContributions(registry)) {
    const entry = playableEntryFromPluginCatalog(
      contribution.pluginId,
      contribution.item,
    )
    if (entry.id !== playableId) continue
    const release = releaseId
      ? contribution.item.releases.find(candidate => candidate.id === releaseId)
      : contribution.item.releases[0]
    if (!release) {
      return invalidPluginRelease(
        contribution.pluginId,
        playableId,
        `release ${releaseId ?? "<default>"} was not found`,
      )
    }
    if (release.launch.kind !== "process") {
      return invalidPluginRelease(
        contribution.pluginId,
        playableId,
        `unsupported launch kind ${release.launch.kind}`,
      )
    }
    const resource = executableResources(registry).find(
      candidate =>
        candidate.pluginId === contribution.pluginId &&
        candidate.resource.id === release.launch.executable.resource,
    )?.resource
    if (!resource) {
      return invalidPluginRelease(
        contribution.pluginId,
        playableId,
        `missing executable resource ${release.launch.executable.resource}`,
      )
    }
    const releaseEntry = entry.releases.find(
      candidate => candidate.id === release.id,
    )
    if (!releaseEntry) {
      return invalidPluginRelease(
        contribution.pluginId,
        playableId,
        `missing playable release entry ${release.id}`,
      )
    }
    return {
      _tag: "Found",
      contribution: {
        pluginId: contribution.pluginId,
        item: contribution.item,
        release,
        resource,
        launch: release.launch,
        playableEntry: entry,
        releaseEntry,
      },
    }
  }
  return { _tag: "Miss" }
}

function invalidPluginRelease(
  pluginId: PluginId,
  playableId: string,
  diagnostic: string,
): PluginReleaseLookup {
  return {
    _tag: "Invalid",
    error: new LibraryError({
      reason: "config",
      message: `Plugin playable ${playableId} from ${pluginId} is invalid`,
      diagnostic,
    }),
  }
}

function resolvePluginLaunch(
  contribution: PluginReleaseContribution,
  resolver: PluginExecutableResourceResolver,
): Effect.Effect<ResolvedLaunch, LibraryError> {
  return resolver
    .resolveExecutable({
      pluginId: contribution.pluginId,
      resource: contribution.resource,
    })
    .pipe(
      Effect.mapError(
        error =>
          new LibraryError({
            reason: "config",
            message: `Plugin resource ${error.pluginId}/${error.resourceId} is not fulfilled`,
            diagnostic: "path" in error ? error.path : error.message,
          }),
      ),
      Effect.flatMap(executable =>
        Effect.try({
          try: () => {
            const spec: LaunchSpec = {
              command: executable.command,
              args: contribution.launch.args ?? [],
              ...(contribution.launch.env
                ? { env: contribution.launch.env }
                : {}),
              ...((executable.cwd ?? contribution.launch.cwd)
                ? { cwd: executable.cwd ?? contribution.launch.cwd }
                : {}),
            }
            return {
              spec,
              app: undefined,
              release: contribution.releaseEntry,
              playable: contribution.playableEntry,
              ...(contribution.launch.with
                ? { launchCompanions: contribution.launch.with }
                : {}),
            }
          },
          catch: error =>
            new LibraryError({
              reason: "config",
              message: `Plugin playable ${contribution.playableEntry.id} from ${contribution.pluginId} has invalid launch provider options`,
              diagnostic:
                error instanceof Error ? error.message : String(error),
            }),
        }),
      ),
    )
}

function isPluginCatalogItem(
  record: ConfigRecord,
): record is ConfigRecord & PluginCatalogItem {
  const candidate = record as Partial<PluginCatalogItem>
  return (
    candidate.kind === "game" &&
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    Array.isArray(candidate.releases) &&
    candidate.releases.every(isPluginCatalogRelease)
  )
}

function isPluginCatalogRelease(
  value: unknown,
): value is PluginCatalogItem["releases"][number] {
  const candidate = value as Partial<PluginCatalogItem["releases"][number]>
  const launch = candidate.launch as Partial<ProcessPluginLaunch> | undefined
  const executable = launch?.executable as
    | { readonly resource?: unknown }
    | undefined
  return (
    typeof candidate.id === "string" &&
    (candidate.title === undefined || typeof candidate.title === "string") &&
    launch?.kind === "process" &&
    typeof executable?.resource === "string" &&
    (launch.args === undefined ||
      (Array.isArray(launch.args) &&
        launch.args.every(item => typeof item === "string"))) &&
    (launch.cwd === undefined || typeof launch.cwd === "string") &&
    (launch.env === undefined || isStringRecord(launch.env)) &&
    (launch.with === undefined || isRecord(launch.with))
  )
}

function isStringRecord(
  value: unknown,
): value is Readonly<Record<string, string>> {
  return (
    isRecord(value) &&
    Object.values(value).every(item => typeof item === "string")
  )
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
