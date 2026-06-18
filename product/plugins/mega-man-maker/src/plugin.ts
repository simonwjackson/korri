import { AcquisitionError } from "@platform/acquisition/errors"
import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import type { PluginAcquireOutput } from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  ArtifactAcquisitionHint,
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"

export const KORRI_MEGA_MAN_MAKER_PLUGIN_ID = "@korri:mega-man-maker" as const

const DEFAULT_API_BASE_URL = "https://api.megamanmaker.com"
const DEFAULT_WEB_BASE_URL = "https://megamanmaker.com"
const DEFAULT_CDN_HOST = "cdn.megamanmaker.com"
const MEGA_MAN_MAKER_SYSTEM = "mega-man-maker"
const MEGA_MAN_MAKER_FORMAT = "mega-man-maker-level"
const LEVEL_FILE_MEDIA_TYPE = "application/gzip"

export interface MegaManMakerPluginOptions {
  readonly apiBaseUrl?: string
  readonly webBaseUrl?: string
  readonly cdnHost?: string
  readonly fetchImpl?: typeof fetch
}

interface MegaManMakerRuntime {
  readonly apiBaseUrl: string
  readonly webBaseUrl: string
  readonly cdnHost: string
  readonly fetchImpl: typeof fetch
}

interface MegaManMakerLevel {
  readonly id?: unknown
  readonly name?: unknown
  readonly authorName?: unknown
  readonly created?: unknown
  readonly boss?: unknown
  readonly likes?: unknown
  readonly dislikes?: unknown
  readonly downloads?: unknown
  readonly difficulty?: unknown
  readonly tags?: unknown
}

interface MegaManMakerSearchPayload {
  readonly items?: unknown
}

interface MegaManMakerDownloadPayload {
  readonly id?: unknown
  readonly location?: unknown
  readonly content?: unknown
}

const levelArtifactHint = {
  kind: "content" as const,
  system: MEGA_MAN_MAKER_SYSTEM,
  format: { id: MEGA_MAN_MAKER_FORMAT },
} satisfies ArtifactAcquisitionHint

export function createMegaManMakerPlugin(
  options: MegaManMakerPluginOptions = {},
) {
  const runtime = createRuntime(options)

  return plugin({
    namespace: "@korri",
    name: "mega-man-maker",
    title: "Mega Man Maker",
    description:
      "Adds Mega Man Maker explore search, level details, and .mmlv.gz download resolution.",
    contributes: {
      handlers: [
        {
          id: "mega-man-maker.claims-search",
          operation: "claims.search",
          capabilities: ["claims.search", "mega-man-maker"],
          run: context => {
            const input = readRecord(context.input)
            const query = typeof input.query === "string" ? input.query : ""
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (platform): platform is string =>
                    typeof platform === "string",
                )
              : undefined
            return searchMegaManMaker(
              runtime,
              context.provider,
              query,
              platforms,
            )
          },
        },
        {
          id: "mega-man-maker.claims-details",
          operation: "claims.details",
          capabilities: ["claims.details", "mega-man-maker"],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            return fetchLevel(runtime, id).pipe(
              Effect.flatMap(level =>
                level
                  ? Effect.succeed(detailsFor(runtime, context.provider, level))
                  : Effect.fail(
                      new AcquisitionError({
                        reason: "caller",
                        providerId: context.provider,
                        message: `Unknown Mega Man Maker level: ${id}`,
                      }),
                    ),
              ),
            )
          },
        },
        {
          id: "mega-man-maker.claims-parse-url",
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", "mega-man-maker"],
          run: context => {
            const input = readRecord(context.input)
            const url = typeof input.url === "string" ? input.url : ""
            return parseMegaManMakerUrl(url, runtime)?.id ?? null
          },
        },
        {
          id: "mega-man-maker.provider-validate",
          operation: "provider.validate",
          capabilities: ["provider.validate", "mega-man-maker"],
          run: context => {
            const input = readRecord(context.input)
            return fetchJson(runtime, "/level/search?size=1").pipe(
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
          id: "mega-man-maker.artifact-resolve-download",
          operation: "artifact.resolve-download",
          capabilities: ["artifact.resolve-download", "mega-man-maker"],
          run: context => {
            const input = readRecord(context.input)
            const candidateUrl = stringField(input, "candidateUrl")
            return resolveMegaManMakerDownload(
              runtime,
              context.provider,
              candidateUrl,
            )
          },
        },
        {
          id: "mega-man-maker.artifact-acquire",
          operation: "artifact.acquire",
          capabilities: ["artifact.acquire", "mega-man-maker"],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            return acquireMegaManMakerLevel(runtime, context.provider, id)
          },
        },
        {
          id: "mega-man-maker.diagnostics",
          operation: "diagnostics.collect",
          capabilities: ["mega-man-maker"],
          run: context => ({
            provider: context.provider,
            status: "ok",
            apiBaseUrl: runtime.apiBaseUrl,
            webBaseUrl: runtime.webBaseUrl,
          }),
        },
      ],
    },
  })
}

