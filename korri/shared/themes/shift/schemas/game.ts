import { Schema } from "effect"

export const MediaType = Schema.Literal("image", "video", "audio")
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
  lastPlayed: Schema.optional(Schema.DateFromSelf),
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
 * Display name with id fallback.
 */
export function getGameDisplayName(game: GameRecord): string {
  return game.metadata?.name ?? game.id
}
