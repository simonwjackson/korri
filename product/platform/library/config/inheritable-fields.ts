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
 * - `hooks.before`       → list concat in inheritance order (outermost
 *                         first: host → … → release)
 * - `hooks.after`        → list concat in inheritance order; execution
 *                         runs the resolved list reversed (most-specific
 *                         first, host last) for try/finally semantics
 * - `hooks.use`          → references named hook profiles; referenced
 *                         profiles expand before the layer's inline
 *                         entries, in reference order
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

/**
 * Launch hook steps — user-authored shell commands that run around a
 * game session. `run` is a raw shell string (YAML block scalars give
 * multiline scripts for free); `timeout` is whole seconds (default 30,
 * applied by the executor, not the schema). Before-steps carry
 * `on-failure: abort | warn` (default abort); after-steps never block
 * teardown, so `on-failure` on an after-step is a decode error — the
 * step schemas are intentionally distinct.
 */
export const HookBeforeStep = Schema.Struct({
  run: NonEmptyString("hooks step run"),
  name: Schema.optional(NonEmptyString("hooks step name")),
  timeout: Schema.optional(PositiveInteger("hooks step timeout")),
  "on-failure": Schema.optional(Schema.Literals(["abort", "warn"])),
})
export type HookBeforeStep = Schema.Schema.Type<typeof HookBeforeStep>

export const HookAfterStep = Schema.Struct({
  run: NonEmptyString("hooks step run"),
  name: Schema.optional(NonEmptyString("hooks step name")),
  timeout: Schema.optional(PositiveInteger("hooks step timeout")),
})
export type HookAfterStep = Schema.Schema.Type<typeof HookAfterStep>

export const HooksPolicy = Schema.Struct({
  before: Schema.optional(Schema.Array(HookBeforeStep)),
  after: Schema.optional(Schema.Array(HookAfterStep)),
  use: Schema.optional(Schema.Array(NonEmptyString("hooks use reference"))),
})
export type HooksPolicy = Schema.Schema.Type<typeof HooksPolicy>

export const InheritableLayer = Schema.Struct({
  launch: Schema.optional(LaunchPolicy),
  moonlight: Schema.optional(StreamerPolicy),
  preferences: Schema.optional(Preferences),
  plugin: Schema.optional(PluginPolicyMap),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
  hooks: Schema.optional(HooksPolicy),
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
