import { spawn } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { createConnection, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createInterface, type Interface } from "node:readline"
import type { Readable } from "node:stream"
import type {
  AcquireArtifactRequest,
  PluginAcquireOutput,
} from "@platform/protocol/acquisition/artifact-acquisition"
import type {
  ProviderClaim,
  ProviderClaimDetails,
} from "@platform/protocol/acquisition/candidate"
import type {
  DownloadChoice,
  DownloadResolution,
  ResolveDownloadRequest,
} from "@platform/protocol/acquisition/download-resolution"
import { Effect } from "effect"
import { validateOutboundHttpUrl } from "../download-resolution/url-policy"
import { AcquisitionError } from "../errors"
import type { AcquisitionPluginContext } from "../plugin-runtime"
import type { AcquisitionPluginDefinition } from "./registry"

const PROVIDER_ID = "@korri:itchio"
const DISPLAY_NAME = "itch.io"
const RELEASE_ID = "itchio"
const PUBLIC_DOWNLOAD_FORMAT_ID = "itchio-public-download"
const BUTLER_INSTALL_FORMAT_ID = "itchio-butler-install-tar"
const MAX_PUBLIC_ARTIFACT_BYTES = 256 * 1024 * 1024

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

interface ItchioPluginOptions {
  readonly fetchImpl?: FetchLike
  readonly apiKey?: string
  readonly apiBaseUrl?: string
  readonly butlerClient?: ItchioButlerClient
  readonly butlerCommand?: readonly string[]
}

interface ItchioButlerClient {
  readonly listGameUploads: (
    input: ItchioButlerRequest,
  ) => Promise<readonly ItchioUploadChoice[]>
  readonly acquireGameUpload: (
    input: ItchioButlerAcquireRequest,
  ) => Promise<ItchioButlerAcquireResult>
}

interface ItchioButlerRequest {
  readonly apiKey: string
  readonly gameId: number
  readonly command: readonly string[]
}

interface ItchioButlerAcquireRequest extends ItchioButlerRequest {
  readonly uploadId: string
  readonly filename?: string
}

interface ItchioButlerAcquireResult {
  readonly bytes: Buffer
  readonly filename: string
  readonly sizeBytes: number
}

interface ItchioPublicPage {
  readonly id: string
  readonly url: string
  readonly title: string
  readonly description?: string
  readonly display?: Readonly<Record<string, unknown>>
  readonly platforms: readonly string[]
}

interface ItchioGameData {
  readonly id?: number
  readonly title?: string
  readonly price?: string
  readonly originalPrice?: string
  readonly sale?: Readonly<Record<string, unknown>>
}

interface ItchioAuth {
  readonly apiKey: string
}

interface ItchioApiGame {
  readonly id: number
  readonly title: string
  readonly url: string
  readonly shortText?: string
  readonly coverUrl?: string
  readonly minPrice?: number
  readonly traits: readonly string[]
}

interface ItchioOwnedKey {
  readonly id?: number
  readonly key?: string
  readonly gameId: number
  readonly title: string
  readonly url: string
  readonly coverUrl?: string
  readonly traits: readonly string[]
}

export function createItchioPluginDefinition(
  options: ItchioPluginOptions = {},
): AcquisitionPluginDefinition {
  const fetchImpl = options.fetchImpl ?? fetch
  const apiBaseUrl = options.apiBaseUrl ?? "https://api.itch.io"
  const butlerClient = options.butlerClient ?? createButlerClient()

  return {
    metadata: {
      providerId: PROVIDER_ID,
      displayName: DISPLAY_NAME,
      module: "product/platform/acquisition/plugins/itchio",
      builtIn: true,
      enabledByDefault: true,
      legalRisk: "medium",
      credentialRequired: false,
    },
    parseCandidateUrl: parseItchioCandidateUrl,
    search: (context, request) =>
      Effect.tryPromise(async () =>
        searchItchio(
          fetchImpl,
          apiBaseUrl,
          authFrom(context, options),
          request,
        ),
      ).pipe(
        Effect.catch(() =>
          Effect.succeed([] satisfies readonly ProviderClaim[]),
        ),
      ),
    details: (_context, request) =>
      publicPageDetails(fetchImpl, request.id).pipe(Effect.map(detailsFor)),
    validateProvider: context =>
      Effect.tryPromise({
        try: () =>
          validateItchioProvider(
            fetchImpl,
            apiBaseUrl,
            authFrom(context, options),
            context.checkedAt,
          ),
        catch: error => asAcquisitionError(error, authFrom(context, options)),
      }).pipe(
        Effect.catch(error =>
          Effect.succeed({
            _tag: "UnhealthyProvider" as const,
            providerId: PROVIDER_ID,
            checkedAt: context.checkedAt,
            reason:
              error.reason === "configuration"
                ? ("credentials" as const)
                : ("provider-error" as const),
            message: redactCredential(
              error.message,
              authFrom(context, options),
            ),
          }),
        ),
      ),
    resolveDownload: (context, request) =>
      Effect.tryPromise(() =>
        resolveItchioDownload(
          fetchImpl,
          apiBaseUrl,
          authFrom(context, options),
          butlerClient,
          butlerCommandFrom(context, options),
          request,
        ),
      ).pipe(
        Effect.catch(() =>
          Effect.succeed(userActionDownload(request.candidateUrl)),
        ),
      ),
    acquireArtifact: (context, request) =>
      Effect.tryPromise({
        try: () =>
          acquireItchioArtifact(
            fetchImpl,
            apiBaseUrl,
            authFrom(context, options),
            butlerClient,
            butlerCommandFrom(context, options),
            context.clock.nowIso(),
            request,
          ),
        catch: error =>
          error instanceof AcquisitionError
            ? error
            : new AcquisitionError({
                reason: "infrastructure",
                providerId: PROVIDER_ID,
                message: error instanceof Error ? error.message : String(error),
              }),
      }),
  }
}

export const itchioPluginDefinition = createItchioPluginDefinition()

export function parseItchioCandidateUrl(input: string): string | null {
  const url = parseUrl(input)
  if (!url || !url.hostname.endsWith(".itch.io")) return null
  const creator = url.hostname.replace(/\.itch\.io$/, "")
  const slug = url.pathname.split("/").filter(Boolean)[0]
  return creator && slug ? `${creator}/${slug}` : null
}

function publicPageDetails(
  fetchImpl: FetchLike,
  id: string,
): Effect.Effect<ItchioPublicPage, AcquisitionError> {
  const pageUrl = publicPageUrl(id)
  if (!pageUrl) {
    return Effect.fail(unknownCandidate(id))
  }

  return Effect.tryPromise({
    try: async () => {
      const response = await fetchImpl(pageUrl)
      if (!response.ok) throw unknownCandidate(id)
      const html = await response.text()
      const details = extractPublicPageDetails(id, pageUrl, html)
      if (!details) throw unknownCandidate(id)
      const gameData = await fetchPublicGameData(fetchImpl, pageUrl)
      return mergePublicGameData(details, gameData)
    },
    catch: error =>
      error instanceof AcquisitionError
        ? error
        : new AcquisitionError({
            reason: "infrastructure",
            providerId: PROVIDER_ID,
            message: error instanceof Error ? error.message : String(error),
          }),
  })
}

function publicPageUrl(id: string): string | null {
  const [creator, slug, ...extra] = id.split("/")
  if (!creator || !slug || extra.length > 0) return null
  if (!isSafeItchioSegment(creator) || !isSafeItchioSegment(slug)) return null
  return `https://${creator}.itch.io/${slug}`
}

function extractPublicPageDetails(
  id: string,
  fallbackUrl: string,
  html: string,
): ItchioPublicPage | null {
  const title =
    firstText([
      metaContent(html, "og:title"),
      metaContent(html, "twitter:title"),
      titleElement(html),
    ]) ?? null
  if (!title) return null

  const canonical = firstText([canonicalUrl(html), metaContent(html, "og:url")])
  const description = firstText([
    metaContent(html, "og:description"),
    metaContent(html, "description"),
    metaContent(html, "twitter:description"),
  ])

  return {
    id,
    url: canonical && isSafeHttpUrl(canonical) ? canonical : fallbackUrl,
    title,
    ...(description ? { description } : {}),
    platforms: uploadPlatformsFromHtml(html),
  }
}

