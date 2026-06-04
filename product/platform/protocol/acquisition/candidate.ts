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

export const SourceCandidate = Schema.TaggedStruct("SourceCandidate", {
  sourceName: Schema.String,
  id: Schema.String,
  title: Schema.String,
  url: Schema.String,
  platform: Schema.optional(Schema.String),
  thumbnailUrl: Schema.optional(Schema.String),
  artifact: Schema.optional(ArtifactAcquisitionHint),
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
