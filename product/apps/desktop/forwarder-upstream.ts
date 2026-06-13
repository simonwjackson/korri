/**
 * Forwarder upstream picker for the desktop bun.
 *
 * Replaces the single-connection state machine that the forwarder used
 * to consume. The desktop forwarder is bootstrap transport only: product
 * desktops talk to the local coordinator, and catalog federation happens
 * behind that coordinator instead of by selecting a remote renderer API
 * upstream.
 *
 * Pick policy (top-down):
 *   1. Loopback fast-path. If a local korrid is running on
 *      127.0.0.1:<advertised-port>, use it. Subsequent fan-out happens
 *      on the local server side, which keeps the desktop bun a pure
 *      same-origin pass-through (per the
 *      `electrobun-desktop-wrapper-loopback` learning).
 *   2. Optional development mDNS fallback. When explicitly enabled,
 *      browse `_korri-stream._tcp`; pick the first result advertising
 *      `caps: "source"`. This is not enabled for product/kiosk mode,
 *      because a stale LAN peer must not become the renderer's only API
 *      upstream.
 *   3. No upstream. The forwarder surfaces this as `503` to the
 *      renderer; the rail treats 503 as empty-state (per R3, AE1).
 *
 * Pick result is cached for `cacheTtlMs` (default 5s) so the hot
 * `/api/*` path doesn't re-probe every request. `invalidate()`
 * forces a re-pick — the forwarder calls it on upstream fetch
 * failure so a brief 502 self-heals on the next request.
 */

import { Bonjour } from "bonjour-service"
import {
  type BonjourLike,
  candidateFromMdnsService,
  KORRI_STREAM_SERVICE_PROTOCOL,
  KORRI_STREAM_SERVICE_TYPE,
} from "../cli/lan-stream-discovery"

export interface ForwarderUpstreamOptions {
  /** Local server base URL to fast-path probe. Default `http://127.0.0.1:3001`. */
  readonly loopbackBaseUrl?: string
  /**
   * Tests inject a probe stub; production probes the loopback's
   * `/api/health` with a short timeout.
   */
  readonly probeLoopback?: (controlUrl: string) => Promise<boolean>
  /** mDNS browser factory — injected for tests. */
  readonly bonjourFactory?: () => BonjourLike
  /** Cache TTL for the picked upstream. Default 5000ms. 0 disables. */
  readonly cacheTtlMs?: number
  /** mDNS browse window before settling on a result. Default 250ms. */
  readonly browseWindowMs?: number
  /** Loopback probe timeout. Default 200ms. */
  readonly loopbackProbeTimeoutMs?: number
  /**
   * Enable remote mDNS API bootstrap for development/lab use. Product
   * desktops default this off so stale LAN peers cannot become the
   * renderer's only `/api/*` upstream.
   */
  readonly allowRemoteApiBootstrap?: boolean
}

export interface ForwarderUpstream {
  /** Resolve the current upstream URL or undefined. */
  readonly pickUpstream: () => Promise<string | undefined>
  /** Clear the cached pick so the next call re-discovers. */
  readonly invalidate: () => void
  /** Tear down any background bonjour browser. */
  readonly shutdown: () => Promise<void>
}

const DEFAULT_LOOPBACK_URL = "http://127.0.0.1:3001"
const DEFAULT_CACHE_TTL_MS = 5000
const DEFAULT_BROWSE_WINDOW_MS = 250
const DEFAULT_LOOPBACK_TIMEOUT_MS = 200

export function makeForwarderUpstream(
  options: ForwarderUpstreamOptions = {},
): ForwarderUpstream {
  const loopbackBaseUrl = options.loopbackBaseUrl ?? DEFAULT_LOOPBACK_URL
  const probeLoopback =
    options.probeLoopback ??
    ((url: string) =>
      defaultProbeLoopback(
        url,
        options.loopbackProbeTimeoutMs ?? DEFAULT_LOOPBACK_TIMEOUT_MS,
      ))
  const bonjourFactory: () => BonjourLike =
    options.bonjourFactory ?? (() => new Bonjour() as unknown as BonjourLike)
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const browseWindowMs = options.browseWindowMs ?? DEFAULT_BROWSE_WINDOW_MS
  const allowRemoteApiBootstrap = options.allowRemoteApiBootstrap ?? false

  let cache: { url: string | undefined; expiresAt: number } | undefined

  const pick = async (): Promise<string | undefined> => {
    if (await probeLoopback(loopbackBaseUrl)) return loopbackBaseUrl
    if (!allowRemoteApiBootstrap) return undefined
    return await pickFromMdns(bonjourFactory, browseWindowMs)
  }

  const pickUpstream = async (): Promise<string | undefined> => {
    if (cacheTtlMs > 0 && cache && Date.now() < cache.expiresAt) {
      return cache.url
    }
    const url = await pick()
    if (cacheTtlMs > 0) {
      cache = { url, expiresAt: Date.now() + cacheTtlMs }
    }
    return url
  }

  const invalidate = (): void => {
    cache = undefined
  }

  const shutdown = async (): Promise<void> => {
    invalidate()
    // Browse cleanup is per-pick (we destroy after each browse window),
    // so there's nothing background to tear down here. Reserved for
    // future use if the policy moves to a persistent browser.
  }

  return { pickUpstream, invalidate, shutdown }
}

async function defaultProbeLoopback(
  baseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}/api/health`, {
      method: "GET",
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function pickFromMdns(
  bonjourFactory: () => BonjourLike,
  browseWindowMs: number,
): Promise<string | undefined> {
  const bonjour = bonjourFactory()
  let resolved: string | undefined

  const browser = bonjour.find(
    {
      type: KORRI_STREAM_SERVICE_TYPE,
      protocol: KORRI_STREAM_SERVICE_PROTOCOL,
    },
    service => {
      if (resolved) return
      const candidate = candidateFromMdnsService(service)
      if (!candidate) return
      if (!candidate.capabilities.includes("source")) return
      resolved = candidate.controlUrl
    },
  )
  browser.start?.()

  await new Promise<void>(resolve => setTimeout(resolve, browseWindowMs))

  browser.stop()
  await new Promise<void>(resolve => bonjour.destroy(() => resolve()))
  return resolved
}
