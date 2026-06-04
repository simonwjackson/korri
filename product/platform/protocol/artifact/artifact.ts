import { Schema } from "effect"

const STRICT = { onExcessProperty: "error" } as const

const SHA256_HEX = /^[a-f0-9]{64}$/
const DIGEST_ALGORITHM = /^[a-z0-9][a-z0-9-]{0,31}$/
const SOURCE_DATA_NAMESPACE =
  /^[a-z][a-z0-9-]*(?:\.(?!v[1-9][0-9]*(?:\.|$))[a-z][a-z0-9-]*)*\.v[1-9][0-9]*$/
const SEMANTIC_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SAFE_EXTENSION = /^[a-z0-9][a-z0-9-]{0,31}$/
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export const ArtifactId = Schema.String.check(
  Schema.isPattern(/^sha256:[a-f0-9]{64}$/),
)
export type ArtifactId = Schema.Schema.Type<typeof ArtifactId>

export const ArtifactKind = Schema.Literals(["content", "patch"])
export type ArtifactKind = Schema.Schema.Type<typeof ArtifactKind>

export const DigestAlgorithm = Schema.String.check(
  Schema.isPattern(DIGEST_ALGORITHM),
)
export type DigestAlgorithm = Schema.Schema.Type<typeof DigestAlgorithm>

export const DigestValue = Schema.String.check(Schema.isPattern(/^[a-f0-9]+$/))
export type DigestValue = Schema.Schema.Type<typeof DigestValue>

const checkDigestSet = Schema.makeFilter<Record<string, string>>(digests => {
  const issues: Array<Schema.FilterIssue> = []

  if (!Object.hasOwn(digests, "sha256")) {
    issues.push({ path: ["sha256"], issue: "sha256 digest is required" })
  } else if (!SHA256_HEX.test(digests.sha256)) {
    issues.push({ path: ["sha256"], issue: "sha256 digest must be hex64" })
  }

  for (const [algorithm, value] of Object.entries(digests)) {
    if (!DIGEST_ALGORITHM.test(algorithm)) {
      issues.push({ path: [algorithm], issue: "digest algorithm is invalid" })
    }
    if (!/^[a-f0-9]+$/.test(value)) {
      issues.push({
        path: [algorithm],
        issue: "digest value must be lowercase hex",
      })
    }
  }

  return issues.length === 0 ? undefined : issues
})

export const DigestSet = Schema.Record(Schema.String, Schema.String).check(
  checkDigestSet,
)
export type DigestSet = Schema.Schema.Type<typeof DigestSet>

export const ExpectedDigestSet = Schema.Record(
  DigestAlgorithm,
  DigestValue,
).check(
  Schema.makeFilter<Record<string, string>>(digests => {
    if (digests.sha256 === undefined || SHA256_HEX.test(digests.sha256)) {
      return undefined
    }
    return [{ path: ["sha256"], issue: "sha256 digest must be hex64" }]
  }),
)
export type ExpectedDigestSet = Schema.Schema.Type<typeof ExpectedDigestSet>

export const SemanticFormat = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(SEMANTIC_ID)),
  version: Schema.optional(Schema.NonEmptyString),
})
export type SemanticFormat = Schema.Schema.Type<typeof SemanticFormat>

export const SafeFileExtension = Schema.String.check(
  Schema.makeFilter(value => {
    const normalized = value.toLowerCase()
    if (value !== normalized) return "file extension must be lowercase"
    if (!SAFE_EXTENSION.test(value)) {
      return "file extension must be a safe extension without separators or metacharacters"
    }
    return undefined
  }),
)
export type SafeFileExtension = Schema.Schema.Type<typeof SafeFileExtension>

const PositiveInt = Schema.Int.check(Schema.isGreaterThan(0))
const FiniteNumber = Schema.Number.check(
  Schema.makeFilter(value =>
    Number.isFinite(value) ? undefined : "number must be finite",
  ),
)

export const SafeFileName = Schema.NonEmptyString.check(
  Schema.makeFilter(value => {
    if (
      value.includes("/") ||
      value.includes("\\") ||
      value.includes("\0") ||
      value === ".." ||
      value === "."
    ) {
      return "file name must not contain path traversal characters"
    }
    return undefined
  }),
)
export type SafeFileName = Schema.Schema.Type<typeof SafeFileName>

export const ArtifactFile = Schema.Struct({
  name: SafeFileName,
  extension: Schema.optional(SafeFileExtension),
  mediaType: Schema.optional(Schema.NonEmptyString),
  sizeBytes: Schema.optional(PositiveInt),
})
export type ArtifactFile = Schema.Schema.Type<typeof ArtifactFile>

export const LanguageTag = Schema.String.check(
  Schema.makeFilter(value => {
    try {
      Intl.getCanonicalLocales(value)
      return undefined
    } catch {
      return "language must be a valid BCP-47 tag"
    }
  }),
)
export type LanguageTag = Schema.Schema.Type<typeof LanguageTag>

export const LocalizedText = Schema.Struct({
  text: Schema.String,
  language: Schema.optional(LanguageTag),
})
export type LocalizedText = Schema.Schema.Type<typeof LocalizedText>

export const Credit = Schema.Struct({
  name: Schema.NonEmptyString,
  role: Schema.optional(Schema.NonEmptyString),
  url: Schema.optional(Schema.NonEmptyString),
})
export type Credit = Schema.Schema.Type<typeof Credit>

