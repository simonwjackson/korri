import {
  ArtifactFacets,
  ArtifactFile,
  ArtifactKind,
  SemanticFormat,
} from "@platform/protocol/artifact/artifact"
import { Schema } from "effect"

export const ArtifactAcquisitionHint = Schema.Struct({
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: Schema.optional(ArtifactFile),
})
export type ArtifactAcquisitionHint = Schema.Schema.Type<
  typeof ArtifactAcquisitionHint
>

const CandidateDisplayMetadata = Schema.Record(Schema.String, Schema.Unknown)
const CandidateTarget = Schema.Union([
  Schema.NonEmptyString,
  Schema.Array(Schema.NonEmptyString),
])
const SourceCandidateAppChoice = Schema.Struct({
  id: Schema.NonEmptyString,
  runtime: Schema.optional(Schema.NonEmptyString),
})

export const SourceCandidateRelease = Schema.Struct({
  id: Schema.NonEmptyString,
  source: Schema.optional(Schema.NonEmptyString),
  system: Schema.NonEmptyString,
  target: Schema.optional(CandidateTarget),
  apps: Schema.optional(Schema.Array(SourceCandidateAppChoice)),
  display: Schema.optional(CandidateDisplayMetadata),
})
export type SourceCandidateRelease = Schema.Schema.Type<
  typeof SourceCandidateRelease
>

const CandidateReleaseList = Schema.Array(SourceCandidateRelease).pipe(
  Schema.check(
    Schema.makeFilter((releases: readonly SourceCandidateRelease[]) => {
      if (releases.length === 0) {
        return {
          path: ["releases"],
          issue: "source candidate must declare at least one release",
        }
      }
      const ids = new Set<string>()
      for (const release of releases) {
        if (ids.has(release.id)) {
          return {
            path: ["releases"],
            issue: `source candidate release id '${release.id}' must be unique`,
          }
        }
        ids.add(release.id)
      }
      return undefined
    }),
  ),
)

export const SourceCandidatePlayable = Schema.Struct({
  id: Schema.NonEmptyString,
  title: Schema.optional(Schema.String),
  source: Schema.optional(Schema.NonEmptyString),
  collections: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  display: Schema.optional(CandidateDisplayMetadata),
  releases: CandidateReleaseList,
})
export type SourceCandidatePlayable = Schema.Schema.Type<
  typeof SourceCandidatePlayable
>

export const SourceCandidate = Schema.TaggedStruct("SourceCandidate", {
  sourceName: Schema.String,
  id: Schema.String,
  title: Schema.String,
  url: Schema.String,
  platform: Schema.optional(Schema.String),
  thumbnailUrl: Schema.optional(Schema.String),
  artifact: Schema.optional(ArtifactAcquisitionHint),
  playable: Schema.optional(SourceCandidatePlayable),
})
export type SourceCandidate = Schema.Schema.Type<typeof SourceCandidate>

export const SourceDetails = Schema.TaggedStruct("SourceDetails", {
  sourceName: Schema.String,
  id: Schema.String,
  title: Schema.String,
  url: Schema.String,
  description: Schema.optional(Schema.String),
  downloadPageUrl: Schema.optional(Schema.String),
  artifact: Schema.optional(ArtifactAcquisitionHint),
  playable: Schema.optional(SourceCandidatePlayable),
  facets: Schema.optional(ArtifactFacets),
})
export type SourceDetails = Schema.Schema.Type<typeof SourceDetails>

export const SearchRequest = Schema.Struct({
  query: Schema.String,
  sourceNames: Schema.optional(Schema.Array(Schema.String)),
  platforms: Schema.optional(Schema.Array(Schema.String)),
})
export type SearchRequest = Schema.Schema.Type<typeof SearchRequest>

export const SearchResponse = Schema.Struct({
  candidates: Schema.Array(SourceCandidate),
})
export type SearchResponse = Schema.Schema.Type<typeof SearchResponse>

export const DetailsRequest = Schema.Struct({
  sourceName: Schema.String,
  id: Schema.String,
})
export type DetailsRequest = Schema.Schema.Type<typeof DetailsRequest>
