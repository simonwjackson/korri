import { dlopen, FFIType, ptr } from "bun:ffi"
import { appendFileSync, closeSync, existsSync, openSync } from "node:fs"
import { readFile } from "node:fs/promises"
import {
  ABS_HAT0X,
  ABS_HAT0Y,
  BTN_BACK,
  BTN_MODE,
  BTN_SELECT,
  BTN_START,
  BTN_THUMBL,
  BTN_THUMBR,
  BTN_TL,
  BTN_TR,
  BTN_X,
  BTN_Y,
  EV_ABS,
  EV_KEY,
  EV_SW,
  KEY_BRIGHTNESSDOWN,
  KEY_BRIGHTNESSUP,
  KEY_F24,
  KEY_POWER,
  KEY_RECORD,
  KEY_VOLUMEDOWN,
  KEY_VOLUMEUP,
  SW_LID,
} from "@platform/input/native/button-codes"
import {
  type DiscoveredDevice,
  type NativeInputAxisInfo,
  type NativeInputDeviceClass,
  parseProcBusInputDevices,
} from "@platform/input/native/discover-devices"
import { resolveInputPlumberVirtualGamepad } from "@platform/input/native/inputplumber-virtual-gamepad"
import {
  type EvdevEvent,
  parseEvdevBytes,
} from "@platform/input/native/parse-evdev"
import {
  createSystemShortcutEngine,
  type SystemShortcutControl,
  type SystemShortcutDefinition,
  type SystemTapDefinition,
} from "@platform/input/native/system-shortcut-engine"
import {
  decodeNativeInputEvent,
  decodeNativeInputSubscription,
  encodeNativeInputEvent,
  type NativeInputEvent,
} from "@platform/input/native/wire-schema"
import { logger as defaultLogger } from "@platform/logger"
import {
  createInputdActionDispatcher,
  type InputdActionDispatcher,
  type KorriInputdActionId,
} from "./inputd-actions"

export interface KorriInputdEventSource extends AsyncIterable<Uint8Array> {
  close?: () => void
}

export interface KorriInputdLogger {
  debug: (input: unknown, message?: string) => void
  info: (input: unknown, message?: string) => void
  warn: (input: unknown, message?: string) => void
  error: (input: unknown, message?: string) => void
}

export interface KorriInputdOptions {
  readonly port?: number
  readonly hostname?: string
  readonly pollIntervalMs?: number
  readonly readProcDevices?: () => Promise<string>
  readonly readAxisInfo?: (
    device: DiscoveredDevice,
  ) => Promise<readonly NativeInputAxisInfo[]>
  readonly openEventSource?: (
    device: DiscoveredDevice,
  ) => KorriInputdEventSource
  readonly nowMs?: () => number
  readonly logger?: KorriInputdLogger
  readonly actionDispatcher?: InputdActionDispatcher
  readonly shortcuts?: readonly SystemShortcutDefinition<KorriInputdActionId>[]
  readonly systemTaps?: readonly SystemTapDefinition<KorriInputdActionId>[]
  readonly eventNodeExists?: (eventNode: string) => boolean
}

export interface KorriInputdHandle {
  readonly port: number
  readonly hostname: string
  refreshDevices: () => Promise<void>
  stop: () => Promise<void>
}

type InputdSocket = Bun.ServerWebSocket<{ readonly id: string }>

type DeviceStream = {
  readonly source: KorriInputdEventSource
  readonly done: Promise<void>
  readonly recycleTimer?: ReturnType<typeof setInterval>
}

const DEFAULT_PORT = 3002
const DEFAULT_HOSTNAME = "0.0.0.0"
const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_GAMEPAD_STREAM_RECYCLE_MS = 30_000
const EVDEV_ABS_MAX = 0x3f
const INPUT_ABSINFO_BYTES = 24
const EVIOCGABS_BASE = 0x80184540

