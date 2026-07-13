import { createCookieJar } from "./cookie-jar"
import type { ProviderId } from "./index"

export interface PluginHttpRequestOptions {
  /** HTTP method. Defaults to GET. */
  readonly method?: string
  /** Request body for POST/PUT/PATCH. */
  readonly body?: string | Uint8Array | URLSearchParams
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
}

export interface PluginHttpResponse {
  readonly status: number
  readonly ok: boolean
  /** Final URL after redirects. */
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** Raw Set-Cookie header values (may be several per response). */
  readonly setCookies: readonly string[]
  readonly text: () => PromiseLike<string>
  readonly json: <T = unknown>() => PromiseLike<T>
  readonly bytes: () => PromiseLike<Uint8Array>
}

export interface PluginHttpServices {
  /**
   * Convenience wrapper over `request` returning the decoded body text.
   */
  readonly text?: (
    url: string | URL,
    options?: PluginHttpRequestOptions,
  ) => string | PromiseLike<string>
  /**
   * Convenience wrapper over `request` returning the decoded JSON body.
   */
  readonly json?: <T = unknown>(
    url: string | URL,
    options?: PluginHttpRequestOptions,
  ) => T | PromiseLike<T>
  /**
   * Capable HTTP client: any method, request body, binary responses, and
   * response status/header visibility. All plugin tiers share this one
   * surface — bundled plugins must not reach for a global fetch instead.
   */
  readonly request?: (
    url: string | URL,
    options?: PluginHttpRequestOptions,
  ) => PluginHttpResponse | PromiseLike<PluginHttpResponse>
}

export interface PluginCacheQueryOptions {
  readonly ttlMs?: number
}

export interface PluginCacheServices {
  readonly get?: <T = unknown>(key: readonly unknown[]) => T | undefined
  readonly set?: <T>(
    key: readonly unknown[],
    value: T,
    options?: PluginCacheQueryOptions,
  ) => void | PromiseLike<void>
  readonly query?: <T>(
    key: readonly unknown[],
    load: () => T | PromiseLike<T>,
    options?: PluginCacheQueryOptions,
  ) => T | PromiseLike<T>
}

export interface PluginHtmlParseOptions {
  readonly baseUrl?: string
}

export interface PluginHtmlServices<Document = unknown> {
  readonly parse?: (html: string, options?: PluginHtmlParseOptions) => Document
}

export interface PluginUrlServices {
  readonly absolute?: (
    baseUrl: string,
    path: string | undefined | null,
  ) => string | undefined
}

export interface PluginCryptoServices {
  readonly stableId?: (input: string) => string
  readonly urlId?: (url: string) => string
  readonly urlFromId?: (id: string) => string
}

export interface PluginCredentialServices {
  readonly get?: (name: string) => string | undefined
  readonly require?: (name: string) => string
}

export interface PluginTimeServices {
  readonly nowIso?: () => string
  readonly sleep?: (ms: number) => PromiseLike<void>
}

export interface PluginLogServices {
  readonly debug?: (message: string, data?: unknown) => void
  readonly info?: (message: string, data?: unknown) => void
  readonly warn?: (message: string, data?: unknown) => void
  readonly error?: (message: string, data?: unknown) => void
}

export interface PluginClaimCandidate {
  readonly id?: string
  readonly title: string
  readonly url: string
  readonly platform?: string
  /**
   * Korri library system id (e.g. "snes", "gba") — the plugin's own mapping
   * from its site's platform naming. When present the claim carries a
   * playable release hint, which is what makes the Store offer Get and lets
   * placement file the download where discovery will find it.
   */
  readonly system?: string
  readonly description?: string
  readonly downloadPageUrl?: string
  readonly thumbnailUrl?: string
  readonly fileName?: string
  readonly format?: string
  readonly contentType?: string
  readonly tags?: readonly string[]
}

export interface PluginClaimServices {
  readonly providerId?: ProviderId
  readonly claim?: (candidate: PluginClaimCandidate) => object
  readonly details?: (candidate: PluginClaimCandidate) => object
  readonly parseUrlId?: (url: string) => string
}

