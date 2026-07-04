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
    Schema.check(Schema.isMinLength(1, { message: `${label} must be non-empty` })),
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

const MoonlightResolutionPolicy = Schema.Struct({
  width: Schema.optional(PositiveInteger("stream.resolution.width")),
  height: Schema.optional(PositiveInteger("stream.resolution.height")),
})

const MoonlightStreamPolicy = Schema.Struct({
  resolution: Schema.optional(MoonlightResolutionPolicy),
  fps: Schema.optional(PositiveInteger("stream.fps")),
  bitrateKbps: Schema.optional(NullablePositiveInteger("stream.bitrateKbps")),
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

export const decodeMoonlightPolicy = (input: unknown): MoonlightPolicy =>
  Schema.decodeUnknownSync(MoonlightPolicy)(input, STRICT)
