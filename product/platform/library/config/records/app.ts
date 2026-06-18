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

export const AppKind = NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      value === "steam"
        ? "kind: steam was retired; use kind: @korri:steam"
        : undefined,
    ),
  ),
)
export type AppKind = Schema.Schema.Type<typeof AppKind>

const AppPayloadBase = Schema.Struct({
  settings: Schema.optional(LaunchSettings),
  kind: Schema.optional(AppKind),

  // Optional executable shape for custom apps or built-in overrides.
  command: Schema.optional(NonEmptyString),
  runtime: Schema.optional(NonEmptyString),
  args: Schema.optional(Schema.Array(Schema.String)),
  systems: Schema.optional(Schema.Array(Schema.String)),
  policy: Schema.optional(
    Schema.Struct({
      allowedCommands: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),

  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),

  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  plugin: InheritableLayer.fields.plugin,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})

export const AppPayload = AppPayloadBase
export type AppPayload = Schema.Schema.Type<typeof AppPayload>

export const AppRecord = Schema.Struct({
  id: NonEmptyString,
  ...AppPayloadBase.fields,
})
export type AppRecord = Schema.Schema.Type<typeof AppRecord>

export const decodeAppPayload = (input: unknown): AppPayload =>
  Schema.decodeUnknownSync(AppPayload)(input, STRICT)

export const decodeAppRecord = (input: unknown): AppRecord =>
  Schema.decodeUnknownSync(AppRecord)(input, STRICT)

export const appRecordKind = (app: Pick<AppRecord, "id" | "kind">): AppKind =>
  app.kind ?? "process"