export interface PluginDownloadServices {
  readonly providerId?: ProviderId
  readonly final?: (input: {
    readonly url: string
    readonly filename?: string
    readonly contentType?: string
    /**
     * Headers the daemon must send when fetching the bytes (e.g. Referer).
     * Cookies collected by the provider's session jar are merged in
     * automatically by the provider-scoped services.
     */
    readonly requestHeaders?: Readonly<Record<string, string>>
  }) => object
  readonly nonFinal?: (
    reason: "interstitial" | "requires-user-action" | "unsupported",
    url?: string,
  ) => object
  readonly failed?: (
    reason:
      | "provider-error"
      | "configuration"
      | "not-found"
      | "defective-provider",
    message: string,
  ) => object
}

export interface PluginProviderServices {
  readonly providerId?: ProviderId
  readonly healthy?: (checkedAt?: string) => object
  readonly unhealthy?: (
    reason:
      | "configuration"
      | "credentials"
      | "network"
      | "provider-error"
      | "defective-provider",
    message: string,
    checkedAt?: string,
  ) => object
}

export interface PluginLimitServices {
  readonly maxResults?: number
  readonly timeoutMs?: number
}

export interface PluginServices {
  readonly http?: PluginHttpServices
  readonly cache?: PluginCacheServices
  readonly html?: PluginHtmlServices
  readonly urls?: PluginUrlServices
  readonly crypto?: PluginCryptoServices
  readonly credentials?: PluginCredentialServices
  readonly time?: PluginTimeServices
  readonly log?: PluginLogServices
  readonly claims?: PluginClaimServices
  readonly downloads?: PluginDownloadServices
  readonly provider?: PluginProviderServices
  readonly limits?: PluginLimitServices
}

export class MissingPluginService extends Error {
  readonly service: keyof PluginServices
  readonly operation: string

  constructor(input: {
    readonly service: keyof PluginServices
    readonly operation: string
  }) {
    super(
      `Plugin operation ${input.operation} requires service ${input.service}`,
    )
    this.name = "MissingPluginService"
    this.service = input.service
    this.operation = input.operation
  }
}

export function requirePluginService<Service extends keyof PluginServices>(
  services: PluginServices | undefined,
  service: Service,
  operation: string,
): NonNullable<PluginServices[Service]> {
  const value = services?.[service]
  if (value === undefined) {
    throw new MissingPluginService({ service, operation })
  }
  return value as NonNullable<PluginServices[Service]>
}

export function createProviderScopedPluginServices(
  services: PluginServices | undefined,
  providerId: ProviderId,
): PluginServices {
  const stableId = services?.crypto?.stableId ?? defaultStableId
  const urlId = services?.crypto?.urlId ?? encodeURIComponent
  const urlFromId = services?.crypto?.urlFromId ?? decodeURIComponent
  const nowIso = services?.time?.nowIso ?? (() => new Date().toISOString())
  const session = createProviderHttpSession(services?.http)
  return {
    ...services,
    ...(session.http ? { http: session.http } : {}),
    crypto: {
      ...services?.crypto,
      stableId,
      urlId,
      urlFromId,
    },
    claims: {
      ...services?.claims,
      providerId,
      parseUrlId: url => urlId(url),
      claim: candidate => ({
        _tag: "ProviderClaim",
        providerId,
        id: candidate.id ?? urlId(candidate.url),
        ref: { kind: "url", value: candidate.url },
        title: candidate.title,
        url: candidate.url,
        ...(candidate.platform ? { platform: candidate.platform } : {}),
        ...(candidate.thumbnailUrl
          ? { thumbnailUrl: candidate.thumbnailUrl }
          : {}),
        ...(candidate.system
          ? {
              playable: {
                id: candidate.id ?? urlId(candidate.url),
                title: candidate.title,
                providerId,
                releases: [
                  {
                    id: candidate.system,
                    providerId,
                    system: candidate.system,
                  },
                ],
              },
            }
          : {}),
        artifact: acquisitionHint(candidate),
        fetchedAt: nowIso(),
      }),
      details: candidate => ({
        _tag: "ProviderClaimDetails",
        providerId,
        id: candidate.id ?? urlId(candidate.url),
        ref: { kind: "url", value: candidate.url },
        title: candidate.title,
        url: candidate.url,
        ...(candidate.description
          ? { description: candidate.description }
          : {}),
        ...(candidate.downloadPageUrl
          ? { downloadPageUrl: candidate.downloadPageUrl }
          : {}),
        artifact: acquisitionHint(candidate),
        facets: {
          ...(candidate.description
            ? { description: { text: candidate.description } }
            : {}),
          tags: [candidate.platform, ...(candidate.tags ?? [])].filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          ),
        },
        fetchedAt: nowIso(),
      }),
    },
    downloads: {
      ...services?.downloads,
      providerId,
      final: input => {
        const requestHeaders = mergeRequestHeaders(
          session.cookieHeader(input.url),
          input.requestHeaders,
        )
        return {
          _tag: "FinalDownload",
          providerId,
          url: input.url,
          ...(input.filename ? { filename: input.filename } : {}),
          ...(input.contentType ? { contentType: input.contentType } : {}),
          ...(requestHeaders ? { requestHeaders } : {}),
        }
      },
      nonFinal: (reason, url) => ({
        _tag: "NonFinalDownload",
        providerId,
        reason,
        ...(url ? { url } : {}),
      }),
      failed: (reason, message) => ({
        _tag: "FailedDownload",
        providerId,
        reason,
        message,
      }),
    },
    provider: {
      ...services?.provider,
      providerId,
      healthy: checkedAt => ({
        _tag: "HealthyProvider",
        providerId,
        checkedAt: checkedAt ?? nowIso(),
      }),
      unhealthy: (reason, message, checkedAt) => ({
        _tag: "UnhealthyProvider",
        providerId,
        checkedAt: checkedAt ?? nowIso(),
        reason,
        message,
      }),
    },
  }
}

