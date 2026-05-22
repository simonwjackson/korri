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

import { GameMetadata, GameUserData } from "@shared/fixtures/games/game"
import { Schema } from "effect"

import { ByLauncherPayload, InheritableLayer } from "../inheritable-fields"
import { PresetMapPayload } from "./preset"

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
