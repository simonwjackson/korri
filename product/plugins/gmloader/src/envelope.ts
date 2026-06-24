import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { join } from "node:path"
import type { LaunchSpec } from "@platform/library/launcher"
import { LibraryError } from "@platform/library/library-services"
import type { ResolvedExecutableResource } from "@platform/plugin/resources"
import {
  decodeGmloaderInstalledManifest,
  type GmloaderInstalledManifest,
} from "./manifest"

export interface PrepareGmloaderLaunchEnvelopeInput {
  readonly manifest?: GmloaderInstalledManifest
  readonly manifestPath?: string
  readonly runtime?: ResolvedExecutableResource
  readonly command?: string
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly sdlGameControllerConfig?: string
}

export interface GmloaderLaunchEnvelope {
  readonly spec: LaunchSpec
  readonly manifest: GmloaderInstalledManifest
}

export async function prepareGmloaderLaunchEnvelope(
  input: PrepareGmloaderLaunchEnvelopeInput,
): Promise<GmloaderLaunchEnvelope> {
  const manifest = input.manifest ?? (await readManifest(input.manifestPath))
  await requireReadable(
    join(manifest.gameRoot, "assets", "game.droid"),
    "assets/game.droid",
  )
  await requireReadable(
    join(manifest.gameRoot, "lib", "arm64-v8a", "libyoyo.so"),
    "lib/arm64-v8a/libyoyo.so",
  )
  await requireReadable(manifest.run.configPath, "gmloader.json")

  const command = input.runtime?.command ?? input.command
  if (!command) {
    throw new LibraryError({
      reason: "unavailable",
      message: "GMLoader runtime executable is not available",
    })
  }

  const inheritedLibraryPath = input.env?.LD_LIBRARY_PATH
  const libraryPaths = manifest.run.libraryPaths.join(":")
  const env: Record<string, string> = {
    LD_LIBRARY_PATH: inheritedLibraryPath
      ? `${libraryPaths}:${inheritedLibraryPath}`
      : libraryPaths,
    KORRI_GMLOADER_HOME: manifest.installRoot,
    KORRI_GMLOADER_GAME_ROOT: manifest.gameRoot,
    ...(manifest.compatibility.env ?? {}),
  }
  if (input.sdlGameControllerConfig) {
    env.SDL_GAMECONTROLLERCONFIG = input.sdlGameControllerConfig
  }

  return {
    manifest,
    spec: {
      command,
      args: ["-c", manifest.run.configPath],
      cwd: manifest.gameRoot,
      env,
    },
  }
}

async function readManifest(
  path: string | undefined,
): Promise<GmloaderInstalledManifest> {
  if (!path) {
    throw new LibraryError({
      reason: "config",
      message: "Missing GMLoader manifest path",
    })
  }
  try {
    const manifest = decodeGmloaderInstalledManifest(
      JSON.parse(await readFile(path, "utf8")),
    )
    if (!manifest) throw new Error("invalid manifest")
    return manifest
  } catch (error) {
    throw new LibraryError({
      reason: "config",
      message: `Failed to read GMLoader manifest: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}

async function requireReadable(path: string, label: string): Promise<void> {
  try {
    await access(path, constants.R_OK)
  } catch {
    throw new LibraryError({
      reason: "config",
      message: `Installed GMLoader file is missing: ${label}`,
    })
  }
}
