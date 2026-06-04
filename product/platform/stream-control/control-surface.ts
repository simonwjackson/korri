import type { GamescopeScalingFilter } from "@platform/gamescope-control/gamescope-control-protocol"
import { RESOLUTION_STEPS } from "@platform/stream-control/control-contract"

export {
  FPS_STEPS,
  GAMESCOPE_FPS_STEPS,
  LINKED_FPS_STEPS,
  RESOLUTION_STEPS,
} from "@platform/stream-control/control-contract"

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

export interface StreamControlSurfaceState {
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

export const StreamControlSurface = {
  fromState(state: unknown): StreamControlSurfaceState {
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
    numberField(okReadback(state, "moonlight"), "bitrateKbps"),
  )
}

function readMoonlightFps(state: unknown): ControlReadback<number> {
  return numberReadback(numberField(okReadback(state, "moonlight"), "fps"))
}

function readMoonlightResolution(state: unknown): ControlReadback<number> {
  const resolution = recordField(okReadback(state, "moonlight"), "resolution")
  return numberReadback(
    resolutionIndex(
      numberField(resolution, "width"),
      numberField(resolution, "height"),
    ),
  )
}

function readGamescopeFps(state: unknown): ControlReadback<number> {
  return numberReadback(numberField(okReadback(state, "gamescope"), "fps"))
}

function readGamescopeResolution(state: unknown): ControlReadback<number> {
  const resolution = recordField(okReadback(state, "gamescope"), "resolution")
  return numberReadback(
    resolutionIndex(
      numberField(resolution, "width"),
      numberField(resolution, "height"),
    ),
  )
}

function readGamescopeSharpness(state: unknown): ControlReadback<number> {
  return numberReadback(
    numberField(okReadback(state, "gamescope"), "sharpness"),
  )
}

function readGamescopeFilter(
  state: unknown,
): ControlReadback<GamescopeScalingFilter> {
  const filter = okReadback(state, "gamescope")?.filter
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
): StreamControlSurfaceState["brightness"] {
  const status = subsystemStatus(state, "brightness")
  if (status.unavailable) {
    return { unified: unavailable(status.unavailable), devices: [] }
  }

  const readback = okReadback(state, "brightness")
  const devicesValue = isRecord(readback) ? readback.devices : undefined
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

function readBattery(state: unknown): StreamControlSurfaceState["battery"] {
  const status = subsystemStatus(state, "battery")
  if (status.unavailable) {
    return { percent: unavailable(status.unavailable), status: null }
  }
  const readback = okReadback(state, "battery")
  const percent = isRecord(readback) ? readback.percent : undefined
  return {
    percent:
      typeof percent === "number" ? known(clamp(percent, 0, 100)) : unknown(),
    status:
      isRecord(readback) && typeof readback.status === "string"
        ? readback.status
        : null,
  }
}

function numberReadback(value: number | undefined): ControlReadback<number> {
  return value === undefined ? unknown() : known(value)
}

function okReadback(
  state: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const entry = isRecord(state) ? state[key] : undefined
  if (!isRecord(entry) || entry.status !== "ok") return undefined
  return isRecord(entry.readback) ? entry.readback : undefined
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
