import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { ArtifactId } from "@platform/protocol/artifact/artifact"

export interface ReleaseHashIdentityTag {
  readonly kind: "hash"
  readonly value: ArtifactId
}

export function releaseHashIdentityFromSha256Digest(
  digest: string,
): ReleaseHashIdentityTag {
  return { kind: "hash", value: `sha256:${digest}` as ArtifactId }
}

export function releaseHashIdentityForContent(
  content: string | Uint8Array,
): ReleaseHashIdentityTag {
  return releaseHashIdentityFromSha256Digest(
    createHash("sha256").update(content).digest("hex"),
  )
}

interface FileStatKey {
  readonly path: string
  readonly size: number
  readonly mtimeMs: number
}

interface CacheEntry {
  readonly statKey: FileStatKey
  readonly identity: ReleaseHashIdentityTag
}

interface HashQueueItem {
  readonly path: string
  readonly statKey: FileStatKey
  readonly resolve: (identity: ReleaseHashIdentityTag | undefined) => void
}

export interface ReleaseContentIdentityResolverOptions {
  /** Test/diagnostic hook; production callers should not rely on it. */
  readonly onHashStart?: (path: string) => void
  /** Defaults to 2 to keep handheld storage responsive during first scans. */
  readonly maxConcurrentHashes?: number
  /**
   * JSON cache path. Defaults to Korri's XDG cache directory; pass false to
   * disable persistence in tests or diagnostics.
   */
  readonly cachePath?: string | false
}

export interface ReleaseContentIdentityResolver {
  readonly resolveFileHash: (
    path: string,
  ) => Promise<ReleaseHashIdentityTag | undefined>
  readonly cachedFileHashOrQueue: (
    path: string,
  ) => Promise<ReleaseHashIdentityTag | undefined>
}

export function createReleaseContentIdentityResolver(
  options: ReleaseContentIdentityResolverOptions = {},
): ReleaseContentIdentityResolver {
  const cache = new Map<string, CacheEntry>()
  const persistentCachePath =
    options.cachePath === false
      ? undefined
      : (options.cachePath ?? defaultPersistentCachePath(process.env))
  let persistentCacheLoad: Promise<void> | undefined
  let persistTail: Promise<void> = Promise.resolve()
  const inFlight = new Map<
    string,
    Promise<ReleaseHashIdentityTag | undefined>
  >()
  const queue: HashQueueItem[] = []
  let activeHashes = 0
  const maxConcurrentHashes = Math.max(1, options.maxConcurrentHashes ?? 2)

  const drainQueue = () => {
    while (activeHashes < maxConcurrentHashes) {
      const item = queue.shift()
      if (item === undefined) return
      activeHashes += 1
      void hashFile(item.path, options)
        .then(identity => {
          if (identity !== undefined) {
            cache.set(item.path, { statKey: item.statKey, identity })
            schedulePersistentCacheWrite()
          }
          item.resolve(identity)
        })
        .catch(() => item.resolve(undefined))
        .finally(() => {
          activeHashes -= 1
          inFlight.delete(serializeStatKey(item.statKey))
          drainQueue()
        })
    }
  }

  const startHash = (
    path: string,
    statKey: FileStatKey,
  ): Promise<ReleaseHashIdentityTag | undefined> => {
    const inFlightKey = serializeStatKey(statKey)
    const existing = inFlight.get(inFlightKey)
    if (existing !== undefined) return existing

    const pending = new Promise<ReleaseHashIdentityTag | undefined>(resolve => {
      queue.push({ path, statKey, resolve })
      drainQueue()
    })
    inFlight.set(inFlightKey, pending)
    return pending
  }

  const loadPersistentCacheOnce = async () => {
    if (persistentCacheLoad === undefined) {
      persistentCacheLoad = (async () => {
        if (persistentCachePath === undefined) return
        for (const entry of await readPersistentCache(persistentCachePath)) {
          cache.set(entry.statKey.path, entry)
        }
      })()
    }
    await persistentCacheLoad
  }

  const schedulePersistentCacheWrite = () => {
    if (persistentCachePath === undefined) return
    const entries = Array.from(cache.values())
    persistTail = persistTail
      .then(() => writePersistentCache(persistentCachePath, entries))
      .catch(() => undefined)
  }

  const cachedIdentityFor = async (
    path: string,
  ): Promise<
    | {
        readonly statKey: FileStatKey
        readonly identity?: ReleaseHashIdentityTag
      }
    | undefined
  > => {
    await loadPersistentCacheOnce()
    const statKey = await statKeyForFile(path)
    if (statKey === undefined) return undefined

    const cached = cache.get(path)
    if (cached !== undefined && sameStatKey(cached.statKey, statKey)) {
      return { statKey, identity: cached.identity }
    }
    return { statKey }
  }

  return {
    resolveFileHash: async path => {
      const cached = await cachedIdentityFor(path)
      if (cached === undefined) return undefined
      if (cached.identity !== undefined) return cached.identity
      return await startHash(path, cached.statKey)
    },

    cachedFileHashOrQueue: async path => {
      const cached = await cachedIdentityFor(path)
      if (cached === undefined) return undefined
      if (cached.identity !== undefined) return cached.identity
      void startHash(path, cached.statKey)
      return undefined
    },
  }
}

