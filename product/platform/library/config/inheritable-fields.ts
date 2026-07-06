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
 * - `preferences`        → deep merge per nested key; scalars last-wins
 *                         (launcher-neutral launch preferences; each plugin
 *                         translates them into its own native config)
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
import { StreamerPolicy } from "./streamer-policy"

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

/**
 * Launcher-neutral launch preferences — declared once at any cascade layer
 * under `preferences.launch`, folded like `moonlight`, and translated into
 * each launcher's native config by that launcher's own mapping. Values are
 * neutral; no emulator-specific strings appear here. The `preferences`
 * namespace reserves room for future siblings (e.g. `preferences.display`
 * for physical monitor / desktop resolution).
 */
const LaunchResolutionPreferences = Schema.Struct({
  width: PositiveInteger("preferences.launch.video.resolution.width"),
  height: PositiveInteger("preferences.launch.video.resolution.height"),
})

const LaunchVideoPreferences = Schema.Struct({
  fullscreen: Schema.optional(Schema.Boolean),
  resolution: Schema.optional(LaunchResolutionPreferences),
  "aspect-ratio": Schema.optional(
    NonEmptyString("preferences.launch.video.aspect-ratio"),
  ),
})

const LaunchAudioPreferences = Schema.Struct({
  volume: Schema.optional(
    Schema.Number.check(
      Schema.makeFilter<number>(value =>
        Number.isFinite(value) && value >= 0 && value <= 100
          ? undefined
          : "preferences.launch.audio.volume must be in [0, 100]",
      ),
    ),
  ),
})

export const LaunchPreferences = Schema.Struct({
  video: Schema.optional(LaunchVideoPreferences),
  audio: Schema.optional(LaunchAudioPreferences),
})
export type LaunchPreferences = Schema.Schema.Type<typeof LaunchPreferences>

export const Preferences = Schema.Struct({
  launch: Schema.optional(LaunchPreferences),
})
export type Preferences = Schema.Schema.Type<typeof Preferences>

export const InheritableLayer = Schema.Struct({
  launch: Schema.optional(LaunchPolicy),
  moonlight: Schema.optional(StreamerPolicy),
  preferences: Schema.optional(Preferences),
  plugin: Schema.optional(PluginPolicyMap),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type InheritableLayer = Schema.Schema.Type<typeof InheritableLayer>

export const ByLauncherPayload = Schema.Record(Schema.String, InheritableLayer)
export type ByLauncherPayload = Schema.Schema.Type<typeof ByLauncherPayload>

export const decodePreferences = (input: unknown): Preferences =>
  Schema.decodeUnknownSync(Preferences)(input, STRICT)

export const decodeInheritableLayer = (input: unknown): InheritableLayer =>
  Schema.decodeUnknownSync(InheritableLayer)(input, STRICT)

export const decodeByLauncherPayload = (input: unknown): ByLauncherPayload =>
  Schema.decodeUnknownSync(ByLauncherPayload)(input, STRICT)
