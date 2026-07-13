import type { XdgPathEnv } from "@platform/config/xdg-paths"
import type {
  PluginHttpRequestOptions,
  PluginHttpResponse,
  PluginServices,
} from "@platform/plugin/services"
import { fetchWithValidatedRedirects } from "./download-resolution/safe-fetch"
import type { AcquisitionLogger } from "./logger"
import { silentAcquisitionLogger } from "./logger"

export const MAX_PLUGIN_HTTP_RESPONSE_BYTES = 2 * 1024 * 1024 * 1024

export type PluginFetchLike = (
  url: string | URL,
  init?: RequestInit,
) => Promise<Response>

export interface AcquisitionClock {
  readonly nowIso: () => string
}

export interface AcquisitionPluginContext {
  readonly clock: AcquisitionClock
  readonly logger: AcquisitionLogger
  readonly env?: XdgPathEnv
  readonly services?: PluginServices
}

export interface AcquisitionRuntimeOptions {
  readonly clock?: AcquisitionClock
  readonly logger?: AcquisitionLogger
  readonly env?: XdgPathEnv
  readonly services?: PluginServices
  readonly fetchImpl?: PluginFetchLike
}

export function createAcquisitionPluginContext(
  options: AcquisitionRuntimeOptions = {},
): AcquisitionPluginContext {
  const clock = options.clock ?? { nowIso: () => new Date().toISOString() }
  const logger = options.logger ?? silentAcquisitionLogger
  return {
    clock,
    logger,
    env: options.env ?? process.env,
    services: {
      ...createAcquisitionPluginServices({
        clock,
        logger,
        fetchImpl: options.fetchImpl,
      }),
      ...options.services,
    },
  }
}

export function createAcquisitionPluginServices(input: {
  readonly clock: AcquisitionClock
  readonly logger: AcquisitionLogger
  readonly fetchImpl?: PluginFetchLike
}): PluginServices {
  const request = createPluginHttpRequest(input.fetchImpl ?? fetch)
  return {
    time: {
      nowIso: input.clock.nowIso,
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    },
    crypto: {
      stableId: stableId,
      urlId: encodeURIComponent,
      urlFromId: decodeURIComponent,
    },
    credentials: {
      get: name => process.env[name],
      require: name => {
        const value = process.env[name]
        if (value === undefined || value.length === 0) {
          throw new Error(`Missing plugin credential ${name}`)
        }
        return value
      },
    },
    log: {
      debug: (message, data) => input.logger.debug(message, logFields(data)),
      info: (message, data) => input.logger.info(message, logFields(data)),
      warn: (message, data) => input.logger.warn(message, logFields(data)),
      error: (message, data) => input.logger.error(message, logFields(data)),
    },
    http: {
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
  }
}

function createPluginHttpRequest(
  fetchImpl: PluginFetchLike,
): (
  url: string | URL,
  options?: PluginHttpRequestOptions,
) => Promise<PluginHttpResponse> {
  return async (url, options) => {
    const target = withQuery(url, options?.query)
    const response = await fetchWithValidatedRedirects(fetchImpl, target, {
      method: options?.method ?? "GET",
      headers: options?.headers,
      body: requestBody(options?.body),
      signal: timeoutSignal(options?.timeoutMs),
    })
    return toPluginHttpResponse(response, String(target))
  }
}

function requestBody(
  body: PluginHttpRequestOptions["body"],
): BodyInit | undefined {
  if (body === undefined) return undefined
  // Slice by the view's own offset/length so a Buffer.subarray() body never
  // leaks the unrelated bytes of a shared backing ArrayBuffer.
  if (body instanceof Uint8Array) {
    return body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer
  }
  return body
}

function toPluginHttpResponse(
  response: Response,
  requestedUrl: string,
): PluginHttpResponse {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value
  })
  const source = response.url || requestedUrl
  const declaredTooLarge = () =>
    Number(response.headers.get("content-length") ?? "0") >
    MAX_PLUGIN_HTTP_RESPONSE_BYTES
  // All body consumers read through readBytes so the cap is enforced on the
  // ACTUAL byte length, never on Content-Length alone or UTF-16 text length.
  const readBytes = async (): Promise<Uint8Array> => {
    if (declaredTooLarge())
      throw new Error(`Response from ${source} is too large`)
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength > MAX_PLUGIN_HTTP_RESPONSE_BYTES) {
      throw new Error(`Response from ${source} is too large`)
    }
    return new Uint8Array(buffer)
  }
  const readText = async (): Promise<string> =>
    new TextDecoder().decode(await readBytes())
  return {
    status: response.status,
    ok: response.ok,
    url: source,
    headers,
    setCookies: response.headers.getSetCookie?.() ?? [],
    text: readText,
    json: async <T>() => JSON.parse(await readText()) as T,
    bytes: readBytes,
  }
}

function stableId(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `id-${(hash >>> 0).toString(36)}`
}

function logFields(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined) return undefined
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>
  }
  return { value: data }
}

function withQuery(
  input: string | URL,
  query:
    | Readonly<Record<string, string | number | boolean | undefined>>
    | undefined,
): string | URL {
  if (query === undefined) return input
  const url = new URL(String(input))
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}

function timeoutSignal(timeoutMs: number | undefined): AbortSignal | undefined {
  if (timeoutMs === undefined) return undefined
  return AbortSignal.timeout(timeoutMs)
}
