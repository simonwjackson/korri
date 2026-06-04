import {
  ArtifactFacets,
  ArtifactFile,
  ArtifactId,
  ArtifactKind,
  ArtifactProvenance,
  DigestSet,
  ExpectedDigestSet,
  ExternalId,
  SemanticFormat,
  SourceData,
} from "@platform/protocol/artifact/artifact"
import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

export const ArtifactPayload = Schema.Struct({
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: ArtifactFile,
  digests: DigestSet,
  expectedDigests: Schema.optional(ExpectedDigestSet),
  facets: Schema.optional(ArtifactFacets),
  provenance: Schema.optional(ArtifactProvenance),
  externalIds: Schema.optional(Schema.Array(ExternalId)),
  sourceData: Schema.optional(SourceData),
})
export type ArtifactPayload = Schema.Schema.Type<typeof ArtifactPayload>

export const ArtifactRecord = Schema.Struct({
  id: ArtifactId,
  ...ArtifactPayload.fields,
}).check(
  Schema.makeFilter<{
    readonly id: string
    readonly digests: Readonly<Record<string, string>>
  }>(record =>
    record.id === `sha256:${record.digests.sha256}`
      ? undefined
      : "artifact id must match digests.sha256",
  ),
)
export type ArtifactRecord = Schema.Schema.Type<typeof ArtifactRecord>

export const decodeArtifactPayload = (input: unknown): ArtifactPayload =>
  Schema.decodeUnknownSync(ArtifactPayload)(input, STRICT)

export const decodeArtifactRecord = (input: unknown): ArtifactRecord =>
  Schema.decodeUnknownSync(ArtifactRecord)(input, STRICT)
