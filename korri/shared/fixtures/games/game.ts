import { Schema } from "effect"

export const MediaType = Schema.Literals(["image", "video", "audio"])
export type MediaType = Schema.Schema.Type<typeof MediaType>

export const Media = Schema.Struct({
  type: MediaType,
  uri: Schema.String,
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

export const GameRecord = Schema.Struct({
  id: Schema.String,
  metadata: Schema.optional(GameMetadata),
  userData: Schema.optional(GameUserData),
})
export type GameRecord = Schema.Schema.Type<typeof GameRecord>

export const decodeGameRecord = Schema.decodeUnknownSync(GameRecord)
export const decodeGameRecordArray = Schema.decodeUnknownSync(
  Schema.Array(GameRecord),
)

/**
 * Returns the URI of the first image entry in `metadata.media`, or undefined.
 */
export function getGameImageUrl(game: GameRecord): string | undefined {
  return game.metadata?.media?.find(m => m.type === "image")?.uri
}

/**
 * Returns wide/landscape art for feature surfaces when available.
 *
 * Temporary ROCKNIX sidecar media exposes role through stable filenames until
 * the real media pipeline can add typed roles. Keep the convention here so UI
 * components consume a semantic helper instead of knowing folder details.
 */
export function getGameWideImageUrl(game: GameRecord): string | undefined {
  const images = game.metadata?.media?.filter(m => m.type === "image") ?? []
  return (
    images.find(m => isWideImageUri(m.uri))?.uri ??
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
export function getGameDisplayName(game: GameRecord): string {
  return game.metadata?.name ?? game.id
}
