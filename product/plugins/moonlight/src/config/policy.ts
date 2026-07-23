import type {
  NumericLeverBoundary,
  ResolutionLeverBoundary,
  StreamAdaptiveResolution,
  StreamBoundaries,
} from "@platform/stream/stream-adaptive-boundaries"
import { Schema } from "effect"

/**
 * The typed Moonlight launch policy is owned by the plugin, not the platform:
 * the engine carries the streamer policy opaquely and this schema validates it
 * at the `stream.launch` boundary. Validation helpers are defined locally so the
 * plugin stays self-contained (removable without touching platform config).
 */
const STRICT = { onExcessProperty: "error" } as const

const positiveNumber = (label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value > 0
      ? undefined
      : `${label} greater than 0 required`,
  )

const EnvironmentKey = Schema.String.check(
  Schema.isPattern(/^[A-Za-z_][A-Za-z0-9_]*$/),
)

const EnvironmentOverlay = Schema.Record(
  EnvironmentKey,
  Schema.NullOr(Schema.String),
)

const PositiveInteger = (label: string) =>
  Schema.Int.check(positiveNumber(label))

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, { message: `${label} must be non-empty` }),
    ),
  )

const NullablePositiveInteger = (label: string) =>
  Schema.NullOr(PositiveInteger(label))

const NullableNonEmptyString = (label: string) =>
  Schema.NullOr(NonEmptyString(label))

export const MoonlightCodec = Schema.Literals(["auto", "h264", "h265"])
export type MoonlightCodec = Schema.Schema.Type<typeof MoonlightCodec>

export const MoonlightRotation = Schema.Union([
  Schema.Literal(0),
  Schema.Literal(90),
  Schema.Literal(180),
  Schema.Literal(270),
])
export type MoonlightRotation = Schema.Schema.Type<typeof MoonlightRotation>

export const MoonlightControlAuthority = Schema.Literals([
  "observer",
  "controller",
])
export type MoonlightControlAuthority = Schema.Schema.Type<
  typeof MoonlightControlAuthority
>

const MoonlightLoggingPolicy = Schema.Struct({
  verbose: Schema.optional(Schema.Boolean),
  debug: Schema.optional(Schema.Boolean),
})

const MoonlightResolutionSizePolicy = Schema.Struct({
  width: Schema.optional(PositiveInteger("stream.resolution.width")),
  height: Schema.optional(PositiveInteger("stream.resolution.height")),
})

const MoonlightResolutionRangePolicy = Schema.Struct({
  min: Schema.optional(MoonlightResolutionSizePolicy),
  start: MoonlightResolutionSizePolicy,
  max: Schema.optional(MoonlightResolutionSizePolicy),
})

const MoonlightResolutionPolicy = Schema.Union([
  MoonlightResolutionSizePolicy,
  MoonlightResolutionRangePolicy,
])

const MoonlightNumericRangePolicy = (label: string) =>
  Schema.Struct({
    min: Schema.optional(PositiveInteger(`${label}.min`)),
    start: PositiveInteger(`${label}.start`),
    max: Schema.optional(PositiveInteger(`${label}.max`)),
  })

const MoonlightFpsPolicy = Schema.Union([
  PositiveInteger("stream.fps"),
  MoonlightNumericRangePolicy("stream.fps"),
])

const MoonlightBitratePolicy = Schema.Union([
  NullablePositiveInteger("stream.bitrateKbps"),
  MoonlightNumericRangePolicy("stream.bitrateKbps"),
])

const MoonlightStreamPolicy = Schema.Struct({
  resolution: Schema.optional(MoonlightResolutionPolicy),
  fps: Schema.optional(MoonlightFpsPolicy),
  bitrateKbps: Schema.optional(MoonlightBitratePolicy),
  packetSizeBytes: Schema.optional(
    NullablePositiveInteger("stream.packetSizeBytes"),
  ),
  codec: Schema.optional(MoonlightCodec),
  remoteOptimizations: Schema.optional(Schema.Boolean),
  unsupportedHost: Schema.optional(Schema.Boolean),
  quitAppAfter: Schema.optional(Schema.Boolean),
  noSops: Schema.optional(Schema.Boolean),
  localAudio: Schema.optional(Schema.Boolean),
  surround: Schema.optional(Schema.Boolean),
  keyDir: Schema.optional(NullableNonEmptyString("stream.keyDir")),
})

