export interface StreamControlClient {
  readonly getControls?: () => Promise<unknown>
  readonly getState: () => Promise<unknown>
  readonly applyAction: (payload: {
    readonly action: string
    readonly payload: Record<string, unknown>
  }) => Promise<unknown>
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
}

export type StreamControlAction = string

/** @deprecated Use StreamControlClient for product-accessible controls. */
export type EvierStreamControlController = StreamControlClient
