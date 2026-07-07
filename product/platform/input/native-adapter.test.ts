import { afterEach, describe, expect, it } from "bun:test"
import { createNativeInputAdapter } from "./native-adapter"
import type { InputAction } from "./types"

type InputServer = {
  readonly port: number
  readonly messages: unknown[]
  readonly send: (message: unknown) => void
  readonly closeClients: () => void
  readonly stop: () => void
}

const servers: InputServer[] = []
const disposers: Array<() => void> = []

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  for (const server of servers.splice(0)) server.stop()
})

function createInputServer(port = 0): InputServer {
  const sockets = new Set<Bun.ServerWebSocket<{ readonly id: string }>>()
  const messages: unknown[] = []
  const server = Bun.serve<{ readonly id: string }>({
    port,
    fetch(request, server) {
      if (server.upgrade(request, { data: { id: crypto.randomUUID() } }))
        return undefined
      return new Response("native input test server\n")
    },
    websocket: {
      open(socket) {
        sockets.add(socket)
      },
      message(_socket, message) {
        messages.push(JSON.parse(String(message)))
      },
      close(socket) {
        sockets.delete(socket)
      },
    },
  })

  const inputServer = {
    port: server.port ?? port,
    messages,
    send: (message: unknown) => {
      const payload = JSON.stringify(message)
      for (const socket of sockets) socket.send(payload)
    },
    closeClients: () => {
      for (const socket of sockets) socket.close()
    },
    stop: () => server.stop(true),
  }
  servers.push(inputServer)
  return inputServer
}

async function reservePort(): Promise<number> {
  const server = Bun.serve({ port: 0, fetch: () => new Response("ok") })
  const port = server.port ?? 0
  server.stop(true)
  await Bun.sleep(5)
  return port
}

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(5)
  }
  throw new Error(`timed out waiting for ${description}`)
}

function startAdapter(server: InputServer, options = {}) {
  const emitted: InputAction[] = []
  const dispose = createNativeInputAdapter({
    url: `ws://127.0.0.1:${server.port}`,
    reconnect: { initialDelayMs: 20, maxDelayMs: 20, factor: 1 },
    repeatDelayMs: 20,
    repeatIntervalMs: 10,
    ...options,
  }).start(action => emitted.push(action))
  disposers.push(dispose)
  return emitted
}

async function waitForSubscription(server: InputServer) {
  await waitFor(() => server.messages.length > 0, "subscription frame")
}

