import type { GamescopeScalingFilter } from "@shared/gamescope-control/gamescope-control-protocol"

export const FPS_STEPS = [30, 40, 45, 60, 75, 90, 100, 120] as const

// Gamescope's GAMESCOPE_FPS_LIMIT cardinal accepts 0..240; 0 disables the
// compositor-side limiter entirely. Product surfaces expose a compact ladder
// for controller/touch operation instead of a freeform numeric input.
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

export const GAMESCOPE_SCALING_FILTERS = [
  "linear",
  "nearest",
  "integer",
  "fsr",
  "nis",
] as const satisfies readonly GamescopeScalingFilter[]

export type StreamControlSubsystem =
  | "moonlight"
  | "gamescope"
  | "linked"
  | "brightness"
  | "battery"

export type StreamControlAccess = "read-write" | "read-only"
export type StreamControlSupportStatus = "supported" | "unsupported"

export type StreamControlValueSpec =
  | {
      readonly kind: "range"
      readonly min: number
      readonly max: number
      readonly step: number
    }
  | { readonly kind: "steps"; readonly values: readonly number[] }
  | { readonly kind: "options"; readonly values: readonly string[] }
  | { readonly kind: "resolutions"; readonly values: typeof RESOLUTION_STEPS }
  | { readonly kind: "read-only" }

export interface StreamControlDefinition {
  readonly id: string
  readonly subsystem: StreamControlSubsystem
  readonly access: StreamControlAccess
  readonly action: string | null
  readonly readback: string
  readonly value: StreamControlValueSpec
}

export type StreamControlCapability = StreamControlDefinition & {
  readonly status: StreamControlSupportStatus
  readonly unavailableReason: string | null
}

export interface StreamControlAvailability {
  readonly moonlight: boolean
  readonly gamescope: boolean
  readonly brightness: boolean
  readonly battery: boolean
}

const STREAM_CONTROL_DEFINITIONS: readonly StreamControlDefinition[] = [
  {
    id: "linked.resolution",
    subsystem: "linked",
    access: "read-write",
    action: "app.stream-control.linked-resolution.set",
    readback: "linked.resolution",
    value: { kind: "resolutions", values: RESOLUTION_STEPS },
  },
  {
    id: "linked.fps",
    subsystem: "linked",
    access: "read-write",
    action: "app.stream-control.linked-fps.set",
    readback: "linked.fps",
    value: { kind: "steps", values: LINKED_FPS_STEPS },
  },
  {
    id: "moonlight.bitrate",
    subsystem: "moonlight",
    access: "read-write",
    action: "app.stream-control.moonlight-bitrate.set",
    readback: "moonlight.bitrate",
    value: { kind: "range", min: 500, max: 150_000, step: 500 },
  },
  {
    id: "moonlight.fps",
    subsystem: "moonlight",
    access: "read-write",
    action: "app.stream-control.moonlight-fps.set",
    readback: "moonlight.fps",
    value: { kind: "steps", values: FPS_STEPS },
  },
  {
    id: "moonlight.resolution",
    subsystem: "moonlight",
    access: "read-write",
    action: "app.stream-control.moonlight-resolution.set",
    readback: "moonlight.resolution",
    value: { kind: "resolutions", values: RESOLUTION_STEPS },
  },
  {
    id: "gamescope.resolution",
    subsystem: "gamescope",
    access: "read-write",
    action: "app.stream-control.gamescope-mode.set",
    readback: "gamescope.resolution",
    value: { kind: "resolutions", values: RESOLUTION_STEPS },
  },
  {
    id: "gamescope.fps",
    subsystem: "gamescope",
    access: "read-write",
    action: "app.stream-control.gamescope-fps.set",
    readback: "gamescope.fps",
    value: { kind: "steps", values: GAMESCOPE_FPS_STEPS },
  },
  {
    id: "gamescope.filter",
    subsystem: "gamescope",
    access: "read-write",
    action: "app.stream-control.gamescope-filter.set",
    readback: "gamescope.filter",
    value: { kind: "options", values: GAMESCOPE_SCALING_FILTERS },
  },
  {
    id: "gamescope.sharpness",
    subsystem: "gamescope",
    access: "read-write",
    action: "app.stream-control.gamescope-sharpness.set",
    readback: "gamescope.sharpness",
    value: { kind: "range", min: 0, max: 20, step: 1 },
  },
  {
    id: "brightness.percent",
    subsystem: "brightness",
    access: "read-write",
    action: "app.stream-control.brightness.set",
    readback: "brightness.unified",
    value: { kind: "range", min: 0, max: 100, step: 1 },
  },
  {
    id: "battery.percent",
    subsystem: "battery",
    access: "read-only",
    action: null,
    readback: "battery.percent",
    value: { kind: "read-only" },
  },
]

export function streamControlCapabilities(
  availability: StreamControlAvailability,
): { readonly controls: readonly StreamControlCapability[] } {
  return {
    controls: STREAM_CONTROL_DEFINITIONS.map(definition => ({
      ...definition,
      ...supportFor(definition, availability),
    })),
  }
}

function supportFor(
  definition: StreamControlDefinition,
  availability: StreamControlAvailability,
): Pick<StreamControlCapability, "status" | "unavailableReason"> {
  if (definition.subsystem === "linked") {
    if (!availability.moonlight) {
      return { status: "unsupported", unavailableReason: "moonlight disabled" }
    }
    if (!availability.gamescope) {
      return { status: "unsupported", unavailableReason: "gamescope disabled" }
    }
    return { status: "supported", unavailableReason: null }
  }

  const enabled = availability[definition.subsystem]
  return enabled
    ? { status: "supported", unavailableReason: null }
    : {
        status: "unsupported",
        unavailableReason: `${definition.subsystem} disabled`,
      }
}
