import { createReadStream } from "node:fs"
import { readFile } from "node:fs/promises"
import {
  type DiscoveredDevice,
  type NativeInputDeviceClass,
  parseProcBusInputDevices,
} from "@shared/input/native/discover-devices"
import { parseEvdevBytes } from "@shared/input/native/parse-evdev"
import {
  decodeNativeInputEvent,
  decodeNativeInputSubscription,
  encodeNativeInputEvent,
  type NativeInputEvent,
} from "@shared/input/native/wire-schema"
import { logger as defaultLogger } from "@shared/logger"

export interface InputBridgeEventSource extends AsyncIterable<Uint8Array> {
  close?: () => void
}

export interface InputBridgeLogger {
  debug: (input: unknown, message?: string) => void
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface InputBridgeOptions {
  readonly port?: number
  readonly hostname?: string
  readonly pollIntervalMs?: number
  readonly readProcDevices?: () => Promise<string>
  readonly openEventSource?: (
    device: DiscoveredDevice,
  ) => InputBridgeEventSource
  readonly nowMs?: () => number
  readonly logger?: InputBridgeLogger
}

export interface InputBridgeHandle {
  readonly port: number
  readonly hostname: string
  refreshDevices: () => Promise<void>
  stop: () => Promise<void>
}

type BridgeSocket = Bun.ServerWebSocket<{ readonly id: string }>

type DeviceStream = {
  readonly source: InputBridgeEventSource
  readonly done: Promise<void>
}

const DEFAULT_PORT = 3002
const DEFAULT_HOSTNAME = "0.0.0.0"
const DEFAULT_POLL_INTERVAL_MS = 1_000

export async function startInputBridge(
  options: InputBridgeOptions = {},
): Promise<InputBridgeHandle> {
  const logger = options.logger ?? defaultLogger
  const readProcDevices = options.readProcDevices ?? readRealProcDevices
  const openEventSource = options.openEventSource ?? openRealEventSource
  const nowMs = options.nowMs ?? Date.now
  const hostname = options.hostname ?? DEFAULT_HOSTNAME
  const clients = new Map<BridgeSocket, Set<NativeInputDeviceClass>>()
  const devices = new Map<string, DiscoveredDevice>()
  const streams = new Map<string, DeviceStream>()
  let stopped = false

  async function refreshDevices() {
    const nextDevices = new Map(
      parseProcBusInputDevices(await readProcDevices()).map(device => [
        device.deviceId,
        device,
      ]),
    )

    for (const [deviceId, currentDevice] of devices) {
      if (nextDevices.has(deviceId)) continue

      devices.delete(deviceId)
      closeDeviceStream(deviceId)
      broadcast({ kind: "device-removed", deviceId }, currentDevice.class)
    }

    for (const [deviceId, nextDevice] of nextDevices) {
      if (devices.has(deviceId)) continue

      devices.set(deviceId, nextDevice)
      if (nextDevice.class === "gamepad") {
        openDeviceStream(nextDevice)
      }
      broadcast(
        {
          kind: "device-added",
          device: toWireDevice(nextDevice),
        },
        nextDevice.class,
      )
    }
  }

  function openDeviceStream(device: DiscoveredDevice) {
    if (streams.has(device.deviceId)) return

    const source = openEventSource(device)
    const done = runDeviceStream(device, source).finally(() => {
      streams.delete(device.deviceId)
      if (!stopped && devices.has(device.deviceId)) {
        setTimeout(() => openDeviceStream(device), 250)
      }
    })
    streams.set(device.deviceId, { source, done })
  }

  async function runDeviceStream(
    device: DiscoveredDevice,
    source: InputBridgeEventSource,
  ) {
    let remainder: Uint8Array<ArrayBufferLike> = new Uint8Array()

    try {
      for await (const chunk of source) {
        if (stopped) return

        const bytes =
          remainder.byteLength === 0 ? chunk : concatBytes(remainder, chunk)
        const parsed = parseEvdevBytes(bytes)
        remainder = parsed.remainder

        for (const event of parsed.events) {
          broadcast(
            {
              kind: "input",
              deviceId: device.deviceId,
              class: device.class,
              type: event.type,
              code: event.code,
              value: event.value,
              timestamp: event.tvSec * 1_000 + Math.floor(event.tvUsec / 1_000),
            },
            device.class,
          )
        }
      }
    } catch (error) {
      if (!stopped) {
        logger.warn(
          {
            err: error,
            deviceId: device.deviceId,
            eventNode: device.eventNode,
          },
          "input bridge: event stream ended with error",
        )
      }
    }
  }

  function closeDeviceStream(deviceId: string) {
    const stream = streams.get(deviceId)
    if (!stream) return
    stream.source.close?.()
    streams.delete(deviceId)
  }

  function broadcast(
    event: NativeInputEvent,
    deviceClass: NativeInputDeviceClass,
  ) {
    const payload = encodeEventPayload(event)

    for (const [client, classes] of clients) {
      if (!classes.has(deviceClass)) continue
      client.send(payload)
    }
  }

  function sendCurrentDevices(client: BridgeSocket) {
    const classes = clients.get(client)
    if (!classes) return

    for (const device of devices.values()) {
      if (!classes.has(device.class)) continue
      sendToClient(client, {
        kind: "device-added",
        device: toWireDevice(device),
      })
    }
  }

  function sendToClient(client: BridgeSocket, event: NativeInputEvent) {
    client.send(encodeEventPayload(event))
  }

  const server = Bun.serve<{ readonly id: string }>({
    port: options.port ?? DEFAULT_PORT,
    hostname,
    fetch(request, server) {
      if (server.upgrade(request, { data: { id: crypto.randomUUID() } })) {
        return undefined
      }

      return new Response("Korri native input bridge\n", { status: 200 })
    },
    websocket: {
      open(socket) {
        clients.set(socket, new Set())
      },
      message(socket, message) {
        try {
          const subscription = decodeNativeInputSubscription(
            parseSocketMessage(message),
          )
          clients.set(socket, new Set(subscription.classes))
          sendCurrentDevices(socket)
        } catch (error) {
          logger.warn(
            { err: error },
            "input bridge: ignored malformed subscription frame",
          )
        }
      },
      close(socket) {
        clients.delete(socket)
      },
    },
  })

  await refreshDevices()

  const actualPort = server.port ?? options.port ?? DEFAULT_PORT

  const pollTimer = setInterval(() => {
    refreshDevices().catch(error => {
      logger.warn({ err: error }, "input bridge: device refresh failed")
    })
  }, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)

  logger.info(
    { port: actualPort, hostname, now: nowMs() },
    "input bridge listening",
  )

  return {
    port: actualPort,
    hostname,
    refreshDevices,
    stop: async () => {
      stopped = true
      clearInterval(pollTimer)
      clients.clear()

      const pendingStreams = [...streams.values()]
      for (const deviceId of [...streams.keys()]) {
        closeDeviceStream(deviceId)
      }

      server.stop(true)
      await Promise.allSettled(pendingStreams.map(stream => stream.done))
    },
  }
}

async function readRealProcDevices(): Promise<string> {
  return readFile("/proc/bus/input/devices", "utf8")
}

function openRealEventSource(device: DiscoveredDevice): InputBridgeEventSource {
  const stream = createReadStream(`/dev/input/${device.eventNode}`)

  return {
    async *[Symbol.asyncIterator]() {
      for await (const chunk of stream) {
        yield chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
      }
    },
    close: () => stream.destroy(),
  }
}

function toWireDevice(device: DiscoveredDevice) {
  return {
    deviceId: device.deviceId,
    class: device.class,
    name: device.name,
    capabilities: [...device.capabilities],
  }
}

function encodeEventPayload(event: NativeInputEvent): string {
  return JSON.stringify(encodeNativeInputEvent(decodeNativeInputEvent(event)))
}

function parseSocketMessage(message: string | Buffer): unknown {
  if (typeof message === "string") return JSON.parse(message)
  return JSON.parse(new TextDecoder().decode(message))
}

function concatBytes(
  a: Uint8Array<ArrayBufferLike>,
  b: Uint8Array<ArrayBufferLike>,
): Uint8Array<ArrayBufferLike> {
  const bytes = new Uint8Array(a.byteLength + b.byteLength)
  bytes.set(a, 0)
  bytes.set(b, a.byteLength)
  return bytes
}

async function main() {
  const port = Number.parseInt(
    process.env.KORRI_INPUT_BRIDGE_PORT ?? `${DEFAULT_PORT}`,
    10,
  )

  const handle = await startInputBridge({ port })

  const shutdown = async (signal: string) => {
    defaultLogger.info({ signal }, "input bridge shutting down")
    await handle.stop()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

if (import.meta.main) {
  main().catch(error => {
    defaultLogger.error({ err: error }, "input bridge failed")
    process.exit(1)
  })
}
