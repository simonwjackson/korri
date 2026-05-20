import { Bonjour, type Service } from "bonjour-service"

export const KORRI_STREAM_SERVICE_TYPE = "korri-stream"
export const KORRI_STREAM_SERVICE_PROTOCOL = "tcp" as const
export const KORRI_STREAM_PROTOCOL_VERSION = "1"

export interface StreamHostCandidate {
  readonly id: string
  readonly name: string
  readonly controlUrl: string
  readonly source: "mdns" | "manual"
  readonly capabilities: readonly string[]
  readonly identityVerified: false
}

export interface DiscoverStreamHostsOptions {
  readonly manualHost?: string
  readonly timeoutMs?: number
  readonly bonjourFactory?: () => BonjourLike
}

export interface BonjourLike {
  find: (
    options: { readonly type: string; readonly protocol: "tcp" },
    onup: (service: Service) => void,
  ) => BrowserLike
  publish?: (options: unknown) => Service
  destroy: (callback?: () => void) => void
}

export interface BrowserLike {
  start?: () => void
  stop: () => void
}

export async function discoverStreamHosts(
  options: DiscoverStreamHostsOptions = {},
): Promise<readonly StreamHostCandidate[]> {
  if (options.manualHost) return [candidateFromManualHost(options.manualHost)]

  const timeoutMs = options.timeoutMs ?? 1500
  const bonjour = options.bonjourFactory?.() ?? new Bonjour()
  const candidates = new Map<string, StreamHostCandidate>()
  let browser: BrowserLike | undefined

  try {
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, timeoutMs)
      browser = bonjour.find(
        {
          type: KORRI_STREAM_SERVICE_TYPE,
          protocol: KORRI_STREAM_SERVICE_PROTOCOL,
        },
        service => {
          const candidate = candidateFromMdnsService(service)
          if (candidate) candidates.set(candidate.controlUrl, candidate)
        },
      )
      browser.start?.()
      setTimeout(() => {
        clearTimeout(timer)
        resolve()
      }, timeoutMs)
    })
  } finally {
    browser?.stop()
    await new Promise<void>(resolve => bonjour.destroy(resolve))
  }

  return [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function candidateFromManualHost(host: string): StreamHostCandidate {
  const url = normalizeControlUrl(host)
  return {
    id: url.hostname,
    name: url.hostname,
    controlUrl: url.toString().replace(/\/$/, ""),
    source: "manual",
    capabilities: ["stream"],
    identityVerified: false,
  }
}

export function candidateFromMdnsService(
  service: Pick<Service, "name" | "host" | "port" | "addresses" | "txt">,
): StreamHostCandidate | undefined {
  if (service.port <= 0) return undefined
  const address = service.addresses?.find(isAllowedLanAddress)
  if (!address) return undefined

  const protocol = txtValue(service.txt, "proto")
  if (protocol && protocol !== KORRI_STREAM_PROTOCOL_VERSION) return undefined

  const url = new URL(`http://${hostForUrl(address)}:${service.port}`)
  const hostId = txtValue(service.txt, "hostId") ?? service.host ?? address
  return {
    id: hostId,
    name: service.name || hostId,
    controlUrl: url.toString().replace(/\/$/, ""),
    source: "mdns",
    capabilities: parseCapabilities(txtValue(service.txt, "caps")),
    identityVerified: false,
  }
}

export function normalizeControlUrl(value: string): URL {
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `http://${value}`
  const url = new URL(withProtocol)
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Korri stream host must use http or https")
  }
  return url
}

function parseCapabilities(value: string | undefined): readonly string[] {
  const capabilities = value
    ?.split(",")
    .map(capability => capability.trim())
    .filter(Boolean)
  return capabilities && capabilities.length > 0 ? capabilities : ["stream"]
}

function txtValue(txt: unknown, key: string): string | undefined {
  if (typeof txt !== "object" || txt === null) return undefined
  const value = (txt as Record<string, unknown>)[key]
  if (typeof value === "string") return value
  if (Buffer.isBuffer(value)) return value.toString("utf8")
  if (Array.isArray(value)) return value.join(",")
  return undefined
}

function hostForUrl(address: string): string {
  return address.includes(":") ? `[${address}]` : address
}

function isAllowedLanAddress(address: string): boolean {
  if (address === "127.0.0.1" || address === "::1") return true
  if (/^10\./.test(address)) return true
  if (/^192\.168\./.test(address)) return true
  const octets = address.split(".").map(Number)
  if (
    octets.length === 4 &&
    octets[0] === 172 &&
    octets[1] >= 16 &&
    octets[1] <= 31
  ) {
    return true
  }
  const normalized = address.toLowerCase()
  return (
    normalized.startsWith("fe80:") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fc")
  )
}
