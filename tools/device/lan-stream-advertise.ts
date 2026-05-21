import { hostname } from "node:os"
import { Bonjour, type Service } from "bonjour-service"
import { logger } from "@shared/logger"
import {
  type BonjourLike,
  KORRI_STREAM_PROTOCOL_VERSION,
  KORRI_STREAM_SERVICE_PROTOCOL,
  KORRI_STREAM_SERVICE_TYPE,
} from "../cli/lan-stream-discovery"
import {
  type AvahiAdvertisement,
  AvahiCliNotFoundError,
  type AvahiSubprocess,
  isAvahiDaemonRunning,
  publishViaAvahi,
} from "./avahi-publisher"

export interface StreamAdvertisement {
  readonly stop: () => Promise<void>
}

export type AdvertiseBackend = "auto" | "bonjour" | "avahi"

export interface AdvertiseStreamHostOptions {
  readonly name?: string
  readonly hostId?: string
  readonly port: number
  readonly capabilities?: readonly string[]
  /**
   * Override the publisher backend. Defaults to `auto`: avahi when
   * `avahi-daemon` is running on the host, bonjour-service otherwise.
   */
  readonly backend?: AdvertiseBackend
  /** Inject a Bonjour factory for tests. */
  readonly bonjourFactory?: () => BonjourLike
  /** Inject the avahi-daemon detector for tests. */
  readonly detectAvahi?: () => boolean
  /** Inject the avahi publisher for tests. */
  readonly publishAvahi?: typeof publishViaAvahi
  /** Inject a spawn override for the avahi CLI. */
  readonly spawnAvahi?: (argv: readonly string[]) => AvahiSubprocess
}

export function advertiseStreamHost(
  options: AdvertiseStreamHostOptions,
): StreamAdvertisement {
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error("Korri stream advertisement requires a positive port")
  }

  const hostId = options.hostId ?? hostname()
  const name = options.name ?? `Korri Stream on ${hostId}`
  const txt = {
    proto: KORRI_STREAM_PROTOCOL_VERSION,
    hostId,
    caps: (options.capabilities ?? ["stream"]).join(","),
  }

  const detectAvahi = options.detectAvahi ?? isAvahiDaemonRunning
  const backend: AdvertiseBackend =
    options.backend ?? (detectAvahi() ? "avahi" : "bonjour")

  if (backend === "avahi") {
    try {
      return publishViaAvahiBackend({
        name,
        port: options.port,
        txt,
        publish: options.publishAvahi ?? publishViaAvahi,
        spawn: options.spawnAvahi,
      })
    } catch (error) {
      if (error instanceof AvahiCliNotFoundError) {
        // avahi-daemon is running but its CLI isn't on $PATH — typical on
        // hardened systemd units that haven't added `pkgs.avahi` to the
        // unit's path. Falling back to bonjour-service would race against
        // the running daemon and produce NXDOMAIN, so the safer move is
        // to no-op the advertisement and let the operator fix PATH.
        logger.warn(
          { cli: error.cli },
          "avahi-publish-service not on PATH; mDNS advertise disabled (add pkgs.avahi to the unit's path to fix)",
        )
        return { stop: async () => {} }
      }
      throw error
    }
  }

  const bonjour: BonjourLike =
    options.bonjourFactory?.() ?? (new Bonjour() as unknown as BonjourLike)
  return publishViaBonjourBackend({
    name,
    port: options.port,
    txt,
    bonjour,
  })
}

function publishViaAvahiBackend(input: {
  readonly name: string
  readonly port: number
  readonly txt: Readonly<Record<string, string>>
  readonly publish: typeof publishViaAvahi
  readonly spawn?: (argv: readonly string[]) => AvahiSubprocess
}): StreamAdvertisement {
  const advertisement: AvahiAdvertisement = input.publish({
    name: input.name,
    type: KORRI_STREAM_SERVICE_TYPE,
    protocol: KORRI_STREAM_SERVICE_PROTOCOL,
    port: input.port,
    txt: input.txt,
    spawn: input.spawn,
  })
  return { stop: () => advertisement.stop() }
}

function publishViaBonjourBackend(input: {
  readonly name: string
  readonly port: number
  readonly txt: Readonly<Record<string, string>>
  readonly bonjour: BonjourLike
}): StreamAdvertisement {
  if (!input.bonjour.publish) throw new Error("Bonjour publisher is unavailable")
  const service = input.bonjour.publish({
    name: input.name,
    type: KORRI_STREAM_SERVICE_TYPE,
    protocol: KORRI_STREAM_SERVICE_PROTOCOL,
    port: input.port,
    txt: input.txt,
  }) as Service
  return {
    stop: async () => {
      await new Promise<void>(resolve => service.stop?.(resolve))
      await new Promise<void>(resolve => input.bonjour.destroy(resolve))
    },
  }
}
