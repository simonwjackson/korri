import { Schema } from "effect"

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "launcher profile values must be non-empty",
    }),
  ),
)

export const LauncherProfileDefaults = Schema.Struct({
  contentPath: Schema.optional(Schema.String),
  system: Schema.optional(Schema.String),
  emulator: Schema.optional(Schema.String),
  core: Schema.optional(Schema.String),
})
export type LauncherProfileDefaults = Schema.Schema.Type<
  typeof LauncherProfileDefaults
>

export const LauncherProfilePolicy = Schema.Struct({
  allowedCommands: Schema.optional(Schema.Array(Schema.String)),
})
export type LauncherProfilePolicy = Schema.Schema.Type<
  typeof LauncherProfilePolicy
>

export const LauncherProfilePayloadRecord = Schema.Struct({
  command: NonEmptyString,
  args: Schema.Array(Schema.String),
  defaults: Schema.optional(LauncherProfileDefaults),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  policy: Schema.optional(LauncherProfilePolicy),
})
export type LauncherProfilePayloadRecord = Schema.Schema.Type<
  typeof LauncherProfilePayloadRecord
>

export const LauncherProfileRecord = Schema.Struct({
  id: NonEmptyString,
  command: NonEmptyString,
  args: Schema.Array(Schema.String),
  defaults: Schema.optional(LauncherProfileDefaults),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
  policy: Schema.optional(LauncherProfilePolicy),
})
export type LauncherProfileRecord = Schema.Schema.Type<
  typeof LauncherProfileRecord
>

export const decodeLauncherProfileRecord = Schema.decodeUnknownSync(
  LauncherProfileRecord,
)
