import type { LaunchSpec } from "@shared/library/launcher"
import {
  composeGamescopeLaunchSpec,
  type GamescopeOptions,
} from "../../../../../tools/device/game-stream-fullscreen"

/**
 * Build a Moonlight `LaunchSpec` for `gamescope -- moonlight stream -app "Korri Stream" <host>`
 * (or a bare `moonlight stream -app "Korri Stream" <host>` when gamescope is disabled).
 *
 * Mirrors `composeGamescopeLaunchSpec` for local launches. The server's
 * `app.library.launch` handler calls this to dispatch remote-source (Moonlight)
 * launches through the same `Launcher` / `ForegroundSessionHost` seam used by
 * local launches.
 *
 * Remote-source game identity is carried by the peer `prepare` intent. The
 * Moonlight app stays the stable Sunshine launcher (`Korri Stream`) so the
 * source machine's runner can consume `/run/korri-game-stream/next-launch.json`.
 */
export interface ComposeMoonlightLaunchSpecOptions {
  /** Peer hostname or IP (IPv6 callers must strip brackets — see `moonlightHostFromControlUrl`). */
  readonly host: string
  /** Sunshine app name. Defaults to `Korri Stream`. */
  readonly appName?: string
  /** Gamescope policy. Defaults to disabled when omitted. */
  readonly gamescope?: GamescopeOptions
  /** Override `moonlight` command. Defaults to env or `"moonlight"`. */
  readonly command?: string
  /** Override Moonlight Embedded platform. Defaults to `KORRI_MOONLIGHT_PLATFORM`. */
  readonly platform?: string
  /** Override controller mapping file. Defaults to `KORRI_MOONLIGHT_MAPPING_FILE`. */
  readonly mappingFile?: string
}

export function composeMoonlightLaunchSpec(
  options: ComposeMoonlightLaunchSpecOptions,
): LaunchSpec {
  if (!options.host)
    throw new Error("composeMoonlightLaunchSpec: host is required")

  const appName = options.appName ?? DEFAULT_APP_NAME
  if (!appName.trim())
    throw new Error("composeMoonlightLaunchSpec: appName is required")

  const command =
    options.command ?? moonlightCommandFromEnv() ?? DEFAULT_MOONLIGHT_COMMAND
  const platform = options.platform ?? moonlightPlatformFromEnv()
  const mappingFile = options.mappingFile ?? moonlightMappingFileFromEnv()
  const args = [
    "stream",
    ...(platform ? ["-platform", platform] : []),
    ...(mappingFile ? ["-mapping", mappingFile] : []),
    "-app",
    appName,
    options.host,
  ]

  return composeGamescopeLaunchSpec(
    { command, args },
    options.gamescope ?? { enabled: false },
  )
}

/**
 * Extract the host portion of a peer `controlUrl` for use as Moonlight's
 * `<host>` argument. Strips IPv6 brackets (`[::1]` → `::1`).
 */
export function moonlightHostFromControlUrl(controlUrl: string): string {
  if (!controlUrl) {
    throw new Error(
      `moonlightHostFromControlUrl: controlUrl is required (got ${JSON.stringify(controlUrl)})`,
    )
  }
  let url: URL
  try {
    url = new URL(controlUrl)
  } catch {
    throw new Error(
      `moonlightHostFromControlUrl: invalid controlUrl ${JSON.stringify(controlUrl)}`,
    )
  }
  // URL.hostname keeps IPv6 brackets stripped already for IPv6, but defensively
  // remove any leading/trailing `[` `]` if a caller hands us something exotic.
  return url.hostname.replace(/^\[/, "").replace(/\]$/, "")
}

const DEFAULT_APP_NAME = "Korri Stream"
const DEFAULT_MOONLIGHT_COMMAND = "moonlight"

function moonlightCommandFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_COMMAND")
}

function moonlightPlatformFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_PLATFORM")
}

function moonlightMappingFileFromEnv(): string | undefined {
  return nonEmptyEnv("KORRI_MOONLIGHT_MAPPING_FILE")
}

function nonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
