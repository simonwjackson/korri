/**
 * Collection record — manual game groupings (favorites, classics,
 * a curated playlist).
 *
 * v1 scope: title/description + manual membership (the membership lives
 * on the game side via `GamePayload.collections: string[]`). Collection-
 * level policy contributions, smart filter-based membership, and
 * `basedOn` relationships are deferred.
 *
 * Layer-bearing: the `presets` field is reserved for future
 * collection-scoped presets. It decodes today so YAML written against
 * future tooling doesn't break here; the cascade resolver doesn't
 * consult collections in v1.
 */

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { PlayableId } from "../playable-id"
import { PresetMapPayload } from "./preset"

const STRICT = { onExcessProperty: "error" } as const

export const CollectionPayload = Schema.Struct({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  items: Schema.optional(Schema.Array(PlayableId)),

  // Layer-bearing fields (reserved; cascade does not consult in v1).
  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),
  byLauncher: Schema.optional(ByLauncherPayload),

  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
})
export type CollectionPayload = Schema.Schema.Type<typeof CollectionPayload>

export const CollectionRecord = Schema.Struct({
  id: Schema.String,
  ...CollectionPayload.fields,
})
export type CollectionRecord = Schema.Schema.Type<typeof CollectionRecord>

export const decodeCollectionPayload = (input: unknown): CollectionPayload =>
  Schema.decodeUnknownSync(CollectionPayload)(input, STRICT)

export const decodeCollectionRecord = (input: unknown): CollectionRecord =>
  Schema.decodeUnknownSync(CollectionRecord)(input, STRICT)