const libc = dlopen("libc.so.6", {
  ioctl: {
    args: [FFIType.i32, FFIType.u64, FFIType.ptr],
    returns: FFIType.i32,
  },
})

const DEFAULT_SHORTCUTS: readonly SystemShortcutDefinition<KorriInputdActionId>[] =
  [
    {
      id: "kill-current-game",
      requiredControls: ["l1", "r1", "start", "select"],
      exact: true,
    },
    { id: "brightness-up", requiredControls: ["home", "volume-up"] },
    { id: "brightness-down", requiredControls: ["home", "volume-down"] },
    { id: "workspace-prev", requiredControls: ["home", "dpad-left"] },
    { id: "workspace-prev", requiredControls: ["home", "l1"] },
    { id: "workspace-next", requiredControls: ["home", "dpad-right"] },
    { id: "workspace-next", requiredControls: ["home", "r1"] },
    { id: "move-output-up", requiredControls: ["home", "dpad-up"] },
    { id: "move-output-down", requiredControls: ["home", "dpad-down"] },
    { id: "screen-switch", requiredControls: ["home", "back"] },
    {
      id: "toggle-bottom-screen",
      requiredControls: ["home", "l3"],
      exact: true,
    },
    {
      id: "toggle-top-screen",
      requiredControls: ["home", "r3"],
      exact: true,
    },
    { id: "toggle-bottom-keyboard", requiredControls: ["home", "x"] },
  ]

const DEFAULT_SYSTEM_TAPS: readonly SystemTapDefinition<KorriInputdActionId>[] =
  [{ id: "system-panel", control: "home" }]