async function fetchPublicGameData(
  fetchImpl: FetchLike,
  pageUrl: string,
): Promise<ItchioGameData | undefined> {
  try {
    const response = await fetchImpl(publicGameDataUrl(pageUrl))
    if (!response.ok) return undefined
    return gameDataFromUnknown(await response.json())
  } catch {
    return undefined
  }
}

function publicGameDataUrl(pageUrl: string): string {
  return `${pageUrl.replace(/\/+$/, "")}/data.json`
}

function gameDataFromUnknown(input: unknown): ItchioGameData | undefined {
  const record = readRecord(input)
  if (!record) return undefined
  const id = numberField(record, "id")
  const title = stringField(record, "title")
  const price = stringField(record, "price")
  const originalPrice = stringField(record, "original_price")
  const sale = readRecord(record.sale)
  if (!id && !title && !price && !originalPrice && !sale) return undefined
  return {
    ...(id ? { id } : {}),
    ...(title ? { title } : {}),
    ...(price ? { price } : {}),
    ...(originalPrice ? { originalPrice } : {}),
    ...(sale ? { sale } : {}),
  }
}

function mergePublicGameData(
  page: ItchioPublicPage,
  gameData: ItchioGameData | undefined,
): ItchioPublicPage {
  if (!gameData) return page
  const display = displayFromGameData(gameData)
  return {
    ...page,
    ...(gameData.title ? { title: gameData.title } : {}),
    ...(display ? { display } : {}),
  }
}

function displayFromGameData(
  gameData: ItchioGameData,
): Readonly<Record<string, unknown>> | undefined {
  const display = {
    ...(gameData.id !== undefined ? { gameId: gameData.id } : {}),
    ...(gameData.price ? { price: gameData.price } : {}),
    ...(gameData.originalPrice
      ? { originalPrice: gameData.originalPrice }
      : {}),
    ...(gameData.sale ? { sale: gameData.sale } : {}),
  }
  return Object.keys(display).length > 0 ? display : undefined
}

interface ItchioDiscoveryEntry {
  readonly id: string
  readonly title: string
  readonly url: string
  readonly description?: string
  readonly thumbnailUrl?: string
  readonly gameId?: number
  readonly price?: string
  readonly currency?: string
  readonly platforms: readonly string[]
}

async function searchItchio(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth | undefined,
  request: { readonly query: string; readonly platforms?: readonly string[] },
): Promise<readonly ProviderClaim[]> {
  if (isAuthenticatedOwnedKeysQuery(request.query)) {
    if (!auth) return []
    return searchAuthenticatedOwnedKeys(fetchImpl, apiBaseUrl, auth, request)
  }
  if (isAuthenticatedProfileGamesQuery(request.query)) {
    if (!auth) return []
    return searchAuthenticatedProfileGames(fetchImpl, apiBaseUrl, auth, request)
  }
  return searchPublic(fetchImpl, request)
}

async function searchPublic(
  fetchImpl: FetchLike,
  request: { readonly query: string; readonly platforms?: readonly string[] },
): Promise<readonly ProviderClaim[]> {
  const rssClaims = await searchPublicRss(fetchImpl, request)
  if (rssClaims.length > 0) return rssClaims
  return searchPublicPage(fetchImpl, request)
}

function isAuthenticatedProfileGamesQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-")
  return ["profile:games", "my-games", "uploaded", "uploaded-games"].includes(
    normalized,
  )
}

function isAuthenticatedOwnedKeysQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-")
  return [
    "profile:owned",
    "owned",
    "owned-games",
    "my-library",
    "my-purchases",
    "my-collections",
    "library",
  ].includes(normalized)
}

async function searchAuthenticatedOwnedKeys(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth,
  request: { readonly platforms?: readonly string[] },
): Promise<readonly ProviderClaim[]> {
  const ownedKeys = await listAuthenticatedOwnedKeys(
    fetchImpl,
    apiBaseUrl,
    auth,
  )
  return ownedKeys
    .filter(key =>
      matchesRequestedPlatforms(
        {
          id: String(key.gameId),
          title: key.title,
          url: key.url,
          platforms: platformsFromApiTraits(key.traits),
        },
        request.platforms,
      ),
    )
    .map(claimForOwnedKey)
}

async function searchAuthenticatedProfileGames(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth,
  request: { readonly platforms?: readonly string[] },
): Promise<readonly ProviderClaim[]> {
  const response = await fetchItchioApi(
    fetchImpl,
    apiBaseUrl,
    auth,
    "/profile/games",
  )
  const payload = readRecord(await response.json())
  assertNoItchioApiErrors(payload, auth)
  const games = Array.isArray(payload?.games) ? payload.games : []
  return games
    .flatMap(apiGameFromUnknown)
    .filter(game =>
      matchesRequestedPlatforms(
        {
          id: String(game.id),
          title: game.title,
          url: game.url,
          platforms: platformsFromApiTraits(game.traits),
        },
        request.platforms,
      ),
    )
    .map(claimForApiGame)
}

async function validateItchioProvider(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth | undefined,
  checkedAt: string,
) {
  if (!auth) {
    return {
      _tag: "HealthyProvider" as const,
      providerId: PROVIDER_ID,
      checkedAt,
    }
  }
  const response = await fetchItchioApi(
    fetchImpl,
    apiBaseUrl,
    auth,
    "/credentials/info",
  )
  const payload = readRecord(await response.json())
  assertNoItchioApiErrors(payload, auth)
  return {
    _tag: "HealthyProvider" as const,
    providerId: PROVIDER_ID,
    checkedAt,
  }
}

function authFrom(
  context: AcquisitionPluginContext,
  options: ItchioPluginOptions,
): ItchioAuth | undefined {
  const apiKey = options.apiKey ?? context.env?.ITCHIO_API_KEY
  const trimmed = apiKey?.trim()
  return trimmed ? { apiKey: trimmed } : undefined
}

function butlerCommandFrom(
  context: AcquisitionPluginContext,
  options: ItchioPluginOptions,
): readonly string[] {
  if (options.butlerCommand && options.butlerCommand.length > 0) {
    return options.butlerCommand
  }
  const encoded = context.env?.ITCHIO_BUTLER_COMMAND?.trim()
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded)
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every(value => typeof value === "string" && value.length > 0)
      ) {
        return parsed
      }
    } catch {
      return [context.env?.ITCHIO_BUTLER_BIN?.trim() || "butler"]
    }
  }
  return [context.env?.ITCHIO_BUTLER_BIN?.trim() || "butler"]
}

