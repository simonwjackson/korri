import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"
import { LaunchSettings } from "../launch-block"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "app values must be non-empty",
    }),
  ),
)

export const AppPayload = Schema.Struct({
  settings: Schema.optional(LaunchSettings),

  // Optional executable shape for custom apps or built-in overrides.
  command: Schema.optional(NonEmptyString),
  args: Schema.optional(Schema.Array(Schema.String)),
  systems: Schema.optional(Schema.Array(Schema.String)),
  policy: Schema.optional(
    Schema.Struct({
      allowedCommands: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),

  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type AppPayload = Schema.Schema.Type<typeof AppPayload>

export const AppRecord = Schema.Struct({
  id: NonEmptyString,
  ...AppPayload.fields,
})
export type AppRecord = Schema.Schema.Type<typeof AppRecord>

export const decodeAppPayload = (input: unknown): AppPayload =>
  Schema.decodeUnknownSync(AppPayload)(input, STRICT)