export async function startKorriInputd(
  options: KorriInputdOptions = {},
): Promise<KorriInputdHandle> {
  const logger = options.logger ?? defaultLogger
  const readProcDevices = options.readProcDevices ?? readRealProcDevices
  const openEventSource = options.openEventSource ?? openRealEventSource
  const readAxisInfo =
    options.readAxisInfo ??
    (options.openEventSource ? readNoAxisInfo : readRealAxisInfo)
  const nowMs = options.nowMs ?? Date.now
  const hostname =
    options.hostname ??
    process.env.KORRI_INPUT_BRIDGE_HOSTNAME ??
    DEFAULT_HOSTNAME
  const actionDispatcher =
    options.actionDispatcher ?? createInputdActionDispatcher({ logger })
  const eventNodeExists =
    options.eventNodeExists ??
    (options.openEventSource ? alwaysEventNodeExists : realEventNodeExists)
  const shortcutEngine = createSystemShortcutEngine({
    shortcuts: options.shortcuts ?? DEFAULT_SHORTCUTS,
    taps: options.systemTaps ?? DEFAULT_SYSTEM_TAPS,
  })
  const clients = new Map<InputdSocket, Set<NativeInputDeviceClass>>()
  const devices = new Map<string, DiscoveredDevice>()
  const streams = new Map<string, DeviceStream>()
  let pendingSystemAction = false
  let stopped = false

  function filterDiscoveredDevices(
    discoveredDevices: readonly DiscoveredDevice[],
  ): readonly DiscoveredDevice[] {
    const nonGamepads = discoveredDevices.filter(
      device => device.class !== "gamepad",
    )
    const resolution = resolveInputPlumberVirtualGamepad(discoveredDevices)
    if (resolution.status === "found") {
      return [
        ...nonGamepads,
        ...discoveredDevices.filter(
          device => device.deviceId === resolution.device.deviceId,
        ),
      ]
    }

    logger.warn(
      {
        status: resolution.status,
        rawGamepads:
          resolution.status === "missing" ? resolution.rawGamepads : undefined,
        candidates:
          resolution.status === "ambiguous"
            ? resolution.devices.map(device => device.deviceId)
            : undefined,
      },
      "inputd: normalized InputPlumber gamepad unavailable",
    )
    return nonGamepads
  }

  async function refreshDevices() {
    const discoveredDevices = filterDiscoveredDevices(
      parseProcBusInputDevices(await readProcDevices()).filter(device =>
        eventNodeExists(device.eventNode),
      ),
    )
    const nextDevices = new Map(
      (
        await Promise.all(
          discoveredDevices.map(device => discoverAxisInfo(device)),
        )
      ).map(device => [device.deviceId, device]),
    )

    async function discoverAxisInfo(
      device: DiscoveredDevice,
    ): Promise<DiscoveredDevice> {
      if (!device.capabilities.includes("EV_ABS")) return device

      try {
        const axes = await readAxisInfo(device)
        return axes.length > 0 ? { ...device, axes } : device
      } catch (error) {
        logger.warn(
          {
            err: error,
            deviceId: device.deviceId,
            eventNode: device.eventNode,
          },
          "inputd: failed to read axis metadata",
        )
        return device
      }
    }

    for (const [deviceId, currentDevice] of devices) {
      if (nextDevices.has(deviceId)) continue

      devices.delete(deviceId)
      closeDeviceStream(deviceId)
      shortcutEngine.clearDevice(deviceId)
      broadcast({ kind: "device-removed", deviceId }, currentDevice.class)
    }

    for (const [deviceId, nextDevice] of nextDevices) {
      const currentDevice = devices.get(deviceId)
      if (currentDevice) {
        if (!sameDevice(currentDevice, nextDevice)) {
          closeDeviceStream(deviceId)
          shortcutEngine.clearDevice(deviceId)
          devices.set(deviceId, nextDevice)
          broadcast({ kind: "device-removed", deviceId }, currentDevice.class)
          broadcast(
            {
              kind: "device-added",
              device: toWireDevice(nextDevice),
            },
            nextDevice.class,
          )
          openDeviceStream(nextDevice)
        }
        continue
      }

      devices.set(deviceId, nextDevice)
      broadcast(
        {
          kind: "device-added",
          device: toWireDevice(nextDevice),
        },
        nextDevice.class,
      )
      openDeviceStream(nextDevice)
    }
  }

  function openDeviceStream(device: DiscoveredDevice) {
    if (streams.has(device.deviceId)) return

    const source = openEventSource(device)
    let stream: DeviceStream
    const done = runDeviceStream(device, source).finally(() => {
      if (streams.get(device.deviceId) !== stream) return

      if (stream.recycleTimer) clearInterval(stream.recycleTimer)
      streams.delete(device.deviceId)
      shortcutEngine.clearDevice(device.deviceId)
      if (!stopped && devices.has(device.deviceId)) {
        setTimeout(() => {
          if (!stopped && devices.has(device.deviceId)) openDeviceStream(device)
        }, 250)
      }
    })
    const recycleTimer =
      device.class === "gamepad"
        ? setInterval(() => {
            if (stopped) return
            if (streams.get(device.deviceId) !== stream) return
            appendInputdDiagnostic("recycling gamepad event stream", {
              deviceId: device.deviceId,
              eventNode: device.eventNode,
            })
            source.close?.()
          }, DEFAULT_GAMEPAD_STREAM_RECYCLE_MS)
        : undefined
    stream = { source, done, recycleTimer }
    streams.set(device.deviceId, stream)
  }

  async function runDeviceStream(
    device: DiscoveredDevice,
    source: KorriInputdEventSource,
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
          if (device.name.includes("Xbox") || device.name.includes("AYN")) {
            appendInputdDiagnostic("raw evdev event", {
              deviceId: device.deviceId,
              deviceName: device.name,
              eventNode: device.eventNode,
              type: event.type,
              code: event.code,
              value: event.value,
            })
          }
          const consumedByPolicy = handlePolicyEvent(device, event)
          if (!consumedByPolicy) {
            broadcast(
              {
                kind: "input",
                deviceId: device.deviceId,
                class: device.class,
                type: event.type,
                code: event.code,
                value: event.value,
                timestamp:
                  event.tvSec * 1_000 + Math.floor(event.tvUsec / 1_000),
              },
              device.class,
            )
          }
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
          "inputd: event stream ended with error",
        )
      }
    }
  }

  function handlePolicyEvent(
    device: DiscoveredDevice,
    event: EvdevEvent,
  ): boolean {
    const policyControl = policyControlForEvent(event)
    const matches = shortcutEngine.handleEvent({
      deviceId: device.deviceId,
      deviceClass: device.class,
      type: event.type,
      code: event.code,
      value: event.value,
    })

    for (const match of matches) {
      dispatchAction(match.id)
    }

    if (matches.length > 0) return true

    if (event.type === EV_KEY) {
      const systemAction = systemKeyAction(event.code, event.value, process.env)
      if (systemAction) {
        dispatchAction(systemAction)
        return true
      }
    }

    if (event.type === EV_SW && event.code === SW_LID) {
      dispatchAction(event.value === 0 ? "lid-opened" : "lid-closed")
      return true
    }

    if (isReleaseOrNeutralPolicyFrame(event)) return false
    if (shortcutEngine.isPressed("home")) return true
    if (policyControl && isShortcutCandidateFrame(policyControl)) return true

    return false
  }

  function dispatchAction(actionId: KorriInputdActionId) {
    if (actionId === "system-panel") {
      broadcastSystemAction()
    }

    void actionDispatcher.dispatch(actionId).catch(error => {
      logger.warn({ err: error, actionId }, "inputd: action dispatch failed")
    })
  }

  function isShortcutCandidateFrame(control: SystemShortcutControl): boolean {
    for (const shortcut of options.shortcuts ?? DEFAULT_SHORTCUTS) {
      if (!shortcut.requiredControls.includes(control)) continue
      if (
        shortcut.requiredControls.some(
          required =>
            required !== control && shortcutEngine.isPressed(required),
        )
      ) {
        return true
      }
    }
    return false
  }

  function closeDeviceStream(deviceId: string) {
    const stream = streams.get(deviceId)
    if (!stream) return
    if (stream.recycleTimer) clearInterval(stream.recycleTimer)
    stream.source.close?.()
    streams.delete(deviceId)
  }

  function broadcast(
    event: NativeInputEvent,
    deviceClass: NativeInputDeviceClass,
  ): boolean {
    const payload = encodeEventPayload(event)
    let delivered = false

    for (const [client, classes] of clients) {
      if (!classes.has(deviceClass)) continue
      client.send(payload)
      delivered = true
    }

    return delivered
  }

  function broadcastSystemAction() {
    pendingSystemAction = !broadcast(
      { kind: "action", class: "system", action: "system", timestamp: nowMs() },
      "system",
    )
  }

  function sendCurrentDevices(client: InputdSocket) {
    const classes = clients.get(client)
    if (!classes) return

    for (const device of devices.values()) {
      if (!classes.has(device.class)) continue
      sendToClient(client, {
        kind: "device-added",
        device: toWireDevice(device),
      })
    }

    if (pendingSystemAction && classes.has("system")) {
      sendToClient(client, {
        kind: "action",
        class: "system",
        action: "system",
        timestamp: nowMs(),
      })
      pendingSystemAction = false
    }
  }

  function sendToClient(client: InputdSocket, event: NativeInputEvent) {
    client.send(encodeEventPayload(event))
  }

  const server = Bun.serve<{ readonly id: string }>({
    port: options.port ?? DEFAULT_PORT,
    hostname,
    fetch(request, server) {
      if (server.upgrade(request, { data: { id: crypto.randomUUID() } })) {
        return undefined
      }

      return new Response("Korri inputd\n", { status: 200 })
    },
    websocket: {
      open(socket) {
        appendInputdDiagnostic("websocket opened", { id: socket.data.id })
        clients.set(socket, new Set())
      },
      message(socket, message) {
        try {
          appendInputdDiagnostic("websocket message", {
            id: socket.data.id,
            message: parseSocketMessage(message),
          })
          const subscription = decodeNativeInputSubscription(
            parseSocketMessage(message),
          )
          clients.set(socket, new Set(subscription.classes))
          sendCurrentDevices(socket)
        } catch (error) {
          logger.warn(
            { err: error },
            "inputd: ignored malformed subscription frame",
          )
        }
      },
      close(socket) {
        appendInputdDiagnostic("websocket closed", { id: socket.data.id })
        clients.delete(socket)
      },
    },
  })

  await refreshDevices()

  const actualPort = server.port ?? options.port ?? DEFAULT_PORT

  const pollTimer = setInterval(() => {
    refreshDevices().catch(error => {
      logger.warn({ err: error }, "inputd: device refresh failed")
    })
  }, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS)

  logger.info({ port: actualPort, hostname, now: nowMs() }, "inputd listening")

  return {
    port: actualPort,
    hostname,
    refreshDevices,
    stop: async () => {
      stopped = true
      clearInterval(pollTimer)
      clients.clear()
      shortcutEngine.reset()

      const pendingStreams = [...streams.values()]
      for (const deviceId of [...streams.keys()]) {
        closeDeviceStream(deviceId)
      }

      server.stop(true)
      await Promise.allSettled(pendingStreams.map(stream => stream.done))
    },
  }
}