async function fetchItchioApi(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth,
  path: string,
): Promise<Response> {
  const url = `${apiBaseUrl.replace(/\/+$/, "")}${path}`
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${auth.apiKey}` },
  })
  if (response.status === 401 || response.status === 403) {
    throw new AcquisitionError({
      reason: "configuration",
      providerId: PROVIDER_ID,
      message: `itch.io API credentials were rejected: HTTP ${response.status}`,
    })
  }
  if (!response.ok) {
    throw new AcquisitionError({
      reason: "infrastructure",
      providerId: PROVIDER_ID,
      message: `itch.io API request failed: HTTP ${response.status}`,
    })
  }
  return response
}

function assertNoItchioApiErrors(
  payload: Readonly<Record<string, unknown>> | null,
  auth: ItchioAuth,
): void {
  const errors = Array.isArray(payload?.errors) ? payload.errors : []
  if (errors.length === 0) return
  throw new AcquisitionError({
    reason: "configuration",
    providerId: PROVIDER_ID,
    message: redactCredential(
      `itch.io API returned errors: ${errors.map(error => String(error)).join(", ")}`,
      auth,
    ),
  })
}

async function listAuthenticatedOwnedKeys(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth,
): Promise<readonly ItchioOwnedKey[]> {
  const response = await fetchItchioApi(
    fetchImpl,
    apiBaseUrl,
    auth,
    "/profile/owned-keys",
  )
  const payload = readRecord(await response.json())
  assertNoItchioApiErrors(payload, auth)
  return ownedKeysFromPayload(payload)
}

function ownedKeysFromPayload(
  payload: Readonly<Record<string, unknown>> | null,
): readonly ItchioOwnedKey[] {
  if (!payload) return []
  const collections = [
    payload.owned_keys,
    payload.download_keys,
    payload.keys,
    payload.items,
  ]
  return collections
    .filter(Array.isArray)
    .flatMap(values => values.flatMap(ownedKeyFromUnknown))
}

function ownedKeyFromUnknown(input: unknown): ItchioOwnedKey[] {
  const record = readRecord(input)
  if (!record) return []
  const game = readRecord(record.game) ?? readRecord(record.game_data)
  const gameId =
    numberField(record, "game_id") ??
    numberField(record, "gameId") ??
    (game ? numberField(game, "id") : undefined)
  const title = firstText([
    stringField(record, "title"),
    game ? stringField(game, "title") : undefined,
  ])
  const url = firstText([
    stringField(record, "url"),
    game ? stringField(game, "url") : undefined,
  ])
  if (!gameId || !title || !url || !isSafePublicHttpUrl(url)) return []
  return [
    {
      ...(numberField(record, "id") ? { id: numberField(record, "id") } : {}),
      ...(stringField(record, "key")
        ? { key: stringField(record, "key") }
        : {}),
      gameId,
      title,
      url,
      ...(game && stringField(game, "cover_url")
        ? { coverUrl: stringField(game, "cover_url") }
        : {}),
      traits:
        game && Array.isArray(game.traits)
          ? game.traits.filter(
              (trait): trait is string => typeof trait === "string",
            )
          : [],
    },
  ]
}

function apiGameFromUnknown(input: unknown): ItchioApiGame[] {
  const record = readRecord(input)
  if (!record) return []
  const id = numberField(record, "id")
  const title = stringField(record, "title")
  const url = stringField(record, "url")
  if (!id || !title || !url || !isSafePublicHttpUrl(url)) return []
  return [
    {
      id,
      title,
      url,
      ...(stringField(record, "short_text")
        ? { shortText: stringField(record, "short_text") }
        : {}),
      ...(stringField(record, "cover_url")
        ? { coverUrl: stringField(record, "cover_url") }
        : {}),
      ...(numberField(record, "min_price") !== undefined
        ? { minPrice: numberField(record, "min_price") }
        : {}),
      traits: Array.isArray(record.traits)
        ? record.traits.filter(
            (trait): trait is string => typeof trait === "string",
          )
        : [],
    },
  ]
}

function claimForOwnedKey(key: ItchioOwnedKey): ProviderClaim {
  const id = parseItchioCandidateUrl(key.url) ?? `game/${key.gameId}`
  const platforms = platformsFromApiTraits(key.traits)
  const display = {
    gameId: key.gameId,
    source: "owned-key",
    ...(key.id !== undefined ? { ownedKeyId: key.id } : {}),
  }
  return {
    _tag: "ProviderClaim" as const,
    providerId: PROVIDER_ID,
    id,
    ref: { kind: "provider-item-id" as const, value: id },
    title: key.title,
    url: key.url,
    ...(platforms.length > 0 ? { platform: platforms.join(", ") } : {}),
    ...(key.coverUrl && isSafePublicHttpUrl(key.coverUrl)
      ? { thumbnailUrl: key.coverUrl }
      : {}),
    playable: {
      id,
      title: key.title,
      providerId: PROVIDER_ID,
      display,
      releases: releasesForPlatforms(platforms, key.url),
    },
  }
}

function claimForApiGame(game: ItchioApiGame): ProviderClaim {
  const id = parseItchioCandidateUrl(game.url) ?? `game/${game.id}`
  const platforms = platformsFromApiTraits(game.traits)
  return claimForDiscoveryEntry({
    id,
    title: game.title,
    url: game.url,
    ...(game.shortText ? { description: game.shortText } : {}),
    ...(game.coverUrl && isSafePublicHttpUrl(game.coverUrl)
      ? { thumbnailUrl: game.coverUrl }
      : {}),
    gameId: game.id,
    ...(game.minPrice !== undefined
      ? { price: game.minPrice === 0 ? "$0.00" : String(game.minPrice) }
      : {}),
    platforms,
  })
}

function platformsFromApiTraits(traits: readonly string[]): readonly string[] {
  return uniqueStrings(
    traits.map(trait => {
      if (trait === "p_windows") return "windows"
      if (trait === "p_linux") return "linux"
      if (trait === "p_osx") return "macos"
      if (trait === "p_android") return "android"
      if (trait === "p_web") return "html"
      return undefined
    }),
  )
}

function asAcquisitionError(
  error: unknown,
  auth: ItchioAuth | undefined,
): AcquisitionError {
  if (error instanceof AcquisitionError) return error
  const record = readRecord(error)
  if (record?._tag === "AcquisitionError") {
    return new AcquisitionError({
      reason:
        record.reason === "configuration" ? "configuration" : "infrastructure",
      providerId: PROVIDER_ID,
      message: redactCredential(
        String(record.message ?? "itch.io API error"),
        auth,
      ),
    })
  }
  return new AcquisitionError({
    reason: "infrastructure",
    providerId: PROVIDER_ID,
    message: redactCredential(
      error instanceof Error ? error.message : String(error),
      auth,
    ),
  })
}

function redactCredential(
  message: string,
  auth: ItchioAuth | undefined,
): string {
  return auth?.apiKey ? message.replaceAll(auth.apiKey, "[redacted]") : message
}

async function searchPublicRss(
  fetchImpl: FetchLike,
  request: { readonly query: string; readonly platforms?: readonly string[] },
): Promise<readonly ProviderClaim[]> {
  const feedUrl = rssFeedUrlFor(request)
  if (!feedUrl) return []
  const response = await fetchImpl(feedUrl)
  if (!response.ok) return []
  const xml = await response.text()
  return parseRssEntries(xml)
    .filter(entry => matchesRequestedPlatforms(entry, request.platforms))
    .map(claimForDiscoveryEntry)
}

async function searchPublicPage(
  fetchImpl: FetchLike,
  request: { readonly query: string; readonly platforms?: readonly string[] },
): Promise<readonly ProviderClaim[]> {
  const searchUrl = publicSearchPageUrl(request.query)
  if (!searchUrl) return []
  const response = await fetchImpl(searchUrl)
  if (!response.ok) return []
  const html = await response.text()
  return parseSearchPageEntries(html)
    .filter(entry => matchesRequestedPlatforms(entry, request.platforms))
    .map(claimForDiscoveryEntry)
}

function publicSearchPageUrl(query: string): string | null {
  const normalized = query.trim().replaceAll(/\s+/g, " ")
  if (!normalized) return null
  const params = new URLSearchParams({ q: normalized, type: "games" })
  return `https://itch.io/search?${params.toString()}`
}

function rssFeedUrlFor(request: {
  readonly query: string
  readonly platforms?: readonly string[]
}): string | null {
  const normalized = normalizeSearchQuery(request.query)
  if (!normalized) return null
  const platform = firstSupportedPlatform(request.platforms)
  const platformPath = platform ? `/platform-${platform}` : ""
  if (normalized === "free") {
    return `https://itch.io/games/free${platformPath}.xml`
  }
  if (platform && normalized === platform) {
    return `https://itch.io/games/platform-${platform}.xml`
  }
  return `https://itch.io/games/tag-${encodeURIComponent(normalized)}${platformPath}.xml`
}

function normalizeSearchQuery(query: string): string | null {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-")
  return /^[a-z0-9][a-z0-9-]*$/.test(normalized) ? normalized : null
}

function firstSupportedPlatform(
  platforms: readonly string[] | undefined,
): string | undefined {
  return platforms
    ?.map(platform => platform.toLowerCase())
    .map(platform => (platform === "macos" ? "osx" : platform))
    .find(platform =>
      ["windows", "linux", "osx", "html", "html5", "android"].includes(
        platform,
      ),
    )
    ?.replace(/^html5$/, "html")
}

function parseRssEntries(xml: string): readonly ItchioDiscoveryEntry[] {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].flatMap(match => {
    const item = match[1] ?? ""
    const url = elementText(item, "link") ?? elementText(item, "guid")
    const id = url ? parseItchioCandidateUrl(url) : null
    const title = elementText(item, "plainTitle") ?? elementText(item, "title")
    if (!url || !id || !title) return []
    return [
      {
        id,
        title,
        url,
        ...(elementText(item, "description")
          ? { description: stripTags(elementText(item, "description") ?? "") }
          : {}),
        ...(elementText(item, "imageurl")
          ? { thumbnailUrl: elementText(item, "imageurl") }
          : {}),
        ...(elementText(item, "price")
          ? { price: elementText(item, "price") }
          : {}),
        ...(elementText(item, "currency")
          ? { currency: elementText(item, "currency") }
          : {}),
        platforms: platformsFromRssItem(item),
      },
    ]
  })
}

