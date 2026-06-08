import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "profile values must be non-empty",
    }),
  ),
)

export const ProfilePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  app: Schema.optional(NonEmptyString),
  runtime: Schema.optional(NonEmptyString),

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type ProfilePayload = Schema.Schema.Type<typeof ProfilePayload>

export const ProfileRecord = Schema.Struct({
  id: Schema.String,
  ...ProfilePayload.fields,
})
export type ProfileRecord = Schema.Schema.Type<typeof ProfileRecord>

export const decodeProfilePayload = (input: unknown): ProfilePayload =>
  Schema.decodeUnknownSync(ProfilePayload)(input, STRICT)

export const decodeProfileRecord = (input: unknown): ProfileRecord =>
  Schema.decodeUnknownSync(ProfileRecord)(input, STRICT)
