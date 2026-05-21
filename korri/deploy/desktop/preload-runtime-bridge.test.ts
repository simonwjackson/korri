import { describe, expect, it } from "bun:test"

import type { ConnectionStateBridgeState } from "./connection-state-bridge"
import {
  installConnectionStateBridge,
  installRuntimeBridge,
} from "./preload"
import type { RuntimeConfigBridgeState } from "./runtime-config-bridge"

interface WindowDouble {
  __korriConnection?: unknown
  __korriRuntime?: unknown
  __electrobun?: {
    receiveMessageFromBun?: (msg: unknown) => void
    [k: string]: unknown
  }
}

function makeWindow(): WindowDouble {
  return {}
}

const CONNECTED: ConnectionStateBridgeState = {
  status: "connected",
  server: { hostId: "aka", controlUrl: "http://aka:3010" },
}

const RUNTIME_WITH_URL: RuntimeConfigBridgeState = {
  nativeBridgeUrl: "ws://127.0.0.1:3002",
}

const RUNTIME_WITHOUT_URL: RuntimeConfigBridgeState = {
  nativeBridgeUrl: null,
}

describe("installRuntimeBridge", () => {
  it("installs window.__korriRuntime with getState() and subscribe()", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(w as unknown as Window & typeof globalThis)
    expect(w.__korriRuntime).toBe(bridge)
    expect(typeof bridge.getState).toBe("function")
    expect(typeof bridge.subscribe).toBe("function")
  })

  it("returns an initial state with null nativeBridgeUrl before any push", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(w as unknown as Window & typeof globalThis)
    expect(bridge.getState()).toEqual({ nativeBridgeUrl: null })
  })

  it("delivers incoming state to subscribers and updates getState()", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(w as unknown as Window & typeof globalThis)
    const received: RuntimeConfigBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITH_URL)

    expect(received).toEqual([RUNTIME_WITH_URL])
    expect(bridge.getState()).toEqual(RUNTIME_WITH_URL)
  })

  it("accepts an explicit-null payload", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(w as unknown as Window & typeof globalThis)
    const received: RuntimeConfigBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITHOUT_URL)

    expect(received).toEqual([RUNTIME_WITHOUT_URL])
  })

  it("ignores malformed payloads without throwing", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(w as unknown as Window & typeof globalThis)
    const received: RuntimeConfigBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.({ nativeBridgeUrl: 42 })
    w.__electrobun?.receiveMessageFromBun?.({ nativeBridgeUrl: undefined })
    w.__electrobun?.receiveMessageFromBun?.(null)
    w.__electrobun?.receiveMessageFromBun?.("hello")

    expect(received).toEqual([])
    expect(bridge.getState()).toEqual({ nativeBridgeUrl: null })
  })

  it("unsubscribe stops delivering to that listener only", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(w as unknown as Window & typeof globalThis)
    const a: RuntimeConfigBridgeState[] = []
    const b: RuntimeConfigBridgeState[] = []
    const unsubA = bridge.subscribe(state => a.push(state))
    bridge.subscribe(state => b.push(state))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITHOUT_URL)
    unsubA()
    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITH_URL)

    expect(a).toEqual([RUNTIME_WITHOUT_URL])
    expect(b).toEqual([RUNTIME_WITHOUT_URL, RUNTIME_WITH_URL])
  })

  it("creates __electrobun when missing", () => {
    const w = makeWindow()
    installRuntimeBridge(w as unknown as Window & typeof globalThis)
    expect(typeof w.__electrobun?.receiveMessageFromBun).toBe("function")
  })
})

describe("installRuntimeBridge composed with installConnectionStateBridge", () => {
  it("connection-state push reaches connection subscribers only", () => {
    const w = makeWindow()
    const connection = installConnectionStateBridge(
      w as unknown as Window & typeof globalThis,
    )
    const runtime = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )

    const connectionEvents: ConnectionStateBridgeState[] = []
    const runtimeEvents: RuntimeConfigBridgeState[] = []
    connection.subscribe(s => connectionEvents.push(s))
    runtime.subscribe(s => runtimeEvents.push(s))

    w.__electrobun?.receiveMessageFromBun?.(CONNECTED)

    expect(connectionEvents).toEqual([CONNECTED])
    expect(runtimeEvents).toEqual([])
  })

  it("runtime-config push reaches runtime subscribers only", () => {
    const w = makeWindow()
    const connection = installConnectionStateBridge(
      w as unknown as Window & typeof globalThis,
    )
    const runtime = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )

    const connectionEvents: ConnectionStateBridgeState[] = []
    const runtimeEvents: RuntimeConfigBridgeState[] = []
    connection.subscribe(s => connectionEvents.push(s))
    runtime.subscribe(s => runtimeEvents.push(s))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITH_URL)

    expect(connectionEvents).toEqual([])
    expect(runtimeEvents).toEqual([RUNTIME_WITH_URL])
  })

  it("install order does not matter — runtime first then connection", () => {
    const w = makeWindow()
    const runtime = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    const connection = installConnectionStateBridge(
      w as unknown as Window & typeof globalThis,
    )

    const connectionEvents: ConnectionStateBridgeState[] = []
    const runtimeEvents: RuntimeConfigBridgeState[] = []
    connection.subscribe(s => connectionEvents.push(s))
    runtime.subscribe(s => runtimeEvents.push(s))

    w.__electrobun?.receiveMessageFromBun?.(CONNECTED)
    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITH_URL)

    expect(connectionEvents).toEqual([CONNECTED])
    expect(runtimeEvents).toEqual([RUNTIME_WITH_URL])
  })

  it("a throwing subscriber in one bridge does not poison the chain for the other", () => {
    const w = makeWindow()
    const connection = installConnectionStateBridge(
      w as unknown as Window & typeof globalThis,
    )
    const runtime = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )

    // Connection subscriber throws on every push.
    connection.subscribe(() => {
      throw new Error("connection subscriber blew up")
    })

    const runtimeEvents: RuntimeConfigBridgeState[] = []
    runtime.subscribe(s => runtimeEvents.push(s))

    // Push something that matches the connection bridge — the throwing
    // subscriber fires, but the chain must continue running the runtime
    // acceptor so a later runtime push still reaches its subscribers.
    expect(() =>
      w.__electrobun?.receiveMessageFromBun?.(CONNECTED),
    ).not.toThrow()

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_WITH_URL)

    expect(runtimeEvents).toEqual([RUNTIME_WITH_URL])
  })
})
