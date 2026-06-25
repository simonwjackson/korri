import {
  ResolvedGameMedia,
  type ResolvedGameRecord,
} from "@platform/fixtures/games/game"
import { GameMetadata } from "@platform/library/config/records/game"
import { ProviderInstallMetadataSchema } from "@platform/library/install-state"
import { Schema } from "effect"

const DisplayMetadata = Schema.Record(Schema.String, Schema.Unknown)
const FileReleaseTarget = Schema.Struct({
  kind: Schema.Literal("file"),
  storage: Schema.String,
  path: Schema.String,
})
const UrlReleaseTarget = Schema.Struct({
  kind: Schema.Literal("url"),
  value: Schema.String,
})
const ExecutableReleaseTarget = Schema.Struct({
  kind: Schema.Literal("executable"),
  path: Schema.String,
})
const ProviderRefReleaseTarget = Schema.Struct({
  kind: Schema.Literal("provider-ref"),
  provider: Schema.String,
  ref: Schema.String,
})
const FileSetReleaseTarget = Schema.Struct({
  kind: Schema.Literal("file-set"),
  storage: Schema.String,
  root: Schema.optional(Schema.String),
  files: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      role: Schema.optional(Schema.String),
      path: Schema.String,
    }),
  ),
})
const ReleaseTarget = Schema.Union([
  UrlReleaseTarget,
  FileReleaseTarget,
  FileSetReleaseTarget,
  ExecutableReleaseTarget,
  ProviderRefReleaseTarget,
])
const ReleaseLaunchSummary = Schema.Struct({
  use: Schema.optional(Schema.String),
  plugin: Schema.optional(Schema.String),
  runtime: Schema.optional(Schema.String),
})

export const PlayableReleaseEntry = Schema.Struct({
  id: Schema.String,
  system: Schema.String,
  target: Schema.optional(ReleaseTarget),
  launch: Schema.optional(ReleaseLaunchSummary),
  display: Schema.optional(DisplayMetadata),
  install: Schema.optional(ProviderInstallMetadataSchema),
  launchable: Schema.Boolean,
})
export type PlayableReleaseEntry = Schema.Schema.Type<
  typeof PlayableReleaseEntry
>

export const PlayableLibraryEntry = Schema.Struct({
  id: Schema.String,
  itemId: Schema.String,
  containedId: Schema.optional(Schema.String),
  title: Schema.optional(Schema.String),
  collections: Schema.optional(Schema.Array(Schema.String)),
  versionOf: Schema.optional(Schema.String),
  relation: Schema.optional(Schema.String),
  display: Schema.optional(DisplayMetadata),
  releases: Schema.Array(PlayableReleaseEntry),
  launchable: Schema.Boolean,
  system: Schema.optional(Schema.String),
  userData: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),

  /**
   * Temporary display compatibility while UI callers are realigned to title.
   * Readable entries forward persisted metadata when present.
   */
  metadata: Schema.optional(GameMetadata),
  media: Schema.optional(Schema.Array(ResolvedGameMedia)),
})
export type PlayableLibraryEntry = Schema.Schema.Type<
  typeof PlayableLibraryEntry
>

export type PlayableLibraryInput = PlayableLibraryEntry | ResolvedGameRecord

export function playableEntryFromResolvedGame(
  game: ResolvedGameRecord,
): PlayableLibraryEntry {
  const title = game.metadata?.name ?? game.id
  return {
    id: game.id,
    itemId: game.id,
    title,
    launchable: true,
    releases: [
      {
        id: game.system,
        system: game.system,
        launchable: true,
      },
    ],
    system: game.system,
    metadata: { name: title, ...game.metadata },
    ...(game.userData ? { userData: game.userData } : {}),
    media: game.media,
  }
}

export function asPlayableLibraryEntry(
  entry: PlayableLibraryInput,
): PlayableLibraryEntry {
  return "releases" in entry ? entry : playableEntryFromResolvedGame(entry)
}