export const megaManMakerPlugin = createMegaManMakerPlugin()

function createRuntime({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  webBaseUrl = DEFAULT_WEB_BASE_URL,
  cdnHost = DEFAULT_CDN_HOST,
  fetchImpl = globalThis.fetch,
}: MegaManMakerPluginOptions): MegaManMakerRuntime {
  if (!fetchImpl) {
    throw new AcquisitionError({
      reason: "configuration",
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      message: "global fetch is not available for Mega Man Maker",
    })
  }
  return {
    apiBaseUrl: trimTrailingSlash(apiBaseUrl),
    webBaseUrl: trimTrailingSlash(webBaseUrl),
    cdnHost,
    fetchImpl,
  }
}

function searchMegaManMaker(
  runtime: MegaManMakerRuntime,
  providerId: ProviderId,
  query: string,
  platforms?: readonly string[],
): Effect.Effect<readonly ProviderClaim[], AcquisitionError> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return Effect.succeed([])
  if (
    platforms &&
    platforms.length > 0 &&
    !platforms.includes(MEGA_MAN_MAKER_SYSTEM)
  ) {
    return Effect.succeed([])
  }

  if (/^\d+$/.test(trimmed)) {
    return fetchLevel(runtime, trimmed).pipe(
      Effect.map(level =>
        level ? [claimFor(runtime, providerId, level)] : [],
      ),
    )
  }

  return fetchJson(
    runtime,
    `/level/search?search=${encodeURIComponent(trimmed)}&size=6`,
  ).pipe(
    Effect.map(payload =>
      levelsFromSearchPayload(payload)
        .slice(0, 5)
        .map(level => claimFor(runtime, providerId, level)),
    ),
  )
}

function fetchLevel(
  runtime: MegaManMakerRuntime,
  id: string,
): Effect.Effect<MegaManMakerLevel | null, AcquisitionError> {
  return fetchJson(runtime, `/level/${encodeURIComponent(id)}`, {
    notFound: null,
  }).pipe(Effect.map(payload => (payload ? levelFromPayload(payload) : null)))
}

function resolveMegaManMakerDownload(
  runtime: MegaManMakerRuntime,
  providerId: ProviderId,
  candidateUrl: string,
): Effect.Effect<DownloadResolution, AcquisitionError> {
  const parsed = parseMegaManMakerUrl(candidateUrl, runtime)
  if (parsed?.kind === "cdn") {
    return Effect.succeed({
      _tag: "FinalDownload" as const,
      providerId,
      url: candidateUrl,
      filename: filenameFromUrl(candidateUrl),
      contentType: LEVEL_FILE_MEDIA_TYPE,
    })
  }
  if (!parsed) {
    return Effect.succeed({
      _tag: "NonFinalDownload" as const,
      providerId,
      reason: "unsupported" as const,
      url: candidateUrl,
    })
  }

  return fetchDownload(runtime, parsed.id).pipe(
    Effect.map(download => {
      const location = stringValue(download.location)
      if (!location) {
        return {
          _tag: "FailedDownload" as const,
          providerId,
          reason: "not-found" as const,
          message: `Mega Man Maker level has no downloadable file: ${parsed.id}`,
        } satisfies DownloadResolution
      }
      return {
        _tag: "FinalDownload" as const,
        providerId,
        url: location,
        filename: filenameFromUrl(location),
        contentType: LEVEL_FILE_MEDIA_TYPE,
      } satisfies DownloadResolution
    }),
  )
}

function acquireMegaManMakerLevel(
  runtime: MegaManMakerRuntime,
  providerId: ProviderId,
  id: string,
): Effect.Effect<PluginAcquireOutput, AcquisitionError> {
  return Effect.gen(function* () {
    const [level, download] = yield* Effect.all([
      fetchLevel(runtime, id),
      fetchDownload(runtime, id),
    ])
    const location = stringValue(download.location)
    if (!location) {
      return yield* Effect.fail(
        new AcquisitionError({
          reason: "provider-error",
          providerId,
          message: `Mega Man Maker level has no downloadable file: ${id}`,
        }),
      )
    }
    const bytes = yield* fetchBytes(runtime, location)
    const title = level ? titleFor(level) : `Mega Man Maker Level ${id}`
    const filename = filenameFromUrl(location) ?? `${id}.mmlv.gz`
    return {
      kind: "content" as const,
      system: MEGA_MAN_MAKER_SYSTEM,
      format: { id: MEGA_MAN_MAKER_FORMAT },
      file: {
        name: filename,
        extension: "gz",
        mediaType: LEVEL_FILE_MEDIA_TYPE,
        sizeBytes: bytes.length,
      },
      bytesBase64: bytes.toString("base64"),
      facets: {
        title: { text: title },
        ...(level ? { description: { text: descriptionFor(level) } } : {}),
      },
      provenance: {
        source: "Mega Man Maker",
        url: webLevelUrl(runtime, id),
      },
      externalIds: [{ namespace: "megamanmaker.level", id }],
      sourceData: {
        "megamanmaker.v1": {
          id,
          downloadUrl: location,
          ...(level ? { level } : {}),
        },
      },
    } satisfies PluginAcquireOutput
  })
}