describe("createNativeInputAdapter", () => {
  it("subscribes to gamepad-class bridge events on connect", async () => {
    const server = createInputServer()
    startAdapter(server)

    await waitForSubscription(server)

    expect(server.messages[0]).toEqual({ classes: ["gamepad"] })
  })

  it("maps gamepad button presses to semantic actions", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send(inputEvent({ code: 304, value: 1 }))
    server.send(inputEvent({ code: 305, value: 1 }))
    server.send(inputEvent({ code: 308, value: 1 }))
    server.send(inputEvent({ code: 315, value: 1 }))

    await waitFor(() => emitted.length === 4, "button actions")
    expect(emitted).toEqual([
      { type: "confirm", source: "native" },
      { type: "back", source: "native" },
      { type: "options", source: "native" },
      { type: "menu", source: "native" },
    ])
  })

  it("emits one direction for a short d-pad press", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send(inputEvent({ code: 547, value: 1 }))
    server.send(inputEvent({ code: 547, value: 0 }))
    await Bun.sleep(40)

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("repeats held d-pad directions after the configured delay", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send(inputEvent({ code: 547, value: 1 }))

    await waitFor(() => emitted.length >= 3, "held d-pad repeats")
    expect(emitted.slice(0, 3)).toEqual([
      { type: "direction", direction: "right", source: "native" },
      { type: "direction", direction: "right", source: "native" },
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("stops a held direction if the bridge misses a release event", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server, {
      staleReleaseMs: 35,
      repeatDelayMs: 100,
      repeatIntervalMs: 10,
    })
    await waitForSubscription(server)

    server.send(inputEvent({ type: 3, code: 16, value: 1 }))
    await waitFor(() => emitted.length === 1, "initial direction")
    await Bun.sleep(120)

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("maps low-range gamepad axes using device metadata from inputd", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send({
      kind: "device-added",
      device: {
        deviceId: "rocknix-pad",
        class: "gamepad",
        name: "AYN Odin2 Gamepad",
        capabilities: ["EV_ABS", "BTN_GAMEPAD"],
        axes: [
          { code: 0, minimum: -1_408, maximum: 1_408, flat: 0 },
          { code: 1, minimum: -1_408, maximum: 1_408, flat: 0 },
        ],
      },
    })
    server.send(
      inputEvent({ deviceId: "rocknix-pad", type: 3, code: 0, value: 1_000 }),
    )

    await waitFor(() => emitted.length > 0, "metadata axis direction")
    expect(emitted[0]).toEqual({
      type: "direction",
      direction: "right",
      source: "native",
    })
  })

  it("clears removed gamepad metadata and pressed state", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send({
      kind: "device-added",
      device: {
        deviceId: "rocknix-pad",
        class: "gamepad",
        name: "AYN Odin2 Gamepad",
        capabilities: ["EV_ABS", "BTN_GAMEPAD"],
        axes: [
          { code: 0, minimum: -1_408, maximum: 1_408, flat: 0 },
          { code: 1, minimum: -1_408, maximum: 1_408, flat: 0 },
        ],
      },
    })
    server.send(inputEvent({ deviceId: "rocknix-pad", code: 304, value: 1 }))
    server.send({ kind: "device-removed", deviceId: "rocknix-pad" })
    server.send(inputEvent({ deviceId: "rocknix-pad", code: 304, value: 1 }))
    server.send(
      inputEvent({ deviceId: "rocknix-pad", type: 3, code: 0, value: 1_000 }),
    )

    await waitFor(() => emitted.length === 2, "button after device removal")
    await Bun.sleep(40)
    expect(emitted).toEqual([
      { type: "confirm", source: "native" },
      { type: "confirm", source: "native" },
    ])
  })

  it("maps analog axes through dominant-axis selection", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server, { axisThreshold: 16_000 })
    await waitForSubscription(server)

    server.send(inputEvent({ type: 3, code: 0, value: 20_000 }))
    server.send(inputEvent({ type: 3, code: 1, value: 10_000 }))

    await waitFor(() => emitted.length > 0, "axis direction")
    expect(emitted[0]).toEqual({
      type: "direction",
      direction: "right",
      source: "native",
    })
  })

  it("stops analog holds when an axis returns to neutral", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server, { axisThreshold: 16_000 })
    await waitForSubscription(server)

    server.send(inputEvent({ type: 3, code: 0, value: 20_000 }))
    server.send(inputEvent({ type: 3, code: 0, value: 0 }))
    await Bun.sleep(40)

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("emits system actions from inputd action frames", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server, { subscribe: ["gamepad", "system"] })
    await waitForSubscription(server)

    server.send({
      kind: "action",
      class: "system",
      action: "system",
      timestamp: Date.now(),
    })

    await waitFor(() => emitted.length === 1, "system action")
    expect(emitted).toEqual([{ type: "system", source: "native" }])
  })

  it("suppresses portal actions while the surface is inactive", async () => {
    const server = createInputServer()
    let active = false
    const emitted = startAdapter(server, {
      subscribe: ["gamepad", "system"],
      isActive: () => active,
    })
    await waitForSubscription(server)

    server.send(inputEvent({ code: 304, value: 1 }))
    server.send({
      kind: "action",
      class: "system",
      action: "system",
      timestamp: Date.now(),
    })
    await Bun.sleep(30)

    active = true
    server.send(inputEvent({ code: 304, value: 1 }))

    await waitFor(() => emitted.length === 1, "active surface action")
    expect(emitted).toEqual([{ type: "confirm", source: "native" }])
  })

  it("resets held native input when the surface becomes inactive", async () => {
    const server = createInputServer()
    let active = true
    const emitted = startAdapter(server, {
      isActive: () => active,
      repeatDelayMs: 20,
      repeatIntervalMs: 10,
    })
    await waitForSubscription(server)

    server.send(inputEvent({ code: 547, value: 1 }))
    await waitFor(() => emitted.length >= 1, "initial focused action")

    active = false
    server.send(inputEvent({ code: 547, value: 1 }))
    await Bun.sleep(60)

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
    ])
  })

  it("ignores non-gamepad input events and device lifecycle events", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send(inputEvent({ class: "keyboard", code: 304, value: 1 }))
    server.send({
      kind: "device-added",
      device: {
        deviceId: "keyboard",
        class: "keyboard",
        name: "Keyboard",
        capabilities: ["EV_KEY"],
      },
    })
    await Bun.sleep(20)

    expect(emitted).toEqual([])
  })

  it("keeps the connection open after malformed bridge messages", async () => {
    const server = createInputServer()
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.send("not-a-native-event")
    server.send(inputEvent({ code: 304, value: 1 }))

    await waitFor(() => emitted.length === 1, "valid event after malformed one")
    expect(emitted).toEqual([{ type: "confirm", source: "native" }])
  })

  it("reconnects after the bridge becomes available", async () => {
    const port = await reservePort()
    const emitted: InputAction[] = []
    const dispose = createNativeInputAdapter({
      url: `ws://127.0.0.1:${port}`,
      reconnect: { initialDelayMs: 20, maxDelayMs: 20, factor: 1 },
    }).start(action => emitted.push(action))
    disposers.push(dispose)

    await Bun.sleep(30)
    const server = createInputServer(port)
    await waitForSubscription(server)

    server.send(inputEvent({ code: 304, value: 1 }))
    await waitFor(() => emitted.length === 1, "event after reconnect")
    expect(emitted).toEqual([{ type: "confirm", source: "native" }])
  })

  it("reconnects after a mid-stream transport drop", async () => {
    const port = await reservePort()
    const server = createInputServer(port)
    const emitted = startAdapter(server)
    await waitForSubscription(server)

    server.closeClients()
    await Bun.sleep(30)
    server.send(inputEvent({ code: 304, value: 1 }))

    await waitFor(() => server.messages.length >= 2, "resubscription")
    server.send(inputEvent({ code: 304, value: 1 }))
    await waitFor(() => emitted.length === 1, "event after reconnect")

    expect(emitted).toEqual([{ type: "confirm", source: "native" }])
  })
})

function inputEvent(
  overrides: Partial<{
    kind: "input"
    deviceId: string
    class: "gamepad" | "keyboard" | "mouse" | "touch" | "system" | "unknown"
    type: number
    code: number
    value: number
    timestamp: number
  }>,
) {
  return {
    kind: "input",
    deviceId: "inputplumber-virtual-xbox360",
    class: "gamepad",
    type: 1,
    code: 304,
    value: 1,
    timestamp: Date.now(),
    ...overrides,
  }
}
