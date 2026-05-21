import type { ServerWebSocket } from "bun"
import { afterEach, describe, expect, it } from "bun:test"
import { ABS_HAT0X } from "@shared/input/native/button-codes"
import { decodeDesktopInputBridgePayload } from "@shared/input/desktop-bridge-wire"
import { Effect, Fiber } from "effect"
import { createDesktopInputBroker } from "./input-broker"

interface InputServerDouble {
  readonly port: number
  readonly messages: unknown[]
  send(payload: unknown): void
  stop(): void
}

const servers: InputServerDouble[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.stop()
})

describe("createDesktopInputBroker", () => {
  it("subscribes to inputd, maps gamepad frames, and pushes semantic actions to the active webview", async () => {
    const server = createInputServer()
    const window = createWindowDouble()
    await runBrokerUntil(server, {
      getActiveWindow: () => window,
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

    await waitFor(() => window.payloads.length === 1, "input action")
    expect(decodeDesktopInputBridgePayload(window.payloads[0])).toMatchObject({
      kind: "korri.input.action",
      action: { type: "direction", direction: "right", source: "native" },
    })
  })

  it("fails closed when the active window is unknown", async () => {
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
    expect(
      window.payloads.filter(
        payload =>
          decodeDesktopInputBridgePayload(payload).kind ===
          "korri.input.action",
      ),
    ).toEqual([])
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
  await waitFor(() => server.messages.length > 0, "subscription")
  return () => Effect.runPromise(Fiber.interrupt(fiber))
}

function createWindowDouble() {
  const handlers = new Map<string, Array<() => void>>()
  const payloads: unknown[] = []
  return {
    title: "Korri",
    payloads,
    webview: {
      sendMessageToWebviewViaExecute(payload: unknown) {
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
