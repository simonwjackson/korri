/**
 * Server-side mDNS peer discovery.
 *
 * Every korrid browses the LAN for other library-bearing servers
 * (`_korri-stream._tcp` with `caps: "source"` in TXT) and maintains an
 * in-memory peer set, used by `app.catalog.snapshot` fan-out (U4) and the
 * launch router (U5).
 *
 * Filters:
 *   - `caps` must include `"source"`. Stream-only servers (legacy
 *     pre-federation pattern) are excluded — they expose no library.
 *   - The local advertisement is excluded by matching `hostId` against
 *     this server's own `KORRI_STREAM_ADVERTISE_HOST_ID` (passed via
 *     `localHostId`). Without self-filtering, fan-out would re-enter
 *     the local handler and double-count entries.
 *
 * State lives in a `SubscriptionRef<Map<controlUrl, PeerRecord>>` so
 * consumers can read the current set OR subscribe to the changes
 * stream. The forked `Stream.runForEach` consumer lives for the
 * scope's lifetime (per the boot-scoped-control-plane learning, one
 * peer-set per server process).
 */

import type { StreamHostCandidate } from "@platform/stream/lan-stream-discovery"
import {
  type BonjourLike,
  watchStreamHosts,
} from "@platform/stream/lan-stream-discovery"
import { Context, Effect, Layer, Stream, SubscriptionRef } from "effect"
import type { PeerStore, StoredPeer } from "./peer-store"

export type {
  BonjourLike,
  BrowserLike,
} from "@platform/stream/lan-stream-discovery"

export interface PeerRecord {
  readonly hostId: string
  readonly controlUrl: string
  readonly displayName: string
  readonly caps: readonly string[]
}

// fallow-ignore-next-line unused-types
export interface PeerDiscoveryService {
  /**
   * SubscriptionRef of the current peer set keyed by `controlUrl`.
   * Consumers read the snapshot via `SubscriptionRef.get` and can
   * subscribe to changes via `.changes` if live updates are needed.
   */
  readonly peers: SubscriptionRef.SubscriptionRef<
    ReadonlyMap<string, PeerRecord>
  >
}

export class PeerDiscovery extends Context.Service<
  PeerDiscovery,
  PeerDiscoveryService
>()("PeerDiscovery") {}

export interface PeerDiscoveryLayerOptions {
  /**
   * Inject a custom `BonjourLike` factory for tests. Defaults to a
   * fresh `bonjour-service` instance per layer construction.
   */
  readonly bonjourFactory?: () => BonjourLike
  /**
   * This server's own advertised `hostId`. Peers with a matching hostId
   * are excluded from the federation set (the local server already
   * handles its own entries; including itself would double-count).
   */
  readonly localHostId?: string
  /**
   * Durable peer memory. When provided, remembered peers seed the peer set on
   * boot and every mDNS appearance writes through to the store, so the node
   * keeps federating with known peers across restarts and off the LAN.
   */
  readonly peerStore?: PeerStore
}

export function makePeerDiscoveryLayer(
  options: PeerDiscoveryLayerOptions = {},
): Layer.Layer<PeerDiscovery> {
  return Layer.effect(PeerDiscovery)(
    Effect.gen(function* () {
      const peersRef = yield* SubscriptionRef.make<
        ReadonlyMap<string, PeerRecord>
      >(new Map())

      const streamOptions = options.bonjourFactory
        ? { bonjourFactory: options.bonjourFactory }
        : {}

      // Seed from durable memory before the live browser starts, so a node
      // boots already knowing the peers it has met — even off the LAN.
      const store = options.peerStore
      if (store) {
        const remembered = yield* Effect.promise(() =>
          store.load().catch(() => [] as readonly StoredPeer[]),
        )
        if (remembered.length > 0) {
          yield* SubscriptionRef.update(peersRef, prev =>
            seedRemembered(prev, remembered, options.localHostId),
          )
        }
      }

      // Forked, scope-bound consumer. When the layer scope closes
      // (server shutdown), the stream's bonjour browser is destroyed.
      yield* Effect.forkScoped(
        Stream.runForEach(watchStreamHosts(streamOptions), event =>
          Effect.gen(function* () {
            yield* SubscriptionRef.update(peersRef, prev =>
              applyEvent(prev, event, options.localHostId),
            )
            // Write-through: remember every federatable mDNS appearance so the
            // peer survives a restart. Forked so a slow disk never stalls
            // discovery; failures are swallowed (memory is best-effort).
            if (
              store &&
              event.kind === "appear" &&
              federatable(event.candidate, options.localHostId)
            ) {
              const c = event.candidate
              yield* Effect.forkScoped(
                Effect.promise(() =>
                  store
                    .remember({
                      hostId: c.id,
                      controlUrl: c.controlUrl,
                      displayName: c.name,
                      caps: c.capabilities,
                      source: "mdns",
                    })
                    .catch(() => undefined),
                ),
              )
            }
          }),
        ),
      )

      return { peers: peersRef }
    }),
  )
}

