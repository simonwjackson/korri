import { Bonjour, type Service } from "bonjour-service"
import { Effect, Queue, Stream } from "effect"

export const KORRI_STREAM_SERVICE_TYPE = "korri-stream"
export const KORRI_STREAM_SERVICE_PROTOCOL = "tcp" as const
export const KORRI_STREAM_PROTOCOL_VERSION = "1"
export const KORRI_STREAM_DEFAULT_PORT = 3001

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
  on?: (
    event: "down" | "up",
    handler: (service: Service) => void,
  ) => BrowserLike
  off?: (
    event: "down" | "up",
    handler: (service: Service) => void,
  ) => BrowserLike
}

export type StreamHostEvent =
  | { readonly kind: "appear"; readonly candidate: StreamHostCandidate }
  | { readonly kind: "disappear"; readonly controlUrl: string }

export interface WatchStreamHostsOptions {
  readonly bonjourFactory?: () => BonjourLike
}

/**
 * Always-on mDNS browse stream for `_korri-stream._tcp` services.
 *
 * Emits `appear` once per distinct `controlUrl` (TTL refreshes are
 * deduplicated) and `disappear` only when a prior `appear` was emitted for
 * the same `controlUrl`. The bonjour browser is started when the stream is
 * pulled and destroyed when the surrounding scope closes.
 */
export function watchStreamHosts(
  options: WatchStreamHostsOptions = {},
): Stream.Stream<StreamHostEvent> {
  return Stream.callback<StreamHostEvent>(queue =>
    Effect.gen(function* () {
      const bonjour = options.bonjourFactory?.() ?? new Bonjour()
      const known = new Map<string, string>()

      const onUp = (service: Service) => {
        const candidate = candidateFromMdnsService(service)
        if (!candidate) return
        if (known.has(candidate.controlUrl)) return
        known.set(candidate.controlUrl, hostKeyForService(service))
        Queue.offerUnsafe(queue, {
          kind: "appear",
          candidate,
        })
      }

      const onDown = (service: Service) => {
        const candidate = candidateFromMdnsService(service)
        const controlUrl =
          candidate?.controlUrl ?? findControlUrlByService(known, service)
        if (!controlUrl) return
        if (!known.has(controlUrl)) return
        known.delete(controlUrl)
        Queue.offerUnsafe(queue, {
          kind: "disappear",
          controlUrl,
        })
      }

      const browser = bonjour.find(
        {
          type: KORRI_STREAM_SERVICE_TYPE,
          protocol: KORRI_STREAM_SERVICE_PROTOCOL,
        },
        onUp,
      )
      browser.on?.("down", onDown)
      browser.start?.()

      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          browser.off?.("down", onDown)
          browser.stop()
          bonjour.destroy()
        }),
      )
    }),
  )
}

function hostKeyForService(service: Service): string {
  return service.name ?? service.host ?? ""
}

function findControlUrlByService(
  known: ReadonlyMap<string, string>,
  service: Service,
): string | undefined {
  const key = hostKeyForService(service)
  if (!key) return undefined
  for (const [controlUrl, recordedKey] of known.entries()) {
    if (recordedKey === key) return controlUrl
  }
  return undefined
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

  const hostId = txtValue(service.txt, "hostId") ?? service.host ?? address
  // Address peers by a resolvable name when one is advertised, falling back to
  // the discovered LAN IP. A device name (e.g. "aka") keeps the controlUrl
  // valid across networks: LAN DNS/mDNS at home, and an overlay resolver such
  // as Tailscale MagicDNS when away. The LAN address found above is still
  // required as a discovery gate, and is used as the host only when no usable
  // name is advertised.
  const host = resolvableHostName(service) ?? address
  const url = new URL(`http://${hostForUrl(host)}:${service.port}`)
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
  // The server (and mDNS advert) defaults to 3001. URL parsing drops an
  // unspecified port to the protocol default (80/443), which then sends
  // the CLI at a port nothing is listening on; default it back to the
  // Korri stream port so `--host aka` is shorthand for `--host aka:3001`.
  if (url.port === "") {
    url.port = String(KORRI_STREAM_DEFAULT_PORT)
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

/**
 * Prefer the advertised device name (mDNS TXT `hostId`, then the `.local`
 * SRV host) for the controlUrl host, but only when it is a usable URL
 * hostname. Display-name-style ids with spaces fall through to the caller's
 * IP fallback so we never produce an invalid URL.
 */
function resolvableHostName(
  service: Pick<Service, "host" | "txt">,
): string | undefined {
  const candidates = [
    txtValue(service.txt, "hostId"),
    service.host?.replace(/\.$/, ""),
  ]
  for (const candidate of candidates) {
    if (candidate && isUrlHostname(candidate)) return candidate
  }
  return undefined
}

function isUrlHostname(value: string): boolean {
  try {
    return new URL(`http://${hostForUrl(value)}`).hostname.length > 0
  } catch {
    return false
  }
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
