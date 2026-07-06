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

export interface PluginClaimServices {
  readonly providerId?: ProviderId
}

export interface PluginDownloadServices {
  readonly providerId?: ProviderId
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
  readonly time?: PluginTimeServices
  readonly log?: PluginLogServices
  readonly claims?: PluginClaimServices
  readonly downloads?: PluginDownloadServices
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
