/**
 * System record — per-platform configuration (snes, psx, switch).
 *
 * The `cores` map captures per-launcher core defaults
 * (`cores.<launcherId> = <coreString>`). At cascade time, the resolved
 * launcher's entry is used as the default core unless the game's
 * `core` field overrides it.
 *
 * Layer-bearing: presets nested under a system are always visible
 * (presets at every owner's path contribute to the menu). The `launcher`
 * field sets a per-system default that the cascade pulls in unless a
 * more-specific layer overrides it.
 *
 * Identity fields stay on `GamePayload` — system records are about
 * the platform, not a specific piece of content.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

export const SystemPayload = Schema.Struct({
  // Display metadata (optional; populated by ROCKNIX importer).
  name: Schema.optional(Schema.String),
  manufacturer: Schema.optional(Schema.String),

  // Per-launcher core defaults: `cores.<launcherId> = <coreString>`.
  cores: Schema.optional(Schema.Record(Schema.String, Schema.String)),

  // Per-system default launcher.
  launcher: Schema.optional(Schema.String),

  // Layer-bearing fields.
  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),
  byLauncher: Schema.optional(ByLauncherPayload),

  // Inlined inheritable whitelist.
  gamescope: InheritableLayer.fields.gamescope,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
})
export type SystemPayload = Schema.Schema.Type<typeof SystemPayload>

export const SystemRecord = Schema.Struct({
  id: Schema.String,
  ...SystemPayload.fields,
})
export type SystemRecord = Schema.Schema.Type<typeof SystemRecord>

export const decodeSystemPayload = (input: unknown): SystemPayload =>
  Schema.decodeUnknownSync(SystemPayload)(input, STRICT)

export const decodeSystemRecord = (input: unknown): SystemRecord =>
  Schema.decodeUnknownSync(SystemRecord)(input, STRICT)
