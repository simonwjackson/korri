import { Schema } from "effect"

const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/),
  ),
)

export const ResolveDownloadRequest = Schema.Struct({
  providerId: ProviderId,
  candidateUrl: Schema.String,
  fileName: Schema.optional(Schema.String),
  size: Schema.optional(Schema.String),
  artifactFormat: Schema.optional(Schema.String),
})
export type ResolveDownloadRequest = Schema.Schema.Type<
  typeof ResolveDownloadRequest
>

export const FinalDownloadResolution = Schema.TaggedStruct("FinalDownload", {
  providerId: ProviderId,
  url: Schema.String,
  filename: Schema.optional(Schema.String),
  contentType: Schema.optional(Schema.String),
})

export const DownloadChoice = Schema.Struct({
  id: Schema.String,
  fileName: Schema.optional(Schema.String),
  size: Schema.optional(Schema.String),
  platforms: Schema.optional(Schema.Array(Schema.String)),
})
export type DownloadChoice = Schema.Schema.Type<typeof DownloadChoice>

export const NonFinalDownloadResolution = Schema.TaggedStruct(
  "NonFinalDownload",
  {
    providerId: ProviderId,
    reason: Schema.Literals([
      "interstitial",
      "requires-user-action",
      "unsupported",
    ]),
    url: Schema.optional(Schema.String),
    choices: Schema.optional(Schema.Array(DownloadChoice)),
  },
)

export const FailedDownloadResolution = Schema.TaggedStruct("FailedDownload", {
  providerId: ProviderId,
  reason: Schema.Literals([
    "provider-error",
    "configuration",
    "not-found",
    "defective-provider",
  ]),
  message: Schema.String,
})

export const DownloadResolution = Schema.Union([
  FinalDownloadResolution,
  NonFinalDownloadResolution,
  FailedDownloadResolution,
])
export type DownloadResolution = Schema.Schema.Type<typeof DownloadResolution>
