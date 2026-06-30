import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import type { XdgPathEnv } from "@platform/config/xdg-paths"
import type { GameAssetRecord } from "@platform/library/config/records/game-asset"
import { gameAssetBlobPath } from "./game-assets-service"

/**
 * Content-addressed validation cache for durable game-asset blobs.
 *
 * Game-asset blobs are stored content-addressed: the asset id is
 * `sha256:<digest of the bytes>`, and the blob store is immutable. Both the
 * HTTP serve path (`/api/game-assets/*`) and catalog hydration previously
 * re-read AND re-SHA256-hashed the entire blob on every access. With many
 * image-backed games that is a real, repeated CPU cost on the Bun process:
 * during rail navigation each newly revealed tile triggers a fresh serve, and
 * every catalog hydration/refresh re-hashes every assigned tile/wide blob.
 *
 * This cache hashes a given blob at most once per process. A blob is only
 * trusted after a verified digest match, and the trust is keyed by the file's
 * size and mtime, so an out-of-band rewrite (different size or mtime) forces a
 * re-hash. The integrity guarantee is unchanged — a mismatch is still rejected;
 * only the redundant re-hashing of an already-verified blob is removed.
 */

interface ValidatedBlob {
  readonly size: number
  readonly mtimeMs: number
}

const validatedBlobs = new Map<string, ValidatedBlob>()

function expectedDigest(asset: Pick<GameAssetRecord, "id">): string {
  return asset.id.replace(/^sha256:/, "")
}

function isCachedValid(path: string, size: number, mtimeMs: number): boolean {
  const cached = validatedBlobs.get(path)
  return (
    cached !== undefined && cached.size === size && cached.mtimeMs === mtimeMs
  )
}

function recordValid(path: string, size: number, mtimeMs: number): void {
  validatedBlobs.set(path, { size, mtimeMs })
}

/**
 * Read a durable game-asset blob, returning its bytes only when they satisfy
 * the content-addressed id. The full-file SHA256 is skipped when the blob was
 * already verified for the same size + mtime in this process.
 */
export async function readValidatedGameAssetBytes(
  env: XdgPathEnv,
  asset: GameAssetRecord,
): Promise<Buffer | null> {
  const path = gameAssetBlobPath(env, asset)
  try {
    const fileStat = await stat(path)
    if (!fileStat.isFile() || fileStat.size !== asset.byteSize) return null

    const body = await readFile(path)
    if (body.byteLength !== asset.byteSize) return null

    if (isCachedValid(path, fileStat.size, fileStat.mtimeMs)) return body

    const digest = createHash("sha256").update(body).digest("hex")
    if (digest !== expectedDigest(asset)) return null

    recordValid(path, fileStat.size, fileStat.mtimeMs)
    return body
  } catch {
    return null
  }
}

/**
 * Whether a durable game-asset blob matches its content-addressed id. Hashing
 * is skipped on a cache hit, so a blob already verified during a serve (or a
 * prior hydration) does not need to be re-read for catalog hydration.
 */
export async function isGameAssetBlobValid(
  env: XdgPathEnv,
  asset: GameAssetRecord,
): Promise<boolean> {
  const path = gameAssetBlobPath(env, asset)
  try {
    const fileStat = await stat(path)
    if (!fileStat.isFile()) return false

    if (isCachedValid(path, fileStat.size, fileStat.mtimeMs)) return true

    const body = await readFile(path)
    const digest = createHash("sha256").update(body).digest("hex")
    if (digest !== expectedDigest(asset)) return false

    recordValid(path, fileStat.size, fileStat.mtimeMs)
    return true
  } catch {
    return false
  }
}

/** Test seam: drop all cached validations. */
export function resetGameAssetBlobCache(): void {
  validatedBlobs.clear()
}
