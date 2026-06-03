import { afterEach, describe, expect, it } from "bun:test"
import { readFile } from "node:fs/promises"
import { decodeDesktopInputBridgePayload } from "@platform/input/desktop-bridge-wire"
import { ABS_HAT0X, ABS_X, ABS_Y } from "@platform/input/native/button-codes"
import type { ServerWebSocket } from "bun"
import { Effect, Fiber } from "effect"
import { createDesktopInputBroker } from "./input-broker"

interface InputServerDouble {
  readonly port: number
  readonly messages: unknown[]
  send(payload: unknown): void
  stop(): void
}

const servers: InputServerDouble[] = []
const brokerDisposers: Array<() => Promise<unknown>> = []

afterEach(async () => {
  await Promise.all(brokerDisposers.splice(0).map(dispose => dispose()))
  for (const server of servers.splice(0)) server.stop()
})

describe("createDesktopInputBroker", () => {
  it("subscribes to inputd, maps gamepad frames, and pushes semantic actions to the active webview", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => window,
      getWindows: () => [window],
    })

    server.send({
      kind: "input",
      deviceId: "pad-1",
      class: "gamepad",
      type: 3,
      code: ABS_HAT0X,
      value: 1,
      timestamp: Date.now(),
    })

    await waitFor(() => actionPayloads(window).length === 1, "input action")
    expect(
      decodeDesktopInputBridgePayload(actionPayloads(window)[0]),
    ).toMatchObject({
      kind: "korri.input.action",
      action: { type: "direction", direction: "right", source: "native" },
    })
    expect(statusPayloads(window).at(-1)).toMatchObject({
      status: {
        inputd: "connected",
        active: true,
        decodedFrames: 1,
        emittedActions: 1,
        droppedActions: 0,
      },
    })
  })

  it("maps low-range gamepad axes using device metadata from inputd", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => window,
      getWindows: () => [window],
    })

    server.send({
      kind: "device-added",
      device: {
        deviceId: "rocknix-pad",
        class: "gamepad",
        name: "AYN Odin2 Gamepad",
        capabilities: ["EV_ABS", "BTN_GAMEPAD"],
        axes: [
          { code: ABS_X, minimum: -1_408, maximum: 1_408, flat: 0 },
          { code: ABS_Y, minimum: -1_408, maximum: 1_408, flat: 0 },
        ],
      },
    })
    server.send({
      kind: "input",
      deviceId: "rocknix-pad",
      class: "gamepad",
      type: 3,
      code: ABS_X,
      value: 1_000,
      timestamp: Date.now(),
    })

    await waitFor(() => actionPayloads(window).length === 1, "axis action")
    expect(
      decodeDesktopInputBridgePayload(actionPayloads(window)[0]),
    ).toMatchObject({
      kind: "korri.input.action",
      action: { type: "direction", direction: "right", source: "native" },
    })
  })

  it("clears removed gamepad metadata without resetting other gamepads", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => window,
      getWindows: () => [window],
    })

    for (const deviceId of ["pad-a", "pad-b"]) {
      server.send({
        kind: "device-added",
        device: {
          deviceId,
          class: "gamepad",
          name: `Gamepad ${deviceId}`,
          capabilities: ["EV_ABS", "BTN_GAMEPAD"],
          axes: [
            { code: ABS_X, minimum: -1_408, maximum: 1_408, flat: 0 },
            { code: ABS_Y, minimum: -1_408, maximum: 1_408, flat: 0 },
          ],
        },
      })
    }
    server.send({ kind: "device-removed", deviceId: "pad-a" })
    server.send({
      kind: "input",
      deviceId: "pad-a",
      class: "gamepad",
      type: 3,
      code: ABS_X,
      value: 1_000,
      timestamp: Date.now(),
    })
    server.send({
      kind: "input",
      deviceId: "pad-b",
      class: "gamepad",
      type: 3,
      code: ABS_X,
      value: 1_000,
      timestamp: Date.now(),
    })

    await waitFor(() => actionPayloads(window).length === 1, "pad-b action")
    expect(
      decodeDesktopInputBridgePayload(actionPayloads(window)[0]),
    ).toMatchObject({
      kind: "korri.input.action",
      action: { type: "direction", direction: "right", source: "native" },
    })
  })

  it("drops input when no Korri window is active, even with one window", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => null,
      getWindows: () => [window],
    })

    server.send({
      kind: "input",
      deviceId: "pad-1",
      class: "gamepad",
      type: 3,
      code: ABS_HAT0X,
      value: 1,
      timestamp: Date.now(),
    })

    await Bun.sleep(30)
    expect(actionPayloads(window)).toEqual([])
    expect(statusPayloads(window).at(-1)).toMatchObject({
      status: {
        inputd: "connected",
        active: false,
        decodedFrames: 1,
        emittedActions: 0,
        droppedActions: 1,
      },
    })
  })

  it("fails closed when the active window is unknown among multiple windows", async () => {
    const server = createInputServer()
    const primary = createWindowDouble()
    const companion = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => null,
      getWindows: () => [primary, companion],
    })

    server.send({
      kind: "input",
      deviceId: "pad-1",
      class: "gamepad",
      type: 3,
      code: ABS_HAT0X,
      value: 1,
      timestamp: Date.now(),
    })

    await Bun.sleep(30)
    expect(actionPayloads(primary)).toEqual([])
    expect(actionPayloads(companion)).toEqual([])
    expect(statusPayloads(primary).at(-1)).toMatchObject({
      status: {
        inputd: "connected",
        active: false,
        decodedFrames: 1,
        emittedActions: 0,
        droppedActions: 1,
      },
    })
  })

  it("resets held mapper state immediately when active state becomes inactive", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    let active = true
    let activeListener: ((active: boolean) => void) | undefined
    await runBrokerUntil(server, {
      getActiveWindow: () => (active ? window : null),
      getWindows: () => [window],
      onActiveChange(listener) {
        activeListener = listener
        return () => {
          activeListener = undefined
        }
      },
      reconnectDelayMs: 10,
    })

    server.send({
      kind: "input",
      deviceId: "pad-1",
      class: "gamepad",
      type: 3,
      code: ABS_HAT0X,
      value: 1,
      timestamp: Date.now(),
    })
    await waitFor(() => actionPayloads(window).length === 1, "initial hold")

    active = false
    activeListener?.(false)
    await waitFor(
      () => statusPayloads(window).at(-1)?.status.active === false,
      "inactive status",
    )
    active = true
    activeListener?.(true)
    await Bun.sleep(450)

    expect(actionPayloads(window)).toHaveLength(1)
  })

  it("pushes status snapshots to all windows and re-pushes them on dom-ready", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => window,
      getWindows: () => [window],
    })

    await waitFor(
      () =>
        window.payloads.some(
          payload =>
            decodeDesktopInputBridgePayload(payload).kind ===
            "korri.input.status",
        ),
      "initial status",
    )
    const initialStatusCount = window.payloads.filter(
      payload =>
        decodeDesktopInputBridgePayload(payload).kind === "korri.input.status",
    ).length

    window.emit("dom-ready")

    await waitFor(
      () =>
        window.payloads.filter(
          payload =>
            decodeDesktopInputBridgePayload(payload).kind ===
            "korri.input.status",
        ).length > initialStatusCount,
      "dom-ready status",
    )
  })

  it("reports invalid inputd URLs as status errors instead of throwing", async () => {
    const window = createWindowDouble()
    const fiber = Effect.runFork(
      createDesktopInputBroker({
        inputdUrl: "not a websocket url",
        getWindows: () => [window],
        getActiveWindow: () => window,
        reconnectDelayMs: 10_000,
      }),
    )
    const dispose = () => Effect.runPromise(Fiber.interrupt(fiber))
    brokerDisposers.push(dispose)

    await waitFor(
      () => statusPayloads(window).at(-1)?.status.inputd === "error",
      "invalid URL status",
    )
    expect(statusPayloads(window).at(-1)?.status.lastError).not.toBeNull()
    await dispose()
    brokerDisposers.splice(brokerDisposers.indexOf(dispose), 1)
  })

  it("pushes incremented status failure counts to remaining healthy windows", async () => {
    const server = createInputServer()
    const throwing = createWindowDouble({ failStatus: true })
    const healthy = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => healthy,
      getWindows: () => [throwing, healthy],
    })

    await waitFor(
      () =>
        statusPayloads(healthy).some(
          payload => payload.status.pushFailures > 0,
        ),
      "push failure count",
    )
    expect(statusPayloads(healthy).at(-1)?.status.pushFailures).toBeGreaterThan(
      0,
    )
  })

  it("does not invoke OS keyboard injection tools", async () => {
    const deploySource = await readFile(
      new URL("./input-broker.ts", import.meta.url),
      "utf8",
    )
    const sharedSource = await readFile(
      new URL(
        "../../../product/platform/input/desktop-input-broker-core.ts",
        import.meta.url,
      ),
      "utf8",
    )

    for (const source of [deploySource, sharedSource]) {
      expect(source).not.toContain("ydotool")
      expect(source).not.toContain("wtype")
      expect(source).not.toContain("uinput")
    }
  })
})

