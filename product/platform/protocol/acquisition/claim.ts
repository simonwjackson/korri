import {
  ArtifactFacets,
  ArtifactFile,
  ArtifactKind,
  SemanticFormat,
} from "@platform/protocol/artifact/artifact"
import { Schema } from "effect"

const SafeText = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(value =>
      value.length <= 8192
        ? undefined
        : { path: [], issue: "text must be 8192 characters or fewer" },
    ),
  ),
)
const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/),
  ),
)
const SafeUrl = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(value => {
      try {
        const url = new URL(value)
        if (url.username || url.password) {
          return {
            path: [],
            issue: "provider claim URLs must not embed credentials",
          }
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return { path: [], issue: "provider claim URLs must be HTTP(S)" }
        }
        return undefined
      } catch {
        return { path: [], issue: "provider claim URLs must be valid URLs" }
      }
    }),
  ),
)

export const ProviderRef = Schema.Struct({
  kind: Schema.Literals(["url", "provider-item-id", "external-id"]),
  value: Schema.String.pipe(
    Schema.check(
      Schema.makeFilter(value =>
        value.length <= 2048
          ? undefined
          : {
              path: [],
              issue: "provider ref values must be 2048 characters or fewer",
            },
      ),
    ),
  ),
})
export type ProviderRef = Schema.Schema.Type<typeof ProviderRef>

export const ArtifactAcquisitionHint = Schema.Struct({
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: Schema.optional(ArtifactFile),
})
export type ArtifactAcquisitionHint = Schema.Schema.Type<
  typeof ArtifactAcquisitionHint
>

const ClaimDisplayMetadata = Schema.Record(Schema.String, Schema.Unknown)
const ClaimTarget = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("url"), value: Schema.NonEmptyString }),
  Schema.Struct({ kind: Schema.Literal("file"), path: Schema.NonEmptyString }),
  Schema.Struct({
    kind: Schema.Literal("executable"),
    command: Schema.NonEmptyString,
  }),
  Schema.Struct({
    kind: Schema.Literal("provider-ref"),
    provider: ProviderId,
    ref: ProviderRef,
  }),
  Schema.Struct({
    kind: Schema.Literal("file-set"),
    files: Schema.NonEmptyArray(
      Schema.Struct({ id: Schema.NonEmptyString, path: Schema.NonEmptyString }),
    ),
    primary: Schema.optional(Schema.NonEmptyString),
  }),
])
const ProviderClaimLaunchHint = Schema.Struct({
  use: Schema.optional(Schema.NonEmptyString),
  plugin: Schema.optional(ProviderId),
  runtime: Schema.optional(Schema.NonEmptyString),
})

export const ProviderClaimReleaseHint = Schema.Struct({
  id: Schema.NonEmptyString,
  providerId: Schema.optional(ProviderId),
  system: Schema.NonEmptyString,
  target: Schema.optional(ClaimTarget),
  launch: Schema.optional(ProviderClaimLaunchHint),
  display: Schema.optional(ClaimDisplayMetadata),
})
export type ProviderClaimReleaseHint = Schema.Schema.Type<
  typeof ProviderClaimReleaseHint
>

const ClaimReleaseList = Schema.Array(ProviderClaimReleaseHint).pipe(
  Schema.check(
    Schema.makeFilter((releases: readonly ProviderClaimReleaseHint[]) => {
      if (releases.length === 0) {
        return {
          path: ["releases"],
          issue: "provider claim must declare at least one release hint",
        }
      }
      const ids = new Set<string>()
      for (const release of releases) {
        if (ids.has(release.id)) {
          return {
            path: ["releases"],
            issue: `provider claim release id '${release.id}' must be unique`,
          }
        }
        ids.add(release.id)
      }
      return undefined
    }),
  ),
)

export const ProviderClaimPlayableHint = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.optional(SafeText),
  providerId: Schema.optional(ProviderId),
  collections: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  display: Schema.optional(ClaimDisplayMetadata),
  releases: ClaimReleaseList,
})
export type ProviderClaimPlayableHint = Schema.Schema.Type<
  typeof ProviderClaimPlayableHint
>

export const ProviderClaim = Schema.TaggedStruct("ProviderClaim", {
  providerId: ProviderId,
  id: Schema.String,
  ref: Schema.optional(ProviderRef),
  title: SafeText,
  url: SafeUrl,
  platform: Schema.optional(SafeText),
  thumbnailUrl: Schema.optional(SafeUrl),
  artifact: Schema.optional(ArtifactAcquisitionHint),
  playable: Schema.optional(ProviderClaimPlayableHint),
  fetchedAt: Schema.optional(Schema.String),
})
export type ProviderClaim = Schema.Schema.Type<typeof ProviderClaim>

export const ProviderClaimDetails = Schema.TaggedStruct(
  "ProviderClaimDetails",
  {
    providerId: ProviderId,
    id: Schema.String,
    ref: Schema.optional(ProviderRef),
    title: SafeText,
    url: SafeUrl,
    description: Schema.optional(SafeText),
    downloadPageUrl: Schema.optional(SafeUrl),
    artifact: Schema.optional(ArtifactAcquisitionHint),
    playable: Schema.optional(ProviderClaimPlayableHint),
    facets: Schema.optional(ArtifactFacets),
    fetchedAt: Schema.optional(Schema.String),
  },
)
export type ProviderClaimDetails = Schema.Schema.Type<
  typeof ProviderClaimDetails
>

export const SearchRequest = Schema.Struct({
  query: Schema.String,
  providerIds: Schema.optional(Schema.Array(ProviderId)),
  platforms: Schema.optional(Schema.Array(Schema.String)),
})
export type SearchRequest = Schema.Schema.Type<typeof SearchRequest>

export const SearchResponse = Schema.Struct({
  claims: Schema.Array(ProviderClaim),
})
export type SearchResponse = Schema.Schema.Type<typeof SearchResponse>

export const DetailsRequest = Schema.Struct({
  providerId: ProviderId,
  id: Schema.String,
})
export type DetailsRequest = Schema.Schema.Type<typeof DetailsRequest>
