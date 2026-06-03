import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"

export interface StreamControlClient {
  readonly getControls: () => Promise<unknown>
  readonly getState: () => Promise<unknown>
  readonly setBrightness: (payload: {
    readonly percent: number
    readonly device?: string
  }) => Promise<unknown>
  readonly setMoonlightBitrate: (payload: {
    readonly bitrateKbps: number
  }) => Promise<unknown>
  readonly setMoonlightFps: (payload: {
    readonly fps: number
  }) => Promise<unknown>
  readonly setMoonlightResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setLinkedFps: (payload: { readonly fps: number }) => Promise<unknown>
  readonly setLinkedResolution: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setGamescopeMode: (payload: {
    readonly width: number
    readonly height: number
  }) => Promise<unknown>
  readonly setGamescopeFps: (payload: {
    readonly fps: number
  }) => Promise<unknown>
  readonly setGamescopeFilter: (payload: {
    readonly filter: GamescopeScalingFilter
  }) => Promise<unknown>
  readonly setGamescopeSharpness: (payload: {
    readonly sharpness: number
  }) => Promise<unknown>
}

export type StreamControlAction = Exclude<
  keyof StreamControlClient,
  "getControls" | "getState"
>
