import type { XdgPathEnv } from "@platform/config/xdg-paths"
import type { PluginServices } from "@platform/plugin/services"
import type { AcquisitionLogger } from "./logger"
import { silentAcquisitionLogger } from "./logger"

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
      ...createAcquisitionPluginServices({ clock, logger }),
      ...options.services,
    },
  }
}

export function createAcquisitionPluginServices(input: {
  readonly clock: AcquisitionClock
  readonly logger: AcquisitionLogger
}): PluginServices {
  return {
    time: {
      nowIso: input.clock.nowIso,
      sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    },
    log: {
      debug: (message, data) => input.logger.debug(message, logFields(data)),
      info: (message, data) => input.logger.info(message, logFields(data)),
      warn: (message, data) => input.logger.warn(message, logFields(data)),
      error: (message, data) => input.logger.error(message, logFields(data)),
    },
    http: {
      text: async (url, options) => {
        const response = await fetch(withQuery(url, options?.query), {
          headers: options?.headers,
          signal: timeoutSignal(options?.timeoutMs),
        })
        return response.text()
      },
      json: async (url, options) => {
        const response = await fetch(withQuery(url, options?.query), {
          headers: options?.headers,
          signal: timeoutSignal(options?.timeoutMs),
        })
        return response.json()
      },
    },
  }
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
