import type { LaunchSpec } from "@shared/library/launcher"

export type GamescopeBackend = "auto" | "drm" | "sdl" | "wayland" | "headless"

export interface GamescopeOptions {
  readonly enabled: boolean
  readonly command?: string
  readonly backend?: GamescopeBackend
  readonly exposeWayland?: boolean
  readonly args?: readonly string[]
}

const DEFAULT_GAMESCOPE_COMMAND = "gamescope"

export function composeGamescopeLaunchSpec(
  game: LaunchSpec,
  options: GamescopeOptions,
): LaunchSpec {
  if (!options.enabled) return game

  return {
    command: options.command ?? DEFAULT_GAMESCOPE_COMMAND,
    args: [
      ...(options.backend ? ["--backend", options.backend] : []),
      "-f",
      "-b",
      ...(options.exposeWayland ? ["--expose-wayland"] : []),
      ...(options.args ?? []),
      "--",
      game.command,
      ...game.args,
    ],
    env: game.env,
    cwd: game.cwd,
  }
}