const MoonlightPlatformPolicy = Schema.Struct({
  name: Schema.optional(NonEmptyString("platform.name")),
})

const MoonlightTouchBoundsPolicy = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  w: PositiveInteger("input.touch.bounds.w"),
  h: PositiveInteger("input.touch.bounds.h"),
})

const MoonlightTouchPolicy = Schema.Struct({
  absolute: Schema.optional(Schema.Boolean),
  requireBounds: Schema.optional(Schema.Boolean),
  bounds: Schema.optional(Schema.NullOr(MoonlightTouchBoundsPolicy)),
})

const MoonlightInputPolicy = Schema.Struct({
  devices: Schema.optional(Schema.Array(NonEmptyString("input.devices[]"))),
  mappingFile: Schema.optional(NonEmptyString("input.mappingFile")),
  viewOnly: Schema.optional(Schema.Boolean),
  rotate: Schema.optional(MoonlightRotation),
  touch: Schema.optional(MoonlightTouchPolicy),
})

const MoonlightAudioPolicy = Schema.Struct({
  device: Schema.optional(NullableNonEmptyString("audio.device")),
})

const MoonlightWindowPolicy = Schema.Struct({
  windowed: Schema.optional(Schema.Boolean),
  autoResize: Schema.optional(Schema.Boolean),
})

const MoonlightControlPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  authority: Schema.optional(MoonlightControlAuthority),
  allowRootPeers: Schema.optional(Schema.Boolean),
})

/**
 * Typed Moonlight Embedded stream launch policy. The stream action, fixed Korri
 * Stream app, and selected peer host are product invariants and are
 * intentionally not configurable in readable policy.
 */
export const MoonlightPolicy = Schema.Struct({
  command: Schema.optional(NonEmptyString("command")),
  environment: Schema.optional(EnvironmentOverlay),
  logging: Schema.optional(MoonlightLoggingPolicy),
  stream: Schema.optional(MoonlightStreamPolicy),
  platform: Schema.optional(MoonlightPlatformPolicy),
  input: Schema.optional(MoonlightInputPolicy),
  audio: Schema.optional(MoonlightAudioPolicy),
  window: Schema.optional(MoonlightWindowPolicy),
  control: Schema.optional(MoonlightControlPolicy),
  extraArgs: Schema.optional(Schema.Array(Schema.String)),
})
export type MoonlightPolicy = Schema.Schema.Type<typeof MoonlightPolicy>
export type MoonlightStreamPolicy = NonNullable<MoonlightPolicy["stream"]>
export type MoonlightResolutionPolicy = NonNullable<
  MoonlightStreamPolicy["resolution"]
>
export type MoonlightFpsPolicy = NonNullable<MoonlightStreamPolicy["fps"]>
export type MoonlightBitratePolicy = NonNullable<
  MoonlightStreamPolicy["bitrateKbps"]
>

export const decodeMoonlightPolicy = (input: unknown): MoonlightPolicy => {
  const policy = Schema.decodeUnknownSync(MoonlightPolicy)(input, STRICT)
  validateMoonlightPolicy(policy)
  return policy
}

export function moonlightStreamBoundaries(
  policy: Pick<MoonlightPolicy, "stream"> | undefined,
): StreamBoundaries | undefined {
  const stream = policy?.stream
  if (!stream) return undefined

  const levers: {
    resolution?: ResolutionLeverBoundary
    fps?: NumericLeverBoundary
    bitrate?: NumericLeverBoundary
  } = {}
  const resolution = resolutionBoundary(stream.resolution)
  if (resolution) levers.resolution = resolution
  const fps = numericBoundary(stream.fps, { includeStartup: false })
  if (fps) levers.fps = fps
  const bitrate = numericBoundary(stream.bitrateKbps, { includeStartup: true })
  if (bitrate) levers.bitrate = bitrate

  return Object.keys(levers).length > 0 ? { levers, outcomes: {} } : undefined
}

export function moonlightLaunchResolution(
  stream: MoonlightStreamPolicy | undefined,
): StreamAdaptiveResolution | undefined {
  const resolution = stream?.resolution
  if (!resolution) return undefined
  return isResolutionRange(resolution)
    ? completeResolution(resolution.start)
    : completeResolution(resolution)
}

export function moonlightLaunchFps(
  stream: MoonlightStreamPolicy | undefined,
): number | undefined {
  return numericLaunchValue(stream?.fps) ?? undefined
}

