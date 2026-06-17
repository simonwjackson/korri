import type { GamescopeScalingFilter } from "../runtime-control"

// Gamescope's GAMESCOPE_FPS_LIMIT cardinal accepts 0..240; 0 disables the
// compositor-side limiter entirely. Product surfaces expose a compact ladder
// for controller/touch operation instead of a freeform numeric input.
export const GAMESCOPE_FPS_STEPS = [
  0, 30, 45, 60, 75, 90, 120, 144, 165, 240,
] as const

export const GAMESCOPE_SCALING_FILTERS = [
  "linear",
  "nearest",
  "integer",
  "fsr",
  "nis",
] as const satisfies readonly GamescopeScalingFilter[]
