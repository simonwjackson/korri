/**
 * Durable peer memory.
 *
 * mDNS only discovers peers on the local link, so the set evaporates the
 * moment a node leaves the home LAN. This store remembers every peer a node
 * has met and reloads it on boot, so the node can re-federate with those peers
 * by name (resolved by LAN DNS/mDNS at home, or an overlay resolver such as
 * Tailscale MagicDNS when away) without any hand-maintained list.
 *
 * Memory is durable state, keyed by `hostId` (the stable identity; `controlUrl`
 * is refreshed as it changes). Peers are kept indefinitely — a powered-off
 * device is still fleet membership. Liveness is NOT asserted here; the catalog
 * fan-out decides ready/failed per fetch. The local host is never stored.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { korriStatePath } from "@platform/config/xdg-paths"
import { logger } from "@platform/logger/logger"

export type PeerSource = "mdns" | "gossip" | "manual"

export interface StoredPeer {
  readonly hostId: string
  readonly controlUrl: string
  readonly displayName: string
  readonly caps: readonly string[]
  readonly firstSeenAt: string
  readonly lastSeenAt: string
  readonly source: PeerSource
}

export interface RememberPeerInput {
  readonly hostId: string
  readonly controlUrl: string
  readonly displayName: string
  readonly caps: readonly string[]
  readonly source: PeerSource
}

export interface PeerStore {
  /** Load remembered peers. Returns `[]` on missing or corrupt state. */
  readonly load: () => Promise<readonly StoredPeer[]>
  /**
   * Upsert a peer by `hostId`, preserving its original `firstSeenAt` and
   * bumping `lastSeenAt`. The local host is never persisted.
   */
  readonly remember: (peer: RememberPeerInput) => Promise<void>
  /** Remove a peer by `hostId`. */
  readonly forget: (hostId: string) => Promise<void>
}

export interface FilePeerStoreOptions {
  readonly env?: NodeJS.ProcessEnv
  /** This server's own host id; never persisted. */
  readonly localHostId?: string
  /** Clock seam for deterministic tests. */
  readonly now?: () => string
}

export function makeFilePeerStore(
  options: FilePeerStoreOptions = {},
): PeerStore {
  const env = options.env ?? process.env
  const now = options.now ?? (() => new Date().toISOString())
  const path = korriStatePath(env, "peers.json")

  // Serialize read-modify-write so concurrent remember/forget calls within the
  // process don't lose updates (the file is replaced atomically per write).
  let queue: Promise<unknown> = Promise.resolve()
  const serialize = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task)
    queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const readAll = async (): Promise<StoredPeer[]> => {
    let raw: string
    try {
      raw = await readFile(path, "utf8")
    } catch {
      return []
    }
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter(isStoredPeer)
    } catch {
      logger.warn({ path }, "peer-store: ignoring corrupt peers file")
      return []
    }
  }

  const writeAll = async (peers: readonly StoredPeer[]): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(peers, null, 2)}\n`, "utf8")
    await rename(tmp, path)
  }

  return {
    load: () => serialize(readAll),
    remember: peer =>
      serialize(async () => {
        if (options.localHostId && peer.hostId === options.localHostId) return
        const existing = await readAll()
        const ts = now()
        const prior = existing.find(p => p.hostId === peer.hostId)
        const next: StoredPeer = {
          hostId: peer.hostId,
          controlUrl: peer.controlUrl,
          displayName: peer.displayName,
          caps: [...peer.caps],
          firstSeenAt: prior?.firstSeenAt ?? ts,
          lastSeenAt: ts,
          source: peer.source,
        }
        await writeAll([
          ...existing.filter(p => p.hostId !== peer.hostId),
          next,
        ])
      }),
    forget: hostId =>
      serialize(async () => {
        const existing = await readAll()
        if (!existing.some(p => p.hostId === hostId)) return
        await writeAll(existing.filter(p => p.hostId !== hostId))
      }),
  }
}

function isStoredPeer(value: unknown): value is StoredPeer {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.hostId === "string" &&
    typeof v.controlUrl === "string" &&
    typeof v.displayName === "string" &&
    Array.isArray(v.caps) &&
    typeof v.firstSeenAt === "string" &&
    typeof v.lastSeenAt === "string" &&
    (v.source === "mdns" || v.source === "gossip" || v.source === "manual")
  )
}