export const defaultReleaseContentIdentityResolver =
  createReleaseContentIdentityResolver()

const PERSISTENT_CACHE_VERSION = 1

interface PersistentCacheFile {
  readonly version: 1
  readonly entries: readonly CacheEntry[]
}

async function readPersistentCache(
  path: string,
): Promise<readonly CacheEntry[]> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown
    if (!isPersistentCacheFile(parsed)) return []
    return parsed.entries
  } catch {
    return []
  }
}

async function writePersistentCache(
  path: string,
  entries: readonly CacheEntry[],
): Promise<void> {
  const payload: PersistentCacheFile = {
    version: PERSISTENT_CACHE_VERSION,
    entries,
  }
  const directory = dirname(path)
  const tempPath = `${path}.${process.pid}.tmp`
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(tempPath, `${JSON.stringify(payload)}\n`, { mode: 0o600 })
  await rename(tempPath, path)
}

function isPersistentCacheFile(value: unknown): value is PersistentCacheFile {
  if (typeof value !== "object" || value === null) return false
  const record = value as {
    readonly version?: unknown
    readonly entries?: unknown
  }
  return (
    record.version === PERSISTENT_CACHE_VERSION &&
    Array.isArray(record.entries) &&
    record.entries.every(isCacheEntry)
  )
}

function isCacheEntry(value: unknown): value is CacheEntry {
  if (typeof value !== "object" || value === null) return false
  const record = value as {
    readonly statKey?: unknown
    readonly identity?: unknown
  }
  return (
    isFileStatKey(record.statKey) && isReleaseHashIdentityTag(record.identity)
  )
}

function isFileStatKey(value: unknown): value is FileStatKey {
  if (typeof value !== "object" || value === null) return false
  const record = value as {
    readonly path?: unknown
    readonly size?: unknown
    readonly mtimeMs?: unknown
  }
  return (
    typeof record.path === "string" &&
    typeof record.size === "number" &&
    typeof record.mtimeMs === "number"
  )
}

function isReleaseHashIdentityTag(
  value: unknown,
): value is ReleaseHashIdentityTag {
  if (typeof value !== "object" || value === null) return false
  const record = value as { readonly kind?: unknown; readonly value?: unknown }
  return (
    record.kind === "hash" &&
    typeof record.value === "string" &&
    /^sha256:[a-f0-9]{64}$/.test(record.value)
  )
}

function defaultPersistentCachePath(env: NodeJS.ProcessEnv): string {
  const cacheRoot =
    env.KORRI_RELEASE_IDENTITY_CACHE_DIR ??
    env.XDG_CACHE_HOME ??
    (env.HOME ? join(env.HOME, ".cache") : "/tmp")
  return join(cacheRoot, "korri", "release-content-identity-v1.json")
}

async function statKeyForFile(path: string): Promise<FileStatKey | undefined> {
  try {
    const stats = await stat(path)
    if (!stats.isFile()) return undefined
    return { path, size: stats.size, mtimeMs: stats.mtimeMs }
  } catch {
    return undefined
  }
}

async function hashFile(
  path: string,
  options: ReleaseContentIdentityResolverOptions,
): Promise<ReleaseHashIdentityTag | undefined> {
  try {
    options.onHashStart?.(path)
    const hash = createHash("sha256")
    for await (const chunk of createReadStream(path)) {
      hash.update(chunk)
    }
    return releaseHashIdentityFromSha256Digest(hash.digest("hex"))
  } catch {
    return undefined
  }
}

function sameStatKey(left: FileStatKey, right: FileStatKey): boolean {
  return (
    left.path === right.path &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  )
}

function serializeStatKey(statKey: FileStatKey): string {
  return `${statKey.path}\0${statKey.size}\0${statKey.mtimeMs}`
}
