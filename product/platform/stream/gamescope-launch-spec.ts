import type { LaunchSpec } from "@platform/library/launcher"

export type GamescopeBackend = "auto" | "drm" | "sdl" | "wayland" | "headless"

export interface GamescopeOptions {
  readonly enabled: boolean
  readonly command?: string
  readonly backend?: GamescopeBackend
  readonly exposeWayland?: boolean
  readonly args?: readonly string[]
  /**
   * Run the nested game through Gamescope's Xwayland (X11) path instead of
   * letting it connect as a native-Wayland client. Implemented by clearing
   * WAYLAND_DISPLAY for the inner process (`env -u WAYLAND_DISPLAY`).
   *
   * Required on RK3566 / Mali-G52 (RG353M): native-Wayland clients (e.g.
   * RetroArch) intermittently deadlock in their own Wayland event dispatch
   * under Gamescope there, whereas the Xwayland path is rock solid. Off by
   * default so Adreno/SM8550-class hardware keeps native-Wayland behaviour.
   */
  readonly forceXwayland?: boolean
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
      ...(options.forceXwayland ? ["env", "-u", "WAYLAND_DISPLAY"] : []),
      game.command,
      ...game.args,
    ],
    env: game.env,
    cwd: game.cwd,
  }
}
