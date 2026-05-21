import { describe, expect, it } from "bun:test"
import type { ConnectionStateBridgeState } from "./connection-state-bridge"
import { isConnectionStateBridgeState } from "./connection-state-bridge"
import { installConnectionStateBridge } from "./preload"

interface WindowDouble {
  __korriConnection?: unknown
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

const SEARCHING: ConnectionStateBridgeState = {
  status: "searching",
  since: new Date("2026-01-01T00:00:00Z").toISOString(),
  helpAfter: new Date("2026-01-01T00:00:30Z").toISOString(),
}

const RECONNECTING: ConnectionStateBridgeState = {
  status: "reconnecting",
  server: { hostId: "aka", controlUrl: "http://aka:3010" },
  since: new Date("2026-01-01T00:00:00Z").toISOString(),
  helpAfter: new Date("2026-01-01T00:00:30Z").toISOString(),
}

describe("connection-state bridge type guard", () => {
  it("accepts a searching state", () => {
    expect(isConnectionStateBridgeState(SEARCHING)).toBe(true)
  })

  it("accepts a reconnecting state", () => {
    expect(isConnectionStateBridgeState(RECONNECTING)).toBe(true)
  })

  it("accepts a connected state", () => {
    expect(isConnectionStateBridgeState(CONNECTED)).toBe(true)
  })

  it("rejects an unknown status", () => {
    expect(
      isConnectionStateBridgeState({ status: "wat", since: "x", helpAfter: "y" }),
    ).toBe(false)
  })

  it("rejects a reconnecting state without a server", () => {
    expect(
      isConnectionStateBridgeState({
        status: "reconnecting",
        since: SEARCHING.since,
        helpAfter: SEARCHING.helpAfter,
      }),
    ).toBe(false)
  })

  it("rejects null and primitives", () => {
    expect(isConnectionStateBridgeState(null)).toBe(false)
    expect(isConnectionStateBridgeState(42)).toBe(false)
    expect(isConnectionStateBridgeState("connected")).toBe(false)
  })
})

describe("installConnectionStateBridge", () => {
  it("installs window.__korriConnection with getState() and subscribe()", () => {
    const w = makeWindow()
    const bridge = installConnectionStateBridge(w as unknown as Window & typeof globalThis)
    expect(w.__korriConnection).toBe(bridge)
    expect(typeof bridge.getState).toBe("function")
    expect(typeof bridge.subscribe).toBe("function")
  })

  it("returns an initial searching state before any push", () => {
    const w = makeWindow()
    const bridge = installConnectionStateBridge(w as unknown as Window & typeof globalThis)
    expect(bridge.getState().status).toBe("searching")
  })

  it("delivers incoming state to subscribers and updates getState()", () => {
    const w = makeWindow()
    const bridge = installConnectionStateBridge(w as unknown as Window & typeof globalThis)
    const received: ConnectionStateBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.(CONNECTED)

    expect(received).toEqual([CONNECTED])
    expect(bridge.getState()).toEqual(CONNECTED)
  })

  it("ignores malformed payloads without throwing", () => {
    const w = makeWindow()
    const bridge = installConnectionStateBridge(w as unknown as Window & typeof globalThis)
    const received: ConnectionStateBridgeState[] = []
    bridge.subscribe(state => received.push(state))

    w.__electrobun?.receiveMessageFromBun?.({ status: "garbage" })
    w.__electrobun?.receiveMessageFromBun?.(null)
    w.__electrobun?.receiveMessageFromBun?.("hello")

    expect(received).toEqual([])
    expect(bridge.getState().status).toBe("searching")
  })

  it("unsubscribe stops delivering to that listener only", () => {
    const w = makeWindow()
    const bridge = installConnectionStateBridge(w as unknown as Window & typeof globalThis)
    const a: ConnectionStateBridgeState[] = []
    const b: ConnectionStateBridgeState[] = []
    const unsubA = bridge.subscribe(state => a.push(state))
    bridge.subscribe(state => b.push(state))

    w.__electrobun?.receiveMessageFromBun?.(SEARCHING)
    unsubA()
    w.__electrobun?.receiveMessageFromBun?.(CONNECTED)

    expect(a).toEqual([SEARCHING])
    expect(b).toEqual([SEARCHING, CONNECTED])
  })

  it("preserves any other electrobun keys when overriding receiveMessageFromBun", () => {
    const w: WindowDouble = {
      __electrobun: {
        receiveInternalMessageFromBun: () => {},
      },
    }
    installConnectionStateBridge(w as unknown as Window & typeof globalThis)
    expect(typeof w.__electrobun?.receiveInternalMessageFromBun).toBe("function")
    expect(typeof w.__electrobun?.receiveMessageFromBun).toBe("function")
  })
})
