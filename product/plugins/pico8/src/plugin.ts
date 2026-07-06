import { AcquisitionError } from "@platform/acquisition/errors"
import type { ProviderId } from "@platform/plugin"
import { plugin } from "@platform/plugin"
import { releaseDiscoveryProvider } from "@platform/plugin/discovery"
import type { PluginServices } from "@platform/plugin/services"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/claim"
import type { DownloadResolution } from "@platform/protocol/acquisition/download-resolution"
import type { ProviderHealth } from "@platform/protocol/acquisition/source-health"
import { Effect } from "effect"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
} from "../../retroarch"

export const KORRI_PICO8_PLUGIN_ID = "@korri:pico8" as const

const DEFAULT_BBS_BASE_URL = "https://www.lexaloffle.com"
export const KORRI_PICO8_SYSTEM_ID = "pico8" as const
export const KORRI_PICO8_FAKE08_RUNTIME_LOCAL_ID = "fake08" as const
export const KORRI_PICO8_FAKE08_RUNTIME_ID =
  `${KORRI_PICO8_PLUGIN_ID}/${KORRI_PICO8_FAKE08_RUNTIME_LOCAL_ID}` as const
export const KORRI_PICO8_CART_DISCOVERY_PROVIDER_ID =
  `${KORRI_PICO8_PLUGIN_ID}/cart-files` as const

const PICO8_SYSTEM = KORRI_PICO8_SYSTEM_ID
const PICO8_CART_CONTENT_TYPE = "image/png"
const MAX_SEARCH_RESULTS = 50

export interface Pico8PluginOptions {
  readonly bbsBaseUrl?: string
  readonly fetchImpl?: typeof fetch
}

interface Pico8Runtime {
  readonly bbsBaseUrl: string
  readonly fetchImpl: typeof fetch
}

export const pico8CartDiscoveryProvider = releaseDiscoveryProvider({
  id: KORRI_PICO8_CART_DISCOVERY_PROVIDER_ID,
  title: "PICO-8 cart files",
  discover: ({ files }) =>
    files.flatMap(file => {
      const normalized = file.relativePath.toLowerCase()
      if (!normalized.endsWith(".p8") && !normalized.endsWith(".p8.png")) {
        return []
      }
      return [
        {
          kind: "file-release" as const,
          confidence: "high" as const,
          source: file,
          release: {
            id: KORRI_PICO8_SYSTEM_ID,
            system: KORRI_PICO8_SYSTEM_ID,
            app: KORRI_RETROARCH_APP_ID,
            runtime: KORRI_PICO8_FAKE08_RUNTIME_ID,
          },
          evidence: [
            {
              kind: "extension",
              value: normalized.endsWith(".p8.png") ? ".p8.png" : ".p8",
            },
          ],
        },
      ]
    }),
})

interface Pico8BbsEntry {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly platform: typeof PICO8_SYSTEM
  readonly author?: string
  readonly thumbnailUrl?: string
  readonly createdAt?: string
  readonly updatedAt?: string
}

interface Pico8CartDetails extends Pico8BbsEntry {
  readonly downloadUrl?: string
  readonly filename?: string
}

interface ParsedPico8Url {
  readonly id?: string
  readonly downloadUrl?: string
}

