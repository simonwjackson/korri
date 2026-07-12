import { Schema } from "effect"

import {
  ArtifactFacets,
  ArtifactFile,
  ArtifactId,
  ArtifactKind,
  ArtifactProvenance,
  Base64Bytes,
  DigestSet,
  ExpectedDigestSet,
  ExternalId,
  SemanticFormat,
  SourceData,
} from "../artifact/artifact"

const STRICT = { onExcessProperty: "error" } as const

const ProviderId = Schema.String.pipe(
  Schema.check(
    Schema.isPattern(/^@[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/),
  ),
)

export const AcquireArtifactRequest = Schema.Struct({
  providerId: ProviderId,
  id: Schema.String,
  /**
   * Claim page URL. Providers without an `artifact.acquire` handler are
   * acquired through the generic fallback: resolve-download against this URL,
   * then the daemon fetches the final artifact itself.
   */
  url: Schema.optional(Schema.String),
  fileName: Schema.optional(Schema.String),
  size: Schema.optional(Schema.String),
  artifactFormat: Schema.optional(Schema.String),
  /** Library system hint (e.g. "gba", "pico8") used to organize placement. */
  system: Schema.optional(Schema.String),
})
export type AcquireArtifactRequest = Schema.Schema.Type<
  typeof AcquireArtifactRequest
>

export const PluginAcquireOutput = Schema.Struct({
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: ArtifactFile,
  bytesBase64: Base64Bytes,
  expectedDigests: Schema.optional(ExpectedDigestSet),
  facets: Schema.optional(ArtifactFacets),
  provenance: Schema.optional(ArtifactProvenance),
  externalIds: Schema.optional(Schema.Array(ExternalId)),
  sourceData: Schema.optional(SourceData),
})
export type PluginAcquireOutput = Schema.Schema.Type<typeof PluginAcquireOutput>

export const AcquiredArtifact = Schema.Struct({
  id: ArtifactId,
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: ArtifactFile,
  stagedPath: Schema.NonEmptyString,
  digests: DigestSet,
  expectedDigests: Schema.optional(ExpectedDigestSet),
  facets: Schema.optional(ArtifactFacets),
  provenance: Schema.optional(ArtifactProvenance),
  externalIds: Schema.optional(Schema.Array(ExternalId)),
  sourceData: Schema.optional(SourceData),
}).check(
  Schema.makeFilter<{
    readonly id: ArtifactId
    readonly digests: DigestSet
  }>(artifact =>
    artifact.id === `sha256:${artifact.digests.sha256}`
      ? undefined
      : "acquired artifact id must match digests.sha256",
  ),
)
export type AcquiredArtifact = Schema.Schema.Type<typeof AcquiredArtifact>

export const decodePluginAcquireOutput = (
  input: unknown,
): PluginAcquireOutput =>
  Schema.decodeUnknownSync(PluginAcquireOutput)(input, STRICT)

export const decodeAcquiredArtifact = (input: unknown): AcquiredArtifact =>
  Schema.decodeUnknownSync(AcquiredArtifact)(input, STRICT)
