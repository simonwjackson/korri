/**
 * Preset — a named bundle of inheritable contributions, nested under an
 * owning record (`global`, `user`, `system`, `launcher`, `game`).
 *
 * Presets are the full behavior layer. They can set ANY inheritable
 * field (including `launcher`) and launcher-keyed contributions via
 * `byLauncher.<id>.*`. The only fields presets cannot set are:
 * - Identity fields (`system`, `contentPath`) — those live on
 *   `GamePayload` only. The cascade resolver treats them as non-
 *   inheritable; presets that try to set them fail decode.
 * - Nested presets — no presets-in-presets. Same-name presets across
 *   layers form a deep-merge chain instead.
 *
 * `inherit: false` truncates the deep-merge chain at this preset's
 * link, ignoring all less-specific contributions.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { LaunchBlock } from "../launch-block"

const STRICT = { onExcessProperty: "error" } as const

export const PresetPayload = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  launch: Schema.optional(LaunchBlock),
  launcher: Schema.optional(Schema.String),
  inherit: Schema.optional(Schema.Boolean),
  byLauncher: Schema.optional(ByLauncherPayload),
  // Inline the inheritable behavior whitelist so the strict-mode check
  // sees every key on the same struct (Effect Schema's struct-extension
  // helpers don't flatten cleanly for excess-property checking).
  moonlight: InheritableLayer.fields.moonlight,
  retroarch: InheritableLayer.fields.retroarch,
  ryubing: InheritableLayer.fields.ryubing,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type PresetPayload = Schema.Schema.Type<typeof PresetPayload>

/**
 * Presets are persisted as a map keyed by preset name under their
 * owning record's `presets:` field. The map value is the payload above.
 */
export const PresetMapPayload = Schema.Record(Schema.String, PresetPayload)
export type PresetMapPayload = Schema.Schema.Type<typeof PresetMapPayload>

export const decodePresetPayload = (input: unknown): PresetPayload =>
  Schema.decodeUnknownSync(PresetPayload)(input, STRICT)

export const decodePresetMapPayload = (input: unknown): PresetMapPayload =>
  Schema.decodeUnknownSync(PresetMapPayload)(input, STRICT)
