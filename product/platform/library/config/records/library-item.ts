import { Schema } from "effect"

import { InheritableLayer } from "../inheritable-fields"
import { LocalPlayableId, PlayableId } from "../playable-id"
import { AppChoiceList } from "./app-choice"

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
  id: LocalPlayableId,
  source: Schema.optional(NonEmptyString),
  system: NonEmptyString,
  target: Schema.optional(Target),
  app: Schema.optional(Schema.Unknown),
  runtime: Schema.optional(Schema.Unknown),
  apps: Schema.optional(AppChoiceList),
  display: Schema.optional(DisplayMetadata),

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  retroarch: InheritableLayer.fields.retroarch,
  ryubing: InheritableLayer.fields.ryubing,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
}).pipe(
  Schema.check(
    Schema.makeFilter(release => {
      if (release.app !== undefined) {
        return {
          path: ["app"],
          issue: "release.app was removed; use release.apps[] choices",
        }
      }
      if (release.runtime !== undefined) {
        return {
          path: ["runtime"],
          issue: "release.runtime was removed; use release.apps[].runtime",
        }
      }
      return undefined
    }),
  ),
)
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
      const ids = new Set<string>()
      for (const release of releases) {
        if (ids.has(release.id)) {
          return {
            path: ["releases"],
            issue: `library item release id '${release.id}' must be unique`,
          }
        }
        ids.add(release.id)
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
  "version-of": Schema.optional(PlayableId),
  relation: Schema.optional(NonEmptyString),
  collections: Schema.optional(Schema.Array(NonEmptyString)),
  display: Schema.optional(DisplayMetadata),

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  retroarch: InheritableLayer.fields.retroarch,
  ryubing: InheritableLayer.fields.ryubing,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type ContainedPlayablePayload = Schema.Schema.Type<
  typeof ContainedPlayablePayload
>

const ContainsMap = Schema.Record(
  LocalPlayableId,
  ContainedPlayablePayload,
).pipe(
  Schema.check(
    Schema.makeFilter(
      (contains: Readonly<Record<string, ContainedPlayablePayload>>) =>
        Object.keys(contains).length > 0
          ? undefined
          : {
              path: ["contains"],
              issue: "contains must name at least one local playable",
            },
    ),
  ),
)

export const LibraryItemPayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  source: Schema.optional(NonEmptyString),
  "version-of": Schema.optional(PlayableId),
  relation: Schema.optional(NonEmptyString),
  collections: Schema.optional(Schema.Array(NonEmptyString)),
  display: Schema.optional(DisplayMetadata),
  contains: Schema.optional(ContainsMap),
  releases: ReleaseList,

  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  retroarch: InheritableLayer.fields.retroarch,
  ryubing: InheritableLayer.fields.ryubing,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type LibraryItemPayload = Schema.Schema.Type<typeof LibraryItemPayload>

export const LibraryItemRecord = Schema.Struct({
  id: LocalPlayableId,
  ...LibraryItemPayload.fields,
})
export type LibraryItemRecord = Schema.Schema.Type<typeof LibraryItemRecord>

export const decodeLibraryItemPayload = (input: unknown): LibraryItemPayload =>
  Schema.decodeUnknownSync(LibraryItemPayload)(input, STRICT)

export const decodeLibraryItemRecord = (input: unknown): LibraryItemRecord =>
  Schema.decodeUnknownSync(LibraryItemRecord)(input, STRICT)