function appendInputdDiagnostic(
  message: string,
  fields: Readonly<Record<string, unknown>>,
) {
  const path = process.env.KORRI_INPUTD_LOG
  if (!path) return

  try {
    appendFileSync(
      path,
      `${new Date().toISOString()} ${message} ${JSON.stringify(fields)}\n`,
    )
  } catch {
    // Diagnostic-only; never let logging break input handling.
  }
}

function alwaysEventNodeExists(): boolean {
  return true
}

function realEventNodeExists(eventNode: string): boolean {
  return existsSync(`/dev/input/${eventNode}`)
}

function policyControlForEvent(
  event: EvdevEvent,
): SystemShortcutControl | null {
  if (event.type === EV_KEY) {
    if (event.code === BTN_MODE) return "home"
    if (event.code === BTN_TL) return "l1"
    if (event.code === BTN_TR) return "r1"
    if (event.code === BTN_START) return "start"
    if (event.code === BTN_SELECT) return "select"
    if (event.code === BTN_THUMBL) return "l3"
    if (event.code === BTN_THUMBR) return "r3"
    if (event.code === BTN_BACK || event.code === KEY_RECORD) return "back"
    if (event.code === BTN_X || event.code === BTN_Y) return "x"
    if (event.code === KEY_VOLUMEUP) return "volume-up"
    if (event.code === KEY_VOLUMEDOWN) return "volume-down"
    return null
  }

  if (event.type === EV_ABS && event.code === ABS_HAT0X) {
    if (event.value < 0) return "dpad-left"
    if (event.value > 0) return "dpad-right"
    return null
  }

  if (event.type === EV_ABS && event.code === ABS_HAT0Y) {
    if (event.value < 0) return "dpad-up"
    if (event.value > 0) return "dpad-down"
  }

  return null
}

