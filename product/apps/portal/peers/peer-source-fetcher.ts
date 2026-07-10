/**
 * Per-peer catalog facts fetcher.
 *
 * Peer catalog federation reads each LAN peer's self-only
 * `app.catalog.snapshot` facts and re-tags entries with the peer's
 * structural source identity. This module owns that operation in isolation
 * so the coordinator can degrade peer failures without failing self reads.
 */

import { PlayStats as PlayStatsSchema } from "@platform/library/config/records/play-log"
import { logger } from "@platform/logger/logger"
import { createRemoteStreamControlClient } from "@product/apps/portal/stream/remote-stream-client"
import { Context, Effect, Layer, Schema } from "effect"
import type { CatalogEntry } from "../api/catalog/snapshot.rpc"
import type { PeerRecord } from "./peer-discovery"

export type { PeerRecord } from "./peer-discovery"

/**
 * Minimal shape returned by a peer's self-only catalog snapshot. Kept
 * structural (not class-bound) so test seams and the live client agree on
 * the same wire shape.
 */
export type PeerSourceCatalogEntry = CatalogEntry & {
  readonly displayName: string
  readonly streamable: boolean
}

export type PeerCatalogFetchResult =
  | {
      readonly status: "ready"
      readonly entries: readonly CatalogEntry[]
    }
  | {
      readonly status: "failed"
      readonly entries: readonly CatalogEntry[]
      readonly error: string
    }

export interface PeerSourceFetcherService {
  /**
   * Fetch one peer's self catalog, tag entries with the peer's
   * structural source identity, and convert each into a `CatalogEntry`.
   * Returns `[]` on any failure (timeout, network, control-disabled).
   */
  readonly fetchPeerCatalog: (
    peer: PeerRecord,
  ) => Effect.Effect<readonly CatalogEntry[], never>
  /**
   * Fetch one peer while preserving success/failure state for catalog
   * snapshot diagnostics. Never fails the caller.
   */
  readonly fetchPeerCatalogResult: (
    peer: PeerRecord,
  ) => Effect.Effect<PeerCatalogFetchResult, never>
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
   * Per-peer timeout. Default 2 seconds. 0 disables (used by tests).
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
    fetchPeerCatalog: peer =>
      fetchOnePeer(peer, createClient, timeoutMs).pipe(
        Effect.map(result => result.entries),
      ),
    fetchPeerCatalogResult: peer => fetchOnePeer(peer, createClient, timeoutMs),
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
): Effect.Effect<PeerCatalogFetchResult, never> {
  const fetchEffect = Effect.tryPromise({
    try: () => createClient(peer.controlUrl).listSourceGames(),
    catch: error => error,
  })

  const withTimeout =
    timeoutMs > 0
      ? fetchEffect.pipe(Effect.timeout(`${timeoutMs} millis`))
      : fetchEffect

  return withTimeout.pipe(
    Effect.map(entries => ({
      status: "ready" as const,
      entries: entries.map(entry =>
        peerCatalogEntryToCatalogEntry(entry, peer),
      ),
    })),
    Effect.catchCause(cause =>
      Effect.sync(() => {
        const error = String(cause)
        logger.warn(
          {
            peerHostId: peer.hostId,
            peerControlUrl: peer.controlUrl,
            error,
          },
          "app.catalog.snapshot: peer federation skipped (partial failure)",
        )
        return {
          status: "failed" as const,
          entries: [] as readonly CatalogEntry[],
          error,
        }
      }),
    ),
  )
}

/**
 * Construct a federated `CatalogEntry` from a peer's self-only catalog
 * entry. The peer's structural source identity is coordinator-relative from
 * the requester, so remote launches route back to that peer.
 */
function peerCatalogEntryToCatalogEntry(
  entry: PeerSourceCatalogEntry,
  peer: PeerRecord,
): CatalogEntry {
  const {
    displayName: _displayName,
    streamable: _streamable,
    ...catalog
  } = entry
  return {
    ...catalog,
    ...(catalog.playStats
      ? { playStats: decodePeerPlayStats(catalog.playStats) }
      : {}),
    source: {
      hostId: peer.hostId,
      controlUrl: peer.controlUrl,
      isLocal: false,
    },
  } satisfies CatalogEntry
}

function decodePeerPlayStats(
  playStats: PeerSourceCatalogEntry["playStats"],
): NonNullable<CatalogEntry["playStats"]> {
  const decoded = Schema.decodeUnknownSync(PlayStatsSchema)(playStats)
  if (
    decoded.lastPlayed !== undefined &&
    Number.isNaN(decoded.lastPlayed.getTime())
  ) {
    throw new Error("peer catalog playStats.lastPlayed is invalid")
  }
  return decoded
}
