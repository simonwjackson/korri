/**
 * Global config — the least-specific layer of the cascade.
 *
 * Persisted as a singleton in the `config` collection under the key
 * `"global"`. Carries root-level inheritable behavior, global presets,
 * and the global default `launcher`.
 *
 * The plan declared this as a "singleton" intentionally: there is
 * exactly one valid key. ProseQL's `documents` source doesn't enforce
 * cardinality natively; the library-db layer asserts that the `config`
 * collection contains at most one record and its id is `"global"`.
 *
 * Unlike user/system/launcher/game/preset layers, `inherit: false` is
 * NOT meaningful at the global layer — there is nothing less-specific
 * to truncate to — so the schema rejects it. Forces typos to surface
 * here rather than silently no-op.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

/** The only valid id for a record in the singleton `config` collection. */
export const GLOBAL_CONFIG_KEY = "global" as const
export type GlobalConfigKey = typeof GLOBAL_CONFIG_KEY

export const GlobalConfigPayload = Schema.Struct({
  // Global default launcher.
  launcher: Schema.optional(Schema.String),

  // Global layer-bearing fields. No `inherit` — nothing to truncate to.
  presets: Schema.optional(PresetMapPayload),
  byLauncher: Schema.optional(ByLauncherPayload),

  // Inlined inheritable whitelist.
  gamescope: InheritableLayer.fields.gamescope,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
})
export type GlobalConfigPayload = Schema.Schema.Type<typeof GlobalConfigPayload>

export const GlobalConfigRecord = Schema.Struct({
  id: Schema.Literal(GLOBAL_CONFIG_KEY),
  ...GlobalConfigPayload.fields,
})
export type GlobalConfigRecord = Schema.Schema.Type<typeof GlobalConfigRecord>

export const decodeGlobalConfigPayload = (
  input: unknown,
): GlobalConfigPayload =>
  Schema.decodeUnknownSync(GlobalConfigPayload)(input, STRICT)

export const decodeGlobalConfigRecord = (input: unknown): GlobalConfigRecord =>
  Schema.decodeUnknownSync(GlobalConfigRecord)(input, STRICT)
