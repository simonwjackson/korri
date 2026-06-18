import type { ProviderId } from "@platform/plugin"

export const FPS_STEPS = [30, 40, 45, 60, 75, 90, 100, 120] as const

export const RESOLUTION_STEPS = [
  { label: "360p", width: 640, height: 360 },
  { label: "480p", width: 854, height: 480 },
  { label: "540p", width: 960, height: 540 },
  { label: "576p", width: 1024, height: 576 },
  { label: "720p", width: 1280, height: 720 },
  { label: "900p", width: 1600, height: 900 },
  { label: "1080p", width: 1920, height: 1080 },
] as const

export type StreamControlSubsystem =
  | "moonlight"
  | "brightness"
  | "battery"
  | (string & {})

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
  readonly label: string
  readonly subsystem: StreamControlSubsystem
  readonly provider?: ProviderId
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
  readonly brightness: boolean
  readonly battery: boolean
}

export const STREAM_CONTROL_BUILT_IN_DEFINITIONS: readonly StreamControlDefinition[] =
  [
    {
      id: "moonlight.bitrate",
      label: "Bitrate",
      subsystem: "moonlight",
      access: "read-write",
      action: "app.stream-control.moonlight-bitrate.set",
      readback: "moonlight.bitrate",
      value: { kind: "range", min: 500, max: 150_000, step: 500 },
    },
    {
      id: "moonlight.fps",
      label: "Moonlight FPS",
      subsystem: "moonlight",
      access: "read-write",
      action: "app.stream-control.moonlight-fps.set",
      readback: "moonlight.fps",
      value: { kind: "steps", values: FPS_STEPS },
    },
    {
      id: "moonlight.resolution",
      label: "Moonlight resolution",
      subsystem: "moonlight",
      access: "read-write",
      action: "app.stream-control.moonlight-resolution.set",
      readback: "moonlight.resolution",
      value: { kind: "resolutions", values: RESOLUTION_STEPS },
    },
    {
      id: "brightness.percent",
      label: "Display brightness",
      subsystem: "brightness",
      access: "read-write",
      action: "app.stream-control.brightness.set",
      readback: "brightness.unified",
      value: { kind: "range", min: 0, max: 100, step: 1 },
    },
    {
      id: "battery.percent",
      label: "Battery",
      subsystem: "battery",
      access: "read-only",
      action: null,
      readback: "battery.percent",
      value: { kind: "read-only" },
    },
  ]

export function streamControlCapabilities(
  availability: StreamControlAvailability,
  pluginControls: readonly StreamControlCapability[] = [],
): { readonly controls: readonly StreamControlCapability[] } {
  return {
    controls: [
      ...STREAM_CONTROL_BUILT_IN_DEFINITIONS.map(definition => ({
        ...definition,
        ...supportFor(definition, availability),
      })),
      ...pluginControls,
    ],
  }
}

function supportFor(
  definition: StreamControlDefinition,
  availability: StreamControlAvailability,
): Pick<StreamControlCapability, "status" | "unavailableReason"> {
  const enabled =
    availability[definition.subsystem as keyof StreamControlAvailability]
  return enabled
    ? { status: "supported", unavailableReason: null }
    : {
        status: "unsupported",
        unavailableReason: `${definition.subsystem} disabled`,
      }
}
