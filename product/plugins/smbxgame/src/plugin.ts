import { AcquisitionError } from "@platform/acquisition/errors"
import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import type { ArtifactFacets } from "@platform/protocol/artifact/artifact"
import { Effect } from "effect"

export const KORRI_SMBXGAME_PLUGIN_ID = "@korri:smbxgame" as const

const DEFAULT_FORUM_BASE_URL = "https://www.smbxgame.com/forums"
const EPISODES_FORUM_ID = 36
const SMBX_EPISODE_SYSTEM = "smbx-episode"
const SMBX_EPISODE_FORMAT = "smbx-episode-archive"
const SEARCH_PAGE_COUNT = 3
const TOPICS_PER_PAGE = 30

export interface SmbxGamePluginOptions {
  readonly forumBaseUrl?: string
  readonly fetchImpl?: typeof fetch
  readonly searchPageCount?: number
}

interface SmbxGameRuntime {
  readonly forumBaseUrl: string
  readonly fetchImpl: typeof fetch
  readonly searchPageCount: number
}

interface SmbxTopicSummary {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly author?: string
  readonly replies?: number
  readonly views?: number
}

interface SmbxTopicDetails extends SmbxTopicSummary {
  readonly description?: string
  readonly downloadUrl?: string
  readonly links: readonly string[]
}

export function createSmbxGamePlugin(options: SmbxGamePluginOptions = {}) {
  const runtime = createRuntime(options)
  return plugin({
    namespace: "@korri",
    name: "smbxgame",
    title: "SMBX Episodes Forum",
    description:
      "Adds Super Mario Bros. X forum episode discovery and download handoff metadata.",
    contributes: {
      handlers: [
        {
          id: "smbxgame.claims-search",
          operation: "claims.search",
          capabilities: ["claims.search", "smbxgame", "smbx-episodes"],
          run: context => {
            const input = readRecord(context.input)
            const query = typeof input.query === "string" ? input.query : ""
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (platform): platform is string =>
                    typeof platform === "string",
                )
              : undefined
            return searchSmbxEpisodes(
              runtime,
              context.provider,
              query,
              platforms,
            )
          },
        },
        {
          id: "smbxgame.claims-details",
          operation: "claims.details",
          capabilities: ["claims.details", "smbxgame", "smbx-episodes"],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            return fetchTopicDetails(runtime, id).pipe(
              Effect.map(details => detailsFor(context.provider, details)),
            )
          },
        },
        {
          id: "smbxgame.claims-parse-url",
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", "smbxgame", "smbx-episodes"],
          run: context => {
            const input = readRecord(context.input)
            const url = typeof input.url === "string" ? input.url : ""
            return parseSmbxGameTopicUrl(url, runtime)
          },
        },
        {
          id: "smbxgame.provider-validate",
          operation: "provider.validate",
          capabilities: ["provider.validate", "smbxgame", "smbx-episodes"],
          run: context => {
            const input = readRecord(context.input)
            return fetchForumPage(runtime, 0).pipe(
              Effect.map(
                () =>
                  ({
                    _tag: "HealthyProvider" as const,
                    providerId: context.provider,
                    checkedAt:
                      typeof input.checkedAt === "string"
                        ? input.checkedAt
                        : new Date(0).toISOString(),
                  }) satisfies ProviderHealth,
              ),
            )
          },
        },
        {
          id: "smbxgame.artifact-resolve-download",
          operation: "artifact.resolve-download",
          capabilities: [
            "artifact.resolve-download",
            "smbxgame",
            "smbx-episodes",
          ],
          run: context => {
            const input = readRecord(context.input)
            const candidateUrl = stringField(input, "candidateUrl")
            return resolveSmbxDownload(runtime, context.provider, candidateUrl)
          },
        },
        {
          id: "smbxgame.diagnostics",
          operation: "diagnostics.collect",
          capabilities: ["smbxgame", "smbx-episodes"],
          run: context => ({
            provider: context.provider,
            status: "ok",
            forumBaseUrl: runtime.forumBaseUrl,
            forumId: EPISODES_FORUM_ID,
          }),
        },
      ],
    },
  })
}

