import type { ScheduledAction } from "./evier-control-state"
import {
  type ControlReadback,
  FPS_STEPS,
  GAMESCOPE_FPS_STEPS,
  LINKED_FPS_STEPS,
  RESOLUTION_STEPS,
  type UnifiedReadback,
} from "@shared/stream-control/control-surface"

export interface SliderSpec {
  readonly id: string
  readonly label: string
  readonly action: ScheduledAction
  readonly initial: number
  readonly min: number
  readonly max: number
  readonly step: number
  readonly stepper: number
  readonly accent: "moonlight" | "gamescope" | "linked"
  readonly hint?: string
  readonly format: (value: number) => string
  readonly payload: (value: number) => Record<string, unknown>
}

export function knownValue<T>(readback: ControlReadback<T>): T | undefined {
  return readback._tag === "known" ? readback.value : undefined
}

export function knownUnifiedNumber(
  readback: UnifiedReadback<number>,
): number | undefined {
  return readback._tag === "known" ? readback.value : undefined
}

export function knownStepIndex(
  readback: ControlReadback<number> | UnifiedReadback<number>,
  steps: readonly number[],
): number | undefined {
  if (readback._tag !== "known") return undefined
  const index = steps.indexOf(readback.value)
  return index >= 0 ? index : undefined
}

export const brightnessSpec: SliderSpec = {
  id: "evier-brightness",
  label: "Display brightness",
  action: "setBrightness",
  initial: 50,
  min: 0,
  max: 100,
  step: 1,
  stepper: 5,
  accent: "linked",
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
    action: "setBrightness",
    initial: knownValue(device.percent) ?? 50,
    min: 0,
    max: 100,
    step: 1,
    stepper: 5,
    accent: "linked",
    hint: device.name,
    format: value => `${value}%`,
    payload: value => ({ percent: value, device: device.name }),
  }
}

export const linkedResolutionSpec: SliderSpec = {
  id: "evier-linked-resolution",
  label: "Resolution",
  action: "setLinkedResolution",
  initial: RESOLUTION_STEPS.length - 1,
  min: 0,
  max: RESOLUTION_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "linked",
  hint: "Applies to the active session output and stream source",
  format: value => RESOLUTION_STEPS[value]?.label ?? "1080p",
  payload: value => {
    const resolution = RESOLUTION_STEPS[value] ?? RESOLUTION_STEPS.at(-1)
    return { width: resolution.width, height: resolution.height }
  },
}

export const linkedFpsSpec: SliderSpec = {
  id: "evier-linked-fps",
  label: "FPS",
  action: "setLinkedFps",
  initial: LINKED_FPS_STEPS.length - 1,
  min: 0,
  max: LINKED_FPS_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "linked",
  hint: "30, 45, 60, 75, 90, 120 FPS",
  format: value => `${LINKED_FPS_STEPS[value] ?? 120} FPS`,
  payload: value => ({ fps: LINKED_FPS_STEPS[value] ?? 120 }),
}

const moonlightBitrateSpecBase: SliderSpec = {
  id: "evier-moonlight-bitrate",
  label: "Moonlight bitrate",
  action: "setMoonlightBitrate",
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

export const unifiedBitrateSpec: SliderSpec = {
  ...moonlightBitrateSpecBase,
  id: "evier-unified-bitrate",
  label: "Bitrate",
}

export const moonlightBitrateSpec: SliderSpec = {
  ...moonlightBitrateSpecBase,
}

export const moonlightFpsSpec: SliderSpec = {
  id: "evier-moonlight-fps",
  label: "Moonlight FPS",
  action: "setMoonlightFps",
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
  action: "setMoonlightResolution",
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

export const gamescopeResolutionSpec: SliderSpec = {
  ...moonlightResolutionSpec,
  id: "evier-gamescope-resolution",
  label: "Gamescope resolution",
  action: "setGamescopeMode",
  accent: "gamescope",
}

export const gamescopeFpsSpec: SliderSpec = {
  id: "evier-gamescope-fps",
  label: "Gamescope FPS cap",
  action: "setGamescopeFps",
  initial: 0,
  min: 0,
  max: GAMESCOPE_FPS_STEPS.length - 1,
  step: 1,
  stepper: 1,
  accent: "gamescope",
  hint: "Off, 30, 45, 60, 75, 90, 120, 144, 165, 240",
  format: value => {
    const fps = GAMESCOPE_FPS_STEPS[value] ?? 0
    return fps === 0 ? "Off" : `${fps} FPS`
  },
  payload: value => ({ fps: GAMESCOPE_FPS_STEPS[value] ?? 0 }),
}

const gamescopeSharpnessSpecBase: SliderSpec = {
  id: "evier-gamescope-sharpness",
  label: "Gamescope sharpness",
  action: "setGamescopeSharpness",
  initial: 10,
  min: 0,
  max: 20,
  step: 1,
  stepper: 1,
  accent: "gamescope",
  hint: "0–20",
  format: value => String(value),
  payload: value => ({ sharpness: value }),
}

export const unifiedSharpnessSpec: SliderSpec = {
  ...gamescopeSharpnessSpecBase,
  id: "evier-unified-sharpness",
  label: "Sharpness",
}

export const gamescopeSharpnessSpec: SliderSpec = {
  ...gamescopeSharpnessSpecBase,
}
