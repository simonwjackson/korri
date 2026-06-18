/**
 * Inheritable-field whitelist for the seven-layer config cascade.
 *
 * Every layer-bearing record (`GlobalConfigPayload`, `UserPayload`,
 * `SystemPayload`, `LauncherPayload`, `GamePayload`, `PresetPayload`,
 * `EphemeralOverride`) carries a subset of these fields plus a
 * `byLauncher?: ByLauncherPayload` sub-map that scopes contributions to
 * a specific launcher id.
 *
 * Schemas decode in strict whitelist mode — unknown keys fail loudly so
 * typos (`gamescpoe`) surface at decode time with the offending key
 * path, rather than being silently stripped and disappearing into
 * "inherits from less-specific layer."
 *
 * Field-by-field merge rules (applied by the cascade resolver, not the
 * schema):
 * - `launch.with`      → provider-keyed launch companion map; object values
 *                         → deep merge, arrays concatenate in inheritance order,
 *                         → scalars last-win
 * - `moonlight`          → deep merge per nested key; scalars last-wins
 * - `moonlight.input.devices` / `moonlight.extraArgs`
 *                         → list concat in inheritance order
 * - `moonlight.environment`
 *                         → map merge; `null` means executable env unset
 * - `plugin`            → provider-keyed map; object values deep merge,
 *                         → arrays concatenate in inheritance order
 * - `env`                → map merge per key; more-specific wins
 * - `cwd`                → scalar; most-specific path wins
 * - `argsAppend`         → list concat in inheritance order
 * - `patches`            → list concat in inheritance order
 * - `byLauncher[L]`      → merged when the resolved launcher equals L
 */

import type { ProviderId } from "@platform/plugin"
import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

export const LaunchSettingValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
])
export type LaunchSettingValue = Schema.Schema.Type<typeof LaunchSettingValue>

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
export type EnvironmentOverlay = Schema.Schema.Type<typeof EnvironmentOverlay>

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

const ProviderIdKey = Schema.String.check(
  Schema.isPattern(/^@[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+$/),
)

export const LaunchCompanionPayload = Schema.Unknown
export type LaunchCompanionPayload = Schema.Schema.Type<
  typeof LaunchCompanionPayload
>

export const LaunchCompanionMap = Schema.Record(
  ProviderIdKey,
  LaunchCompanionPayload,
)
export type LaunchCompanionMap = Readonly<Record<ProviderId, unknown>>

export const LaunchWithPolicy = LaunchCompanionMap
export type LaunchWithPolicy = LaunchCompanionMap

export const PluginPolicyPayload = Schema.Unknown
export type PluginPolicyPayload = Schema.Schema.Type<typeof PluginPolicyPayload>

export const PluginPolicyMap = Schema.Record(ProviderIdKey, PluginPolicyPayload)
export type PluginPolicyMap = Readonly<Record<ProviderId, unknown>>

export const LaunchPolicy = Schema.Struct({
  with: Schema.optional(LaunchWithPolicy),
})
export type LaunchPolicy = Schema.Schema.Type<typeof LaunchPolicy>

export const launchCompanionsFromLaunch = (layer: {
  readonly launch?: LaunchPolicy
}): LaunchCompanionMap | undefined =>
  layer.launch?.with as LaunchCompanionMap | undefined

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
 * Typed Moonlight Embedded stream launch policy for Korri product launches.
 * The stream action, fixed Korri Stream app, and selected peer host are product
 * invariants and are intentionally not configurable in readable policy.
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

export const InheritableLayer = Schema.Struct({
  launch: Schema.optional(LaunchPolicy),
  moonlight: Schema.optional(MoonlightPolicy),
  plugin: Schema.optional(PluginPolicyMap),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type InheritableLayer = Schema.Schema.Type<typeof InheritableLayer>

export const ByLauncherPayload = Schema.Record(Schema.String, InheritableLayer)
export type ByLauncherPayload = Schema.Schema.Type<typeof ByLauncherPayload>

export const decodeMoonlightPolicy = (input: unknown): MoonlightPolicy =>
  Schema.decodeUnknownSync(MoonlightPolicy)(input, STRICT)

export const decodeInheritableLayer = (input: unknown): InheritableLayer =>
  Schema.decodeUnknownSync(InheritableLayer)(input, STRICT)

export const decodeByLauncherPayload = (input: unknown): ByLauncherPayload =>
  Schema.decodeUnknownSync(ByLauncherPayload)(input, STRICT)
