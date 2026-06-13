import { makeLocalEntrySource, type EntrySource } from "@platform/api/rpc/entry-source"
import type { PeerRecord } from "./peer-discovery"

export type CatalogPeerStatus = "loading" | "ready" | "failed"

export interface CatalogPeerState {
  readonly hostId: string
  readonly displayName: string
  readonly controlUrl: string
  readonly isLocal: boolean
  readonly caps: readonly string[]
  readonly status: CatalogPeerStatus
  readonly entryCount: number
  readonly updatedAt: string
  readonly error?: string
}

export function makeSelfCatalogPeer(options: {
  readonly env?: NodeJS.ProcessEnv
  readonly entryCount: number
  readonly updatedAt?: string
  readonly status?: CatalogPeerStatus
  readonly error?: string
}): CatalogPeerState {
  const source: EntrySource = makeLocalEntrySource(options.env ?? process.env)
  return {
    hostId: source.hostId,
    displayName: `${source.hostId} (self)`,
    controlUrl: source.controlUrl,
    isLocal: true,
    caps: ["source"],
    status: options.status ?? "ready",
    entryCount: options.entryCount,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    ...(options.error ? { error: options.error } : {}),
  }
}

export function catalogPeerFromRecord(
  peer: PeerRecord,
  options: {
    readonly status: CatalogPeerStatus
    readonly entryCount: number
    readonly updatedAt?: string
    readonly error?: string
  },
): CatalogPeerState {
  return {
    hostId: peer.hostId,
    displayName: peer.displayName,
    controlUrl: peer.controlUrl,
    isLocal: false,
    caps: peer.caps,
    status: options.status,
    entryCount: options.entryCount,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    ...(options.error ? { error: options.error } : {}),
  }
}
