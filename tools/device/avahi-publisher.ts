/**
 * mDNS publisher that delegates to `avahi-publish-service`.
 *
 * Used on hosts where `avahi-daemon` already owns UDP 5353 — running the
 * embedded `bonjour-service` publisher alongside causes both processes to
 * answer mDNS queries, and the avahi response (which doesn't know about
 * the service) races ahead with NXDOMAIN, hiding the real records.
 *
 * Detection lives in `lan-stream-advertise.ts`; this module only knows
 * how to publish via the avahi CLI.
 */

import { existsSync } from "node:fs"
import type { Subprocess } from "bun"

const DEFAULT_AVAHI_SOCKETS = [
  "/run/avahi-daemon/socket",
  "/var/run/avahi-daemon/socket",
] as const

const DEFAULT_AVAHI_CLI = "avahi-publish-service"

/**
 * Thrown when `avahi-publish-service` cannot be found on `$PATH`. Surfaced
 * as a distinct error so callers can fall back to a no-op publisher
 * instead of crashing the host process. Common on hardened systemd units
 * that don't have `pkgs.avahi` in their `path`.
 */
export class AvahiCliNotFoundError extends Error {
  readonly cli: string
  constructor(cli: string) {
    super(`avahi-publish-service not found on $PATH (looked for "${cli}")`)
    this.name = "AvahiCliNotFoundError"
    this.cli = cli
  }
}

export interface AvahiPublishOptions {
  readonly name: string
  /** Service type without the `_` prefix or `._tcp/._udp` suffix. */
  readonly type: string
  readonly protocol: "tcp" | "udp"
  readonly port: number
  readonly txt: Readonly<Record<string, string>>
  /** Override the CLI binary path. Defaults to `avahi-publish-service`. */
  readonly cli?: string
  /**
   * Spawn override for tests. Receives the resolved argv and returns a
   * Subprocess-like handle with `kill()` and `exited`. Default uses
   * `Bun.spawn`.
   */
  readonly spawn?: (argv: readonly string[]) => AvahiSubprocess
}

export interface AvahiSubprocess {
  readonly exited: Promise<number>
  kill(signal?: number | string): void
}

export interface AvahiAdvertisement {
  readonly stop: () => Promise<void>
}

/**
 * Spawn `avahi-publish-service` for the given service. The CLI keeps the
 * registration alive while the process is running; killing it withdraws
 * the record from avahi-daemon.
 */
export function publishViaAvahi(
  options: AvahiPublishOptions,
): AvahiAdvertisement {
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error("avahi publisher requires a positive port")
  }
  const cli = options.cli ?? DEFAULT_AVAHI_CLI
  const serviceType = `_${options.type}._${options.protocol}`
  const txtArgs = Object.entries(options.txt).map(
    ([key, value]) => `${key}=${value}`,
  )
  const argv = [
    cli,
    options.name,
    serviceType,
    String(options.port),
    ...txtArgs,
  ]

  let child: AvahiSubprocess
  if (options.spawn) {
    child = options.spawn(argv)
  } else {
    // Pre-flight the CLI so missing binaries surface a typed error
    // before we try to spawn (Bun.spawn throws synchronously on ENOENT,
    // but we want the caller to be able to catch a specific class).
    if (!Bun.which(cli)) {
      throw new AvahiCliNotFoundError(cli)
    }
    try {
      child = Bun.spawn(argv, {
        stdout: "ignore",
        stderr: "ignore",
      }) as AvahiSubprocess
    } catch (error) {
      const code = (error as { code?: string } | null)?.code
      if (code === "ENOENT") throw new AvahiCliNotFoundError(cli)
      throw error
    }
  }

  return {
    stop: async () => {
      try {
        child.kill()
      } catch {
        // Best-effort: already dead processes throw.
      }
      // Wait for graceful exit but don't block forever.
      await Promise.race([
        child.exited.catch(() => 0),
        new Promise<void>(resolve => setTimeout(resolve, 1000)),
      ])
    },
  }
}

/**
 * Best-effort detection: avahi-daemon owns mDNS on this host iff one of
 * its sockets exists. Tests can override via the `fs` argument.
 */
export function isAvahiDaemonRunning(
  sockets: readonly string[] = DEFAULT_AVAHI_SOCKETS,
  exists: (path: string) => boolean = existsSync,
): boolean {
  return sockets.some(path => exists(path))
}
