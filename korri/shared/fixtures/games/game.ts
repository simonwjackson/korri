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
export const decodeGameRecord = decodeGamePayloadOrRecord
export const decodeGameRecordArray = Schema.decodeUnknownSync(
  Schema.Array(GameRecord),
)

/**
 * Returns the URI of the first image entry in `metadata.media`, or undefined.
 */
export function getGameImageUrl(
  game: Schema.Schema.Type<typeof GameRecord>,
): string | undefined {
  const images = game.metadata?.media?.filter(m => m.type === "image") ?? []
  return (
    images.find(m => m.role === "tile")?.uri ??
    images.find(m => m.role === "poster")?.uri ??
    images.find(m => isCoverImageUri(m.uri))?.uri ??
    images[0]?.uri
  )
}

/**
 * Returns wide/landscape art for feature surfaces when available.
 */
export function getGameWideImageUrl(
  game: Schema.Schema.Type<typeof GameRecord>,
): string | undefined {
  const images = game.metadata?.media?.filter(m => m.type === "image") ?? []
  return (
    images.find(m => m.role === "banner")?.uri ??
    images.find(m => m.role === "hero")?.uri ??
    images.find(m => isWideImageUri(m.uri))?.uri ??
    images.find(m => m.role === "tile")?.uri ??
    images.find(m => isCoverImageUri(m.uri))?.uri ??
    images[0]?.uri
  )
}

function isWideImageUri(uri: string): boolean {
  const fileName = decodeURIComponent(uri.split("/").pop() ?? "")
  return fileName.startsWith("hero-") || fileName.startsWith("banner-")
}

function isCoverImageUri(uri: string): boolean {
  const fileName = decodeURIComponent(uri.split("/").pop() ?? "")
  return fileName.startsWith("cover-")
}

/**
 * Display name with id fallback.
 */
export function getGameDisplayName(
  game: Schema.Schema.Type<typeof GameRecord>,
): string {
  return game.metadata?.name ?? game.id
}
