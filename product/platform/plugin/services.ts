import type { ProviderId } from "./index"

export interface PluginHttpRequestOptions {
  readonly query?: Readonly<
    Record<string, string | number | boolean | undefined>
  >
  readonly headers?: Readonly<Record<string, string>>
  readonly timeoutMs?: number
}

export interface PluginHttpServices {
  readonly text?: (
    url: string | URL,
    options?: PluginHttpRequestOptions,
  ) => string | PromiseLike<string>
  readonly json?: <T = unknown>(
    url: string | URL,
    options?: PluginHttpRequestOptions,
  ) => T | PromiseLike<T>
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
  return {
    ...services,
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
      final: input => ({
        _tag: "FinalDownload",
        providerId,
        url: input.url,
        ...(input.filename ? { filename: input.filename } : {}),
        ...(input.contentType ? { contentType: input.contentType } : {}),
      }),
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

function acquisitionHint(candidate: PluginClaimCandidate): object {
  return {
    kind: "content",
    system: candidate.platform ?? "unknown",
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
