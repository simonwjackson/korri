/**
 * Launcher record — describes an executable that can run games for a
 * set of systems. Carries the argv template (`command`, `args`) used
 * downstream by `composeLaunchSpec` to fill `{contentPath}`, `{core}`,
 * `{system}`, `{emulator}` placeholders.
 *
 * Layer-bearing: presets nested under a launcher are conditionally
 * visible (only when the launcher is the resolved default for the
 * current game's system).
 *
 * Identity fields (`system`, `contentPath`) live on `GamePayload`
 * only. The launcher's `systems` list is *supported systems*, not
 * identity.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "launcher values must be non-empty",
    }),
  ),
)

export const LauncherPayload = Schema.Struct({
  command: NonEmptyString,
  args: Schema.Array(Schema.String),
  systems: Schema.Array(Schema.String),

  // Optional policy (carried over from launcher-profile).
  policy: Schema.optional(
    Schema.Struct({
      allowedCommands: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),

  // Layer-bearing fields.
  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),
  byLauncher: Schema.optional(ByLauncherPayload),

  // Inlined inheritable whitelist (see preset.ts for the rationale).
  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  plugin: InheritableLayer.fields.plugin,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type LauncherPayload = Schema.Schema.Type<typeof LauncherPayload>

export const LauncherRecord = Schema.Struct({
  id: NonEmptyString,
  ...LauncherPayload.fields,
})
export type LauncherRecord = Schema.Schema.Type<typeof LauncherRecord>

export const decodeLauncherPayload = (input: unknown): LauncherPayload =>
  Schema.decodeUnknownSync(LauncherPayload)(input, STRICT)

export const decodeLauncherRecord = (input: unknown): LauncherRecord =>
  Schema.decodeUnknownSync(LauncherRecord)(input, STRICT)