async function runBrokerUntil(
  server: InputServerDouble,
  options: Partial<Parameters<typeof createDesktopInputBroker>[0]>,
) {
  const fiber = Effect.runFork(
    createDesktopInputBroker({
      inputdUrl: `ws://127.0.0.1:${server.port}`,
      getWindows: () => [],
      getActiveWindow: () => null,
      reconnectDelayMs: 10,
      ...options,
    }),
  )
  const dispose = () => Effect.runPromise(Fiber.interrupt(fiber))
  brokerDisposers.push(dispose)
  await waitFor(() => server.messages.length > 0, "subscription")
  return dispose
}

function actionPayloads(window: ReturnType<typeof createWindowDouble>) {
  return window.payloads.filter(
    payload =>
      decodeDesktopInputBridgePayload(payload).kind === "korri.input.action",
  )
}

function statusPayloads(window: ReturnType<typeof createWindowDouble>) {
  return window.payloads
    .map(payload => decodeDesktopInputBridgePayload(payload))
    .filter(payload => payload.kind === "korri.input.status")
}

function createWindowDouble(options: { readonly failStatus?: boolean } = {}) {
  const handlers = new Map<string, Array<() => void>>()
  const payloads: unknown[] = []
  const scripts: string[] = []
  return {
    title: "Korri",
    payloads,
    scripts,
    webview: {
      executeJavascript(script: string) {
        scripts.push(script)
        const payload = payloadFromDispatchScript(script)
        if (
          options.failStatus &&
          decodeDesktopInputBridgePayload(payload).kind === "korri.input.status"
        ) {
          throw new Error("status push failed")
        }
        payloads.push(payload)
      },
      on(event: string, handler: () => void) {
        const list = handlers.get(event) ?? []
        list.push(handler)
        handlers.set(event, list)
      },
    },
    emit(event: string) {
      for (const handler of handlers.get(event) ?? []) handler()
    },
  }
}

function payloadFromDispatchScript(script: string): unknown {
  const prefix = "window.__korriInputDispatch?.("
  const suffix = ");"
  if (!script.startsWith(prefix) || !script.endsWith(suffix)) {
    throw new Error(`unexpected input dispatch script: ${script}`)
  }
  return JSON.parse(script.slice(prefix.length, -suffix.length))
}

function createInputServer(): InputServerDouble {
  const sockets = new Set<ServerWebSocket<unknown>>()
  const messages: unknown[] = []
  const server = Bun.serve({
    port: 0,
    fetch(request, server) {
      if (server.upgrade(request)) return undefined
      return new Response("inputd test server")
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
  if (!server.port) throw new Error("input test server did not bind")
  const handle = {
    port: server.port,
    messages,
    send(payload: unknown) {
      for (const socket of sockets) socket.send(JSON.stringify(payload))
    },
    stop() {
      for (const socket of sockets) socket.close()
      server.stop(true)
    },
  }
  servers.push(handle)
  return handle
}

async function waitFor(
  predicate: () => boolean,
  description: string,
): Promise<void> {
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await Bun.sleep(10)
  }
  throw new Error(`timed out waiting for ${description}`)
}