function parseSearchPageEntries(html: string): readonly ItchioDiscoveryEntry[] {
  return html
    .split(/(?=<div\s+[^>]*class=["'][^"']*\bgame_cell\b)/gi)
    .filter(chunk => /<div\s+[^>]*class=["'][^"']*\bgame_cell\b/i.test(chunk))
    .flatMap(searchEntryFromCell)
}

function searchEntryFromCell(cell: string): readonly ItchioDiscoveryEntry[] {
  const titleLink = titleLinkFromSearchCell(cell)
  const url = titleLink?.href ?? firstSafeItchioHref(cell)
  const id = url ? parseItchioCandidateUrl(url) : null
  const title = titleLink?.text ?? titleFromSearchCell(cell)
  if (!url || !id || !title) return []
  const thumbnailUrl = thumbnailFromSearchCell(cell)
  return [
    {
      id,
      title,
      url,
      ...(descriptionFromSearchCell(cell)
        ? { description: descriptionFromSearchCell(cell) }
        : {}),
      ...(thumbnailUrl && isSafeHttpUrl(thumbnailUrl) ? { thumbnailUrl } : {}),
      ...(gameIdFromSearchCell(cell)
        ? { gameId: gameIdFromSearchCell(cell) }
        : {}),
      ...(priceFromSearchCell(cell)
        ? { price: priceFromSearchCell(cell) }
        : {}),
      platforms: uploadPlatformsFromHtml(cell),
    },
  ]
}

function titleLinkFromSearchCell(
  cell: string,
): { readonly href: string; readonly text: string } | undefined {
  for (const match of cell.matchAll(/<a\s+[^>]*>[\s\S]*?<\/a>/gi)) {
    const tag = match[0] ?? ""
    const openTag = tag.match(/^<a\s+[^>]*>/i)?.[0] ?? ""
    const attributes = attributesFor(openTag)
    const className = attributes.get("class") ?? ""
    if (!className.split(/\s+/).includes("title")) continue
    const href = attributes.get("href")
    const text = decodeHtml(stripTags(tag)).trim()
    if (href && isSafeHttpUrl(href) && text) return { href, text }
  }
  return undefined
}

function firstSafeItchioHref(cell: string): string | undefined {
  for (const match of cell.matchAll(/<a\s+[^>]*>/gi)) {
    const href = attributesFor(match[0]).get("href")
    if (href && parseItchioCandidateUrl(href)) return href
  }
  return undefined
}

function titleFromSearchCell(cell: string): string | undefined {
  const match = cell.match(
    /<div\s+[^>]*class=["'][^"']*\bgame_title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )
  return match?.[1] ? decodeHtml(stripTags(match[1])).trim() : undefined
}

function descriptionFromSearchCell(cell: string): string | undefined {
  const title = cell.match(
    /<div\s+[^>]*class=["'][^"']*\bgame_text\b[^"']*["'][^>]*title=["']([^"']+)["'][^>]*>/i,
  )?.[1]
  if (title) return decodeHtml(title).trim()
  const body = cell.match(
    /<div\s+[^>]*class=["'][^"']*\bgame_text\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )?.[1]
  return body ? decodeHtml(stripTags(body)).trim() : undefined
}

function thumbnailFromSearchCell(cell: string): string | undefined {
  for (const match of cell.matchAll(/<img\s+[^>]*>/gi)) {
    const attributes = attributesFor(match[0])
    const url = attributes.get("data-lazy_src") ?? attributes.get("src")
    if (url) return decodeHtml(url).trim()
  }
  return undefined
}

function gameIdFromSearchCell(cell: string): number | undefined {
  const value = cell.match(/data-game_id=["'](\d+)["']/i)?.[1]
  const gameId = value ? Number(value) : NaN
  return Number.isInteger(gameId) ? gameId : undefined
}

function priceFromSearchCell(cell: string): string | undefined {
  const price = cell.match(
    /<div\s+[^>]*class=["'][^"']*\bgame_price\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
  )?.[1]
  return price ? decodeHtml(stripTags(price)).trim() : undefined
}

function claimForDiscoveryEntry(entry: ItchioDiscoveryEntry): ProviderClaim {
  const display = displayFromDiscoveryEntry(entry)
  return {
    _tag: "ProviderClaim" as const,
    providerId: PROVIDER_ID,
    id: entry.id,
    ref: { kind: "provider-item-id" as const, value: entry.id },
    title: entry.title,
    url: entry.url,
    ...(entry.platforms.length > 0
      ? { platform: entry.platforms.join(", ") }
      : {}),
    ...(entry.thumbnailUrl && isSafeHttpUrl(entry.thumbnailUrl)
      ? { thumbnailUrl: entry.thumbnailUrl }
      : {}),
    playable: {
      id: entry.id,
      title: entry.title,
      providerId: PROVIDER_ID,
      ...(display ? { display } : {}),
      releases: releasesForPlatforms(entry.platforms, entry.url),
    },
  }
}

function displayFromDiscoveryEntry(
  entry: ItchioDiscoveryEntry,
): Readonly<Record<string, unknown>> | undefined {
  const display = {
    ...(entry.gameId !== undefined ? { gameId: entry.gameId } : {}),
    ...(entry.price ? { price: entry.price } : {}),
    ...(entry.currency ? { currency: entry.currency } : {}),
  }
  return Object.keys(display).length > 0 ? display : undefined
}

function releasesForPlatforms(platforms: readonly string[], target: string) {
  const releasePlatforms = platforms.length > 0 ? platforms : [RELEASE_ID]
  return releasePlatforms.map(platform => ({
    id: platform,
    providerId: PROVIDER_ID,
    system: platform,
    ...(platform === "html"
      ? { display: { acquisition: "container-required" } }
      : { target }),
  }))
}

function matchesRequestedPlatforms(
  entry: ItchioDiscoveryEntry,
  platforms: readonly string[] | undefined,
): boolean {
  const platform = firstSupportedPlatform(platforms)
  if (!platform) return true
  return entry.platforms.includes(platform === "osx" ? "macos" : platform)
}

function platformsFromRssItem(item: string): readonly string[] {
  const platforms = item.match(/<platforms>([\s\S]*?)<\/platforms>/i)?.[1] ?? ""
  return [...platforms.matchAll(/<([a-z0-9]+)>yes<\/\1>/gi)].map(match =>
    platformName(match[1] ?? ""),
  )
}

function platformName(platform: string): string {
  return platform === "osx" ? "macos" : platform
}

function elementText(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"))
  const value = match?.[1]
  return value ? decodeHtml(stripCdata(value)).trim() : undefined
}

function stripCdata(value: string): string {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim()
}

function detailsFor(page: ItchioPublicPage): ProviderClaimDetails {
  return {
    _tag: "ProviderClaimDetails" as const,
    providerId: PROVIDER_ID,
    id: page.id,
    ref: { kind: "provider-item-id" as const, value: page.id },
    title: page.title,
    url: page.url,
    ...(page.description ? { description: page.description } : {}),
    downloadPageUrl: page.url,
    playable: {
      id: page.id,
      title: page.title,
      providerId: PROVIDER_ID,
      ...(page.display ? { display: page.display } : {}),
      releases: releasesForPlatforms(page.platforms, page.url),
    },
  }
}

async function resolveItchioDownload(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth | undefined,
  butlerClient: ItchioButlerClient,
  butlerCommand: readonly string[],
  request: ResolveDownloadRequest,
): Promise<DownloadResolution> {
  const { candidateUrl } = request
  const id = parseItchioCandidateUrl(candidateUrl)
  if (!id) return unsupportedDownload(candidateUrl)
  const pageUrl = publicPageUrl(id)
  if (!pageUrl) return userActionDownload(candidateUrl)

  const entitledDownload = entitledDownloadFromUrl(candidateUrl)
  if (entitledDownload) {
    return resolveDownloadPageUploads({
      fetchImpl,
      request,
      pageUrl,
      downloadPageUrl: candidateUrl,
      cookieJar: createCookieJar(),
      downloadKey: entitledDownload.key,
      nonFinalUrl: undefined,
    })
  }

  const gameData = await fetchPublicGameData(fetchImpl, pageUrl)
  if (!isPubliclyFree(gameData)) {
    if (auth && gameData?.id) {
      return resolveAuthenticatedOwnedDownload({
        fetchImpl,
        apiBaseUrl,
        auth,
        butlerClient,
        butlerCommand,
        request,
        pageUrl,
        gameId: gameData.id,
      })
    }
    return userActionDownload(candidateUrl)
  }

  const cookieJar = createCookieJar()
  const downloadPageResponse = await fetchImpl(`${pageUrl}/download_url`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "",
  })
  cookieJar.capture(downloadPageResponse)
  if (!downloadPageResponse.ok) return userActionDownload(candidateUrl)
  const downloadPageUrl = safeUrlFromRecord(await downloadPageResponse.json())
  if (!downloadPageUrl) return userActionDownload(candidateUrl)

  return resolveDownloadPageUploads({
    fetchImpl,
    request,
    pageUrl,
    downloadPageUrl,
    cookieJar,
    nonFinalUrl: candidateUrl,
  })
}

async function resolveDownloadPageUploads({
  fetchImpl,
  request,
  pageUrl,
  downloadPageUrl,
  cookieJar,
  downloadKey,
  nonFinalUrl,
}: {
  readonly fetchImpl: FetchLike
  readonly request: ResolveDownloadRequest
  readonly pageUrl: string
  readonly downloadPageUrl: string
  readonly cookieJar: CookieJar
  readonly downloadKey?: string
  readonly nonFinalUrl?: string
}): Promise<DownloadResolution> {
  const downloadPage = await fetchImpl(downloadPageUrl, {
    headers: cookieJar.headers(),
  })
  cookieJar.capture(downloadPage)
  if (!downloadPage.ok) return userActionDownload(nonFinalUrl)
  const downloadHtml = await downloadPage.text()
  const csrfToken = csrfTokenFromHtml(downloadHtml)
  const uploads = uploadChoicesFromHtml(downloadHtml)
  if (!csrfToken) return userActionDownload(nonFinalUrl)

  const upload = selectUpload(uploads, request)
  if (!upload) return userActionDownload(nonFinalUrl, downloadChoices(uploads))
  const fileResponse = await fetchImpl(
    uploadFileUrl(pageUrl, upload.id, downloadKey),
    {
      method: "POST",
      headers: {
        ...cookieJar.headers(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrf_token: csrfToken }).toString(),
    },
  )
  if (!fileResponse.ok) return userActionDownload(nonFinalUrl)
  const fileUrl = safeUrlFromRecord(await fileResponse.json())
  if (!fileUrl) return userActionDownload(nonFinalUrl)

  return {
    _tag: "FinalDownload" as const,
    providerId: PROVIDER_ID,
    url: fileUrl,
    ...(upload.filename ? { filename: upload.filename } : {}),
  }
}

function uploadFileUrl(
  pageUrl: string,
  uploadId: string,
  downloadKey?: string,
): string {
  const params = new URLSearchParams({
    source: "view_game",
    as_props: "1",
    after_download_lightbox: "true",
    ...(downloadKey ? { key: downloadKey } : {}),
  })
  return `${pageUrl}/file/${encodeURIComponent(uploadId)}?${params.toString()}`
}

async function resolveAuthenticatedOwnedDownload({
  fetchImpl,
  apiBaseUrl,
  auth,
  butlerClient,
  butlerCommand,
  request,
  gameId,
}: {
  readonly fetchImpl: FetchLike
  readonly apiBaseUrl: string
  readonly auth: ItchioAuth
  readonly butlerClient: ItchioButlerClient
  readonly butlerCommand: readonly string[]
  readonly request: ResolveDownloadRequest
  readonly pageUrl: string
  readonly gameId: number
}): Promise<DownloadResolution> {
  const ownedKeys = await listAuthenticatedOwnedKeys(
    fetchImpl,
    apiBaseUrl,
    auth,
  )
  if (!ownedKeys.some(key => key.gameId === gameId)) {
    return userActionDownload(request.candidateUrl)
  }
  const directUploads = await listAuthenticatedGameUploads(
    fetchImpl,
    apiBaseUrl,
    auth,
    gameId,
  )
  if (directUploads.length === 0) {
    const butlerUploads = await listButlerGameUploadsOrEmpty({
      butlerClient,
      auth,
      butlerCommand,
      gameId,
    })
    return userActionDownload(
      request.candidateUrl,
      downloadChoices(butlerUploads),
    )
  }
  const upload = selectUpload(directUploads, request)
  if (!upload)
    return userActionDownload(
      request.candidateUrl,
      downloadChoices(directUploads),
    )
  const fileUrl = await resolveAuthenticatedUploadUrlOrUndefined(
    fetchImpl,
    apiBaseUrl,
    auth,
    upload.id,
  )
  if (!fileUrl) return userActionDownload(request.candidateUrl)
  return {
    _tag: "FinalDownload" as const,
    providerId: PROVIDER_ID,
    url: fileUrl,
    ...(upload.filename ? { filename: upload.filename } : {}),
  }
}

async function listButlerGameUploadsOrEmpty({
  butlerClient,
  auth,
  butlerCommand,
  gameId,
}: {
  readonly butlerClient: ItchioButlerClient
  readonly auth: ItchioAuth
  readonly butlerCommand: readonly string[]
  readonly gameId: number
}): Promise<readonly ItchioUploadChoice[]> {
  try {
    return await butlerClient.listGameUploads({
      apiKey: auth.apiKey,
      command: butlerCommand,
      gameId,
    })
  } catch {
    return []
  }
}

async function listAuthenticatedGameUploads(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth,
  gameId: number,
): Promise<readonly ItchioUploadChoice[]> {
  const response = await fetchItchioApi(
    fetchImpl,
    apiBaseUrl,
    auth,
    `/games/${encodeURIComponent(String(gameId))}/uploads`,
  )
  const payload = readRecord(await response.json())
  assertNoItchioApiErrors(payload, auth)
  return uploadChoicesFromApiPayload(payload)
}

async function resolveAuthenticatedUploadUrlOrUndefined(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth,
  uploadId: string,
): Promise<string | undefined> {
  try {
    const response = await fetchItchioApi(
      fetchImpl,
      apiBaseUrl,
      auth,
      `/upload/${encodeURIComponent(uploadId)}/download`,
    )
    return safeUrlFromRecord(await response.json())
  } catch {
    return undefined
  }
}

function uploadChoicesFromApiPayload(
  payload: Readonly<Record<string, unknown>> | null,
): readonly ItchioUploadChoice[] {
  if (!payload) return []
  const collections = [payload.uploads, payload.items]
  return collections
    .filter(Array.isArray)
    .flatMap(values => values.flatMap(uploadChoiceFromApiUnknown))
}

function uploadChoiceFromApiUnknown(input: unknown): ItchioUploadChoice[] {
  const record = readRecord(input)
  if (!record) return []
  const id = numberField(record, "id") ?? stringField(record, "id")
  const filename = firstText([
    stringField(record, "filename"),
    stringField(record, "file_name"),
    stringField(record, "display_name"),
    stringField(record, "name"),
    stringField(record, "channel_name"),
  ])
  if (id === undefined) return []
  return [
    {
      id: String(id),
      ...(filename ? { filename } : {}),
      ...(stringField(record, "size")
        ? { size: stringField(record, "size") }
        : {}),
      platforms: uploadPlatformsFromApiRecord(record),
    },
  ]
}

function uploadPlatformsFromApiRecord(
  record: Readonly<Record<string, unknown>>,
): readonly string[] {
  const objectPlatforms = readRecord(record.platforms)
  const candidates = [record.platforms, record.traits]
    .filter(Array.isArray)
    .flat()
    .filter((value): value is string => typeof value === "string")
  return uniqueStrings([
    ...platformsFromApiTraits(candidates),
    ...candidates.map(platformNameFromLabel),
    ...(objectPlatforms ? Object.keys(objectPlatforms).map(platformName) : []),
  ])
}

function unsupportedDownload(candidateUrl: string): DownloadResolution {
  return {
    _tag: "NonFinalDownload" as const,
    providerId: PROVIDER_ID,
    reason: "unsupported",
    url: candidateUrl,
  }
}

function userActionDownload(
  _candidateUrl: string | undefined,
  choices: readonly DownloadChoice[] = [],
): DownloadResolution {
  return {
    _tag: "NonFinalDownload" as const,
    providerId: PROVIDER_ID,
    reason: "requires-user-action",
    ...(choices.length > 0 ? { choices } : {}),
  }
}

async function acquireItchioArtifact(
  fetchImpl: FetchLike,
  apiBaseUrl: string,
  auth: ItchioAuth | undefined,
  butlerClient: ItchioButlerClient,
  butlerCommand: readonly string[],
  acquiredAt: string,
  request: AcquireArtifactRequest,
): Promise<PluginAcquireOutput> {
  const candidateUrl = acquireCandidateUrl(request.id)
  if (!candidateUrl) {
    throw new AcquisitionError({
      reason: "caller",
      providerId: PROVIDER_ID,
      message: `Unsupported itch.io artifact id: ${request.id}`,
    })
  }

  const resolution = await resolveItchioDownload(
    fetchImpl,
    apiBaseUrl,
    auth,
    butlerClient,
    butlerCommand,
    {
      providerId: PROVIDER_ID,
      candidateUrl,
      ...(request.fileName ? { fileName: request.fileName } : {}),
      ...(request.size ? { size: request.size } : {}),
      ...(request.artifactFormat
        ? { artifactFormat: request.artifactFormat }
        : {}),
    },
  )
  if (resolution._tag !== "FinalDownload") {
    const butlerOutput = auth
      ? await acquireAuthenticatedOwnedViaButler({
          fetchImpl,
          apiBaseUrl,
          auth,
          butlerClient,
          butlerCommand,
          acquiredAt,
          candidateUrl,
          request,
        })
      : undefined
    if (butlerOutput) return butlerOutput
    throw new AcquisitionError({
      reason: "caller",
      providerId: PROVIDER_ID,
      message:
        "itch.io artifact acquisition requires one internally resolvable downloadable upload",
    })
  }

  const response = await fetchImpl(resolution.url)
  if (!response.ok) {
    throw new AcquisitionError({
      reason: "infrastructure",
      providerId: PROVIDER_ID,
      message: `failed to fetch itch.io artifact: HTTP ${response.status}`,
    })
  }
  const contentLength = numericHeader(response, "content-length")
  if (contentLength && contentLength > MAX_PUBLIC_ARTIFACT_BYTES) {
    throw artifactTooLargeError(contentLength)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.length > MAX_PUBLIC_ARTIFACT_BYTES) {
    throw artifactTooLargeError(bytes.length)
  }

  const filename = safeArtifactFilename(
    resolution.filename ?? filenameFromUrl(resolution.url) ?? "itchio-download",
  )
  const extension = safeExtension(filename)
  const mediaType = response.headers.get("content-type") ?? undefined
  const id = parseItchioCandidateUrl(candidateUrl) ?? request.id
  const provenanceUrl = publicPageUrl(id) ?? candidateUrl

  return {
    kind: "content" as const,
    format: { id: PUBLIC_DOWNLOAD_FORMAT_ID },
    file: {
      name: filename,
      ...(extension ? { extension } : {}),
      ...(mediaType ? { mediaType } : {}),
      sizeBytes: bytes.length,
    },
    bytesBase64: bytes.toString("base64"),
    provenance: {
      source: PROVIDER_ID,
      acquiredAt,
      url: provenanceUrl,
    },
    externalIds: [{ namespace: "itchio", id }],
    sourceData: {
      "itchio.v1": {
        id,
        pageUrl: provenanceUrl,
        filename,
      },
    },
  }
}

async function acquireAuthenticatedOwnedViaButler({
  fetchImpl,
  apiBaseUrl,
  auth,
  butlerClient,
  butlerCommand,
  acquiredAt,
  candidateUrl,
  request,
}: {
  readonly fetchImpl: FetchLike
  readonly apiBaseUrl: string
  readonly auth: ItchioAuth
  readonly butlerClient: ItchioButlerClient
  readonly butlerCommand: readonly string[]
  readonly acquiredAt: string
  readonly candidateUrl: string
  readonly request: AcquireArtifactRequest
}): Promise<PluginAcquireOutput | undefined> {
  const id = parseItchioCandidateUrl(candidateUrl) ?? request.id
  const pageUrl = publicPageUrl(id) ?? candidateUrl
  const gameData = await fetchPublicGameData(fetchImpl, pageUrl)
  if (!gameData?.id) return undefined
  const ownedKeys = await listAuthenticatedOwnedKeys(
    fetchImpl,
    apiBaseUrl,
    auth,
  )
  if (!ownedKeys.some(key => key.gameId === gameData.id)) return undefined
  const uploads = await butlerClient.listGameUploads({
    apiKey: auth.apiKey,
    command: butlerCommand,
    gameId: gameData.id,
  })
  const upload = selectUpload(uploads, {
    providerId: PROVIDER_ID,
    candidateUrl,
    ...(request.fileName ? { fileName: request.fileName } : {}),
    ...(request.size ? { size: request.size } : {}),
    ...(request.artifactFormat
      ? { artifactFormat: request.artifactFormat }
      : {}),
  })
  if (!upload) return undefined
  const acquired = await butlerClient.acquireGameUpload({
    apiKey: auth.apiKey,
    command: butlerCommand,
    gameId: gameData.id,
    uploadId: upload.id,
    ...(upload.filename ? { filename: upload.filename } : {}),
  })
  const filename = safeArtifactFilename(acquired.filename)
  const extension = safeExtension(filename)
  return {
    kind: "content" as const,
    format: { id: BUTLER_INSTALL_FORMAT_ID },
    file: {
      name: filename,
      ...(extension ? { extension } : {}),
      mediaType: "application/gzip",
      sizeBytes: acquired.sizeBytes,
    },
    bytesBase64: Buffer.from(acquired.bytes).toString("base64"),
    provenance: {
      source: PROVIDER_ID,
      acquiredAt,
      url: pageUrl,
    },
    externalIds: [{ namespace: "itchio", id }],
    sourceData: {
      "itchio.v1": {
        id,
        pageUrl,
        filename,
        acquisition: "butlerd-install",
      },
    },
  }
}

function acquireCandidateUrl(id: string): string | undefined {
  if (parseItchioCandidateUrl(id)) return id
  const pageUrl = publicPageUrl(id)
  return pageUrl ?? undefined
}

interface EntitledDownloadUrl {
  readonly pageUrl: string
  readonly key: string
}

function entitledDownloadFromUrl(
  input: string,
): EntitledDownloadUrl | undefined {
  const url = parseUrl(input)
  const id = parseItchioCandidateUrl(input)
  if (!url || !id) return undefined
  const [slug, downloadSegment, key, ...extra] = url.pathname
    .split("/")
    .filter(Boolean)
  if (!slug || downloadSegment !== "download" || !key || extra.length > 0) {
    return undefined
  }
  const pageUrl = publicPageUrl(id)
  if (!pageUrl) return undefined
  return { pageUrl, key }
}

function numericHeader(response: Response, header: string): number | undefined {
  const value = response.headers.get(header)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function artifactTooLargeError(bytes: number): AcquisitionError {
  return new AcquisitionError({
    reason: "caller",
    providerId: PROVIDER_ID,
    message: `itch.io artifact is too large for in-memory acquisition staging: ${bytes} bytes`,
  })
}

function filenameFromUrl(url: string): string | undefined {
  const parsed = parseUrl(url)
  const name = parsed?.pathname.split("/").filter(Boolean).at(-1)
  return name ? decodeURIComponent(name) : undefined
}

function safeArtifactFilename(value: string): string {
  const fallback = "itchio-download"
  const decoded = decodeHtml(stripTags(value)).trim()
  const basename = decoded.split(/[\\/]/).filter(Boolean).at(-1) ?? fallback
  if (
    !basename ||
    basename === "." ||
    basename === ".." ||
    basename.includes("\0")
  ) {
    return fallback
  }
  return basename
}

function safeExtension(filename: string): string | undefined {
  const extension = filename.match(/\.([a-z0-9][a-z0-9-]{0,31})$/i)?.[1]
  return extension?.toLowerCase()
}

function downloadChoices(
  uploads: readonly ItchioUploadChoice[],
): readonly DownloadChoice[] {
  return uploads.map(upload => ({
    id: upload.id,
    ...(upload.filename ? { fileName: upload.filename } : {}),
    ...(upload.size ? { size: upload.size } : {}),
    ...(upload.platforms.length > 0
      ? { platforms: [...upload.platforms] }
      : {}),
  }))
}

function selectUpload(
  uploads: readonly ItchioUploadChoice[],
  request: ResolveDownloadRequest,
): ItchioUploadChoice | undefined {
  const filtered = uploads.filter(upload =>
    uploadMatchesRequest(upload, request),
  )
  if (hasDownloadHint(request))
    return filtered.length === 1 ? filtered[0] : undefined
  return uploads.length === 1 ? uploads[0] : undefined
}

function hasDownloadHint(request: ResolveDownloadRequest): boolean {
  return Boolean(request.fileName || request.size || request.artifactFormat)
}

function uploadMatchesRequest(
  upload: ItchioUploadChoice,
  request: ResolveDownloadRequest,
): boolean {
  if (
    request.fileName &&
    normalizeFilename(upload.filename) !== normalizeFilename(request.fileName)
  ) {
    return false
  }
  if (
    request.size &&
    normalizeSize(upload.size) !== normalizeSize(request.size)
  ) {
    return false
  }
  if (
    request.artifactFormat &&
    normalizeArtifactFormat(upload.filename) !==
      normalizeRequestedArtifactFormat(request.artifactFormat)
  ) {
    return false
  }
  return true
}

function normalizeFilename(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase()
}

function normalizeSize(value: string | undefined): string | undefined {
  return value?.trim().toLowerCase().replaceAll(/\s+/g, "")
}

function normalizeArtifactFormat(
  value: string | undefined,
): string | undefined {
  const filename = normalizeFilename(value)
  const extension = filename?.match(/\.([a-z0-9][a-z0-9._-]*)$/i)?.[1]
  return extension ? normalizeRequestedArtifactFormat(extension) : undefined
}

function normalizeRequestedArtifactFormat(value: string): string {
  return value.trim().toLowerCase().replace(/^\./, "")
}

function unknownCandidate(id: string) {
  return new AcquisitionError({
    reason: "caller",
    providerId: PROVIDER_ID,
    message: `Unknown itch.io candidate: ${id}`,
  })
}

function readRecord(input: unknown): Readonly<Record<string, unknown>> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input)
    ? (input as Readonly<Record<string, unknown>>)
    : null
}

function stringField(
  input: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = input[field]
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function numberField(
  input: Readonly<Record<string, unknown>>,
  field: string,
): number | undefined {
  const value = input[field]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function isPubliclyFree(gameData: ItchioGameData | undefined): boolean {
  if (!gameData) return false
  if (isFreePrice(gameData.price)) return true
  return gameData.price === undefined && isFreePrice(gameData.originalPrice)
}

function isFreePrice(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase()
  return Boolean(
    normalized &&
      (normalized === "free" ||
        normalized === "$0" ||
        normalized === "$0.00" ||
        normalized === "0" ||
        normalized === "0.00"),
  )
}

function safeUrlFromRecord(input: unknown): string | undefined {
  const record = readRecord(input)
  const url = record ? stringField(record, "url") : undefined
  return url && isSafePublicHttpUrl(url) ? url : undefined
}

interface ItchioUploadChoice {
  readonly id: string
  readonly filename?: string
  readonly size?: string
  readonly platforms: readonly string[]
}

function csrfTokenFromHtml(html: string): string | undefined {
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const attributes = attributesFor(match[0])
    if (attributes.get("name") === "csrf_token") return attributes.get("value")
  }
  return undefined
}

function uploadChoicesFromHtml(html: string): readonly ItchioUploadChoice[] {
  return [
    ...html.matchAll(
      /<div\s+[^>]*class=["'][^"']*\bupload\b[^"']*["'][\s\S]*?<\/div>\s*<\/div>/gi,
    ),
  ]
    .map(match => uploadChoiceFromHtml(match[0]))
    .filter((choice): choice is ItchioUploadChoice => choice !== undefined)
}

function uploadChoiceFromHtml(html: string): ItchioUploadChoice | undefined {
  const id = html.match(/data-upload_id=["'](\d+)["']/i)?.[1]
  if (!id) return undefined
  const filename = html.match(
    /<strong[^>]*class=["']name["'][^>]*>([\s\S]*?)<\/strong>/i,
  )?.[1]
  const size = html.match(
    /<span[^>]*class=["']file_size["'][^>]*>([\s\S]*?)<\/span>/i,
  )?.[1]
  return {
    id,
    ...(filename ? { filename: decodeHtml(stripTags(filename)).trim() } : {}),
    ...(size ? { size: decodeHtml(stripTags(size)).trim() } : {}),
    platforms: uploadPlatformsFromHtml(html),
  }
}

function uploadPlatformsFromHtml(html: string): readonly string[] {
  return uniqueStrings([
    ...[...html.matchAll(/title=["']Download for ([^"']+)["']/gi)].map(match =>
      platformNameFromLabel(match[1] ?? ""),
    ),
    ...[...html.matchAll(/title=["']Play in browser["']/gi)].map(() => "html"),
  ]).filter((platform): platform is string => platform !== undefined)
}

function platformNameFromLabel(label: string): string | undefined {
  const normalized = label.trim().toLowerCase()
  if (normalized === "macos") return "macos"
  if (normalized === "windows") return "windows"
  if (normalized === "linux") return "linux"
  if (normalized === "android") return "android"
  if (normalized === "html5" || normalized === "html") return "html"
  return undefined
}

function uniqueStrings(
  values: readonly (string | undefined)[],
): readonly string[] {
  return [
    ...new Set(values.filter((value): value is string => value !== undefined)),
  ]
}

function createButlerClient(): ItchioButlerClient {
  return {
    listGameUploads: input =>
      withButlerSession(input, async session => {
        const profileId = await session.login(input.apiKey)
        await session.downloadKeys(profileId)
        return (await session.gameUploads(input.gameId)).map(
          uploadChoiceFromApiLike,
        )
      }),
    acquireGameUpload: input =>
      withButlerSession(input, async session => {
        const profileId = await session.login(input.apiKey)
        await session.downloadKeys(profileId)
        const game = await session.game(input.gameId)
        const uploads = await session.gameUploads(input.gameId)
        const upload = uploads.find(item => String(item.id) === input.uploadId)
        if (!upload) {
          throw new AcquisitionError({
            reason: "caller",
            providerId: PROVIDER_ID,
            message: "itch.io butler upload was not available for this game",
          })
        }
        const root = await mkdtemp(join(tmpdir(), "korri-itchio-butler-"))
        const installFolder = join(root, "install")
        const stagingFolder = join(root, "staging")
        const archivePath = join(root, "artifact.tar.gz")
        try {
          await mkdir(installFolder, { recursive: true })
          await mkdir(stagingFolder, { recursive: true })
          const queued = await session.callRecord("Install.Queue", {
            noCave: true,
            installFolder,
            stagingFolder,
            game,
            upload,
            ignoreInstallers: true,
            fastQueue: true,
          })
          const id = stringField(queued, "id")
          if (!id) {
            throw new AcquisitionError({
              reason: "defective-provider",
              providerId: PROVIDER_ID,
              message: "itch.io butler did not return an install id",
            })
          }
          await session.callRecord(
            "Install.Perform",
            { id, stagingFolder },
            10 * 60_000,
          )
          await runProcess("tar", [
            "--exclude",
            "./.itch",
            "--exclude",
            ".itch",
            "-C",
            installFolder,
            "-czf",
            archivePath,
            ".",
          ])
          const bytes = await readFile(archivePath)
          const filename = `${safeArtifactFilename(input.filename ?? uploadChoiceFromApiLike(upload).filename ?? "itchio-install")}.tar.gz`
          return { bytes, filename, sizeBytes: bytes.length }
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      }),
  }
}

async function withButlerSession<T>(
  input: ItchioButlerRequest,
  use: (session: ButlerSession) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-itchio-butler-db-"))
  const dbPath = join(root, "butler.db")
  const [command, ...prefixArgs] = input.command
  if (!command) throw new Error("missing butler command")
  const child = spawn(
    command,
    [
      ...prefixArgs,
      "daemon",
      "--json",
      "--transport",
      "tcp",
      "--dbpath",
      dbPath,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  try {
    const listen = await readButlerListen(child)
    const [host, port] = listen.address.split(":")
    if (!host || !port) throw new Error("invalid butler listen address")
    const socket = createConnection(Number(port), host)
    await onceSocket(socket, "connect")
    const session = new ButlerSession(socket)
    try {
      await session.callRecord("Meta.Authenticate", { secret: listen.secret })
      return await use(session)
    } finally {
      await session.shutdown()
    }
  } finally {
    child.kill()
    await rm(root, { recursive: true, force: true })
  }
}

interface ButlerListen {
  readonly secret: string
  readonly address: string
}

async function readButlerListen(
  child: ReturnType<typeof spawn>,
): Promise<ButlerListen> {
  const stdout = child.stdout
  if (!stdout) throw new Error("butler stdout was unavailable")
  const lines = createInterface({ input: stdout as Readable })
  try {
    return await withTimeout(
      new Promise<ButlerListen>((resolve, reject) => {
        child.once("error", reject)
        child.once("exit", code => reject(new Error(`butler exited: ${code}`)))
        lines.on("line", line => {
          const record = readRecordFromJson(line)
          if (record?.type !== "butlerd/listen-notification") return
          const tcp = readRecord(record.tcp)
          const secret = stringField(record, "secret")
          const address = tcp ? stringField(tcp, "address") : undefined
          if (secret && address) resolve({ secret, address })
        })
      }),
      30_000,
      "timed out waiting for butler daemon",
    )
  } finally {
    lines.close()
  }
}

class ButlerSession {
  nextId = 1
  private readonly pending = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void
      readonly reject: (error: Error) => void
    }
  >()
  private readonly lines: Interface

  constructor(private readonly socket: Socket) {
    this.lines = createInterface({ input: socket })
    this.lines.on("line", line => this.receive(line))
    socket.on("error", error => {
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    })
  }

  async login(apiKey: string): Promise<number> {
    const result = await this.callRecord("Profile.LoginWithAPIKey", { apiKey })
    const profile = readRecord(result.profile)
    const profileId = profile ? numberField(profile, "id") : undefined
    if (profileId === undefined)
      throw new Error("butler returned no profile id")
    return profileId
  }

  async downloadKeys(profileId: number): Promise<void> {
    await this.callRecord("Fetch.DownloadKeys", {
      profileId,
      limit: 100,
      fresh: true,
    })
  }

  async game(gameId: number): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.callRecord("Fetch.Game", { gameId, fresh: true })
    const game = readRecord(result.game)
    if (!game) throw new Error("butler returned no game")
    return game
  }

  async gameUploads(
    gameId: number,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const result = await this.callRecord("Fetch.GameUploads", {
      gameId,
      compatible: false,
      fresh: true,
    })
    return Array.isArray(result.uploads)
      ? result.uploads.filter(
          (upload): upload is Readonly<Record<string, unknown>> =>
            readRecord(upload) !== null,
        )
      : []
  }

  async callRecord(
    method: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs = 60_000,
  ): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.call(method, params, timeoutMs)
    const record = readRecord(result)
    if (!record)
      throw new Error(`butler ${method} returned a non-object result`)
    return record
  }

  async call(
    method: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs = 60_000,
  ): Promise<unknown> {
    const id = this.nextId++
    const payload = `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
    this.socket.write(payload)
    return withTimeout(
      promise,
      timeoutMs,
      `timed out waiting for butler ${method}`,
    )
  }

  async shutdown(): Promise<void> {
    try {
      await this.call("Meta.Shutdown", {}, 5_000)
    } catch {
      // butler may close before replying during shutdown.
    } finally {
      this.lines.close()
      this.socket.destroy()
    }
  }

  receive(line: string): void {
    const message = readRecordFromJson(line)
    if (!message) return
    const id = numberField(message, "id")
    if (id === undefined) return
    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)
    const error = readRecord(message.error)
    if (error) {
      pending.reject(new Error(stringField(error, "message") ?? "butler error"))
      return
    }
    pending.resolve(message.result)
  }
}

function uploadChoiceFromApiLike(
  input: Readonly<Record<string, unknown>>,
): ItchioUploadChoice {
  const filename = firstText([
    stringField(input, "displayName"),
    stringField(input, "display_name"),
    stringField(input, "filename"),
    stringField(input, "name"),
    stringField(input, "channelName"),
    stringField(input, "channel_name"),
  ])
  const size = numberField(input, "size")
  return {
    id: String(input.id),
    ...(filename ? { filename } : {}),
    ...(size ? { size: humanBytes(size) } : {}),
    platforms: uploadPlatformsFromApiRecord(input),
  }
}

function humanBytes(size: number): string {
  if (size >= 1024 * 1024) return `${Math.round(size / (1024 * 1024))} MB`
  if (size >= 1024) return `${Math.round(size / 1024)} KB`
  return `${size} B`
}

function readRecordFromJson(
  line: string,
): Readonly<Record<string, unknown>> | null {
  try {
    return readRecord(JSON.parse(line))
  } catch {
    return null
  }
}

async function runProcess(
  command: string,
  args: readonly string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: "ignore" })
    child.once("error", reject)
    child.once("exit", code => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with status ${code}`))
    })
  })
}

async function onceSocket(socket: Socket, event: "connect"): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    socket.once(event, () => resolve())
    socket.once("error", reject)
  })
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  try {
    return await Promise.race([promise, timer])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

interface CookieJar {
  readonly capture: (response: Response) => void
  readonly headers: () => Readonly<Record<string, string>>
}

function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>()
  return {
    capture: response => {
      for (const header of setCookieHeaders(response)) {
        const [pair] = header.split(";")
        const separator = pair?.indexOf("=") ?? -1
        if (!pair || separator <= 0) continue
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
      }
    },
    headers: () => {
      const headers: Record<string, string> = {}
      if (cookies.size === 0) return headers
      headers.Cookie = [...cookies.entries()]
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
      return headers
    },
  }
}

function setCookieHeaders(response: Response): readonly string[] {
  const maybeHeaders = response.headers as Headers & {
    readonly getSetCookie?: () => string[]
  }
  const multiple = maybeHeaders.getSetCookie?.()
  if (multiple && multiple.length > 0) return multiple
  const single = response.headers.get("set-cookie")
  return single ? [single] : []
}

function parseUrl(input: string): URL | null {
  try {
    return new URL(input)
  } catch {
    return null
  }
}

function isSafeItchioSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/i.test(value)
}

function isSafeHttpUrl(value: string): boolean {
  const url = parseUrl(value)
  return url !== null && (url.protocol === "https:" || url.protocol === "http:")
}

function isSafePublicHttpUrl(value: string): boolean {
  try {
    validateOutboundHttpUrl(value)
    return true
  } catch {
    return false
  }
}

function firstText(
  values: readonly (string | null | undefined)[],
): string | undefined {
  return values
    .map(value => (value ? decodeHtml(value).trim() : ""))
    .find(value => value.length > 0)
}

function metaContent(html: string, property: string): string | undefined {
  for (const tag of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const attributes = attributesFor(tag[0])
    if (
      attributes.get("property") === property ||
      attributes.get("name") === property
    ) {
      return attributes.get("content")
    }
  }
  return undefined
}

function canonicalUrl(html: string): string | undefined {
  for (const tag of html.matchAll(/<link\s+[^>]*>/gi)) {
    const attributes = attributesFor(tag[0])
    if (attributes.get("rel") === "canonical") return attributes.get("href")
  }
  return undefined
}

function titleElement(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match?.[1]
}

function attributesFor(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>()
  for (const match of tag.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(["'])(.*?)\2/g,
  )) {
    const key = match[1]
    const value = match[3]
    if (key && value !== undefined) attributes.set(key.toLowerCase(), value)
  }
  return attributes
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (match, codepoint: string) =>
      decodeCodepoint(match, Number(codepoint)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (match, codepoint: string) =>
      decodeCodepoint(match, Number.parseInt(codepoint, 16)),
    )
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
}

function decodeCodepoint(match: string, codepoint: number): string {
  if (!Number.isInteger(codepoint) || codepoint < 0 || codepoint > 0x10ffff) {
    return match
  }
  return String.fromCodePoint(codepoint)
}
