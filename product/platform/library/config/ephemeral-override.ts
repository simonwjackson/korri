/**
 * Ephemeral override — the most-specific cascade layer, supplied at
 * `prepare.rpc` time as an optional field on the payload.
 *
 * Shape mirrors `PresetPayload` minus the namespace fields (`name`,
 * `description`) and minus nested presets. The strict-mode decode
 * rejects identity-field bypass attempts (`system`, `contentPath`),
 * keeping the cascade's identity invariant intact even for runtime
 * one-off launches.
 *
 * Use case: the renderer wants to launch this game "right now with
 * extra args" without persisting a preset. The override flows from
 * RPC → cascade resolver → launch intent → runner without ever
 * touching ProseQL.
 */

import { Schema } from "effect"

import { InheritableLayer } from "./inheritable-fields"
import { LaunchBlock } from "./launch-block"

const STRICT = { onExcessProperty: "error" } as const

const positiveNumber = (label: string) =>
  Schema.makeFilter<number>(value =>
    Number.isFinite(value) && value > 0
      ? undefined
      : `${label} greater than 0 required`,
  )

const PositiveInteger = (label: string) =>
  Schema.Int.check(positiveNumber(label))

const NonEmptyString = (label: string) =>
  Schema.String.pipe(
    Schema.check(
      Schema.isMinLength(1, {
        message: `${label} must be non-empty`,
      }),
    ),
  )

const NullablePositiveInteger = (label: string) =>
  Schema.NullOr(PositiveInteger(label))

const ProviderIdKey = Schema.String.check(
  Schema.isPattern(/^@[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/),
)

const EphemeralLaunchWithPolicy = Schema.Record(ProviderIdKey, Schema.Unknown)

const EphemeralLaunchBlock = Schema.Struct({
  ...LaunchBlock.fields,
  with: Schema.optional(EphemeralLaunchWithPolicy),
})

const EphemeralLaunchPolicy = Schema.Struct({
  with: Schema.optional(EphemeralLaunchWithPolicy),
})

// Streamer control-value enums are duplicated locally (not imported from a
// streamer plugin) so this unauthenticated-runtime-override whitelist stays a
// platform-owned security boundary independent of any streamer plugin.
const MoonlightCodec = Schema.Literals(["auto", "h264", "h265"])
const MoonlightRotation = Schema.Union([
  Schema.Literal(0),
  Schema.Literal(90),
  Schema.Literal(180),
  Schema.Literal(270),
])
const MoonlightControlAuthority = Schema.Literals(["observer", "controller"])

const MoonlightOverrideResolutionPolicy = Schema.Struct({
  width: Schema.optional(PositiveInteger("stream.resolution.width")),
  height: Schema.optional(PositiveInteger("stream.resolution.height")),
})

const MoonlightOverrideStreamPolicy = Schema.Struct({
  resolution: Schema.optional(MoonlightOverrideResolutionPolicy),
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
})

const MoonlightOverridePlatformPolicy = Schema.Struct({
  name: Schema.optional(NonEmptyString("platform.name")),
})

const MoonlightOverrideTouchBoundsPolicy = Schema.Struct({
  x: Schema.Int,
  y: Schema.Int,
  w: PositiveInteger("input.touch.bounds.w"),
  h: PositiveInteger("input.touch.bounds.h"),
})

const MoonlightOverrideTouchPolicy = Schema.Struct({
  absolute: Schema.optional(Schema.Boolean),
  requireBounds: Schema.optional(Schema.Boolean),
  bounds: Schema.optional(Schema.NullOr(MoonlightOverrideTouchBoundsPolicy)),
})

const MoonlightOverrideInputPolicy = Schema.Struct({
  devices: Schema.optional(Schema.Array(NonEmptyString("input.devices[]"))),
  mappingFile: Schema.optional(NonEmptyString("input.mappingFile")),
  viewOnly: Schema.optional(Schema.Boolean),
  rotate: Schema.optional(MoonlightRotation),
  touch: Schema.optional(MoonlightOverrideTouchPolicy),
})

const MoonlightOverrideAudioPolicy = Schema.Struct({
  device: Schema.optional(Schema.NullOr(NonEmptyString("audio.device"))),
})

const MoonlightOverrideWindowPolicy = Schema.Struct({
  windowed: Schema.optional(Schema.Boolean),
  autoResize: Schema.optional(Schema.Boolean),
})

const MoonlightOverrideControlPolicy = Schema.Struct({
  enable: Schema.optional(Schema.Boolean),
  authority: Schema.optional(MoonlightControlAuthority),
})

const MoonlightOverridePolicy = Schema.Struct({
  logging: Schema.optional(
    Schema.Struct({
      verbose: Schema.optional(Schema.Boolean),
      debug: Schema.optional(Schema.Boolean),
    }),
  ),
  stream: Schema.optional(MoonlightOverrideStreamPolicy),
  platform: Schema.optional(MoonlightOverridePlatformPolicy),
  input: Schema.optional(MoonlightOverrideInputPolicy),
  audio: Schema.optional(MoonlightOverrideAudioPolicy),
  window: Schema.optional(MoonlightOverrideWindowPolicy),
  control: Schema.optional(MoonlightOverrideControlPolicy),
})

const EphemeralInheritableLayer = Schema.Struct({
  launch: Schema.optional(EphemeralLaunchPolicy),
  moonlight: Schema.optional(MoonlightOverridePolicy),
  preferences: InheritableLayer.fields.preferences,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})

const EphemeralByLauncherPayload = Schema.Record(
  Schema.String,
  EphemeralInheritableLayer,
)

export const EphemeralOverride = Schema.Struct({
  launch: Schema.optional(EphemeralLaunchBlock),
  launcher: Schema.optional(Schema.String),
  inherit: Schema.optional(Schema.Boolean),
  byLauncher: Schema.optional(EphemeralByLauncherPayload),

  // Inlined inheritable whitelist. Runtime overrides intentionally use
  // narrower schemas than persisted readable policy:
  // app.library.launch is unauthenticated on trusted-LAN deployments, so
  // runtime overrides must not expose command/env/raw-argv/key storage/path
  // process surfaces.
  moonlight: Schema.optional(MoonlightOverridePolicy),
  preferences: InheritableLayer.fields.preferences,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type EphemeralOverride = Schema.Schema.Type<typeof EphemeralOverride>

export const decodeEphemeralOverride = (input: unknown): EphemeralOverride =>
  Schema.decodeUnknownSync(EphemeralOverride)(input, STRICT)
