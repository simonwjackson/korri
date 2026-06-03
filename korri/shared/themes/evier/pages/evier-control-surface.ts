import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"

export const FPS_STEPS = [30, 40, 45, 60, 75, 90, 100, 120] as const

// Gamescope's GAMESCOPE_FPS_LIMIT cardinal accepts 0..240; 0 disables the
// compositor-side limiter entirely. Evier surfaces a compact ladder for touch
// operation instead of a freeform numeric input.
export const GAMESCOPE_FPS_STEPS = [
  0, 30, 45, 60, 75, 90, 120, 144, 165, 240,
] as const

export const LINKED_FPS_STEPS = [30, 45, 60, 75, 90, 120] as const

export const RESOLUTION_STEPS = [
  { label: "360p", width: 640, height: 360 },
  { label: "480p", width: 854, height: 480 },
  { label: "540p", width: 960, height: 540 },
  { label: "576p", width: 1024, height: 576 },
  { label: "720p", width: 1280, height: 720 },
  { label: "900p", width: 1600, height: 900 },
  { label: "1080p", width: 1920, height: 1080 },
] as const

export type ControlReadback<T> =
  | { readonly _tag: "known"; readonly value: T }
  | { readonly _tag: "unknown" }
  | { readonly _tag: "unavailable"; readonly reason: string }

export type UnifiedReadback<T> =
  | ControlReadback<T>
  | { readonly _tag: "mixed"; readonly values: readonly T[] }
  | {
      readonly _tag: "diverged"
      readonly moonlight: T
      readonly gamescope: T
    }

export interface EvierControlSurfaceState {
  readonly moonlight: {
    readonly bitrate: ControlReadback<number>
    readonly fps: ControlReadback<number>
    readonly resolution: ControlReadback<number>
  }
  readonly gamescope: {
    readonly fps: ControlReadback<number>
    readonly resolution: ControlReadback<number>
    readonly sharpness: ControlReadback<number>
    readonly filter: ControlReadback<GamescopeScalingFilter>
  }
  readonly linked: {
    readonly fps: UnifiedReadback<number>
    readonly resolution: UnifiedReadback<number>
  }
  readonly brightness: {
    readonly unified: UnifiedReadback<number>
    readonly devices: readonly BrightnessDeviceReadback[]
  }
  readonly battery: {
    readonly percent: ControlReadback<number>
    readonly status: string | null
  }
}

export interface BrightnessDeviceReadback {
  readonly name: string
  readonly percent: ControlReadback<number>
}

export const EvierControlSurface = {
  fromState(state: unknown): EvierControlSurfaceState {
    const moonlightStatus = subsystemStatus(state, "moonlight")
    const gamescopeStatus = subsystemStatus(state, "gamescope")

    const moonlightFps = ifAvailable(moonlightStatus, () =>
      readMoonlightFps(state),
    )
    const gamescopeFps = ifAvailable(gamescopeStatus, () =>
      readGamescopeFps(state),
    )
    const moonlightResolution = ifAvailable(moonlightStatus, () =>
      readMoonlightResolution(state),
    )
    const gamescopeResolution = ifAvailable(gamescopeStatus, () =>
      readGamescopeResolution(state),
    )

    return {
      moonlight: {
        bitrate: ifAvailable(moonlightStatus, () =>
          readMoonlightBitrate(state),
        ),
        fps: moonlightFps,
        resolution: moonlightResolution,
      },
      gamescope: {
        fps: gamescopeFps,
        resolution: gamescopeResolution,
        sharpness: ifAvailable(gamescopeStatus, () =>
          readGamescopeSharpness(state),
        ),
        filter: ifAvailable(gamescopeStatus, () => readGamescopeFilter(state)),
      },
      linked: {
        fps: linkReadbacks(moonlightFps, gamescopeFps),
        resolution: linkReadbacks(moonlightResolution, gamescopeResolution),
      },
      brightness: readBrightness(state),
      battery: readBattery(state),
    }
  },
}

function known<T>(value: T): ControlReadback<T> {
  return { _tag: "known", value }
}

function unknown<T>(): ControlReadback<T> {
  return { _tag: "unknown" }
}

function unavailable<T>(reason: string): ControlReadback<T> {
  return { _tag: "unavailable", reason }
}

function ifAvailable<T>(
  status: { readonly unavailable?: string },
  read: () => ControlReadback<T>,
): ControlReadback<T> {
  return status.unavailable ? unavailable(status.unavailable) : read()
}

function linkReadbacks(
  moonlight: ControlReadback<number>,
  gamescope: ControlReadback<number>,
): UnifiedReadback<number> {
  if (moonlight._tag === "unavailable") return moonlight
  if (gamescope._tag === "unavailable") return gamescope
  if (moonlight._tag !== "known" || gamescope._tag !== "known") {
    return { _tag: "unknown" }
  }
  if (moonlight.value === gamescope.value) return known(moonlight.value)
  return {
    _tag: "diverged",
    moonlight: moonlight.value,
    gamescope: gamescope.value,
  }
}

function subsystemStatus(
  state: unknown,
  key: string,
): { unavailable?: string } {
  const entry = isRecord(state) ? state[key] : undefined
  if (!isRecord(entry)) return { unavailable: "missing" }
  if (entry.status === "disabled") return { unavailable: "disabled" }
  if (entry.status === "error") {
    return {
      unavailable: typeof entry.error === "string" ? entry.error : "error",
    }
  }
  return {}
}

