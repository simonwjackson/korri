import { ResolvedGameMedia } from "@platform/fixtures/games/game"
import { Schema } from "effect"

const DisplayMetadata = Schema.Record(Schema.String, Schema.Unknown)
const ReleaseTarget = Schema.Union([Schema.String, Schema.Array(Schema.String)])

export const PlayableReleaseEntry = Schema.Struct({
  id: Schema.String,
  system: Schema.String,
  source: Schema.optional(Schema.String),
  target: Schema.optional(ReleaseTarget),
  app: Schema.optional(Schema.String),
  runtime: Schema.optional(Schema.String),
  display: Schema.optional(DisplayMetadata),
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
   * This is derived from the readable playable entry, not persisted old schema.
   */
  metadata: Schema.optional(
    Schema.Struct({
      name: Schema.optional(Schema.String),
    }),
  ),
  media: Schema.optional(Schema.Array(ResolvedGameMedia)),
})
export type PlayableLibraryEntry = Schema.Schema.Type<
  typeof PlayableLibraryEntry
>