export function createPico8Plugin(options: Pico8PluginOptions = {}) {
  const runtime = createRuntime(options)

  return plugin({
    namespace: "@korri",
    name: "pico8",
    title: "PICO-8",
    description:
      "Adds PICO-8 BBS acquisition provider claims, cart download resolution, and the fake-08 PICO-8 runtime package.",
    requires: [
      {
        capability: "libretro.app-host",
        ref: { provider: KORRI_RETROARCH_PLUGIN_ID, id: "retroarch" },
        reason: "fake-08 launches through the RetroArch libretro app host",
      },
    ],
    contributes: {
      discovery: [pico8CartDiscoveryProvider],
      config: {
        systems: {
          pico8: {
            id: KORRI_PICO8_SYSTEM_ID,
            title: "PICO-8",
          },
        },
        modules: {
          "libretro-fake-08-package": {
            id: "libretro-fake-08-package",
            kind: "nix-package",
            package: "libretro-fake-08",
            path: "product/plugins/pico8/packages/libretro-fake-08",
            capabilities: ["package.expose", "launch.runtime", "pico8"],
            core: "fake08",
          },
        },
        runtimes: {
          fake08: {
            id: KORRI_PICO8_FAKE08_RUNTIME_ID,
            kind: "libretro-core",
            app: KORRI_RETROARCH_APP_ID,
            path: "/etc/korri/cores/fake08_libretro.so",
            supports: { systems: ["pico8"] },
          },
        },
      },
      handlers: [
        {
          id: "pico8.claims-search",
          operation: "claims.search",
          capabilities: ["claims.search", "pico8"],
          run: context => {
            const input = readRecord(context.input)
            const query = typeof input.query === "string" ? input.query : ""
            const platforms = Array.isArray(input.platforms)
              ? input.platforms.filter(
                  (platform): platform is string =>
                    typeof platform === "string",
                )
              : undefined
            return searchPico8Bbs(
              runtime,
              context.provider,
              query,
              platforms,
              context.services,
            )
          },
        },
        {
          id: "pico8.claims-details",
          operation: "claims.details",
          capabilities: ["claims.details", "pico8"],
          run: context => {
            const input = readRecord(context.input)
            const id = stringField(input, "id")
            return fetchPico8Details(runtime, id, context.services).pipe(
              Effect.map(entry => detailsFor(context.provider, entry)),
            )
          },
        },
        {
          id: "pico8.claims-parse-url",
          operation: "claims.parse-url",
          capabilities: ["claims.parse-url", "pico8"],
          run: context => {
            const input = readRecord(context.input)
            const url = typeof input.url === "string" ? input.url : ""
            return parsePico8BbsUrl(url, runtime)?.id ?? null
          },
        },
        {
          id: "pico8.provider-validate",
          operation: "provider.validate",
          capabilities: ["provider.validate", "pico8"],
          run: context => {
            const input = readRecord(context.input)
            return fetchText(
              runtime,
              searchUrl(runtime, "pico8", 1),
              context.services,
            ).pipe(
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
          id: "pico8.artifact-resolve-download",
          operation: "artifact.resolve-download",
          capabilities: ["artifact.resolve-download", "pico8"],
          run: context => {
            const input = readRecord(context.input)
            const candidateUrl = stringField(input, "candidateUrl")
            return resolvePico8BbsDownload(
              runtime,
              context.provider,
              candidateUrl,
              context.services,
            )
          },
        },
        {
          id: "pico8.diagnostics",
          operation: "diagnostics.collect",
          capabilities: ["pico8"],
          run: context => ({
            provider: context.provider,
            status: "ok",
            bbsBaseUrl: runtime.bbsBaseUrl,
          }),
        },
      ],
    },
  })
}

export const pico8Plugin = createPico8Plugin()

function createRuntime({
  bbsBaseUrl = DEFAULT_BBS_BASE_URL,
  fetchImpl = globalThis.fetch,
}: Pico8PluginOptions): Pico8Runtime {
  if (!fetchImpl) {
    throw new AcquisitionError({
      reason: "configuration",
      providerId: KORRI_PICO8_PLUGIN_ID,
      message: "global fetch is not available for PICO-8 BBS",
    })
  }
  return {
    bbsBaseUrl: trimTrailingSlash(bbsBaseUrl),
    fetchImpl,
  }
}

function searchPico8Bbs(
  runtime: Pico8Runtime,
  providerId: ProviderId,
  query: string,
  platforms?: readonly string[],
  services?: PluginServices,
): Effect.Effect<readonly ProviderClaim[], AcquisitionError> {
  const normalized = query.trim()
  if (normalized.length === 0) return Effect.succeed([])
  if (platforms && platforms.length > 0 && !platforms.includes(PICO8_SYSTEM)) {
    return Effect.succeed([])
  }

  return fetchText(runtime, searchUrl(runtime, normalized), services).pipe(
    Effect.map(html =>
      parsePico8SearchEntries(runtime, html)
        .slice(0, MAX_SEARCH_RESULTS)
        .map(entry => claimFor(providerId, entry)),
    ),
  )
}

function fetchPico8Details(
  runtime: Pico8Runtime,
  id: string,
  services?: PluginServices,
): Effect.Effect<Pico8CartDetails, AcquisitionError> {
  return fetchText(runtime, postUrl(runtime, id), services).pipe(
    Effect.flatMap(html => {
      const details = parsePico8Details(runtime, html, id)
      if (details) return Effect.succeed(details)
      return Effect.fail(
        new AcquisitionError({
          reason: "caller",
          providerId: KORRI_PICO8_PLUGIN_ID,
          message: `Unknown PICO-8 BBS candidate: ${id}`,
        }),
      )
    }),
  )
}

function resolvePico8BbsDownload(
  runtime: Pico8Runtime,
  providerId: ProviderId,
  candidateUrl: string,
  services?: PluginServices,
): Effect.Effect<DownloadResolution, AcquisitionError> {
  const parsed = parsePico8BbsUrl(candidateUrl, runtime)
  if (!parsed) {
    return Effect.succeed({
      _tag: "NonFinalDownload" as const,
      providerId,
      reason: "unsupported" as const,
      url: candidateUrl,
    })
  }

  if (parsed.downloadUrl) {
    return Effect.succeed(finalDownload(providerId, parsed.downloadUrl))
  }

  if (!parsed.id) {
    return Effect.succeed({
      _tag: "NonFinalDownload" as const,
      providerId,
      reason: "unsupported" as const,
      url: candidateUrl,
    })
  }

  return fetchPico8Details(runtime, parsed.id, services).pipe(
    Effect.map(details => {
      if (!details.downloadUrl) {
        return {
          _tag: "NonFinalDownload" as const,
          providerId,
          reason: "requires-user-action" as const,
          url: details.url,
        } satisfies DownloadResolution
      }
      return finalDownload(providerId, details.downloadUrl)
    }),
  )
}

function claimFor(providerId: ProviderId, entry: Pico8BbsEntry): ProviderClaim {
  return {
    _tag: "ProviderClaim",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    platform: entry.platform,
    ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
    playable: playableFor(providerId, entry),
  }
}

function detailsFor(
  providerId: ProviderId,
  entry: Pico8CartDetails,
): ProviderClaimDetails {
  return {
    _tag: "ProviderClaimDetails",
    providerId,
    id: entry.id,
    ref: { kind: "provider-item-id", value: entry.id },
    title: entry.title,
    url: entry.url,
    description: descriptionFor(entry),
    ...(entry.downloadUrl ? { downloadPageUrl: entry.downloadUrl } : {}),
    playable: playableFor(providerId, entry),
  }
}

function playableFor(providerId: ProviderId, entry: Pico8CartDetails) {
  return {
    id: entry.id,
    title: entry.title,
    providerId,
    releases: [
      {
        id: entry.platform,
        providerId,
        system: entry.platform,
        ...(entry.downloadUrl
          ? { target: { kind: "url" as const, value: entry.downloadUrl } }
          : {}),
      },
    ],
  }
}

function descriptionFor(entry: Pico8CartDetails): string {
  return [
    entry.author ? `PICO-8 BBS cart by ${entry.author}.` : "PICO-8 BBS cart.",
    entry.createdAt ? `Published ${entry.createdAt}.` : undefined,
    entry.updatedAt ? `Updated ${entry.updatedAt}.` : undefined,
  ]
    .filter((part): part is string => part !== undefined)
    .join(" ")
}

function finalDownload(
  providerId: ProviderId,
  url: string,
): DownloadResolution {
  return {
    _tag: "FinalDownload" as const,
    providerId,
    url,
    filename: filenameFromUrl(url) ?? "pico8-cart.p8.png",
    contentType: PICO8_CART_CONTENT_TYPE,
  }
}

function parsePico8SearchEntries(
  runtime: Pico8Runtime,
  html: string,
): readonly Pico8BbsEntry[] {
  return pdatRows(html).flatMap(row => {
    const fields = splitTopLevel(row)
    const id = stringLiteral(fields[0])
    if (!id) return []
    const title = stringLiteral(fields[22]) ?? stringLiteral(fields[2])
    if (!title) return []
    return [
      {
        id,
        title: decodeHtml(title),
        url: postUrl(runtime, id),
        platform: PICO8_SYSTEM,
        author: stringLiteral(fields[8]),
        thumbnailUrl: absoluteBbsUrl(runtime, stringLiteral(fields[3])),
        createdAt: stringLiteral(fields[6]),
        updatedAt: stringLiteral(fields[9]),
      },
    ]
  })
}

function parsePico8Details(
  runtime: Pico8Runtime,
  html: string,
  fallbackId: string,
): Pico8CartDetails | null {
  const cartFilePath = firstMatch(html, /href=["']([^"']+\.p8\.png)["']/i)
  const downloadUrl = absoluteBbsUrl(runtime, cartFilePath)
  const title =
    titleNearCartFile(html) ??
    metaContent(html, "og:title") ??
    `PICO-8 Cart ${fallbackId}`
  return {
    id: fallbackId,
    title: decodeHtml(title),
    url: postUrl(runtime, fallbackId),
    platform: PICO8_SYSTEM,
    author: authorNearCartFile(html),
    downloadUrl,
    filename: downloadUrl ? filenameFromUrl(downloadUrl) : undefined,
  }
}

function pdatRows(html: string): readonly string[] {
  const assignment = html.indexOf("pdat=[")
  if (assignment < 0) return []
  const start = html.indexOf("[", assignment)
  if (start < 0) return []

  const rows: string[] = []
  let depth = 0
  let rowStart = -1
  let quote: "'" | '"' | "`" | null = null
  let escaped = false

  for (let index = start; index < html.length; index++) {
    const char = html[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }

    if (char === "[") {
      depth += 1
      if (depth === 2) rowStart = index + 1
      continue
    }

    if (char === "]") {
      if (depth === 2 && rowStart >= 0) {
        rows.push(html.slice(rowStart, index))
        rowStart = -1
      }
      depth -= 1
      if (depth === 0) break
    }
  }

  return rows
}

function splitTopLevel(row: string): readonly string[] {
  const fields: string[] = []
  let start = 0
  let depth = 0
  let quote: "'" | '"' | "`" | null = null
  let escaped = false

  for (let index = 0; index < row.length; index++) {
    const char = row[index]

    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char
      continue
    }

    if (char === "[") {
      depth += 1
      continue
    }
    if (char === "]") {
      depth -= 1
      continue
    }
    if (char === "," && depth === 0) {
      fields.push(row.slice(start, index).trim())
      start = index + 1
    }
  }

  fields.push(row.slice(start).trim())
  return fields
}

function stringLiteral(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const quote = trimmed[0]
  if (
    (quote === "'" || quote === '"' || quote === "`") &&
    trimmed.endsWith(quote)
  ) {
    return trimmed.slice(1, -1).replaceAll(`\\${quote}`, quote)
  }
  return trimmed === "" ? undefined : trimmed
}

function parsePico8BbsUrl(
  input: string,
  runtime: Pico8Runtime = createRuntime({}),
): ParsedPico8Url | null {
  let url: URL
  try {
    url = new URL(input, `${runtime.bbsBaseUrl}/`)
  } catch {
    return null
  }

  const bbsHost = new URL(runtime.bbsBaseUrl).hostname
  if (url.hostname !== bbsHost) return null

  const cartFile = url.pathname.match(/^\/bbs\/cposts\/\d+\/([^/]+\.p8\.png)$/)
  if (cartFile) return { downloadUrl: url.toString() }

  if (url.pathname !== "/bbs/") return null
  const id = url.searchParams.get("pid") ?? url.searchParams.get("tid")
  return id ? { id } : null
}

function searchUrl(
  runtime: Pico8Runtime,
  query: string,
  limit = MAX_SEARCH_RESULTS,
): string {
  const url = new URL(`${runtime.bbsBaseUrl}/bbs/`)
  url.searchParams.set("cat", "7")
  url.searchParams.set("sub", "2")
  url.searchParams.set("mode", "carts")
  url.searchParams.set("orderby", "ts")
  url.searchParams.set("search", query)
  url.searchParams.set("max", String(limit))
  return url.toString()
}

function postUrl(runtime: Pico8Runtime, id: string): string {
  const url = new URL(`${runtime.bbsBaseUrl}/bbs/`)
  url.searchParams.set("pid", id)
  return `${url.toString()}#p`
}

function absoluteBbsUrl(
  runtime: Pico8Runtime,
  path: string | undefined,
): string | undefined {
  if (!path) return undefined
  try {
    return new URL(path, `${runtime.bbsBaseUrl}/`).toString()
  } catch {
    return undefined
  }
}

function fetchText(
  runtime: Pico8Runtime,
  url: string,
  services?: PluginServices,
): Effect.Effect<string, AcquisitionError> {
  return Effect.tryPromise({
    try: async () => {
      const serviceText = services?.http?.text
      if (serviceText) {
        return serviceText(url, {
          headers: { accept: "text/html,application/xhtml+xml" },
        })
      }

      const response = await runtime.fetchImpl(url, {
        headers: { accept: "text/html,application/xhtml+xml" },
      })
      if (!response.ok) {
        throw new AcquisitionError({
          reason: "infrastructure",
          providerId: KORRI_PICO8_PLUGIN_ID,
          message: `GET ${url} returned ${response.status}`,
        })
      }
      return response.text()
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "infrastructure",
            providerId: KORRI_PICO8_PLUGIN_ID,
            message: `Failed to fetch PICO-8 BBS: ${
              error instanceof Error ? error.message : String(error)
            }`,
          }),
  })
}

