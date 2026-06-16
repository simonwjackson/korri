import { Schema } from "effect"

const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/),
  ),
)

export const ResolveDownloadRequest = Schema.Struct({
  providerId: ProviderId,
  candidateUrl: Schema.String,
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
