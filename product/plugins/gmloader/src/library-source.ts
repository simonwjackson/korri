import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError, type LibrarySourceService, type ResolvedLaunch } from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import type { ResolvedExecutableResource } from "@platform/plugin/resources"
import { Effect } from "effect"
import { prepareGmloaderLaunchEnvelope } from "./envelope"
import { decodeGmloaderInstalledManifest, GMLOADER_RELEASE_ID, GMLOADER_SYSTEM_ID, type GmloaderInstalledManifest } from "./manifest"
import { KORRI_GMLOADER_PLUGIN_ID } from "./plugin"

export interface GmloaderInstalledLibrarySourceOptions {
  readonly installRoot: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly command?: string
  readonly resolveRuntime?: () => Effect.Effect<ResolvedExecutableResource, LibraryError>
}

interface InstalledEntry {
  readonly playable: PlayableLibraryEntry
  readonly manifest: GmloaderInstalledManifest
}

export function withGmloaderInstalledLibrarySource(
  base: LibrarySourceService,
  options: GmloaderInstalledLibrarySourceOptions,
): LibrarySourceService {
  const readEntries = () => loadInstalledEntries(options)
  return {
    ...base,
    list: () =>
      base.list().pipe(
        Effect.zipWith(readEntries().pipe(Effect.map(entries => entries.map(gameFromEntry))), (baseGames, gmloaderGames) => [
          ...baseGames,
          ...gmloaderGames,
        ]),
      ),
    listPlayableEntries: () =>
      listBasePlayableEntries(base).pipe(
        Effect.zipWith(readEntries(), (baseEntries, gmloaderEntries) => [
          ...baseEntries,
          ...gmloaderEntries.map(entry => entry.playable),
        ]),
      ),
    launchSpecFor: (id, releaseId) =>
      findInstalledEntry(options, id).pipe(
        Effect.flatMap(entry => {
          if (!entry) return base.launchSpecFor(id, releaseId)
          if (releaseId && releaseId !== GMLOADER_RELEASE_ID) return Effect.succeed(undefined)
          return resolveInstalledLaunch(options, entry).pipe(
            Effect.map(resolved => resolved.spec),
            Effect.matchEffect({
              onSuccess: spec => Effect.succeed(spec),
              onFailure: error => (error.reason === "config" ? Effect.succeed(undefined) : Effect.fail(error)),
            }),
          )
        }),
      ),
    canResolveLaunchForGame: (id, inputs) =>
      findInstalledEntry(options, id).pipe(
        Effect.flatMap(entry => {
          if (!entry) {
            return base.canResolveLaunchForGame
              ? base.canResolveLaunchForGame(id, inputs)
              : base.launchSpecFor(id, inputs?.releaseId).pipe(Effect.map(Boolean))
          }
          if (inputs?.releaseId && inputs.releaseId !== GMLOADER_RELEASE_ID) return Effect.succeed(false)
          return Effect.succeed(entry.playable.launchable)
        }),
      ),
    resolveLaunchForGame: (id, inputs) =>
      findInstalledEntry(options, id).pipe(
        Effect.flatMap(entry => {
          if (!entry) return base.resolveLaunchForGame(id, inputs)
          if (inputs?.releaseId && inputs.releaseId !== GMLOADER_RELEASE_ID) {
            return Effect.fail(new LibraryError({ reason: "config", message: `GMLoader release ${inputs.releaseId} was not found for ${id}` }))
          }
          return resolveInstalledLaunch(options, entry)
        }),
      ),
  }
}

export function defaultGmloaderInstallRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const explicit = env.KORRI_GMLOADER_INSTALL_ROOT?.trim()
  if (explicit) return explicit
  const dataHome = env.XDG_DATA_HOME ?? (env.HOME ? join(env.HOME, ".local", "share") : "/tmp")
  return join(dataHome, "korri", "gmloader")
}

function listBasePlayableEntries(base: LibrarySourceService) {
  if (base.listPlayableEntries) return base.listPlayableEntries()
  return base.list().pipe(Effect.map(games => games.map(playableEntryFromGame)))
}

