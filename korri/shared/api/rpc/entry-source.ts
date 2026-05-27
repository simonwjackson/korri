/**
 * Structural source-identity tag attached to every entry that flows
 * through `app.library.list` and `app.source.list`.
 *
 * Federation routing reads this tag to decide whether an entry is the
 * local server's own (use the local launch path) or contributed by a
 * peer (use the remote stream-prepare path against `source.controlUrl`).
 * Per the `pointer-aware-spatial-navigation` learning, identity must be
 * structural — never reconstructed from heuristics over (hostId, gameId)
 * \u00d7 (peer-set, current-connection).
 *
 * `hostId` is the advertised host identifier (`KORRI_STREAM_ADVERTISE_HOST_ID`)
 * — also the mDNS TXT `hostId`, which is what makes "this entry came
 * from the peer with mDNS hostId X" verifiable across the system.
 *
 * `controlUrl` is the absolute URL of the server that owns this entry —
 * `http://host:port`, no trailing slash. Used by the fan-out client
 * and the launch router to reach the source peer's RPC surface.
 *
 * `isLocal` is true exactly when the entry was produced by THIS server
 * (not a remote peer). Computed at the source-tag composition site,
 * not derived from `controlUrl` matching loopback.
 */

import * as os from "node:os"
import { Schema } from "effect"

export class EntrySource extends Schema.Class<EntrySource>("EntrySource")({
  hostId: Schema.String,
  controlUrl: Schema.String,
  isLocal: Schema.Boolean,
}) {}

export interface LocalIdentityEnv {
  readonly KORRI_STREAM_ADVERTISE_HOST_ID?: string
  readonly KORRI_SERVER_ID?: string
  readonly KORRI_PUBLIC_API_BASE_URL?: string
  readonly HOST?: string
  readonly PORT?: string
  // Allow passing `process.env` (or any read-only env record) directly
  // without weak-type complaints.
  readonly [key: string]: string | undefined
}

/**
 * Build the `EntrySource` tag for entries served by THIS process.
 *
 * Centralized so the wire shape stays consistent across `app.library.list`,
 * `app.source.list`, and any future server-side surface that emits
 * library entries. Read-once on entry production; do not cache across
 * env changes.
 */
export function makeLocalEntrySource(env: LocalIdentityEnv): EntrySource {
  return new EntrySource({
    hostId: resolveHostId(env),
    controlUrl: resolveControlUrl(env),
    isLocal: true,
  })
}

function resolveHostId(env: LocalIdentityEnv): string {
  return (
    optionalEnv(env.KORRI_STREAM_ADVERTISE_HOST_ID) ??
    optionalEnv(env.KORRI_SERVER_ID) ??
    os.hostname()
  )
}

function resolveControlUrl(env: LocalIdentityEnv): string {
  const explicit = optionalEnv(env.KORRI_PUBLIC_API_BASE_URL)
  if (explicit) return stripTrailingSlash(explicit)
  const host = optionalEnv(env.HOST) ?? "127.0.0.1"
  const port = optionalEnv(env.PORT) ?? "3001"
  return `http://${host}:${port}`
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}