function titleNearCartFile(html: string): string | undefined {
  const cartFileIndex = html.search(/Cart File/i)
  if (cartFileIndex < 0) return undefined
  const before = html.slice(Math.max(0, cartFileIndex - 1000), cartFileIndex)
  const matches = [...before.matchAll(/<div[^>]*>([^<]+)<\/div>/gi)]
  return cleanText(matches.at(-1)?.[1])
}

function authorNearCartFile(html: string): string | undefined {
  const cartFileIndex = html.search(/Cart File/i)
  if (cartFileIndex < 0) return undefined
  const around = html.slice(cartFileIndex, cartFileIndex + 1500)
  return cleanText(firstMatch(around, /<b>([^<]+)<\/b>/i))
}

function metaContent(html: string, property: string): string | undefined {
  return cleanText(
    firstMatch(
      html,
      new RegExp(
        `<meta\\s+property=["']${escapeRegExp(property)}["'][^>]*content=["']([^"']+)["']`,
        "i",
      ),
    ),
  )
}

function firstMatch(input: string, pattern: RegExp): string | undefined {
  return input.match(pattern)?.[1]
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value ? decodeHtml(stripTags(value)).trim() : ""
  return cleaned.length > 0 ? cleaned : undefined
}

function stripTags(value: string): string {
  return value.replaceAll(/<[^>]*>/g, "")
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    gt: ">",
    lt: "<",
    quot: '"',
    apos: "'",
    nbsp: " ",
  }
  return value
    .replaceAll(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replaceAll(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replaceAll(/&([a-z]+);/gi, (match, name: string) => named[name] ?? match)
}

function filenameFromUrl(input: string): string | undefined {
  try {
    const pathname = new URL(input).pathname
    return pathname.split("/").filter(Boolean).at(-1)
  } catch {
    return undefined
  }
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
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
