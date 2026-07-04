import type { StreamControlCapability } from "@platform/stream-control/control-contract"
import {
  type ControlReadback,
  FPS_STEPS,
  RESOLUTION_STEPS,
} from "@platform/stream-control/control-surface"
import type { ScheduledAction } from "./evier-control-state"

export interface SliderSpec {
  readonly id: string
  readonly label: string
  readonly action: ScheduledAction
  readonly initial: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly stepper: number
  readonly accent: "moonlight" | "plugin" | "device"
  readonly hint?: string
  readonly format: (value: number) => string
  readonly payload: (value: number) => Record<string, unknown>
}

export function knownValue<T>(readback: ControlReadback<T>): T | undefined {
  return readback._tag === "known" ? readback.value : undefined
}

export function knownStepIndex(
  readback: ControlReadback<number>,
  steps: readonly number[],
): number | undefined {
  if (readback._tag !== "known") return undefined
  const index = steps.indexOf(readback.value)
  return index >= 0 ? index : undefined
}

export const brightnessSpec: SliderSpec = {
  id: "evier-brightness",
  label: "Display brightness",
  action: "app.stream-control.brightness.set",
  initial: 50,
  min: 0,
  max: 100,
  step: 1,
  stepper: 5,
  accent: "device",
  hint: "0–100%",
  format: value => `${value}%`,
  payload: value => ({ percent: value }),
}

export function brightnessDeviceSpec(
  device: { readonly name: string; readonly percent: ControlReadback<number> },
  index: number,
): SliderSpec {
  return {
    id: `evier-brightness-${device.name}`,
    label: `Display ${index + 1} brightness`,
    action: "app.stream-control.brightness.set",
    initial: knownValue(device.percent) ?? 50,
    min: 0,
    max: 100,
    step: 1,
    stepper: 5,
    accent: "device",
    hint: device.name,
    format: value => `${value}%`,
    payload: value => ({ percent: value, device: device.name }),
  }
}

const moonlightBitrateSpecBase: SliderSpec = {
  id: "evier-moonlight-bitrate",
  label: "Moonlight bitrate",
  action: "@korri:moonlight/bitrate.set",
  initial: 12_000,
  min: 500,
  max: 150_000,
  step: 500,
  stepper: 500,
  accent: "moonlight",
  hint: "0.5–150 Mbps",
  format: value => `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} Mbps`,
  payload: value => ({ bitrateKbps: value }),
}

export const moonlightBitrateSpec: SliderSpec = {
  ...moonlightBitrateSpecBase,
}

export const moonlightFpsSpec: SliderSpec = {
  id: "evier-moonlight-fps",
  label: "Moonlight FPS",
  action: "@korri:moonlight/fps.set",
  initial: 3,
  min: 0,
  max: FPS_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "moonlight",
  hint: "30, 40, 45, 60, 75, 90, 100, 120",
  format: value => `${FPS_STEPS[value] ?? 60} FPS`,
  payload: value => ({ fps: FPS_STEPS[value] ?? 60 }),
}

export const moonlightResolutionSpec: SliderSpec = {
  id: "evier-moonlight-resolution",
  label: "Moonlight resolution",
  action: "@korri:moonlight/resolution.set",
  initial: RESOLUTION_STEPS.length - 1,
  min: 0,
  max: RESOLUTION_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "moonlight",
  hint: "360p, 480p, 540p, 576p, 720p, 900p, 1080p",
  format: value => RESOLUTION_STEPS[value]?.label ?? "1080p",
  payload: value => {
    const resolution = RESOLUTION_STEPS[value] ?? RESOLUTION_STEPS.at(-1)
    return { width: resolution.width, height: resolution.height }
  },
}

export function sliderSpecFromCapability(
  control: StreamControlCapability,
): SliderSpec | undefined {
  if (!control.action || control.access !== "read-write") return undefined
  const spec = control.value
  if (spec.kind === "range") {
    return {
      id: control.id,
      label: control.label,
      action: control.action,
      initial: spec.min,
      min: spec.min,
      max: spec.max,
      step: spec.step,
      stepper: spec.step,
      accent: "plugin",
      format: value => String(value),
      payload: value => ({ [valueKey(control)]: value }),
    }
  }
  if (spec.kind === "steps") {
    return {
      id: control.id,
      label: control.label,
      action: control.action,
      initial: 0,
      min: 0,
      max: spec.values.length - 1,
      step: 1,
      stepper: 1,
      accent: "plugin",
      hint: spec.values.join(", "),
      format: value => String(spec.values[value] ?? value),
      payload: value => ({ [valueKey(control)]: spec.values[value] }),
    }
  }
  if (spec.kind === "resolutions") {
    return {
      id: control.id,
      label: control.label,
      action: control.action,
      initial: spec.values.length - 1,
      min: 0,
      max: spec.values.length - 1,
      step: 1,
      stepper: 1,
      accent: "plugin",
      format: value => spec.values[value]?.label ?? String(value),
      payload: value => {
        const resolution = spec.values[value] ?? spec.values.at(-1)
        return { width: resolution.width, height: resolution.height }
      },
    }
  }
  return undefined
}

function valueKey(control: StreamControlCapability): string {
  const local = control.id.split("/").at(-1) ?? "value"
  if (local.includes("fps")) return "fps"
  if (local.includes("sharpness")) return "sharpness"
  return "value"
}