function isReleaseOrNeutralPolicyFrame(event: EvdevEvent): boolean {
  if (event.type === EV_KEY) return event.value === 0
  if (event.type === EV_ABS) {
    return (
      (event.code === ABS_HAT0X || event.code === ABS_HAT0Y) &&
      event.value === 0
    )
  }
  return false
}

function systemKeyAction(
  code: number,
  value: number,
  env: NodeJS.ProcessEnv,
): KorriInputdActionId | null {
  if (value === 0) return null
  if (code === KEY_F24) {
    if (value !== 1) return null
    return keyF24ActionFromEnv(env)
  }
  if (code === KEY_VOLUMEUP) return "volume-up"
  if (code === KEY_VOLUMEDOWN) return "volume-down"
  if (code === KEY_BRIGHTNESSUP) return "brightness-up"
  if (code === KEY_BRIGHTNESSDOWN) return "brightness-down"
  if (code === KEY_POWER) return "power-suspend"
  if (code === KEY_RECORD) return "screen-switch"
  return null
}

function keyF24ActionFromEnv(
  env: NodeJS.ProcessEnv,
): KorriInputdActionId | null {
  switch (env.KORRI_INPUTD_KEY_F24_ACTION) {
    case "toggle-bottom-screen":
      return "toggle-bottom-screen"
    default:
      return null
  }
}