export const smbxGamePlugin = createSmbxGamePlugin()

function createRuntime({
  forumBaseUrl = DEFAULT_FORUM_BASE_URL,
  fetchImpl = globalThis.fetch,
  searchPageCount = SEARCH_PAGE_COUNT,
}: SmbxGamePluginOptions): SmbxGameRuntime {
  if (!fetchImpl) {
    throw new AcquisitionError({
      reason: "configuration",
      providerId: KORRI_SMBXGAME_PLUGIN_ID,
      message: "global fetch is not available for SMBXGame forums",
    })
  }
  return {
    forumBaseUrl: trimTrailingSlash(forumBaseUrl),
    fetchImpl,
    searchPageCount,
  }
}

function searchSmbxEpisodes(
  runtime: SmbxGameRuntime,
  providerId: ProviderId,
  query: string,
  platforms?: readonly string[],
): Effect.Effect<readonly ProviderClaim[], AcquisitionError> {
  const normalized = query.trim().toLowerCase()
  if (normalized.length === 0) return Effect.succeed([])
  if (
    platforms &&
    platforms.length > 0 &&
    !platforms.includes(SMBX_EPISODE_SYSTEM)
  ) {
    return Effect.succeed([])
  }

  const parsedId = /^\d+$/.test(normalized) ? normalized : undefined
  if (parsedId) {
    return fetchTopicDetails(runtime, parsedId).pipe(
      Effect.map(details => [claimFor(providerId, details)]),
      Effect.catchTag("AcquisitionError", () => Effect.succeed([])),
    )
  }

  return Effect.all(
    Array.from({ length: runtime.searchPageCount }, (_, index) =>
      fetchForumPage(runtime, index * TOPICS_PER_PAGE),
    ),
  ).pipe(
    Effect.map(pages =>
      dedupeTopics(pages.flatMap(page => parseForumTopics(runtime, page)))
        .filter(topic => topic.title.toLowerCase().includes(normalized))
        .slice(0, 20)
        .map(topic => claimFor(providerId, topic)),
    ),
  )
}

function resolveSmbxDownload(
  runtime: SmbxGameRuntime,
  providerId: ProviderId,
  candidateUrl: string,
): Effect.Effect<DownloadResolution, AcquisitionError> {
  const topicId = parseSmbxGameTopicUrl(candidateUrl, runtime)
  if (!topicId) {
    return Effect.succeed({
      _tag: "NonFinalDownload" as const,
      providerId,
      reason: "unsupported" as const,
      url: candidateUrl,
    })
  }

  return fetchTopicDetails(runtime, topicId).pipe(
    Effect.map(details => {
      if (!details.downloadUrl) {
        return {
          _tag: "NonFinalDownload" as const,
          providerId,
          reason: "requires-user-action" as const,
          url: details.url,
        } satisfies DownloadResolution
      }
      return {
        _tag: "NonFinalDownload" as const,
        providerId,
        reason: "requires-user-action" as const,
        url: details.downloadUrl,
      } satisfies DownloadResolution
    }),
  )
}

function fetchForumPage(
  runtime: SmbxGameRuntime,
  start: number,
): Effect.Effect<string, AcquisitionError> {
  const path =
    start > 0
      ? `/viewforum.php?f=${EPISODES_FORUM_ID}&start=${start}`
      : `/viewforum.php?f=${EPISODES_FORUM_ID}`
  return fetchText(runtime, `${runtime.forumBaseUrl}${path}`)
}

