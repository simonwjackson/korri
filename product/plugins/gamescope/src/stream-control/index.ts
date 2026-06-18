export {
  GAMESCOPE_FPS_STEPS,
  GAMESCOPE_SCALING_FILTERS,
  gamescopeStreamControlCapabilities,
} from "./control-surface"
export type {
  GamescopeCommandClient,
  GamescopeFilterPayload,
  GamescopeFpsPayload,
  GamescopeModePayload,
  GamescopeSharpnessPayload,
  GamescopeStreamControlApplyInput,
  GamescopeStreamControlDescribeInput,
  GamescopeStreamControlDescribeOutput,
} from "./handlers"
export {
  applyGamescopeStreamControl,
  describeGamescopeStreamControl,
  gamescopeAction,
  setGamescopeFilter,
  setGamescopeFps,
  setGamescopeMode,
  setGamescopeSharpness,
} from "./handlers"
