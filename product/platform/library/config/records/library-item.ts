import { Schema } from "effect"

import { InheritableLayer, LaunchWithPolicy } from "../inheritable-fields"
import { LaunchSettings } from "../launch-block"
import { LocalPlayableId, PlayableId } from "../playable-id"
import { GameMetadata, GameUserData } from "./game"
import { ProviderId } from "./provider"

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
              "release target URI/string values must not be absolute paths",
          }
        : undefined,
    ),
  ),
)

const FileTarget = Schema.Struct({
  kind: Schema.Literal("file"),
  storage: NonEmptyString,
  path: TargetString,
})

const FileSetPart = Schema.Struct({
  id: NonEmptyString,
  role: Schema.optional(NonEmptyString),
  path: TargetString,
})

const FileSetTarget = Schema.Struct({
  kind: Schema.Literal("file-set"),
  storage: NonEmptyString,
  root: Schema.optional(TargetString),
  files: Schema.Array(FileSetPart).pipe(
    Schema.check(
      Schema.makeFilter(
        (files: readonly Schema.Schema.Type<typeof FileSetPart>[]) => {
          if (files.length === 0) {
            return {
              path: ["files"],
              issue: "file-set targets must declare at least one file",
            }
          }
          const ids = new Set<string>()
          for (const file of files) {
            if (ids.has(file.id)) {
              return {
                path: ["files"],
                issue: `file-set target file id '${file.id}' must be unique`,
              }
            }
            ids.add(file.id)
          }
          return undefined
        },
      ),
    ),
  ),
})

const ExecutableTarget = Schema.Struct({
  kind: Schema.Literal("executable"),
  path: TargetString,
})

const UrlTarget = Schema.Struct({
  kind: Schema.Literal("url"),
  value: TargetString,
})

const ProviderRefTarget = Schema.Struct({
  kind: Schema.Literal("provider-ref"),
  provider: ProviderId,
  ref: NonEmptyString,
})

const Target = Schema.Union([
  FileTarget,
  FileSetTarget,
  ExecutableTarget,
  UrlTarget,
  ProviderRefTarget,
])

const LaunchInput = Schema.Struct({
  part: Schema.optional(NonEmptyString),
  roles: Schema.optional(Schema.Array(NonEmptyString)),
})

const LaunchOverrides = Schema.Struct({
  args: Schema.optional(
    Schema.Struct({
      prepend: Schema.optional(Schema.Array(Schema.String)),
      append: Schema.optional(Schema.Array(Schema.String)),
      replace: Schema.optional(Schema.Array(Schema.String)),
    }),
  ),
  config: Schema.optional(
    Schema.Struct({
      prepend: Schema.optional(Schema.String),
      append: Schema.optional(Schema.String),
      replace: Schema.optional(Schema.String),
    }),
  ),
})

const ReleaseLaunch = Schema.Struct({
  use: Schema.optional(NonEmptyString),
  plugin: Schema.optional(ProviderId),
  runtime: Schema.optional(NonEmptyString),
  input: Schema.optional(LaunchInput),
  settings: Schema.optional(LaunchSettings),
  with: Schema.optional(LaunchWithPolicy),
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  overrides: Schema.optional(LaunchOverrides),
}).pipe(
  Schema.check(
    Schema.makeFilter(launch =>
      launch.use !== undefined && launch.plugin !== undefined
        ? {
            path: ["launch"],
            issue: "release.launch cannot specify both use and plugin",
          }
        : undefined,
    ),
  ),
)

export const LibraryReleasePayload = Schema.Struct({
  id: LocalPlayableId,
  source: Schema.optional(Schema.Unknown),
  system: NonEmptyString,
  target: Schema.optional(Target),
  app: Schema.optional(Schema.Unknown),
  runtime: Schema.optional(Schema.Unknown),
  apps: Schema.optional(Schema.Unknown),
  display: Schema.optional(DisplayMetadata),

  launch: Schema.optional(ReleaseLaunch),
  moonlight: InheritableLayer.fields.moonlight,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
}).pipe(
  Schema.check(
    Schema.makeFilter(release => {
      if (release.source !== undefined) {
        return {
          path: ["source"],
          issue: "release.source was removed; use provider-links[]",
        }
      }
      if (release.app !== undefined) {
        return {
          path: ["app"],
          issue: "release.app was removed; use release.launch",
        }
      }
      if (release.runtime !== undefined) {
        return {
          path: ["runtime"],
          issue: "release.runtime was removed; use release.launch.runtime",
        }
      }
      if (release.apps !== undefined) {
        return {
          path: ["apps"],
          issue: "release.apps was removed; use release.launch",
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

  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  plugin: InheritableLayer.fields.plugin,
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
  source: Schema.optional(Schema.Unknown),
  "version-of": Schema.optional(PlayableId),
  relation: Schema.optional(NonEmptyString),
  collections: Schema.optional(Schema.Array(NonEmptyString)),
  display: Schema.optional(DisplayMetadata),
  metadata: Schema.optional(GameMetadata),
  userData: Schema.optional(GameUserData),
  contains: Schema.optional(ContainsMap),
  releases: ReleaseList,

  launch: InheritableLayer.fields.launch,
  moonlight: InheritableLayer.fields.moonlight,
  plugin: InheritableLayer.fields.plugin,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
})
export type LibraryItemPayload = Schema.Schema.Type<typeof LibraryItemPayload>

export const LibraryItemRecord = Schema.Struct({
  id: LocalPlayableId,
  ...LibraryItemPayload.fields,
}).pipe(
  Schema.check(
    Schema.makeFilter(item =>
      item.source === undefined
        ? undefined
        : {
            path: ["source"],
            issue: "library item source was removed; use provider-links[]",
          },
    ),
  ),
)
export type LibraryItemRecord = Schema.Schema.Type<typeof LibraryItemRecord>

export const decodeLibraryItemPayload = (input: unknown): LibraryItemPayload =>
  Schema.decodeUnknownSync(LibraryItemPayload)(input, STRICT)

export const decodeLibraryItemRecord = (input: unknown): LibraryItemRecord =>
  Schema.decodeUnknownSync(LibraryItemRecord)(input, STRICT)
