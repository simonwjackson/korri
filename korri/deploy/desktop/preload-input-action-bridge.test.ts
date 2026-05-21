import { describe, expect, it } from "bun:test"

import type {
  DesktopInputActionBridgePayload,
  DesktopInputStatusBridgePayload,
} from "@shared/input/desktop-bridge-wire"
import {
  isConnectionStateBridgeState,
  type ConnectionStateBridgeState,
} from "./connection-state-bridge"
import {
  installConnectionStateBridge,
  installDesktopInputBridge,
  installRuntimeBridge,
} from "./preload"
import { isRuntimeConfigBridgeState } from "./runtime-config-bridge"

interface WindowDouble {
  __korriInput?: unknown
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

const INPUT_ACTION: DesktopInputActionBridgePayload = {
  kind: "korri.input.action",
  sequence: 1,
  timestamp: 123,
  action: { type: "direction", direction: "right", source: "native" },
}

const INPUT_STATUS: DesktopInputStatusBridgePayload = {
  kind: "korri.input.status",
  status: {
    inputd: "connected",
    active: true,
    decodedFrames: 3,
    emittedActions: 2,
    droppedActions: 1,
    pushFailures: 0,
    lastError: null,
  },
}

const CONNECTED: ConnectionStateBridgeState = {
  status: "connected",
  server: { hostId: "aka", controlUrl: "http://aka:3010" },
}

const RUNTIME = { nativeBridgeUrl: "ws://127.0.0.1:3002" }

describe("installDesktopInputBridge", () => {
  it("installs window.__korriInput with action and status subscriptions", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )

    expect(w.__korriInput).toBe(bridge)
    expect(typeof bridge.subscribeAction).toBe("function")
    expect(typeof bridge.getStatus).toBe("function")
    expect(typeof bridge.subscribeStatus).toBe("function")
  })

  it("delivers input actions without replaying them to later subscribers", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    const first: DesktopInputActionBridgePayload["action"][] = []
    const second: DesktopInputActionBridgePayload["action"][] = []

    bridge.subscribeAction(action => first.push(action))
    w.__electrobun?.receiveMessageFromBun?.(INPUT_ACTION)
    bridge.subscribeAction(action => second.push(action))

    expect(first).toEqual([INPUT_ACTION.action])
    expect(second).toEqual([])
  })

  it("stores and publishes broker status snapshots", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    const statuses: DesktopInputStatusBridgePayload["status"][] = []
    bridge.subscribeStatus(status => statuses.push(status))

    w.__electrobun?.receiveMessageFromBun?.(INPUT_STATUS)

    expect(statuses).toEqual([INPUT_STATUS.status])
    expect(bridge.getStatus()).toEqual(INPUT_STATUS.status)
  })

  it("composes with connection and runtime bridges without message collisions", () => {
    const w = makeWindow()
    const connection = installConnectionStateBridge(
      w as unknown as Window & typeof globalThis,
    )
    const runtime = installRuntimeBridge(
      w as unknown as Window & typeof globalThis,
    )
    const input = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )

    const connectionEvents: ConnectionStateBridgeState[] = []
    const runtimeEvents: unknown[] = []
    const actions: DesktopInputActionBridgePayload["action"][] = []

    connection.subscribe(state => connectionEvents.push(state))
    runtime.subscribe(state => runtimeEvents.push(state))
    input.subscribeAction(action => actions.push(action))

    w.__electrobun?.receiveMessageFromBun?.(INPUT_ACTION)
    w.__electrobun?.receiveMessageFromBun?.(CONNECTED)
    w.__electrobun?.receiveMessageFromBun?.(RUNTIME)

    expect(actions).toEqual([INPUT_ACTION.action])
    expect(connectionEvents).toEqual([CONNECTED])
    expect(runtimeEvents).toEqual([RUNTIME])
    expect(isConnectionStateBridgeState(INPUT_ACTION)).toBe(false)
    expect(isRuntimeConfigBridgeState(INPUT_ACTION)).toBe(false)
  })

  it("ignores malformed input payloads and isolates throwing subscribers", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    bridge.subscribeAction(() => {
      throw new Error("action subscriber failed")
    })
    const statuses: DesktopInputStatusBridgePayload["status"][] = []
    bridge.subscribeStatus(status => statuses.push(status))

    expect(() => {
      w.__electrobun?.receiveMessageFromBun?.({
        kind: "korri.input.action",
        sequence: 1,
        timestamp: 123,
        action: { type: "direction", source: "native" },
      })
      w.__electrobun?.receiveMessageFromBun?.(INPUT_ACTION)
      w.__electrobun?.receiveMessageFromBun?.(INPUT_STATUS)
    }).not.toThrow()

    expect(statuses).toEqual([INPUT_STATUS.status])
  })
})
