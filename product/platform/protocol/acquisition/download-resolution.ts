import { Schema } from "effect"

export const ResolveDownloadRequest = Schema.Struct({
  sourceName: Schema.String,
  candidateUrl: Schema.String,
})
export type ResolveDownloadRequest = Schema.Schema.Type<
  typeof ResolveDownloadRequest
>

export const FinalDownloadResolution = Schema.TaggedStruct("FinalDownload", {
  sourceName: Schema.String,
  url: Schema.String,
  filename: Schema.optional(Schema.String),
  contentType: Schema.optional(Schema.String),
})

export const NonFinalDownloadResolution = Schema.TaggedStruct(
  "NonFinalDownload",
  {
    sourceName: Schema.String,
    reason: Schema.Literals([
      "interstitial",
      "requires-user-action",
      "unsupported",
    ]),
    url: Schema.optional(Schema.String),
  },
)

export const FailedDownloadResolution = Schema.TaggedStruct("FailedDownload", {
  sourceName: Schema.String,
  reason: Schema.Literals([
    "source-error",
    "configuration",
    "not-found",
    "defective-source",
  ]),
  message: Schema.String,
})

export const DownloadResolution = Schema.Union([
  FinalDownloadResolution,
  NonFinalDownloadResolution,
  FailedDownloadResolution,
])
export type DownloadResolution = Schema.Schema.Type<typeof DownloadResolution>
