import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ResolvedGameRecord } from "@platform/fixtures/games/game"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  LibraryError,
  type LibrarySourceService,
  type ResolvedLaunch,
} from "@platform/library/library-services"
import type { PlayableLibraryEntry } from "@platform/library/playable-library"
import { Effect } from "effect"
import {
  type PortMasterLaunchEnvelopeInput,
  preparePortMasterLaunchEnvelope,
} from "./envelope"
import type { PortMasterInstalledManifest } from "./installer"
import { KORRI_PORTMASTER_PLUGIN_ID } from "./plugin"

export interface PortMasterInstalledLibrarySourceOptions {
  readonly installRoot: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly prepareLaunch?: (input: PortMasterLaunchEnvelopeInput) => Promise<{
    readonly command: string
    readonly args: readonly string[]
    readonly cwd: string
    readonly env: Readonly<Record<string, string>>
  }>
}

export function withPortMasterInstalledLibrarySource(
  base: LibrarySourceService,
  options: PortMasterInstalledLibrarySourceOptions,
): LibrarySourceService {
  const readEntries = () => loadInstalledEntries(options)
  return {
    ...base,
    list: () =>
      base
        .list()
        .pipe(
          Effect.zipWith(
            readEntries().pipe(
              Effect.map(entries => entries.map(compatGameFromEntry)),
            ),
            (baseGames, portmasterGames) => [...baseGames, ...portmasterGames],
          ),
        ),
    listPlayableEntries: () =>
      listBasePlayableEntries(base).pipe(
        Effect.zipWith(readEntries(), (baseEntries, portmasterEntries) => [
          ...baseEntries,
          ...portmasterEntries.map(entry => entry.playable),
        ]),
      ),
    launchSpecFor: (id, releaseId) =>
      findInstalledEntry(options, id).pipe(
        Effect.flatMap(entry => {
          if (!entry) return base.launchSpecFor(id, releaseId)
          if (releaseId && releaseId !== PORTMASTER_RELEASE_ID) {
            return Effect.succeed(undefined)
          }
          return resolveInstalledLaunch(options, entry).pipe(
            Effect.map(resolved => resolved.spec),
            Effect.matchEffect({
              onSuccess: spec => Effect.succeed(spec),
              onFailure: error =>
                error.reason === "config"
                  ? Effect.succeed(undefined)
                  : Effect.fail(error),
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
              : base
                  .launchSpecFor(id, inputs?.releaseId)
                  .pipe(Effect.map(Boolean))
          }
          if (inputs?.releaseId && inputs.releaseId !== PORTMASTER_RELEASE_ID) {
            return Effect.succeed(false)
          }
          return Effect.succeed(entry.playable.launchable)
        }),
      ),
    resolveLaunchForGame: (id, inputs) =>
      findInstalledEntry(options, id).pipe(
        Effect.flatMap(entry => {
          if (!entry) return base.resolveLaunchForGame(id, inputs)
          if (inputs?.releaseId && inputs.releaseId !== PORTMASTER_RELEASE_ID) {
            return Effect.fail(
              new LibraryError({
                reason: "config",
                message: `PortMaster release ${inputs.releaseId} was not found for ${id}`,
              }),
            )
          }
          return resolveInstalledLaunch(options, entry)
        }),
      ),
  }
}

export function defaultPortMasterInstallRoot(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const explicit = env.KORRI_PORTMASTER_INSTALL_ROOT?.trim()
  if (explicit) return explicit
  const dataHome =
    env.XDG_DATA_HOME ?? (env.HOME ? join(env.HOME, ".local", "share") : "/tmp")
  return join(dataHome, "korri", "portmaster")
}

const PORTMASTER_SYSTEM = "portmaster"
const PORTMASTER_RELEASE_ID = "installed"

interface InstalledEntry {
  readonly playable: PlayableLibraryEntry
  readonly manifest: PortMasterInstalledManifest
}

function listBasePlayableEntries(base: LibrarySourceService) {
  if (base.listPlayableEntries) return base.listPlayableEntries()
  return base
    .list()
    .pipe(Effect.map(games => games.map(playableEntryFromCompatGame)))
}

function loadInstalledEntries(
  options: PortMasterInstalledLibrarySourceOptions,
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
          .map(async name =>
            readInstalledEntry(join(manifestsRoot, name)).catch(() => null),
          ),
      )
      return entries
        .filter((entry): entry is InstalledEntry => entry !== null)
        .sort(
          (left, right) =>
            left.playable.title?.localeCompare(right.playable.title ?? "") ?? 0,
        )
    },
    catch: error =>
      new LibraryError({
        reason: "io",
        message: `Failed to list installed PortMaster manifests: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  })
}

function findInstalledEntry(
  options: PortMasterInstalledLibrarySourceOptions,
  id: string,
): Effect.Effect<InstalledEntry | undefined, LibraryError> {
  return loadInstalledEntries(options).pipe(
    Effect.map(entries => entries.find(entry => entry.playable.id === id)),
  )
}

async function readInstalledEntry(
  path: string,
): Promise<InstalledEntry | null> {
  const manifest = decodeInstalledManifest(
    JSON.parse(await readFile(path, "utf8")),
  )
  if (!manifest) return null
  const playable = playableEntryFromManifest(manifest)
  return { playable, manifest }
}

function decodeInstalledManifest(
  input: unknown,
): PortMasterInstalledManifest | null {
  if (!isRecord(input)) return null
  if (input.schemaVersion !== 1) return null
  if (input.providerId !== KORRI_PORTMASTER_PLUGIN_ID) return null
  if (typeof input.id !== "string") return null
  if (typeof input.title !== "string") return null
  if (typeof input.manifestPath !== "string") return null
  if (typeof input.installRoot !== "string") return null
  if (typeof input.portsRoot !== "string") return null
  if (!isRecord(input.catalog)) return null
  if (!isRecord(input.extracted)) return null
  if (!Array.isArray(input.extracted.launchScripts)) return null
  return input as PortMasterInstalledManifest
}

function playableEntryFromManifest(
  manifest: PortMasterInstalledManifest,
): PlayableLibraryEntry {
  const id = playableIdForManifest(manifest)
  return {
    id,
    itemId: id,
    title: manifest.title,
    launchable: manifest.extracted.launchScripts.length > 0,
    system: PORTMASTER_SYSTEM,
    metadata: { name: manifest.title },
    userData: {
      pluginId: KORRI_PORTMASTER_PLUGIN_ID,
      portmasterId: manifest.id,
      manifestPath: manifest.manifestPath,
    },
    releases: [
      {
        id: PORTMASTER_RELEASE_ID,
        system: PORTMASTER_SYSTEM,
        launchable: manifest.extracted.launchScripts.length > 0,
        target: {
          kind: "file",
          storage: "portmaster",
          path: manifest.manifestPath,
        },
        display: {
          installedAt: manifest.installedAt,
          arch: manifest.catalog.arch,
          runtime: manifest.catalog.runtime,
          launchScripts: manifest.extracted.launchScripts.map(
            script => script.path,
          ),
        },
      },
    ],
  }
}

function playableIdForManifest(manifest: PortMasterInstalledManifest): string {
  return `${KORRI_PORTMASTER_PLUGIN_ID}/${manifest.id.replace(/\.zip$/i, "")}`
}

function compatGameFromEntry(entry: InstalledEntry): ResolvedGameRecord {
  return {
    id: entry.playable.id,
    system: entry.playable.system ?? PORTMASTER_SYSTEM,
    metadata: { name: entry.playable.title ?? entry.playable.id },
    media: entry.playable.media,
  }
}

function playableEntryFromCompatGame(
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

function resolveInstalledLaunch(
  options: PortMasterInstalledLibrarySourceOptions,
  entry: InstalledEntry,
): Effect.Effect<ResolvedLaunch, LibraryError> {
  return Effect.tryPromise({
    try: async () => {
      const env = options.env ?? process.env
      const envelope = await (
        options.prepareLaunch ?? preparePortMasterLaunchEnvelope
      )({
        manifest: entry.manifest,
        shellPath:
          env.KORRI_PORTMASTER_SHELL_PATH?.trim() ||
          "/run/current-system/sw/bin/bash",
        bwrapPath: env.KORRI_PORTMASTER_BWRAP_PATH?.trim() || "bwrap",
        envPath: env.KORRI_PORTMASTER_ENV_PATH?.trim() || "/usr/bin/env",
        useBubblewrap: env.KORRI_PORTMASTER_USE_BUBBLEWRAP !== "false",
        presentation: presentationFromEnv(env),
      })
      const spec: LaunchSpec = {
        command: envelope.command,
        args: [...envelope.args],
        env: envelope.env,
        cwd: envelope.cwd,
      }
      return {
        spec,
        app: { id: KORRI_PORTMASTER_PLUGIN_ID, integration: "generic-process" },
        playable: {
          id: entry.playable.id,
          itemId: entry.playable.itemId,
          title: entry.playable.title,
        },
        release: entry.playable.releases[0],
      } satisfies ResolvedLaunch
    },
    catch: error =>
      new LibraryError({
        reason: "config",
        message: `Failed to prepare PortMaster launch for ${entry.playable.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }),
  })
}

function presentationFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): PortMasterLaunchEnvelopeInput["presentation"] {
  if (env.KORRI_PORTMASTER_PRESENTATION !== "sway-fullscreen") return undefined
  return {
    mode: "sway-fullscreen",
    ...(env.KORRI_PORTMASTER_SWAYMSG_PATH
      ? { swaymsgPath: env.KORRI_PORTMASTER_SWAYMSG_PATH }
      : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  )
}