interface ProviderHttpSession {
  readonly http?: PluginHttpServices
  readonly cookieHeader: (url: string) => string | undefined
}

/**
 * Wraps the base http service with a per-provider session cookie jar.
 * Requires the capable `request` surface (which exposes Set-Cookie); when
 * the base http only offers legacy text/json it is passed through untouched.
 */
function createProviderHttpSession(
  base: PluginHttpServices | undefined,
): ProviderHttpSession {
  const baseRequest = base?.request
  if (baseRequest === undefined) {
    return { cookieHeader: () => undefined }
  }
  const jar = createCookieJar()
  const request: NonNullable<PluginHttpServices["request"]> = async (
    url,
    options,
  ) => {
    const target = String(url)
    const cookie = jar.cookieHeader(target)
    const headers =
      cookie === undefined ? options?.headers : { cookie, ...options?.headers }
    const response = await baseRequest(url, { ...options, headers })
    jar.store(response.url || target, response.setCookies)
    return response
  }
  return {
    http: {
      ...base,
      request,
      text: async (url, options) => {
        const response = await request(url, options)
        return response.text()
      },
      json: async <T>(
        url: string | URL,
        options?: PluginHttpRequestOptions,
      ) => {
        const response = await request(url, options)
        return response.json<T>()
      },
    },
    cookieHeader: url => jar.cookieHeader(url),
  }
}

function mergeRequestHeaders(
  cookie: string | undefined,
  explicit: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (cookie === undefined && explicit === undefined) return undefined
  return {
    ...(cookie !== undefined ? { cookie } : {}),
    ...explicit,
  }
}

function acquisitionHint(candidate: PluginClaimCandidate): object {
  return {
    kind: "content",
    system: candidate.system ?? candidate.platform ?? "unknown",
    format: {
      id: candidate.format ?? fileExtension(candidate.fileName) ?? "zip",
    },
    ...(candidate.fileName
      ? {
          file: {
            name: candidate.fileName,
            ...(fileExtension(candidate.fileName)
              ? { extension: fileExtension(candidate.fileName) }
              : {}),
            ...(candidate.contentType
              ? { mediaType: candidate.contentType }
              : {}),
          },
        }
      : {}),
  }
}

function fileExtension(fileName: string | undefined): string | undefined {
  return fileName?.match(/\.([a-z0-9][a-z0-9-]{0,31})$/i)?.[1]?.toLowerCase()
}

function defaultStableId(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `id-${(hash >>> 0).toString(36)}`
}
