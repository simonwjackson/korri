/**
 * Re-export the canonical `GameRecord`, `GameMetadata`, `GameUserData`,
 * and `Media` from the new cascade-config module
 * (`@shared/library/config/records/game`). Helpers that operate on
 * `GameRecord` (image-url, display-name) stay here so consumers keep
 * using `@shared/fixtures/games/game` without churn.
 */

import {
  decodeGameRecord as decodeGamePayloadOrRecord,
  GameMetadata,
  type GamePayload,
  GameRecord,
  GameUserData,
  Media,
  MediaRole,
  MediaSource,
  MediaSourceProvider,
  MediaType,
} from "@shared/library/config/records/game"
import {
  GameAssetId,
  GameAssetSource,
  GameAssetType,
} from "@shared/library/config/records/game-asset"
import { GameAssetRole } from "@shared/library/config/records/game-asset-assignment"
import { Schema } from "effect"

export type { GamePayload }
export {
  GameMetadata,
  GameRecord,
  GameUserData,
  Media,
  MediaRole,
  MediaSource,
  MediaSourceProvider,
  MediaType,
}
export const ResolvedGameMedia = Schema.Struct({
  role: GameAssetRole,
  type: GameAssetType,
  width: Schema.Int,
  height: Schema.Int,
  source: Schema.optional(GameAssetSource),
  assetId: GameAssetId,
  url: Schema.String,
})
export type ResolvedGameMedia = Schema.Schema.Type<typeof ResolvedGameMedia>

export const ResolvedGameRecord = Schema.Struct({
  ...GameRecord.fields,
  media: Schema.optional(Schema.Array(ResolvedGameMedia)),
})
export type ResolvedGameRecord = Schema.Schema.Type<typeof ResolvedGameRecord>

export const decodeGameRecord = decodeGamePayloadOrRecord
export const decodeGameRecordArray = Schema.decodeUnknownSync(
  Schema.Array(GameRecord),
)

/**
 * Returns tile-oriented resolved image art, or undefined.
 */
export function getGameImageUrl(game: ResolvedGameRecord): string | undefined {
  const images = game.media?.filter(m => m.type === "image") ?? []
  return (
    images.find(m => m.role === "tile")?.url ??
    images.find(m => m.role === "poster")?.url ??
    images[0]?.url
  )
}

/**
 * Returns wide/landscape resolved image art for feature surfaces when available.
 */
export function getGameWideImageUrl(
  game: ResolvedGameRecord,
): string | undefined {
  const images = game.media?.filter(m => m.type === "image") ?? []
  return (
    images.find(m => m.role === "banner")?.url ??
    images.find(m => m.role === "hero")?.url ??
    images.find(m => m.role === "tile")?.url ??
    images[0]?.url
  )
}

/**
 * Display name with id fallback.
 */
export function getGameDisplayName(
  game: Schema.Schema.Type<typeof GameRecord>,
): string {
  return game.metadata?.name ?? game.id
}
