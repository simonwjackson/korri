import { describe, expect, it } from "bun:test"

import type { ConnectionStateBridgeState } from "./connection-state-bridge"
import { installConnectionStateBridge, installRuntimeBridge } from "./preload"
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

const RUNTIME_ENABLED: RuntimeConfigBridgeState = { desktopInput: true }
const RUNTIME_DISABLED: RuntimeConfigBridgeState = { desktopInput: false }

describe("installRuntimeBridge", () => {
  it("installs window.__korriRuntime with getState() and subscribe()", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    expect(w.__korriRuntime).toBe(bridge)
    expect(typeof bridge.getState).toBe("function")
    expect(typeof bridge.subscribe).toBe("function")
  })

  it("returns an initial state with desktop input disabled before any push", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    expect(bridge.getState()).toEqual({ desktopInput: false })
  })

  it("delivers incoming state to subscribers and updates getState()", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    const received: RuntimeConfigBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_ENABLED)

    expect(received).toEqual([RUNTIME_ENABLED])
    expect(bridge.getState()).toEqual(RUNTIME_ENABLED)
  })

  it("accepts an explicit-disabled payload", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    const received: RuntimeConfigBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_DISABLED)

    expect(received).toEqual([RUNTIME_DISABLED])
  })

  it("ignores malformed payloads without throwing", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    const received: RuntimeConfigBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.({ nativeBridgeUrl: "ws://x" })
    w.__electrobun?.receiveMessageFromBun?.({ desktopInput: "true" })
    w.__electrobun?.receiveMessageFromBun?.(null)
    w.__electrobun?.receiveMessageFromBun?.("hello")

    expect(received).toEqual([])
    expect(bridge.getState()).toEqual({ desktopInput: false })
  })

  it("unsubscribe stops delivering to that listener only", () => {
    const w = makeWindow()
    const bridge = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    const a: RuntimeConfigBridgeState[] = []
    const b: RuntimeConfigBridgeState[] = []
    const unsubA = bridge.subscribe(state => a.push(state))
    bridge.subscribe(state => b.push(state))

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_DISABLED)
    unsubA()
    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_ENABLED)

    expect(a).toEqual([RUNTIME_DISABLED])
    expect(b).toEqual([RUNTIME_DISABLED, RUNTIME_ENABLED])
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

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_ENABLED)

    expect(connectionEvents).toEqual([])
    expect(runtimeEvents).toEqual([RUNTIME_ENABLED])
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
    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_ENABLED)

    expect(connectionEvents).toEqual([CONNECTED])
    expect(runtimeEvents).toEqual([RUNTIME_ENABLED])
  })

  it("a throwing subscriber in one bridge does not poison the chain for the other", () => {
    const w = makeWindow()
    const connection = installConnectionStateBridge(
      w as unknown as Window & typeof globalThis,
    )
    const runtime = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )

    connection.subscribe(() => {
      throw new Error("connection subscriber blew up")
    })

    const runtimeEvents: RuntimeConfigBridgeState[] = []
    runtime.subscribe(s => runtimeEvents.push(s))

    expect(() =>
      w.__electrobun?.receiveMessageFromBun?.(CONNECTED),
    ).not.toThrow()

    w.__electrobun?.receiveMessageFromBun?.(RUNTIME_ENABLED)

    expect(runtimeEvents).toEqual([RUNTIME_ENABLED])
  })
})