function readMoonlightBitrate(state: unknown): ControlReadback<number> {
  return numberReadback(
    firstNumber(
      moonlightRuntimeSettings(state)?.appliedBitrateKbps,
      moonlightStreamQuality(state)?.bitrateKbps,
    ),
  )
}

function readMoonlightFps(state: unknown): ControlReadback<number> {
  return numberReadback(
    firstNumber(
      moonlightRuntimeSettings(state)?.appliedFps,
      moonlightStreamQuality(state)?.fps,
    ),
  )
}

function readMoonlightResolution(state: unknown): ControlReadback<number> {
  const runtimeResolution = recordField(
    moonlightRuntimeSettings(state),
    "appliedResolution",
  )
  return numberReadback(
    resolutionIndex(
      firstNumber(
        runtimeResolution?.width,
        moonlightStreamQuality(state)?.width,
      ),
      firstNumber(
        runtimeResolution?.height,
        moonlightStreamQuality(state)?.height,
      ),
    ),
  )
}

function readGamescopeFps(state: unknown): ControlReadback<number> {
  return numberReadback(numberField(gamescopeResult(state), "fps"))
}

function readGamescopeResolution(state: unknown): ControlReadback<number> {
  const mode = recordField(gamescopeResult(state), "xwaylandMode")
  return numberReadback(
    resolutionIndex(numberField(mode, "width"), numberField(mode, "height")),
  )
}

function readGamescopeSharpness(state: unknown): ControlReadback<number> {
  return numberReadback(numberField(gamescopeResult(state), "sharpness"))
}

function readGamescopeFilter(
  state: unknown,
): ControlReadback<GamescopeScalingFilter> {
  const filter = gamescopeResult(state)?.filter
  return filter === "linear" ||
    filter === "nearest" ||
    filter === "integer" ||
    filter === "fsr" ||
    filter === "nis"
    ? known(filter)
    : unknown()
}

function readBrightness(
  state: unknown,
): EvierControlSurfaceState["brightness"] {
  const status = subsystemStatus(state, "brightness")
  if (status.unavailable) {
    return { unified: unavailable(status.unavailable), devices: [] }
  }

  const response = okResponse(state, "brightness")
  const devicesValue = isRecord(response) ? response.devices : undefined
  const devices = Array.isArray(devicesValue)
    ? devicesValue.flatMap(device => {
        if (!isRecord(device)) return []
        if (typeof device.name !== "string") return []
        if (typeof device.percent !== "number") return []
        return [
          {
            name: device.name,
            percent: known(clamp(device.percent, 0, 100)),
          } satisfies BrightnessDeviceReadback,
        ]
      })
    : []

  if (devices.length === 0) return { unified: { _tag: "unknown" }, devices }
  const values = devices.flatMap(device =>
    device.percent._tag === "known" ? [device.percent.value] : [],
  )
  if (values.length !== devices.length)
    return { unified: { _tag: "unknown" }, devices }
  const unique = [...new Set(values)]
  return {
    unified:
      unique.length === 1 ? known(unique[0] ?? 0) : { _tag: "mixed", values },
    devices,
  }
}

function readBattery(state: unknown): EvierControlSurfaceState["battery"] {
  const status = subsystemStatus(state, "battery")
  if (status.unavailable) {
    return { percent: unavailable(status.unavailable), status: null }
  }
  const response = okResponse(state, "battery")
  const percent = isRecord(response) ? response.percent : undefined
  return {
    percent:
      typeof percent === "number" ? known(clamp(percent, 0, 100)) : unknown(),
    status:
      isRecord(response) && typeof response.status === "string"
        ? response.status
        : null,
  }
}

function numberReadback(value: number | undefined): ControlReadback<number> {
  return value === undefined ? unknown() : known(value)
}

function okResponse(state: unknown, key: string): unknown {
  const entry = isRecord(state) ? state[key] : undefined
  if (!isRecord(entry) || entry.status !== "ok") return undefined
  return entry.response
}

function rpcResult(response: unknown): Record<string, unknown> | undefined {
  if (!isRecord(response)) return undefined
  const result = response.result
  return isRecord(result) ? result : undefined
}

function moonlightResult(state: unknown): Record<string, unknown> | undefined {
  return rpcResult(okResponse(state, "moonlight"))
}

function gamescopeResult(state: unknown): Record<string, unknown> | undefined {
  return rpcResult(okResponse(state, "gamescope"))
}

function moonlightRuntimeSettings(
  state: unknown,
): Record<string, unknown> | undefined {
  return recordField(moonlightResult(state), "runtimeSettings")
}

function moonlightStreamQuality(
  state: unknown,
): Record<string, unknown> | undefined {
  return recordField(moonlightResult(state), "streamQuality")
}

function recordField(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key]
  return isRecord(value) ? value : undefined
}

function numberField(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key]
  return typeof value === "number" ? value : undefined
}

function firstNumber(...values: readonly unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number")
}

function resolutionIndex(
  width: number | undefined,
  height: number | undefined,
): number | undefined {
  if (width === undefined || height === undefined) return undefined
  const index = RESOLUTION_STEPS.findIndex(
    step => step.width === width && step.height === height,
  )
  return index >= 0 ? index : undefined
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
