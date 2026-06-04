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
 * - `gamescope`        → deep merge per nested key; scalars last-wins
 * - `gamescope.args`   → list concat in inheritance order (least→most specific)
 * - `gamescope.command`→ scalar; more-specific wrapper command wins
 * - `env`           → map merge per key; more-specific wins
 * - `cwd`           → scalar; most-specific path wins
 * - `argsAppend`    → list concat in inheritance order
 * - `patches`       → list concat in inheritance order
 * - `byLauncher[L]` → merged when the resolved launcher equals L
 */

import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

/**
 * Resolved gamescope policy. `enabled` is a tri-state in the cascade:
 * - `true`  → wrap with gamescope at runtime
 * - `false` → explicitly disabled (overrides inherited `true`)
 * - absent  → "no opinion" (inherits from less-specific layer)
 *
 * The resolved product default is `enabled: true`. Args-only policies also
 * resolve to enabled so adding wrapper args does not require repeating the
 * default. Once resolved, this rides on the launch intent as `gamescope: {...}`.
 */
export const GamescopeBackend = Schema.Literals([
  "auto",
  "drm",
  "sdl",
  "wayland",
  "headless",
])
export type GamescopeBackend = Schema.Schema.Type<typeof GamescopeBackend>

export const GamescopePolicy = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  command: Schema.optional(Schema.String),
  backend: Schema.optional(GamescopeBackend),
  exposeWayland: Schema.optional(Schema.Boolean),
  args: Schema.optional(Schema.Array(Schema.String)),
})
export type GamescopePolicy = Schema.Schema.Type<typeof GamescopePolicy>

/**
 * Floor of the gamescope policy cascade. Production deployments run
 * gamescope NESTED under a parent Wayland compositor (sway on kiosks,
 * source-machine hosts); both the wayland backend and exposing the
 * wayland socket to clients are the right defaults there. Override per
 * game/launcher in YAML for standalone-DRM setups.
 */
export const DEFAULT_GAMESCOPE_POLICY: GamescopePolicy = {
  enabled: true,
  backend: "wayland",
  exposeWayland: true,
}

export const normalizeGamescopePolicy = (
  policy: GamescopePolicy | undefined,
): GamescopePolicy => ({
  ...DEFAULT_GAMESCOPE_POLICY,
  ...(policy ?? {}),
})

/**
 * The set of inheritable behavior fields shared by every layer-bearing
 * record. Identity fields (`system`, `contentPath`) are NOT here — they
 * live on `GamePayload` only.
 *
 * Future `cpu` and `hooks` slots are reserved by adding them here; the
 * cascade merge rules don't change.
 */
export const InheritableLayer = Schema.Struct({
  gamescope: Schema.optional(GamescopePolicy),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  patches: Schema.optional(Schema.Array(Schema.String)),
})
export type InheritableLayer = Schema.Schema.Type<typeof InheritableLayer>

/**
 * `byLauncher: Record<launcherId, InheritableLayer>` — scoped contributions
 * keyed by launcher id. At cascade time, only the entry matching the
 * resolved launcher contributes; the others are ignored.
 */
export const ByLauncherPayload = Schema.Record(Schema.String, InheritableLayer)
export type ByLauncherPayload = Schema.Schema.Type<typeof ByLauncherPayload>

export const decodeGamescopePolicy = (input: unknown): GamescopePolicy =>
  Schema.decodeUnknownSync(GamescopePolicy)(input, STRICT)

export const decodeInheritableLayer = (input: unknown): InheritableLayer =>
  Schema.decodeUnknownSync(InheritableLayer)(input, STRICT)

export const decodeByLauncherPayload = (input: unknown): ByLauncherPayload =>
  Schema.decodeUnknownSync(ByLauncherPayload)(input, STRICT)
