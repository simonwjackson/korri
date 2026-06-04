import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

export const GameAssetId = Schema.String.check(
  Schema.isPattern(/^sha256:[a-f0-9]{64}$/),
)
export type GameAssetId = Schema.Schema.Type<typeof GameAssetId>

export const GameAssetType = Schema.Literals(["image"])
export type GameAssetType = Schema.Schema.Type<typeof GameAssetType>

export const GameAssetMimeType = Schema.Literals([
  "image/jpeg",
  "image/png",
  "image/webp",
])
export type GameAssetMimeType = Schema.Schema.Type<typeof GameAssetMimeType>

export const GameAssetExtension = Schema.Literals([
  "jpg",
  "jpeg",
  "png",
  "webp",
])
export type GameAssetExtension = Schema.Schema.Type<typeof GameAssetExtension>

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))

export const GameAssetStorage = Schema.Struct({
  strategy: Schema.Literals(["content-addressed"]),
})
export type GameAssetStorage = Schema.Schema.Type<typeof GameAssetStorage>

export const GameAssetSourceProvider = Schema.Literals([
  "korri",
  "manual",
  "rocknix",
  "steamgriddb",
])
export type GameAssetSourceProvider = Schema.Schema.Type<
  typeof GameAssetSourceProvider
>

const SanitizedSourceUrl = Schema.String.check(
  Schema.makeFilter(value => {
    try {
      const url = new URL(value)
      if (url.protocol !== "https:" && url.protocol !== "http:") {
        return "source URL must use http or https"
      }
      if (url.username !== "" || url.password !== "") {
        return "source URL must not contain credentials"
      }
      if (url.search !== "" || url.hash !== "") {
        return "source URL must not contain query or fragment data"
      }
      return undefined
    } catch {
      return "source URL must be absolute"
    }
  }),
)

export const GameAssetSource = Schema.Struct({
  provider: GameAssetSourceProvider,
  id: Schema.optional(Schema.NonEmptyString),
  url: Schema.optional(SanitizedSourceUrl),
})
export type GameAssetSource = Schema.Schema.Type<typeof GameAssetSource>

const checkConsistentImageMetadata = Schema.makeFilter<{
  readonly mimeType: GameAssetMimeType
  readonly extension: GameAssetExtension
  readonly width: number
  readonly height: number
  readonly pixelCount: number
}>(asset => {
  const issues: Array<Schema.FilterIssue> = []
  const expectedPixelCount = asset.width * asset.height

  if (asset.pixelCount !== expectedPixelCount) {
    issues.push({
      path: ["pixelCount"],
      issue: "pixelCount must equal width multiplied by height",
    })
  }

  if (
    asset.mimeType === "image/jpeg" &&
    asset.extension !== "jpg" &&
    asset.extension !== "jpeg"
  ) {
    issues.push({
      path: ["extension"],
      issue: "JPEG assets must use jpg or jpeg extension",
    })
  }

  if (asset.mimeType === "image/png" && asset.extension !== "png") {
    issues.push({
      path: ["extension"],
      issue: "PNG assets must use png extension",
    })
  }

  if (asset.mimeType === "image/webp" && asset.extension !== "webp") {
    issues.push({
      path: ["extension"],
      issue: "WebP assets must use webp extension",
    })
  }

  return issues.length === 0 ? undefined : issues
})

export const GameAssetPayload = Schema.Struct({
  type: GameAssetType,
  mimeType: GameAssetMimeType,
  extension: GameAssetExtension,
  width: PositiveInt,
  height: PositiveInt,
  byteSize: PositiveInt,
  pixelCount: PositiveInt,
  storage: GameAssetStorage,
  source: Schema.optional(GameAssetSource),
}).check(checkConsistentImageMetadata)
export type GameAssetPayload = Schema.Schema.Type<typeof GameAssetPayload>

export const GameAssetRecord = Schema.Struct({
  id: GameAssetId,
  ...GameAssetPayload.fields,
}).check(checkConsistentImageMetadata)
export type GameAssetRecord = Schema.Schema.Type<typeof GameAssetRecord>

export const decodeGameAssetPayload = (input: unknown): GameAssetPayload =>
  Schema.decodeUnknownSync(GameAssetPayload)(input, STRICT)

export const decodeGameAssetRecord = (input: unknown): GameAssetRecord =>
  Schema.decodeUnknownSync(GameAssetRecord)(input, STRICT)
