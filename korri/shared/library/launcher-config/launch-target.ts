import { LaunchSpec } from "@shared/library/launcher"
import { Schema } from "effect"

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "launch target values must be non-empty",
    }),
  ),
)

const FlatLaunchTargetFields = {
  profile: NonEmptyString,
  contentPath: NonEmptyString,
  system: Schema.optional(Schema.String),
  emulator: Schema.optional(Schema.String),
  core: Schema.optional(Schema.String),
  argsAppend: Schema.optional(Schema.Array(Schema.String)),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cwd: Schema.optional(Schema.String),
} as const

export const ProfileBackedLaunchTargetPayloadRecord = Schema.Struct(
  FlatLaunchTargetFields,
)
export type ProfileBackedLaunchTargetPayloadRecord = Schema.Schema.Type<
  typeof ProfileBackedLaunchTargetPayloadRecord
>

export const ProfileBackedLaunchTargetRecord = Schema.Struct({
  id: NonEmptyString,
  ...FlatLaunchTargetFields,
})
export type ProfileBackedLaunchTargetRecord = Schema.Schema.Type<
  typeof ProfileBackedLaunchTargetRecord
>

export const LegacyLaunchTargetPayloadRecord = Schema.Struct({
  gameId: Schema.String,
  spec: LaunchSpec,
})
export type LegacyLaunchTargetPayloadRecord = Schema.Schema.Type<
  typeof LegacyLaunchTargetPayloadRecord
>

export const LegacyLaunchTargetRecord = Schema.Struct({
  id: Schema.String,
  gameId: Schema.String,
  spec: LaunchSpec,
})
export type LegacyLaunchTargetRecord = Schema.Schema.Type<
  typeof LegacyLaunchTargetRecord
>

export const LaunchTargetPayloadRecord = Schema.Union([
  ProfileBackedLaunchTargetPayloadRecord,
  LegacyLaunchTargetPayloadRecord,
])
export type LaunchTargetPayloadRecord = Schema.Schema.Type<
  typeof LaunchTargetPayloadRecord
>

export const LaunchTargetRecord = Schema.Union([
  ProfileBackedLaunchTargetRecord,
  LegacyLaunchTargetRecord,
])
export type LaunchTargetRecord = Schema.Schema.Type<typeof LaunchTargetRecord>

export function isProfileBackedLaunchTarget(
  target: LaunchTargetRecord,
): target is ProfileBackedLaunchTargetRecord {
  return "profile" in target
}

export function isLegacyLaunchTarget(
  target: LaunchTargetRecord,
): target is LegacyLaunchTargetRecord {
  return "spec" in target
}

export const decodeLaunchTargetRecord =
  Schema.decodeUnknownSync(LaunchTargetRecord)
