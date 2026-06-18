import { type ProviderId, pluginRecordId } from "@platform/plugin"
import {
  RESOLUTION_STEPS,
  type StreamControlCapability,
} from "@platform/stream-control/control-contract"
import type { GamescopeScalingFilter } from "../runtime-control"

// Gamescope's GAMESCOPE_FPS_LIMIT cardinal accepts 0..240; 0 disables the
// compositor-side limiter entirely. Product surfaces expose a compact ladder
// for controller/touch operation instead of a freeform numeric input.
export const GAMESCOPE_FPS_STEPS = [
  0, 30, 45, 60, 75, 90, 120, 144, 165, 240,
] as const

export const GAMESCOPE_SCALING_FILTERS = [
  "linear",
  "nearest",
  "integer",
  "fsr",
  "nis",
] as const satisfies readonly GamescopeScalingFilter[]

export function gamescopeStreamControlCapabilities(input: {
  readonly provider: ProviderId
  readonly enabled: boolean
}): readonly StreamControlCapability[] {
  const support = input.enabled
    ? { status: "supported" as const, unavailableReason: null }
    : {
        status: "unsupported" as const,
        unavailableReason: "runtime-control socket disabled",
      }
  const action = (id: string) => pluginRecordId(input.provider, id)
  return [
    {
      id: action("resolution"),
      label: "Presentation resolution",
      subsystem: "presentation",
      provider: input.provider,
      access: "read-write",
      action: action("resolution.set"),
      readback: action("resolution"),
      value: { kind: "resolutions", values: RESOLUTION_STEPS },
      ...support,
    },
    {
      id: action("fps"),
      label: "Presentation FPS cap",
      subsystem: "presentation",
      provider: input.provider,
      access: "read-write",
      action: action("fps.set"),
      readback: action("fps"),
      value: { kind: "steps", values: GAMESCOPE_FPS_STEPS },
      ...support,
    },
    {
      id: action("filter"),
      label: "Scaling filter",
      subsystem: "presentation",
      provider: input.provider,
      access: "read-write",
      action: action("filter.set"),
      readback: action("filter"),
      value: { kind: "options", values: GAMESCOPE_SCALING_FILTERS },
      ...support,
    },
    {
      id: action("sharpness"),
      label: "Sharpness",
      subsystem: "presentation",
      provider: input.provider,
      access: "read-write",
      action: action("sharpness.set"),
      readback: action("sharpness"),
      value: { kind: "range", min: 0, max: 20, step: 1 },
      ...support,
    },
  ]
}