function fetchDownload(
  runtime: MegaManMakerRuntime,
  id: string,
): Effect.Effect<MegaManMakerDownloadPayload, AcquisitionError> {
  return fetchJson(runtime, `/level/download/${encodeURIComponent(id)}`).pipe(
    Effect.map(downloadFromPayload),
  )
}

function fetchJson(
  runtime: MegaManMakerRuntime,
  path: string,
  options: { readonly notFound?: null } = {},
): Effect.Effect<unknown | null, AcquisitionError> {
  const url = absoluteApiUrl(runtime, path)
  return Effect.tryPromise({
    try: async () => {
      const response = await runtime.fetchImpl(url, {
        headers: { accept: "application/json" },
      })
      if (response.status === 404 && "notFound" in options) return null
      if (!response.ok) {
        throw new AcquisitionError({
          reason: response.status === 404 ? "caller" : "provider-error",
          providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
          message: `Mega Man Maker API returned HTTP ${response.status} for ${url}`,
        })
      }
      return await response.json()
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "provider-error",
            providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
            message: `Mega Man Maker API request failed: ${stringifyError(error)}`,
          }),
  })
}

function fetchBytes(
  runtime: MegaManMakerRuntime,
  url: string,
): Effect.Effect<Buffer, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const response = await runtime.fetchImpl(url)
      if (!response.ok) {
        throw new AcquisitionError({
          reason: response.status === 404 ? "caller" : "provider-error",
          providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
          message: `Mega Man Maker artifact returned HTTP ${response.status} for ${url}`,
        })
      }
      return Buffer.from(await response.arrayBuffer())
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "provider-error",
            providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
            message: `Mega Man Maker artifact request failed: ${stringifyError(error)}`,
          }),
  })
}

function claimFor(
  runtime: MegaManMakerRuntime,
  providerId: ProviderId,
  level: MegaManMakerLevel,
): ProviderClaim {
  const id = idFor(level)
  return {
    _tag: "ProviderClaim",
    providerId,
    id,
    ref: { kind: "provider-item-id", value: id },
    title: titleFor(level),
    url: webLevelUrl(runtime, id),
    platform: MEGA_MAN_MAKER_SYSTEM,
    artifact: levelArtifactHint,
    playable: playableFor(runtime, providerId, level),
  }
}

function detailsFor(
  runtime: MegaManMakerRuntime,
  providerId: ProviderId,
  level: MegaManMakerLevel,
): ProviderClaimDetails {
  const id = idFor(level)
  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id,
    ref: { kind: "provider-item-id", value: id },
    title: titleFor(level),
    url: webLevelUrl(runtime, id),
    description: descriptionFor(level),
    downloadPageUrl: downloadApiUrl(runtime, id),
    artifact: levelArtifactHint,
    playable: playableFor(runtime, providerId, level),
    facets: {
      title: { text: titleFor(level) },
      description: { text: descriptionFor(level) },
      credits: { authors: [{ name: authorFor(level), role: "level author" }] },
      communityStats: communityStatsFor(level),
    },
  }
}

function playableFor(
  runtime: MegaManMakerRuntime,
  providerId: ProviderId,
  level: MegaManMakerLevel,
) {
  const id = idFor(level)
  return {
    id,
    title: titleFor(level),
    providerId,
    releases: [
      {
        id: "level",
        providerId,
        system: MEGA_MAN_MAKER_SYSTEM,
        target: webLevelUrl(runtime, id),
      },
    ],
  }
}

function levelsFromSearchPayload(
  payload: unknown,
): readonly MegaManMakerLevel[] {
  const items = (payload as MegaManMakerSearchPayload | null)?.items
  if (!Array.isArray(items)) return []
  return items.map(levelFromPayload)
}