function fetchTopicDetails(
  runtime: SmbxGameRuntime,
  id: string,
): Effect.Effect<SmbxTopicDetails, AcquisitionError> {
  return fetchText(
    runtime,
    `${runtime.forumBaseUrl}/viewtopic.php?t=${encodeURIComponent(id)}`,
  ).pipe(
    Effect.flatMap(html =>
      Effect.try({
        try: () => parseTopicDetails(runtime, id, html),
        catch: error =>
          error instanceof AcquisitionError
            ? error
            : defective(
                `SMBXGame topic HTML is invalid: ${stringifyError(error)}`,
              ),
      }),
    ),
  )
}

function fetchText(
  runtime: SmbxGameRuntime,
  url: string,
): Effect.Effect<string, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await runtime.fetchImpl(url, {
        headers: { accept: "text/html,application/xhtml+xml" },
      })
      if (!response.ok) {
        throw new AcquisitionError({
          reason: response.status === 404 ? "caller" : "infrastructure",
          providerId: KORRI_SMBXGAME_PLUGIN_ID,
          message: `SMBXGame forums returned HTTP ${response.status} for ${url}`,
        })
      }
      return await response.text()
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "infrastructure",
            providerId: KORRI_SMBXGAME_PLUGIN_ID,
            message: `SMBXGame forum request failed: ${stringifyError(error)}`,
          }),
  })
}

function parseForumTopics(
  runtime: SmbxGameRuntime,
  html: string,
): readonly SmbxTopicSummary[] {
  const topics: SmbxTopicSummary[] = []
  const topicPattern =
    /<a\s+href="(?<href>[^"]*viewtopic\.php\?t=(?<id>\d+)[^"]*)"\s+class="topictitle">(?<title>[\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(topicPattern)) {
    const id = match.groups?.id
    const title = cleanText(match.groups?.title ?? "")
    if (!id || !title) continue
    topics.push({
      id,
      title,
      url: topicUrl(runtime, id),
    })
  }
  return topics
}

function parseTopicDetails(
  runtime: SmbxGameRuntime,
  id: string,
  html: string,
): SmbxTopicDetails {
  const title =
    cleanText(
      matchFirst(
        html,
        /<h2 class="topic-title"><a [^>]*>([\s\S]*?)<\/a><\/h2>/i,
      ) ?? "",
    ) || `SMBX episode ${id}`
  const firstPost =
    matchFirst(html, /<div class="content">([\s\S]*?)<\/div>/i) ?? ""
  const author = cleanText(
    matchFirst(
      html,
      /<p class="author">[\s\S]*?<strong><a [^>]*>([\s\S]*?)<\/a><\/strong>/i,
    ) ?? "",
  )
  const links = extractLinks(runtime, firstPost)
  const downloadUrl = preferredDownloadLink(links, firstPost)
  const description = cleanText(firstPost).slice(0, 4096)
  return {
    id,
    title,
    url: topicUrl(runtime, id),
    ...(author ? { author } : {}),
    ...(description ? { description } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
    links,
  }
}

function claimFor(
  providerId: ProviderId,
  topic: SmbxTopicSummary,
): ProviderClaim {
  return {
    _tag: "ProviderClaim",
    providerId,
    id: topic.id,
    ref: { kind: "provider-item-id", value: topic.id },
    title: topic.title,
    url: topic.url,
    platform: SMBX_EPISODE_SYSTEM,
    artifact: {
      kind: "content" as const,
      system: SMBX_EPISODE_SYSTEM,
      format: { id: SMBX_EPISODE_FORMAT },
    },
    playable: playableFor(providerId, topic),
  }
}

function detailsFor(
  providerId: ProviderId,
  details: SmbxTopicDetails,
): ProviderClaimDetails {
  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id: details.id,
    ref: { kind: "provider-item-id", value: details.id },
    title: details.title,
    url: details.url,
    ...(details.description ? { description: details.description } : {}),
    ...(details.downloadUrl ? { downloadPageUrl: details.downloadUrl } : {}),
    artifact: {
      kind: "content" as const,
      system: SMBX_EPISODE_SYSTEM,
      format: { id: SMBX_EPISODE_FORMAT },
    },
    playable: playableFor(providerId, details),
    facets: facetsFor(details),
  }
}

function playableFor(providerId: ProviderId, topic: SmbxTopicSummary) {
  return {
    id: topic.id,
    title: topic.title,
    providerId,
    releases: [
      {
        id: "episode",
        providerId,
        system: SMBX_EPISODE_SYSTEM,
        target: { kind: "url", value: topic.url },
      },
    ],
  }
}

function facetsFor(details: SmbxTopicDetails): ArtifactFacets {
  return withoutUndefined({
    title: { text: details.title },
    description: details.description
      ? { text: details.description }
      : undefined,
    credits: details.author
      ? { authors: [{ name: details.author, role: "topic author" }] }
      : undefined,
  })
}

export function parseSmbxGameTopicUrl(
  input: string,
  runtime: Pick<SmbxGameRuntime, "forumBaseUrl"> = {
    forumBaseUrl: DEFAULT_FORUM_BASE_URL,
  },
): string | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  const base = new URL(runtime.forumBaseUrl)
  if (url.hostname !== base.hostname) return null
  if (!url.pathname.endsWith("/viewtopic.php")) return null
  const id = url.searchParams.get("t")
  return id && /^\d+$/.test(id) ? id : null
}

