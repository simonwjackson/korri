import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import type { ArtifactId } from "@platform/protocol/artifact/artifact"

export interface ReleaseHashIdentityTag {
  readonly kind: "hash"
  readonly value: ArtifactId
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

export interface ReleaseContentIdentityResolverOptions {
  /** Test/diagnostic hook; production callers should not rely on it. */
  readonly onHashStart?: (path: string) => void
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
  const inFlight = new Map<
    string,
    Promise<ReleaseHashIdentityTag | undefined>
  >()

  const startHash = (
    path: string,
    statKey: FileStatKey,
  ): Promise<ReleaseHashIdentityTag | undefined> => {
    const inFlightKey = serializeStatKey(statKey)
    const existing = inFlight.get(inFlightKey)
    if (existing !== undefined) return existing

    const pending = hashFile(path, options).then(identity => {
      if (identity !== undefined) {
        cache.set(path, { statKey, identity })
      }
      return identity
    })
    inFlight.set(inFlightKey, pending)
    pending.finally(() => {
      inFlight.delete(inFlightKey)
    })
    return pending
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
    const digest = hash.digest("hex")
    return { kind: "hash", value: `sha256:${digest}` as ArtifactId }
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
