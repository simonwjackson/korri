import type { LaunchSpec } from "@shared/library/launcher"
import {
  composeGamescopeLaunchSpec,
  type GamescopeOptions,
} from "../../../../../tools/device/game-stream-fullscreen"

/**
 * Build a Moonlight `LaunchSpec` for `gamescope -- moonlight stream <host> <gameId>`
 * (or a bare `moonlight stream <host> <gameId>` when gamescope is disabled).
 *
 * Mirrors `composeGamescopeLaunchSpec` for local launches. The server's
 * `app.library.launch` handler calls this to dispatch remote-source (Moonlight)
 * launches through the same `Launcher` / `ForegroundSessionHost` seam used by
 * local launches.
 *
 * Intentionally minimal: no `moonlightControl` env coupling, no input preflight,
 * no `--mapping` / `--platform` flags. The kiosk image's sessiond unit is
 * responsible for env/PATH; this composer just builds the command shape.
 */
export interface ComposeMoonlightLaunchSpecOptions {
  /** Peer hostname or IP (IPv6 callers must strip brackets — see `moonlightHostFromControlUrl`). */
  readonly host: string
  /** Game id passed to `moonlight stream`. */
  readonly gameId: string
  /** Gamescope policy. Defaults to disabled when omitted. */
  readonly gamescope?: GamescopeOptions
  /** Override `moonlight` command. Defaults to env or `"moonlight"`. */
  readonly command?: string
}

export function composeMoonlightLaunchSpec(
  options: ComposeMoonlightLaunchSpecOptions,
): LaunchSpec {
  if (!options.host)
    throw new Error("composeMoonlightLaunchSpec: host is required")
  if (!options.gameId)
    throw new Error("composeMoonlightLaunchSpec: gameId is required")

  const command =
    options.command ?? moonlightCommandFromEnv() ?? DEFAULT_MOONLIGHT_COMMAND
  const args = ["stream", options.host, options.gameId]

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

const DEFAULT_MOONLIGHT_COMMAND = "moonlight"

function moonlightCommandFromEnv(): string | undefined {
  const value = process.env.KORRI_MOONLIGHT_COMMAND
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