export function moonlightLaunchBitrateKbps(
  stream: MoonlightStreamPolicy | undefined,
): number | null | undefined {
  return numericLaunchValue(stream?.bitrateKbps)
}

export function validateMoonlightPolicy(policy: MoonlightPolicy): void {
  const stream = policy.stream
  if (!stream) return
  validateResolutionPolicy(stream.resolution)
  validateNumericPolicy(stream.fps, "stream.fps")
  validateNumericPolicy(stream.bitrateKbps, "stream.bitrateKbps")
}

function validateResolutionPolicy(
  resolution: MoonlightResolutionPolicy | undefined,
): void {
  if (!resolution) return
  if (isResolutionRange(resolution)) {
    validateCompleteResolution(resolution.start, "stream.resolution.start")
    if (resolution.min)
      validateCompleteResolution(resolution.min, "stream.resolution.min")
    if (resolution.max)
      validateCompleteResolution(resolution.max, "stream.resolution.max")
    if (
      resolution.min &&
      resolution.max &&
      (resolution.min.width! > resolution.max.width! ||
        resolution.min.height! > resolution.max.height!)
    ) {
      throw new Error("stream.resolution min must be <= max")
    }
    return
  }
  if (resolution.width !== undefined || resolution.height !== undefined) {
    validateCompleteResolution(resolution, "stream.resolution")
  }
}

function validateNumericPolicy(
  value: MoonlightFpsPolicy | MoonlightBitratePolicy | null | undefined,
  label: string,
): void {
  if (!isNumericRange(value)) return
  if (value.min !== undefined && value.min > value.start) {
    throw new Error(`${label}.start must be >= ${label}.min`)
  }
  if (value.max !== undefined && value.start > value.max) {
    throw new Error(`${label}.start must be <= ${label}.max`)
  }
}

function validateCompleteResolution(
  resolution: { readonly width?: number; readonly height?: number },
  label: string,
): void {
  if (resolution.width === undefined || resolution.height === undefined) {
    throw new Error(`${label} requires both width and height`)
  }
}

function numericBoundary(
  value: MoonlightFpsPolicy | MoonlightBitratePolicy | null | undefined,
  options: { readonly includeStartup: boolean },
): NumericLeverBoundary | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "number") return pinnedNumeric(value)
  return definedNumeric({
    floor: value.min,
    ...(options.includeStartup ? { startup: value.start } : {}),
    ceiling: value.max,
  })
}

function resolutionBoundary(
  value: MoonlightResolutionPolicy | undefined,
): ResolutionLeverBoundary | undefined {
  if (!value) return undefined
  if (isResolutionRange(value)) {
    return definedResolution({
      floor: value.min ? completeResolution(value.min) : undefined,
      ceiling: value.max ? completeResolution(value.max) : undefined,
    })
  }
  const resolution = completeResolution(value)
  return resolution
    ? { floor: resolution, ceiling: resolution, pinned: resolution }
    : undefined
}

function numericLaunchValue(
  value: MoonlightFpsPolicy | MoonlightBitratePolicy | null | undefined,
): number | null | undefined {
  if (value === undefined || value === null || typeof value === "number") {
    return value
  }
  return value.start
}

function completeResolution(value: {
  readonly width?: number
  readonly height?: number
}): StreamAdaptiveResolution | undefined {
  if (value.width === undefined || value.height === undefined) return undefined
  return { width: value.width, height: value.height }
}

function pinnedNumeric(value: number): NumericLeverBoundary {
  return { floor: value, ceiling: value, pinned: value }
}

function definedNumeric(lever: NumericLeverBoundary): NumericLeverBoundary {
  return Object.fromEntries(
    Object.entries(lever).filter(([, value]) => value !== undefined),
  ) as NumericLeverBoundary
}

function definedResolution(
  lever: ResolutionLeverBoundary,
): ResolutionLeverBoundary {
  return Object.fromEntries(
    Object.entries(lever).filter(([, value]) => value !== undefined),
  ) as ResolutionLeverBoundary
}

function isNumericRange(value: unknown): value is {
  readonly min?: number
  readonly start: number
  readonly max?: number
} {
  return isRecord(value) && typeof value.start === "number"
}

function isResolutionRange(value: unknown): value is {
  readonly min?: { readonly width?: number; readonly height?: number }
  readonly start: { readonly width?: number; readonly height?: number }
  readonly max?: { readonly width?: number; readonly height?: number }
} {
  return isRecord(value) && isRecord(value.start)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