function levelFromPayload(payload: unknown): MegaManMakerLevel {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new AcquisitionError({
      reason: "defective-provider",
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      message: "Mega Man Maker level payload is not an object",
    })
  }
  const level = payload as MegaManMakerLevel
  idFor(level)
  titleFor(level)
  return level
}

function downloadFromPayload(payload: unknown): MegaManMakerDownloadPayload {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new AcquisitionError({
      reason: "defective-provider",
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      message: "Mega Man Maker download payload is not an object",
    })
  }
  return payload as MegaManMakerDownloadPayload
}

function idFor(level: MegaManMakerLevel): string {
  const id = stringValue(level.id)
  if (!id) {
    throw new AcquisitionError({
      reason: "defective-provider",
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      message: "Mega Man Maker level is missing id",
    })
  }
  return id
}

function titleFor(level: MegaManMakerLevel): string {
  return stringValue(level.name) ?? `Mega Man Maker Level ${idFor(level)}`
}

function authorFor(level: MegaManMakerLevel): string {
  return stringValue(level.authorName) ?? "Unknown author"
}

function descriptionFor(level: MegaManMakerLevel): string {
  const parts = [`Mega Man Maker level by ${authorFor(level)}.`]
  const created = stringValue(level.created)
  if (created) parts.push(`Uploaded: ${created}.`)
  const downloads = numberValue(level.downloads)
  if (downloads !== undefined) parts.push(`Plays: ${downloads}.`)
  const score = scoreFor(level)
  if (score !== undefined) parts.push(`Score: ${score}.`)
  return parts.join(" ")
}

function communityStatsFor(
  level: MegaManMakerLevel,
): Readonly<Record<string, number>> {
  const stats: Record<string, number> = {}
  const downloads = numberValue(level.downloads)
  const likes = numberValue(level.likes)
  const dislikes = numberValue(level.dislikes)
  const difficulty = numberValue(level.difficulty)
  const score = scoreFor(level)
  if (downloads !== undefined) stats.plays = downloads
  if (likes !== undefined) stats.likes = likes
  if (dislikes !== undefined) stats.dislikes = dislikes
  if (difficulty !== undefined) stats.difficulty = difficulty
  if (score !== undefined) stats.score = score
  return stats
}

function scoreFor(level: MegaManMakerLevel): number | undefined {
  const likes = numberValue(level.likes)
  const dislikes = numberValue(level.dislikes)
  if (likes === undefined && dislikes === undefined) return undefined
  return (likes ?? 0) - (dislikes ?? 0)
}

type ParsedMegaManMakerUrl =
  | { readonly kind: "level"; readonly id: string }
  | { readonly kind: "download"; readonly id: string }
  | { readonly kind: "cdn"; readonly id: string }

export function parseMegaManMakerUrl(
  input: string,
  runtime: Pick<
    MegaManMakerRuntime,
    "apiBaseUrl" | "webBaseUrl" | "cdnHost"
  > = {
    apiBaseUrl: DEFAULT_API_BASE_URL,
    webBaseUrl: DEFAULT_WEB_BASE_URL,
    cdnHost: DEFAULT_CDN_HOST,
  },
): ParsedMegaManMakerUrl | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }

  const webHost = new URL(runtime.webBaseUrl).hostname
  const apiHost = new URL(runtime.apiBaseUrl).hostname

  if (url.hostname === webHost || url.hostname === `www.${webHost}`) {
    const id = url.searchParams.get("level")
    return id && /^\d+$/.test(id) ? { kind: "level", id } : null
  }

  if (url.hostname === apiHost) {
    const download = url.pathname.match(/^\/level\/download\/(\d+)$/)
    if (download?.[1]) return { kind: "download", id: download[1] }
    const level = url.pathname.match(/^\/level\/(\d+)$/)
    if (level?.[1]) return { kind: "level", id: level[1] }
  }

  if (url.hostname === runtime.cdnHost) {
    const cdn = url.pathname.match(/\/(\d+)\.mmlv\.gz$/)
    if (cdn?.[1]) return { kind: "cdn", id: cdn[1] }
  }

  return null
}

function webLevelUrl(runtime: MegaManMakerRuntime, id: string): string {
  return `${runtime.webBaseUrl}/?level=${encodeURIComponent(id)}`
}

function downloadApiUrl(runtime: MegaManMakerRuntime, id: string): string {
  return `${runtime.apiBaseUrl}/level/download/${encodeURIComponent(id)}`
}

function absoluteApiUrl(runtime: MegaManMakerRuntime, path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) return path
  return `${runtime.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`
}

function filenameFromUrl(input: string): string | undefined {
  try {
    const pathname = new URL(input).pathname
    const filename = pathname.split("/").filter(Boolean).at(-1)
    return filename ? decodeURIComponent(filename) : undefined
  } catch {
    return undefined
  }
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

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
