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

import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { PresetMapPayload } from "./preset"

/**
 * Display metadata — what shows up in the renderer's tile grid. Shape
 * carried forward from the legacy `GameRecord`; the import path moved
 * from `@shared/fixtures/games/game` to here so the cascade records
 * module is self-contained.
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
})
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

export const GamePayload = Schema.Struct({
  // Identity — required, lives nowhere else.
  system: Schema.String,
  contentPath: Schema.String,

  // Fixture metadata (preserved from the legacy GameRecord shape).
  metadata: Schema.optional(GameMetadata),
  userData: Schema.optional(GameUserData),

  // Explicit selections (override the cascade).
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
  env: InheritableLayer.fields.env,
  cwd: InheritableLayer.fields.cwd,
  argsAppend: InheritableLayer.fields.argsAppend,
})
export type GamePayload = Schema.Schema.Type<typeof GamePayload>

/**
 * Runtime shape (with `id` hydrated from the storage key).
 */
export const GameRecord = Schema.Struct({
  id: Schema.String,
  ...GamePayload.fields,
})
export type GameRecord = Schema.Schema.Type<typeof GameRecord>

export const decodeGamePayload = (input: unknown): GamePayload =>
  Schema.decodeUnknownSync(GamePayload)(input, STRICT)

export const decodeGameRecord = (input: unknown): GameRecord =>
  Schema.decodeUnknownSync(GameRecord)(input, STRICT)