const OutboundHttpUrl = Schema.String.check(
  Schema.makeFilter(value => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return "URL must be absolute"
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "URL must use http or https"
    }
    if (url.username !== "" || url.password !== "") {
      return "URL must not contain credentials"
    }
    if (isPrivateHost(url.hostname)) {
      return "URL host must be publicly routable"
    }
    return undefined
  }),
)

export const MediaAsset = Schema.Struct({
  kind: Schema.Literals(["image", "video", "audio", "document"]),
  role: Schema.NonEmptyString,
  url: OutboundHttpUrl,
  mediaType: Schema.optional(Schema.NonEmptyString),
  language: Schema.optional(LanguageTag),
})
export type MediaAsset = Schema.Schema.Type<typeof MediaAsset>

export const ArtifactFacets = Schema.Struct({
  title: Schema.optional(LocalizedText),
  description: Schema.optional(LocalizedText),
  credits: Schema.optional(
    Schema.Struct({
      authors: Schema.optional(Schema.Array(Credit)),
      contributors: Schema.optional(Schema.Array(Credit)),
    }),
  ),
  compatibility: Schema.optional(
    Schema.Struct({
      expectedBaseDigests: ExpectedDigestSet,
      notes: Schema.optional(LocalizedText),
    }),
  ),
  tags: Schema.optional(Schema.Array(Schema.NonEmptyString)),
  communityStats: Schema.optional(Schema.Record(Schema.String, FiniteNumber)),
  media: Schema.optional(Schema.Array(MediaAsset)),
})
export type ArtifactFacets = Schema.Schema.Type<typeof ArtifactFacets>

const IsoTimestamp = Schema.String.check(
  Schema.makeFilter(value => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      return "timestamp must be an ISO-8601 UTC timestamp"
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
      return "timestamp must be an ISO-8601 UTC timestamp"
    }
    return undefined
  }),
)

export const ArtifactProvenance = Schema.Struct({
  source: Schema.NonEmptyString,
  acquiredAt: Schema.optional(IsoTimestamp),
  url: Schema.optional(OutboundHttpUrl),
})
export type ArtifactProvenance = Schema.Schema.Type<typeof ArtifactProvenance>

export const ExternalId = Schema.Struct({
  namespace: Schema.NonEmptyString,
  id: Schema.NonEmptyString,
})
export type ExternalId = Schema.Schema.Type<typeof ExternalId>

export const SourceData = Schema.Record(Schema.String, Schema.Unknown).check(
  Schema.makeFilter<Record<string, unknown>>(sourceData => {
    const issues: Array<Schema.FilterIssue> = []
    for (const key of Object.keys(sourceData)) {
      if (!SOURCE_DATA_NAMESPACE.test(key)) {
        issues.push({
          path: [key],
          issue:
            "sourceData key must be namespaced and versioned, e.g. source.v1",
        })
      }
    }
    return issues.length === 0 ? undefined : issues
  }),
)
export type SourceData = Schema.Schema.Type<typeof SourceData>

export const Base64Bytes = Schema.String.check(
  Schema.makeFilter(value => {
    if (value.length === 0) return "bytes must not be empty"
    if (!BASE64.test(value)) return "bytes must be base64 encoded"
    return undefined
  }),
)
export type Base64Bytes = Schema.Schema.Type<typeof Base64Bytes>

export const ArtifactMetadata = Schema.Struct({
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: ArtifactFile,
  expectedDigests: Schema.optional(ExpectedDigestSet),
  facets: Schema.optional(ArtifactFacets),
  provenance: Schema.optional(ArtifactProvenance),
  externalIds: Schema.optional(Schema.Array(ExternalId)),
  sourceData: Schema.optional(SourceData),
})
export type ArtifactMetadata = Schema.Schema.Type<typeof ArtifactMetadata>

export const ArtifactRecord = Schema.Struct({
  id: ArtifactId,
  kind: ArtifactKind,
  system: Schema.optional(Schema.NonEmptyString),
  format: SemanticFormat,
  file: ArtifactFile,
  localPath: Schema.optional(Schema.NonEmptyString),
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
  }>(record =>
    record.id === `sha256:${record.digests.sha256}`
      ? undefined
      : "artifact id must match digests.sha256",
  ),
)
export type ArtifactRecord = Schema.Schema.Type<typeof ArtifactRecord>

export const decodeArtifactRecord = (input: unknown): ArtifactRecord =>
  Schema.decodeUnknownSync(ArtifactRecord)(input, STRICT)

export const decodeArtifactMetadata = (input: unknown): ArtifactMetadata =>
  Schema.decodeUnknownSync(ArtifactMetadata)(input, STRICT)

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === "localhost" ||
    host === "localhost." ||
    isPrivateIpv4(host) ||
    isPrivateIpv6(host)
  )
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isPrivateIpv6(host: string): boolean {
  const raw =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
  if (!raw.includes(":")) return false
  return (
    raw === "::" ||
    raw === "::1" ||
    raw.startsWith("fe80:") ||
    raw.startsWith("fc") ||
    raw.startsWith("fd") ||
    raw.startsWith("64:ff9b:") ||
    raw.startsWith("::ffff:")
  )
}
