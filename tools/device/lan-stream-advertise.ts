import { hostname } from "node:os"
import { Bonjour, type Service } from "bonjour-service"
import {
  type BonjourLike,
  KORRI_STREAM_PROTOCOL_VERSION,
  KORRI_STREAM_SERVICE_PROTOCOL,
  KORRI_STREAM_SERVICE_TYPE,
} from "../cli/lan-stream-discovery"

export interface StreamAdvertisement {
  readonly stop: () => Promise<void>
}

export interface AdvertiseStreamHostOptions {
  readonly name?: string
  readonly hostId?: string
  readonly port: number
  readonly capabilities?: readonly string[]
  readonly bonjourFactory?: () => BonjourLike
}

export function advertiseStreamHost(
  options: AdvertiseStreamHostOptions,
): StreamAdvertisement {
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error("Korri stream advertisement requires a positive port")
  }

  const bonjour = options.bonjourFactory?.() ?? new Bonjour()
  const hostId = options.hostId ?? hostname()
  if (!bonjour.publish) throw new Error("Bonjour publisher is unavailable")
  const service = bonjour.publish({
    name: options.name ?? `Korri Stream on ${hostId}`,
    type: KORRI_STREAM_SERVICE_TYPE,
    protocol: KORRI_STREAM_SERVICE_PROTOCOL,
    port: options.port,
    txt: {
      proto: KORRI_STREAM_PROTOCOL_VERSION,
      hostId,
      caps: (options.capabilities ?? ["stream"]).join(","),
    },
  }) as Service

  return {
    stop: async () => {
      await new Promise<void>(resolve => service.stop?.(resolve))
      await new Promise<void>(resolve => bonjour.destroy(resolve))
    },
  }
}
