import { parsePluginRecordId } from "@platform/plugin"
import {
  RESOLUTION_STEPS,
  type StreamControlCapability,
} from "@platform/stream-control/control-contract"

export {
  FPS_STEPS,
  RESOLUTION_STEPS,
} from "@platform/stream-control/control-contract"

export type ControlReadback<T> =
  | { readonly _tag: "known"; readonly value: T }
  | { readonly _tag: "unknown" }
  | { readonly _tag: "unavailable"; readonly reason: string }

export type UnifiedReadback<T> =
  | ControlReadback<T>
  | { readonly _tag: "mixed"; readonly values: readonly T[] }

export interface StreamControlSurfaceState {
  readonly brightness: {
    readonly unified: UnifiedReadback<number>
    readonly devices: readonly BrightnessDeviceReadback[]
  }
  readonly battery: {
    readonly percent: ControlReadback<number>
    readonly status: string | null
  }
  readonly readControl: (
    control: StreamControlCapability,
  ) => ControlReadback<number | string>
  /**
   * Read a provider-contributed readback value from the generic plugins map
   * (`state.plugins[provider].readback[key]`). Resolution-shaped records are
   * mapped to their RESOLUTION_STEPS index.
   */
  readonly pluginReadback: (
    provider: string,
    key: string,
  ) => ControlReadback<number | string>
}

export interface BrightnessDeviceReadback {
  readonly name: string
  readonly percent: ControlReadback<number>
}

export const StreamControlSurface = {
  fromState(state: unknown): StreamControlSurfaceState {
    const surface = {
      brightness: readBrightness(state),
      battery: readBattery(state),
    }

    return {
      ...surface,
      readControl: control => readControlValue(state, control, surface),
      pluginReadback: (provider, key) =>
        readPluginReadback(state, provider, key),
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

function readControlValue(
  state: unknown,
  control: StreamControlCapability,
  surface: Omit<StreamControlSurfaceState, "readControl">,
): ControlReadback<number | string> {
  if (control.status === "unsupported") {
    return unavailable(control.unavailableReason ?? "unsupported")
  }
  if (control.readback === "brightness.unified") {
    const unified = surface.brightness.unified
    return unified._tag === "mixed" ? unknown() : unified
  }
  if (control.readback === "battery.percent") return surface.battery.percent

  const pluginRef = parsePluginRecordId(control.readback)
  if (!pluginRef) return unknown()
  return readPluginReadback(state, pluginRef.provider, pluginRef.id)
}

function readPluginReadback(
  state: unknown,
  provider: string,
  key: string,
): ControlReadback<number | string> {
  const pluginEntry = recordField(
    recordField(state as object, "plugins"),
    provider,
  )
  const status = pluginStateStatus(pluginEntry)
  if (status.unavailable) return unavailable(status.unavailable)
  const readback = recordField(pluginEntry, "readback")
  const value = readback?.[key]
  if (typeof value === "number" || typeof value === "string") {
    return known(value)
  }
  const resolution = isRecord(value)
    ? resolutionIndex(numberField(value, "width"), numberField(value, "height"))
    : undefined
  return numberReadback(resolution)
}

function pluginStateStatus(entry: Record<string, unknown> | undefined): {
  unavailable?: string
} {
  if (!entry) return { unavailable: "missing" }
  if (entry.status === "disabled") return { unavailable: "disabled" }
  if (entry.status === "error") {
    return {
      unavailable: typeof entry.error === "string" ? entry.error : "error",
    }
  }
  return {}
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
  record: object | Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = isRecord(record) ? record[key] : undefined
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