function applyEvent(
  prev: ReadonlyMap<string, PeerRecord>,
  event: import("@platform/stream/lan-stream-discovery").StreamHostEvent,
  localHostId: string | undefined,
): ReadonlyMap<string, PeerRecord> {
  if (event.kind === "disappear") {
    if (!prev.has(event.controlUrl)) return prev
    const next = new Map(prev)
    next.delete(event.controlUrl)
    return next
  }

  const c = event.candidate
  // Self-filter + capability filter: a server never includes its own
  // advertisement, and only library-bearing peers (caps include "source")
  // join the federation set.
  if (!federatable(c, localHostId)) return prev

  const record: PeerRecord = {
    hostId: c.id,
    controlUrl: c.controlUrl,
    displayName: c.name,
    caps: c.capabilities,
  }
  // Dedupe by controlUrl: repeated TTL refreshes don't churn the map.
  if (peerRecordsEqual(prev.get(c.controlUrl), record)) return prev
  const next = new Map(prev)
  next.set(c.controlUrl, record)
  return next
}

/**
 * Empty peer-discovery layer for tests and source-only deployments
 * that should not browse the LAN. Returns an immutable empty peer set;
 * no bonjour browser is started.
 */
export const PeerDiscoveryNoop: Layer.Layer<PeerDiscovery> = Layer.effect(
  PeerDiscovery,
)(
  Effect.gen(function* () {
    const peers = yield* SubscriptionRef.make<ReadonlyMap<string, PeerRecord>>(
      new Map(),
    )
    return { peers }
  }),
)

/**
 * A discovered candidate joins the federation set only when it is not this
 * server and it advertises the `source` capability. Shared by live mDNS events
 * and durable-memory seeding so both gate identically.
 */
function federatable(
  candidate: Pick<StreamHostCandidate, "id" | "capabilities">,
  localHostId: string | undefined,
): boolean {
  if (localHostId && candidate.id === localHostId) return false
  return candidate.capabilities.includes("source")
}

/**
 * Seed the peer set from durable memory, keyed by `controlUrl` to match live
 * discovery, applying the same self/capability gate.
 */
function seedRemembered(
  prev: ReadonlyMap<string, PeerRecord>,
  remembered: readonly StoredPeer[],
  localHostId: string | undefined,
): ReadonlyMap<string, PeerRecord> {
  const next = new Map(prev)
  for (const peer of remembered) {
    if (
      !federatable({ id: peer.hostId, capabilities: peer.caps }, localHostId)
    ) {
      continue
    }
    if (next.has(peer.controlUrl)) continue
    next.set(peer.controlUrl, {
      hostId: peer.hostId,
      controlUrl: peer.controlUrl,
      displayName: peer.displayName,
      caps: peer.caps,
    })
  }
  return next
}

function peerRecordsEqual(a: PeerRecord | undefined, b: PeerRecord): boolean {
  if (!a) return false
  if (a.hostId !== b.hostId) return false
  if (a.controlUrl !== b.controlUrl) return false
  if (a.displayName !== b.displayName) return false
  if (a.caps.length !== b.caps.length) return false
  for (let i = 0; i < a.caps.length; i++) {
    if (a.caps[i] !== b.caps[i]) return false
  }
  return true
}
