import type { ProviderId } from "@platform/plugin"
import type { LaunchMetadata } from "@platform/plugin/launch-metadata"
import { Schema } from "effect"
import {
  DEFAULT_AXIS_PRESS_THRESHOLD,
  DEFAULT_AXIS_RELEASE_THRESHOLD,
  resolveBridgeMapping,
  type BridgeMappingName,
} from "./mapping"

export const CDP_INPUT_BRIDGE_PLUGIN_ID = "@korri:cdp-input-bridge" as const satisfies ProviderId

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: `${label} must be non-empty`,
      }),
    ),
  )

const positiveInteger = (label: string) =>
  Schema.Int.check(
    Schema.makeFilter<number>(value =>
      Number.isFinite(value) && value > 0
        ? undefined
        : `${label} must be a positive integer`,
    ),
  )

const integerRange = (label: string, min: number, max: number) =>
  Schema.Int.check(
    Schema.makeFilter<number>(value =>
      Number.isFinite(value) && value >= min && value <= max
        ? undefined
        : `${label} must be between ${min} and ${max}`,
    ),
  )

const CdpTargetSelector = Schema.Struct({
  type: Schema.optional(Schema.Literals(["page", "iframe"])),
  urlPattern: Schema.optional(NonEmptyString("target.urlPattern")),
  titlePattern: Schema.optional(NonEmptyString("target.titlePattern")),
})
export type CdpTargetSelector = Schema.Schema.Type<typeof CdpTargetSelector>

const SourcePreference = Schema.Struct({
  names: Schema.optional(Schema.Array(NonEmptyString("sourcePreference.names[]"))),
  eventNodes: Schema.optional(
    Schema.Array(NonEmptyString("sourcePreference.eventNodes[]")),
  ),
})
export type SourcePreference = Schema.Schema.Type<typeof SourcePreference>

const AxisPolicy = Schema.Struct({
  pressThreshold: Schema.optional(integerRange("axis.pressThreshold", 1, 32767)),
  releaseThreshold: Schema.optional(integerRange("axis.releaseThreshold", 0, 32766)),
})
export type AxisPolicy = Schema.Schema.Type<typeof AxisPolicy>

const RawPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  cdpHost: Schema.optional(NonEmptyString("cdpHost")),
  cdpPort: Schema.optional(integerRange("cdpPort", 1, 65535)),
  target: Schema.optional(CdpTargetSelector),
  sourcePreference: Schema.optional(SourcePreference),
  mapping: Schema.optional(NonEmptyString("mapping")),
  axis: Schema.optional(AxisPolicy),
  attachTimeoutMs: Schema.optional(positiveInteger("attachTimeoutMs")),
  failClosed: Schema.optional(Schema.Boolean),
  watchPid: Schema.optional(positiveInteger("watchPid")),
})
type RawPolicy = Schema.Schema.Type<typeof RawPolicy>

export type CdpInputBridgePolicy =
  | { readonly enabled: false }
  | {
      readonly enabled: true
      readonly cdpHost: string
      readonly cdpPort: number
      readonly target?: CdpTargetSelector
      readonly sourcePreference?: SourcePreference
      readonly mappingName: BridgeMappingName
      readonly axis: {
        readonly pressThreshold: number
        readonly releaseThreshold: number
      }
      readonly attachTimeoutMs: number
      readonly failClosed: boolean
      readonly watchPid?: number
    }

export function policyAnnotationFromMetadata(
  launchMetadata: LaunchMetadata | undefined,
): unknown {
  return launchMetadata?.annotations?.[CDP_INPUT_BRIDGE_PLUGIN_ID]
}

export function decodeCdpInputBridgePolicy(input: unknown): CdpInputBridgePolicy {
  if (input === undefined) return { enabled: false }
  const raw = Schema.decodeUnknownSync(RawPolicy)(input, STRICT)
  if (raw.enable !== true) return { enabled: false }

  const mappingName = raw.mapping ?? "yfs-default"
  resolveBridgeMapping(mappingName)

  const pressThreshold = raw.axis?.pressThreshold ?? DEFAULT_AXIS_PRESS_THRESHOLD
  const releaseThreshold =
    raw.axis?.releaseThreshold ?? DEFAULT_AXIS_RELEASE_THRESHOLD
  if (releaseThreshold >= pressThreshold) {
    throw new Error("axis.releaseThreshold must be less than axis.pressThreshold")
  }

  return {
    enabled: true,
    cdpHost: raw.cdpHost ?? "127.0.0.1",
    cdpPort: raw.cdpPort ?? 9333,
    ...(raw.target ? { target: raw.target } : {}),
    ...(raw.sourcePreference ? { sourcePreference: raw.sourcePreference } : {}),
    mappingName,
    axis: { pressThreshold, releaseThreshold },
    attachTimeoutMs: raw.attachTimeoutMs ?? 5000,
    failClosed: raw.failClosed ?? true,
    ...(raw.watchPid ? { watchPid: raw.watchPid } : {}),
  }
}

export function encodeCdpInputBridgeAnnotation(
  policy: Extract<CdpInputBridgePolicy, { readonly enabled: true }>,
): Readonly<Record<string, unknown>> {
  return {
    enable: true,
    cdpHost: policy.cdpHost,
    cdpPort: policy.cdpPort,
    mapping: policy.mappingName,
    axis: policy.axis,
    attachTimeoutMs: policy.attachTimeoutMs,
    failClosed: policy.failClosed,
    ...(policy.target ? { target: policy.target } : {}),
    ...(policy.sourcePreference ? { sourcePreference: policy.sourcePreference } : {}),
    ...(policy.watchPid ? { watchPid: policy.watchPid } : {}),
  }
}
