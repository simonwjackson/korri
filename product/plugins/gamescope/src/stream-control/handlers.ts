import type {
  GamescopeControlClient,
  GamescopeScalingFilter,
} from "../runtime-control"

export interface GamescopeModePayload {
  readonly width: number
  readonly height: number
}

export interface GamescopeFpsPayload {
  readonly fps: number
}

export interface GamescopeFilterPayload {
  readonly filter: GamescopeScalingFilter
}

export interface GamescopeSharpnessPayload {
  readonly sharpness: number
}

export type GamescopeCommandClient = Pick<
  GamescopeControlClient,
  "requestCommand" | "setFilter" | "setMode" | "setSharpness"
>

export const setGamescopeMode = (
  client: GamescopeCommandClient,
  payload: GamescopeModePayload,
) => client.setMode(payload)

export const setGamescopeFps = (
  client: GamescopeCommandClient,
  payload: GamescopeFpsPayload,
) => client.requestCommand("fps.set", payload)

export const setGamescopeFilter = (
  client: GamescopeCommandClient,
  payload: GamescopeFilterPayload,
) => client.setFilter(payload)

export const setGamescopeSharpness = (
  client: GamescopeCommandClient,
  payload: GamescopeSharpnessPayload,
) => client.setSharpness(payload)
