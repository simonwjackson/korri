import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"

const STRICT = { onExcessProperty: "error" } as const

const NonEmptyString = Schema.String.pipe(
  Schema.check(
    Schema.isMinLength(1, {
      message: "library values must be non-empty",
    }),
  ),
)

const DisplayMetadata = Schema.Record(Schema.String, Schema.Unknown)

const TargetString = NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      value.startsWith("/")
        ? {
            path: ["target"],
            issue:
              "release target must be a service URI or a relative source path",
          }
        : undefined,
    ),
  ),
)

const Target = Schema.Union([
  TargetString,
  Schema.Array(TargetString).pipe(
    Schema.check(
      Schema.makeFilter((targets: readonly string[]) =>
        targets.length > 0
          ? undefined
          : {
              path: ["target"],
              issue: "release target array must not be empty",
            },
      ),
    ),
  ),
])

export const LibraryReleasePayload = Schema.Struct({
  id: NonEmptyString,
  source: Schema.optional(NonEmptyString),
  system: NonEmptyString,
  target: Schema.optional(Target),
  app: Schema.optional(NonEmptyString),
  runtime: Schema.optional(NonEmptyString),
  display: Schema.optional(DisplayMetadata),

  gamescope: InheritableLayer.fields.gamescope,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type LibraryReleasePayload = Schema.Schema.Type<
  typeof LibraryReleasePayload
>

const ReleaseList = Schema.Array(LibraryReleasePayload).pipe(
  Schema.check(
    Schema.makeFilter((releases: readonly LibraryReleasePayload[]) => {
      if (releases.length === 0) {
        return {
          path: ["releases"],
          issue: "library item must declare at least one release",
        }
      }
      if (!releases.some(release => release.target !== undefined)) {
        return {
          path: ["releases"],
          issue:
            "library item must declare at least one launchable release target",
        }
      }
      return undefined
    }),
  ),
)

export const ContainedPlayablePayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  "version-of": Schema.optional(NonEmptyString),
  relation: Schema.optional(NonEmptyString),
  collections: Schema.optional(Schema.Array(NonEmptyString)),
  display: Schema.optional(DisplayMetadata),

  gamescope: InheritableLayer.fields.gamescope,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type ContainedPlayablePayload = Schema.Schema.Type<
  typeof ContainedPlayablePayload
>

export const LibraryItemPayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  source: Schema.optional(NonEmptyString),
  "version-of": Schema.optional(NonEmptyString),
  relation: Schema.optional(NonEmptyString),
  collections: Schema.optional(Schema.Array(NonEmptyString)),
  display: Schema.optional(DisplayMetadata),
  contains: Schema.optional(
    Schema.Record(NonEmptyString, ContainedPlayablePayload),
  ),
  releases: ReleaseList,

  gamescope: InheritableLayer.fields.gamescope,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type LibraryItemPayload = Schema.Schema.Type<typeof LibraryItemPayload>

export const LibraryItemRecord = Schema.Struct({
  id: NonEmptyString,
  ...LibraryItemPayload.fields,
})
export type LibraryItemRecord = Schema.Schema.Type<typeof LibraryItemRecord>

export const decodeLibraryItemPayload = (input: unknown): LibraryItemPayload =>
  Schema.decodeUnknownSync(LibraryItemPayload)(input, STRICT)

export const decodeLibraryItemRecord = (input: unknown): LibraryItemRecord =>
  Schema.decodeUnknownSync(LibraryItemRecord)(input, STRICT)
