import { AcquisitionError } from "@platform/acquisition/errors"
import type { PluginRequirement, ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"

export interface CommunitySourcePluginEntry {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly platform: string
  readonly description: string
  readonly aliases: readonly string[]
  readonly searchText: string
  readonly download?: {
    readonly url: string
    readonly filename: string
    readonly contentType: string
  }
  readonly nonFinalReason?: "unsupported" | "requires-user-action"
}

export interface CommunitySourcePluginOptions {
  readonly name: string
  readonly entry: CommunitySourcePluginEntry
  readonly parseUrl: (url: URL) => string | null
  readonly requires?: readonly PluginRequirement[]
  readonly legalRisk?: "low" | "medium" | "high"
  readonly credentialRequired?: boolean
  readonly enabledByDefault?: boolean
}

export function createCommunitySourcePlugin({
  name,
  entry,
  parseUrl,
  requires = [],
  legalRisk = "medium",
  credentialRequired = false,
  enabledByDefault = true,
}: CommunitySourcePluginOptions) {
  return plugin({
    namespace: "@korri",
    name,
    title: entry.title,
    description: entry.description,
    requires,
    contributes: {
      config: {
        providers: {
          [`@korri:${name}`]: {
            module: `product/plugins/${name}`,
            legalRisk,
            credentialRequired,
            enabledByDefault,
          },
        },
      },
      handlers: [
        {
          id: `${name}.claims-search`,
          operation: "claims.search",
          capabilities: ["claims.search", name],
          run: context => {
            const input = recordInput(context.input)
            const query = stringValue(input.query).trim().toLowerCase()
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (value): value is string => typeof value === "string",
                )
              : undefined
            if (query.length === 0) return []
            if (platforms && platforms.length > 0 && !platforms.includes(entry.platform)) {
              return []
            }
            return entry.searchText.toLowerCase().includes(query)
              ? [claimFor(entry, context.provider)]
              : []
          },
        },
        {
          id: `${name}.claims-details`,
          operation: "claims.details",
          capabilities: ["claims.details", name],
          run: context => {
            const id = requiredString(recordInput(context.input).id, "id")
            if (!matchesEntryId(entry, id)) {
              return Effect.fail(
                new AcquisitionError({
                  reason: "caller",
                  providerId: context.provider,
                  message: `Unknown ${entry.title} candidate: ${id}`,
                }),
              )
            }
            return detailsFor(entry, context.provider)
          },
        },
        {
          id: `${name}.claims-parse-url`,
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", name],
          run: context => {
            const inputUrl = stringValue(recordInput(context.input).url)
            const url = parseHttpUrl(inputUrl)
            return url ? parseUrl(url) : null
          },
        },
        {
          id: `${name}.provider-validate`,
          operation: "provider.validate",
          capabilities: ["provider.validate", name],
          run: context => {
            const checkedAt = stringValue(recordInput(context.input).checkedAt)
            return {
              _tag: "HealthyProvider" as const,
              providerId: context.provider,
              checkedAt: checkedAt || new Date(0).toISOString(),
            }
          },
        },
        {
          id: `${name}.artifact-resolve-download`,
          operation: "artifact.resolve-download",
          capabilities: ["artifact.resolve-download", name],
          run: context => {
            const candidateUrl = requiredString(
              recordInput(context.input).candidateUrl,
              "candidateUrl",
            )
            const url = parseHttpUrl(candidateUrl)
            const parsedId = url ? parseUrl(url) : null
            if (parsedId === null || !matchesEntryId(entry, parsedId)) {
              return {
                _tag: "NonFinalDownload" as const,
                providerId: context.provider,
                reason: "unsupported" as const,
                url: candidateUrl,
              } satisfies DownloadResolution
            }
            if (!entry.download) {
              return {
                _tag: "NonFinalDownload" as const,
                providerId: context.provider,
                reason: entry.nonFinalReason ?? "unsupported",
                url: candidateUrl,
              } satisfies DownloadResolution
            }
            return {
              _tag: "FinalDownload" as const,
              providerId: context.provider,
              url: entry.download.url,
              filename: entry.download.filename,
              contentType: entry.download.contentType,
            } satisfies DownloadResolution
          },
        },
        {
          id: `${name}.diagnostics`,
          operation: "diagnostics.collect",
          capabilities: [name],
          run: context => ({
            provider: context.provider,
            id: entry.id,
            status: "ok",
            finalDownload: Boolean(entry.download),
          }),
        },
      ],
    },
  })
}

export function githubRepoParser(owner: string, repo: string, id: string) {
  return (url: URL): string | null => {
    const host = normalizedHost(url)
    if (host !== "github.com") return null
    const [actualOwner, actualRepo] = normalizedPath(url).split("/").filter(Boolean)
    return actualOwner?.toLowerCase() === owner.toLowerCase() &&
      actualRepo?.toLowerCase() === repo.toLowerCase()
      ? id
      : null
  }
}

export function itchioParser(creator: string, slug: string, id: string) {
  return (url: URL): string | null => {
    const host = normalizedHost(url)
    if (host !== `${creator}.itch.io`) return null
    const [actualSlug] = normalizedPath(url).split("/").filter(Boolean)
    return actualSlug === slug ? id : null
  }
}

export function exactUrlParser(expected: string, id: string) {
  const expectedUrl = new URL(expected)
  return (url: URL): string | null =>
    url.protocol === expectedUrl.protocol &&
    normalizedHost(url) === normalizedHost(expectedUrl) &&
    normalizedPath(url) === normalizedPath(expectedUrl)
      ? id
      : null
}

export function normalizedHost(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "")
}

export function normalizedPath(url: URL): string {
  return decodeURIComponent(url.pathname).replace(/\/+$/, "")
}

function matchesEntryId(entry: CommunitySourcePluginEntry, id: string) {
  const normalized = id.toLowerCase()
  return (
    entry.id.toLowerCase() === normalized ||
    entry.aliases.some(alias => alias.toLowerCase() === normalized)
  )
}

function claimFor(
  entry: CommunitySourcePluginEntry,
  providerId: ProviderId,
): ProviderClaim {
  return {
    _tag: "ProviderClaim",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    platform: entry.platform,
    playable: playableFor(entry, providerId),
  }
}

function detailsFor(
  entry: CommunitySourcePluginEntry,
  providerId: ProviderId,
): ProviderClaimDetails {
  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    description: entry.description,
    ...(entry.download ? { downloadPageUrl: entry.download.url } : {}),
    playable: playableFor(entry, providerId),
  }
}

function playableFor(entry: CommunitySourcePluginEntry, providerId: ProviderId) {
  return {
    id: entry.id,
    title: entry.title,
    providerId,
    collections: ["community-source-plugin"],
    releases: [
      {
        id: entry.platform,
        providerId,
        system: entry.platform,
        target: entry.download?.url ?? entry.url,
      },
    ],
  }
}

function parseHttpUrl(input: string): URL | null {
  try {
    const url = new URL(input)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function recordInput(input: unknown): Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Readonly<Record<string, unknown>>)
    : {}
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function requiredString(value: unknown, field: string): string {
  const result = stringValue(value).trim()
  if (result.length === 0) throw new Error(`${field} is required`)
  return result
}
