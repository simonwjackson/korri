/**
 * Structural source-identity tag attached to every entry that flows
 * through `app.catalog.snapshot` and `app.catalog.snapshot`.
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
import { EntrySource } from "./entry-source-core"

export { EntrySource }

export interface LocalIdentityEnv {
  readonly KORRI_STREAM_ADVERTISE_HOST_ID?: string
  readonly KORRI_DAEMON_ID?: string
  readonly KORRI_PUBLIC_API_BASE_URL?: string
  readonly HOST?: string
  readonly PORT?: string
  // Allow passing `process.env` (or any read-only env record) directly
  // without weak-type complaints.
  readonly [key: string]: string | undefined
}

/**
 * Options accepted by `makeLocalEntrySource` for test injection. The
 * defaults read live host data via `os.networkInterfaces()`; tests
 * inject a deterministic map.
 */
export interface MakeLocalEntrySourceOptions {
  readonly networkInterfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>
}

/**
 * Build the `EntrySource` tag for entries served by THIS process.
 *
 * Centralized so the wire shape stays consistent across `app.catalog.snapshot`,
 * `app.catalog.snapshot`, and any future server-side surface that emits
 * library entries. Read-once on entry production; do not cache across
 * env changes.
 *
 * Wildcard-bind awareness: federation v1 defaults `HOST=0.0.0.0` on
 * library-bearing hosts (see `product/systems/nixos/images/headless.nix`). A literal
 * "0.0.0.0" in `controlUrl` is meaningless on the wire — it's the
 * bind address, not an address any client can dial. When `HOST` is
 * a wildcard and no explicit `KORRI_PUBLIC_API_BASE_URL` overrides
 * it, we substitute the first non-loopback IPv4 from the host's
 * network interfaces, falling back to `127.0.0.1` only on hosts
 * with no routable interface. `peer-source-fetcher.ts` already
 * overwrites peer-emitted `controlUrl` with the mDNS-discovered
 * address, so this fix is primarily about emitting a syntactically
 * meaningful value on the local side.
 */
export function makeLocalEntrySource(
  env: LocalIdentityEnv,
  options: MakeLocalEntrySourceOptions = {},
): EntrySource {
  return new EntrySource({
    hostId: resolveHostId(env),
    controlUrl: resolveControlUrl(env, options),
    isLocal: true,
  })
}

function resolveHostId(env: LocalIdentityEnv): string {
  return (
    optionalEnv(env.KORRI_STREAM_ADVERTISE_HOST_ID) ??
    optionalEnv(env.KORRI_DAEMON_ID) ??
    os.hostname()
  )
}

function resolveControlUrl(
  env: LocalIdentityEnv,
  options: MakeLocalEntrySourceOptions,
): string {
  const explicit = optionalEnv(env.KORRI_PUBLIC_API_BASE_URL)
  if (explicit) return stripTrailingSlash(explicit)
  const port = optionalEnv(env.PORT) ?? "3001"
  const rawHost = optionalEnv(env.HOST) ?? "127.0.0.1"
  const host = isWildcardHost(rawHost)
    ? routableHostOrLoopback(options.networkInterfaces)
    : rawHost
  return `http://${host}:${port}`
}

function isWildcardHost(host: string): boolean {
  // Cover the IPv4 and IPv6 unspecified addresses. Brackets handled
  // even though we don't currently re-emit bracketed IPv6 here — the
  // server's HOST env is always a bare address in practice.
  return host === "0.0.0.0" || host === "::" || host === "[::]"
}

function routableHostOrLoopback(
  networkInterfaces?: () => NodeJS.Dict<os.NetworkInterfaceInfo[]>,
): string {
  const ifaces = (networkInterfaces ?? os.networkInterfaces)()
  for (const name of Object.keys(ifaces)) {
    const infos = ifaces[name] ?? []
    for (const info of infos) {
      if (info.family !== "IPv4") continue
      if (info.internal) continue
      if (!info.address) continue
      return info.address
    }
  }
  return "127.0.0.1"
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url
}
