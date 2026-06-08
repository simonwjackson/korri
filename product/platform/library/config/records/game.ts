/**
 * Game record — the only schema with identity fields (`system`,
 * `contentPath`). Identity fields bypass the cascade fold; presets and
 * ephemeral overrides cannot set them by construction (their schemas
 * forbid those keys).
 *
 * Carries fixture metadata + userData (preserves the existing
 * `GameRecord` shape from `shared/fixtures/games/game`), plus the full
 * inheritable behavior whitelist, optional explicit `launcher` and
 * `core` selections, manual `collections` membership, nested `presets`,
 * `byLauncher` contributions, and the `inherit: false` escape hatch.
 *
 * `id` is derived from the YAML object key by ProseQL's
 * `derivedFromKey` policy, so the payload struct intentionally omits it.
 */

import { ArtifactId } from "@platform/protocol/artifact/artifact"
import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { LaunchBlock } from "../launch-block"
import { PresetMapPayload } from "./preset"

/**
 * Legacy display media primitives are retained only for pre-existing
 * fixture/UI helper compatibility. Durable image truth now lives in the
 * game-assets catalog, so persisted `GamePayload` decoding rejects
 * `metadata.media` entries.
 */
export const MediaType = Schema.Literals(["image", "video", "audio"])
export type MediaType = Schema.Schema.Type<typeof MediaType>

export const MediaRole = Schema.Literals([
  "tile",
  "banner",
  "poster",
  "hero",
  "logo",
  "screenshot",
])
export type MediaRole = Schema.Schema.Type<typeof MediaRole>

export const MediaSourceProvider = Schema.Literals([
  "korri",
  "rocknix",
  "steamgriddb",
  "manual",
])
export type MediaSourceProvider = Schema.Schema.Type<typeof MediaSourceProvider>

export const MediaSource = Schema.Struct({
  provider: MediaSourceProvider,
  id: Schema.optional(Schema.String),
  url: Schema.optional(Schema.String),
})
export type MediaSource = Schema.Schema.Type<typeof MediaSource>

export const Media = Schema.Struct({
  type: MediaType,
  uri: Schema.String,
  role: Schema.optional(MediaRole),
  width: Schema.optional(Schema.Int),
  height: Schema.optional(Schema.Int),
  source: Schema.optional(MediaSource),
})
export type Media = Schema.Schema.Type<typeof Media>

export const GameMetadata = Schema.Struct({
  name: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  developer: Schema.optional(Schema.String),
  publisher: Schema.optional(Schema.String),
  releaseDate: Schema.optional(Schema.String),
  genre: Schema.optional(Schema.Array(Schema.String)),
  tags: Schema.optional(Schema.Array(Schema.String)),
  media: Schema.optional(Schema.Array(Media)),
}).check(
  Schema.makeFilter(metadata =>
    metadata.media === undefined
      ? undefined
      : {
          path: ["media"],
          issue: "persisted game metadata must not contain media entries",
        },
  ),
)
export type GameMetadata = Schema.Schema.Type<typeof GameMetadata>

export const GameUserData = Schema.Struct({
  lastPlayed: Schema.optional(
    Schema.Union([Schema.Date, Schema.DateFromString]),
  ),
  playtime: Schema.optional(Schema.Number),
  favorite: Schema.optional(Schema.Boolean),
})
export type GameUserData = Schema.Schema.Type<typeof GameUserData>

const STRICT = { onExcessProperty: "error" } as const

export const GameContent = Schema.Struct({
  artifactId: ArtifactId,
})
export type GameContent = Schema.Schema.Type<typeof GameContent>

const GamePayloadFields = {
  // Identity — required, lives nowhere else.
  system: Schema.String,
  contentPath: Schema.optional(Schema.String),
  content: Schema.optional(GameContent),

  // Fixture metadata (preserved from the legacy GameRecord shape).
  metadata: Schema.optional(GameMetadata),
  userData: Schema.optional(GameUserData),

  // Public launch block; launch.app/module win over legacy launcher/core.
  launch: Schema.optional(LaunchBlock),

  // Explicit selections (legacy aliases for launch.app / launch.module).
  launcher: Schema.optional(Schema.String),
  core: Schema.optional(Schema.String),

  // Manual collection membership (collection-side rules don't exist in v1).
  collections: Schema.optional(Schema.Array(Schema.String)),

  // Layer-bearing fields.
  inherit: Schema.optional(Schema.Boolean),
  presets: Schema.optional(PresetMapPayload),
  byLauncher: Schema.optional(ByLauncherPayload),

  // Inlined inheritable whitelist so the strict-mode check sees every
  // key on the same struct (Effect Schema's extension helpers don't
  // flatten cleanly for excess-property checking).
  gamescope: InheritableLayer.fields.gamescope,
  moonlight: InheritableLayer.fields.moonlight,
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
  patches: InheritableLayer.fields.patches,
}

const GameContentReferenceFilter = Schema.makeFilter<{
  readonly contentPath?: string
  readonly content?: GameContent
}>(value => {
  const hasContentPath = value.contentPath !== undefined
  const hasArtifactId = value.content?.artifactId !== undefined
  return hasContentPath !== hasArtifactId
    ? undefined
    : "game must declare exactly one of contentPath or content.artifactId"
})

export const GamePayload = Schema.Struct(GamePayloadFields).check(
  GameContentReferenceFilter,
)
export type GamePayload = Schema.Schema.Type<typeof GamePayload>

/**
 * Runtime shape (with `id` hydrated from the storage key).
 *
 * Applies the same content-reference invariant as `GamePayload`: a game must
 * have exactly one concrete local `contentPath` or durable `content.artifactId`.
 */
export const GameRecord = Schema.Struct({
  id: Schema.String,
  ...GamePayloadFields,
}).check(GameContentReferenceFilter)
export type GameRecord = Schema.Schema.Type<typeof GameRecord>

export const decodeGamePayload = (input: unknown): GamePayload =>
  Schema.decodeUnknownSync(GamePayload)(input, STRICT)

export const decodeGameRecord = (input: unknown): GameRecord =>
  Schema.decodeUnknownSync(GameRecord)(input, STRICT)