function extractLinks(
  runtime: SmbxGameRuntime,
  html: string,
): readonly string[] {
  const links: string[] = []
  for (const match of html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>/gi)) {
    const href = decodeHtml(match[1] ?? "")
    const absolute = absoluteUrl(runtime, href)
    if (!absolute) continue
    links.push(absolute)
  }
  return [...new Set(links)]
}

function preferredDownloadLink(
  links: readonly string[],
  html: string,
): string | undefined {
  const anchorMatches = [
    ...html.matchAll(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
  ]
  for (const match of anchorMatches) {
    const href = decodeHtml(match[1] ?? "")
    const text = cleanText(match[2] ?? "")
    const absolute = links.find(link => link === href || link.endsWith(href))
    if (absolute && /download|get|mirror/i.test(text)) return absolute
  }
  return (
    links.find(link => /\.(zip|7z|rar)(?:$|[?#])/i.test(link)) ??
    links.find(link =>
      /(drive\.google\.com|dropbox\.com|mediafire\.com|mega\.nz|archive\.org)/i.test(
        link,
      ),
    )
  )
}

function dedupeTopics(topics: readonly SmbxTopicSummary[]) {
  const byId = new Map<string, SmbxTopicSummary>()
  for (const topic of topics) byId.set(topic.id, topic)
  return [...byId.values()]
}

function absoluteUrl(runtime: SmbxGameRuntime, href: string): string | null {
  try {
    return new URL(href, `${runtime.forumBaseUrl}/`).toString()
  } catch {
    return null
  }
}

function topicUrl(
  runtime: Pick<SmbxGameRuntime, "forumBaseUrl">,
  id: string,
): string {
  return `${runtime.forumBaseUrl}/viewtopic.php?t=${encodeURIComponent(id)}`
}

function matchFirst(input: string, pattern: RegExp): string | undefined {
  return pattern.exec(input)?.[1]
}

function cleanText(input: string): string {
  return decodeHtml(
    input
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
}

function decodeHtml(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    nbsp: " ",
    laquo: "«",
    raquo: "»",
  }
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    }
    return named[entity.toLowerCase()] ?? `&${entity};`
  })
}

function readRecord(input: unknown): Readonly<Record<string, unknown>> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input as Readonly<Record<string, unknown>>
  }
  return {}
}

function stringField(
  input: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const value = input[key]
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${key} is required`)
  }
  return value
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}

function defective(message: string): AcquisitionError {
  return new AcquisitionError({
    reason: "defective-provider",
    providerId: KORRI_SMBXGAME_PLUGIN_ID,
    message,
  })
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
