import { EntrySource } from "@platform/api/rpc/entry-source-core"
import { Schema } from "effect"

/**
 * One concrete copy that can satisfy a folded catalog launch.
 *
 * The id/source pair is the minimum routing proof. Optional fields preserve the
 * existing launch selectors when a surface starts from a folded item rather
 * than a raw local entry.
 */
export const LaunchAlternative = Schema.Struct({
  id: Schema.String,
  source: EntrySource,
  releaseId: Schema.optional(Schema.String),
  appId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  profileId: Schema.optional(Schema.String),
  presetId: Schema.optional(Schema.Union([Schema.String, Schema.Null])),
})

export type LaunchAlternative = Schema.Schema.Type<typeof LaunchAlternative>
