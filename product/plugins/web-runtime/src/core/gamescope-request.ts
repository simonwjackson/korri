// Maps a web run into a gamescope launch request.
//
// gamescope wrapping is a plugin-owned launch companion: the web runtime emits a
// neutral compositor request and the host hands it to the gamescope plugin as a
// `LaunchMetadata` annotation keyed by the gamescope provider id. This module
// stays free of any gamescope import so the dependency is one-directional.
//
// The produced annotation is shaped to the gamescope policy contract:
//   nested  -> internal render resolution (gamescope -w/-h)
//   output  -> physical output resolution (gamescope -W/-H)
//   scaling -> aspect-fit + pixel filter (sharp upscaling)
//   window  -> fullscreen + force-windows-fullscreen (xwm fullscreens X11 clients)

import { type Dimensions, gamescopeInternalResolution } from "./native-res"

export type GamescopeFilter = "pixel" | "linear" | "fsr"

export const GAMESCOPE_PROVIDER_ID = "@korri:gamescope" as const

export interface WebCompositorRequest {
  readonly internal: Dimensions
  readonly output: Dimensions
  readonly refresh?: number
  readonly filter: GamescopeFilter
}

export interface WebCompositorRequestInput {
  readonly native: Dimensions
  readonly fixedCanvas: boolean
  readonly gap: Dimensions
  readonly output: Dimensions
  readonly refresh?: number
  readonly filter?: GamescopeFilter
}

export function webCompositorRequest(
  input: WebCompositorRequestInput,
): WebCompositorRequest {
  return {
    internal: gamescopeInternalResolution({
      native: input.native,
      fixedCanvas: input.fixedCanvas,
      gap: input.gap,
    }),
    output: input.output,
    ...(input.refresh !== undefined ? { refresh: input.refresh } : {}),
    filter: input.filter ?? "pixel",
  }
}

export function gamescopeAnnotation(request: WebCompositorRequest): object {
  return {
    backend: { type: "wayland" },
    display: {
      nested: {
        width: request.internal.width,
        height: request.internal.height,
        refresh: request.refresh ?? 60,
      },
      output: {
        width: request.output.width,
        height: request.output.height,
      },
    },
    scaling: { scaler: "fit", filter: request.filter },
    window: {
      fullscreen: true,
      forceWindowsFullscreen: true,
      exposeWayland: false,
    },
  }
}
