import type { EntrySource } from "@platform/api/rpc/entry-source"
import { Schema } from "effect"

/**
 * Structural schema for launch-routing source tags.
 *
 * Catalog snapshots often carry plain JSON objects after peer fetches and fold
 * composition, so launch alternatives must decode structurally instead of
 * requiring an `EntrySource` class instance.
 */
const LaunchAlternativeSource = Schema.Struct({
  hostId: Schema.String,
  controlUrl: Schema.String,
  isLocal: Schema.Boolean,
})

/**
 * One concrete copy that can satisfy a folded catalog launch.
 *
 * The id/source pair is the minimum routing proof. Optional fields preserve the
 * existing launch selectors when a surface starts from a folded item rather
 * than a raw local entry.
 */
export const LaunchAlternative = Schema.Struct({
  id: Schema.String,
  source: LaunchAlternativeSource,
  releaseId: Schema.optional(Schema.String),
  appId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  profileId: Schema.optional(Schema.String),
  presetId: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
})

export type LaunchAlternative = Omit<
  Schema.Schema.Type<typeof LaunchAlternative>,
  "source"
> & {
  readonly source: EntrySource
}