async function readRealProcDevices(): Promise<string> {
  return readFile("/proc/bus/input/devices", "utf8")
}

async function readNoAxisInfo(): Promise<readonly NativeInputAxisInfo[]> {
  return []
}

async function readRealAxisInfo(
  device: DiscoveredDevice,
): Promise<readonly NativeInputAxisInfo[]> {
  const path = `/dev/input/${device.eventNode}`
  const fd = openSync(path, "r")

  try {
    const axes: NativeInputAxisInfo[] = []
    for (let code = 0; code <= EVDEV_ABS_MAX; code++) {
      const axis = readEvdevAxisInfo(fd, code)
      if (axis) axes.push(axis)
    }
    return axes
  } finally {
    closeSync(fd)
  }
}

function readEvdevAxisInfo(
  fd: number,
  code: number,
): NativeInputAxisInfo | null {
  const buffer = Buffer.alloc(INPUT_ABSINFO_BYTES)
  const status = libc.symbols.ioctl(fd, EVIOCGABS_BASE + code, ptr(buffer))
  if (status !== 0) return null

  return {
    code,
    minimum: buffer.readInt32LE(4),
    maximum: buffer.readInt32LE(8),
    flat: buffer.readInt32LE(16),
  }
}

function openRealEventSource(device: DiscoveredDevice): KorriInputdEventSource {
  const path = `/dev/input/${device.eventNode}`
  const proc = Bun.spawn({
    cmd: ["cat", path],
    stdout: "pipe",
    stderr: "ignore",
  })
  let closed = false

  const close = () => {
    if (closed) return
    closed = true
    proc.kill()
  }

  return {
    async *[Symbol.asyncIterator]() {
      const reader = proc.stdout.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          yield value
        }

        const exitCode = await proc.exited
        if (!closed && exitCode !== 0) {
          throw new Error(
            `event source exited with status ${exitCode}: ${path}`,
          )
        }
      } finally {
        reader.releaseLock()
        close()
      }
    },
    close,
  }
}

function sameDevice(a: DiscoveredDevice, b: DiscoveredDevice): boolean {
  return (
    a.eventNode === b.eventNode &&
    a.class === b.class &&
    a.name === b.name &&
    a.capabilities.length === b.capabilities.length &&
    a.capabilities.every(
      (capability, index) => capability === b.capabilities[index],
    ) &&
    sameAxes(a.axes ?? [], b.axes ?? [])
  )
}

function sameAxes(
  a: readonly NativeInputAxisInfo[],
  b: readonly NativeInputAxisInfo[],
): boolean {
  return (
    a.length === b.length &&
    a.every(
      (axis, index) =>
        axis.code === b[index]?.code &&
        axis.minimum === b[index]?.minimum &&
        axis.maximum === b[index]?.maximum &&
        axis.flat === b[index]?.flat,
    )
  )
}

function toWireDevice(device: DiscoveredDevice) {
  return {
    deviceId: device.deviceId,
    class: device.class,
    name: device.name,
    capabilities: [...device.capabilities],
    ...(device.axes ? { axes: [...device.axes] } : {}),
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

  const handle = await startKorriInputd({ port })

  const shutdown = async (signal: string) => {
    defaultLogger.info({ signal }, "inputd shutting down")
    await handle.stop()
    process.exit(0)
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"))
  process.on("SIGINT", () => void shutdown("SIGINT"))
}

if (import.meta.main) {
  main().catch(error => {
    defaultLogger.error({ err: error }, "inputd failed")
    process.exit(1)
  })
}