function loadInstalledEntries(
  options: GmloaderInstalledLibrarySourceOptions,
): Effect.Effect<readonly InstalledEntry[], LibraryError> {
  return Effect.tryPromise({
    try: async () => {
      const manifestsRoot = join(options.installRoot, "manifests")
      const names = await readdir(manifestsRoot).catch(error => {
        if (isMissingPath(error)) return []
        throw error
      })
      const entries = await Promise.all(
        names
          .filter(name => name.endsWith(".json"))
          .sort((left, right) => left.localeCompare(right))
          .map(async name => readInstalledEntry(join(manifestsRoot, name), options).catch(() => null)),
      )
      return entries.filter((entry): entry is InstalledEntry => entry !== null)
    },
    catch: error =>
      new LibraryError({
        reason: "io",
        message: `Failed to list installed GMLoader manifests: ${error instanceof Error ? error.message : String(error)}`,
      }),
  })
}

function findInstalledEntry(
  options: GmloaderInstalledLibrarySourceOptions,
  id: string,
): Effect.Effect<InstalledEntry | undefined, LibraryError> {
  return loadInstalledEntries(options).pipe(Effect.map(entries => entries.find(entry => entry.playable.id === id)))
}

async function readInstalledEntry(
  path: string,
  options: GmloaderInstalledLibrarySourceOptions,
): Promise<InstalledEntry | null> {
  const manifest = decodeGmloaderInstalledManifest(JSON.parse(await readFile(path, "utf8")), KORRI_GMLOADER_PLUGIN_ID)
  if (!manifest) return null
  return {
    manifest,
    playable: playableEntryFromManifest(manifest, runtimeConfigured(options)),
  }
}

function playableEntryFromManifest(
  manifest: GmloaderInstalledManifest,
  launchable: boolean,
): PlayableLibraryEntry {
  const id = playableIdForManifest(manifest)
  return {
    id,
    itemId: id,
    title: manifest.title,
    launchable,
    system: GMLOADER_SYSTEM_ID,
    metadata: { name: manifest.title },
    userData: {
      pluginId: KORRI_GMLOADER_PLUGIN_ID,
      gmloaderId: manifest.id,
      manifestPath: manifest.manifestPath,
    },
    releases: [
      {
        id: GMLOADER_RELEASE_ID,
        system: GMLOADER_SYSTEM_ID,
        launchable,
        display: { title: "Installed GMLoader payload" },
      },
    ],
  }
}

function playableIdForManifest(manifest: GmloaderInstalledManifest): string {
  return `${KORRI_GMLOADER_PLUGIN_ID}/${manifest.id}`
}

function gameFromEntry(entry: InstalledEntry): ResolvedGameRecord {
  return {
    id: entry.playable.id,
    system: GMLOADER_SYSTEM_ID,
    metadata: { name: entry.playable.title ?? entry.playable.id },
  }
}

function playableEntryFromGame(game: ResolvedGameRecord): PlayableLibraryEntry {
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

function runtimeConfigured(options: GmloaderInstalledLibrarySourceOptions): boolean {
  return Boolean(options.command || options.resolveRuntime)
}

function resolveInstalledLaunch(
  options: GmloaderInstalledLibrarySourceOptions,
  entry: InstalledEntry,
): Effect.Effect<ResolvedLaunch, LibraryError> {
  const runtime: Effect.Effect<ResolvedExecutableResource | undefined, LibraryError> = options.resolveRuntime
    ? options.resolveRuntime()
    : Effect.succeed(undefined)
  return runtime.pipe(
    Effect.flatMap(resolvedRuntime =>
      Effect.tryPromise({
        try: () =>
          prepareGmloaderLaunchEnvelope({
            manifest: entry.manifest,
            runtime: resolvedRuntime,
            command: options.command,
            env: options.env,
          }),
        catch: error =>
          error instanceof LibraryError
            ? error
            : new LibraryError({ reason: "config", message: error instanceof Error ? error.message : String(error) }),
      }),
    ),
    Effect.map(envelope => ({
      spec: envelope.spec,
      playable: {
        id: entry.playable.id,
        itemId: entry.playable.itemId,
        title: entry.playable.title,
      },
      release: entry.playable.releases?.[0],
    })),
  )
}

function isMissingPath(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { readonly code?: unknown }).code === "ENOENT"
}
