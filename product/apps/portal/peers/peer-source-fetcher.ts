/**
 * Per-peer source catalog fetcher.
 *
 * The fan-out in `app.library.list` (U4) reads each LAN peer's
 * `app.source.list` and re-tags the entries with the peer's structural
 * source identity. This module owns that one operation in isolation
 * so:
 *
 *   1. The fan-out handler stays a small loop over `peers` and a
 *      single mapping step.
 *   2. Tests can inject a deterministic client factory instead of
 *      standing up a real HTTP server per peer.
 *
 * Per-peer failure handling is built in: timeouts, network errors,
 * and `host-control-disabled` responses all collapse to `[]` so the
 * fan-out's `Effect.all` never observes a peer-induced error. The
 * federated response degrades gracefully (R9 / AE2).
 */

import { logger } from "@platform/logger/logger"
import { createRemoteStreamControlClient } from "@product/apps/portal/stream/remote-stream-client"
import { Context, Effect, Layer } from "effect"
import type { LibraryEntry } from "../api/library/list.rpc"
import type { PeerRecord } from "./peer-discovery"

export type { PeerRecord } from "./peer-discovery"

/**
 * Minimal shape returned by a peer's `app.source.list`. Mirrors
 * `SourceCatalogGame` but kept structural (not class-bound) so test
 * stubs and the live client agree on the same wire shape.
 */
export interface PeerSourceCatalogEntry {
  readonly id: string
  readonly displayName: string
  readonly streamable: boolean
  readonly source?: {
    readonly hostId: string
    readonly controlUrl: string
    readonly isLocal: boolean
  }
}

export interface PeerSourceFetcherService {
  /**
   * Fetch one peer's source catalog, tag entries with the peer's
   * structural source identity, and convert each into a `LibraryEntry`.
   * Returns `[]` on any failure (timeout, network, control-disabled).
   */
  readonly fetchPeerCatalog: (
    peer: PeerRecord,
  ) => Effect.Effect<readonly LibraryEntry[], never>
}

export class PeerSourceFetcher extends Context.Service<
  PeerSourceFetcher,
  PeerSourceFetcherService
>()("PeerSourceFetcher") {}

interface PeerSourceClient {
  readonly listSourceGames: () => Promise<readonly PeerSourceCatalogEntry[]>
}

export interface PeerSourceFetcherLiveOptions {
  readonly createClient?: (controlUrl: string) => PeerSourceClient
  /**
   * Per-peer timeout. Default 2 seconds — matches plan §"Fan-out
   * policy in app.library.list". 0 disables (used by tests).
   */
  readonly timeoutMs?: number
}

const DEFAULT_PEER_TIMEOUT_MS = 2000

export function makePeerSourceFetcherLive(
  options: PeerSourceFetcherLiveOptions = {},
): PeerSourceFetcherService {
  const createClient = options.createClient ?? defaultCreateClient
  const timeoutMs = options.timeoutMs ?? DEFAULT_PEER_TIMEOUT_MS

  return {
    fetchPeerCatalog: peer => fetchOnePeer(peer, createClient, timeoutMs),
  }
}

export const PeerSourceFetcherLive: Layer.Layer<PeerSourceFetcher> =
  Layer.succeed(PeerSourceFetcher)(makePeerSourceFetcherLive())

function defaultCreateClient(controlUrl: string): PeerSourceClient {
  return createRemoteStreamControlClient(controlUrl)
}

function fetchOnePeer(
  peer: PeerRecord,
  createClient: (controlUrl: string) => PeerSourceClient,
  timeoutMs: number,
): Effect.Effect<readonly LibraryEntry[], never> {
  const fetchEffect = Effect.tryPromise({
    try: () => createClient(peer.controlUrl).listSourceGames(),
    catch: error => error,
  })

  const withTimeout =
    timeoutMs > 0
      ? fetchEffect.pipe(Effect.timeout(`${timeoutMs} millis`))
      : fetchEffect

  return withTimeout.pipe(
    Effect.map(entries =>
      entries.map(entry => peerCatalogEntryToLibraryEntry(entry, peer)),
    ),
    // `Effect.catchCause` collapses BOTH the inner client failure (e.g.
    // ECONNREFUSED bubbled out of `tryPromise`'s `catch`) AND the
    // `Effect.timeout` failure into the partial-failure path.
    Effect.catchCause(cause =>
      Effect.sync(() => {
        logger.warn(
          {
            peerHostId: peer.hostId,
            peerControlUrl: peer.controlUrl,
            error: String(cause),
          },
          "app.library.list: peer fan-out skipped (partial failure)",
        )
        return [] as readonly LibraryEntry[]
      }),
    ),
  )
}

/**
 * Construct a federated `LibraryEntry` from a peer's
 * `SourceCatalogGame`. Many `GameRecord` fields (system, contentPath,
 * full metadata, media art) are not exposed by `app.source.list` —
 * minimal placeholders are used here; v1 UX explicitly defers richer
 * remote-entry rendering (see scope boundaries in the origin
 * requirements doc).
 */
function peerCatalogEntryToLibraryEntry(
  entry: PeerSourceCatalogEntry,
  peer: PeerRecord,
): LibraryEntry {
  return {
    id: entry.id,
    itemId: entry.id,
    title: entry.displayName,
    system: "remote",
    releases: [
      {
        id: "remote",
        system: "remote",
        launchable: entry.streamable,
      },
    ],
    launchable: entry.streamable,
    metadata: { name: entry.displayName },
    source: {
      hostId: peer.hostId,
      controlUrl: peer.controlUrl,
      isLocal: false,
    },
  } satisfies LibraryEntry
}
