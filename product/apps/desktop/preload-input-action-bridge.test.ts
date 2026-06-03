import { describe, expect, it } from "bun:test"

import type {
  DesktopInputActionBridgePayload,
  DesktopInputStatusBridgePayload,
} from "@platform/input/desktop-bridge-wire"
import { installDesktopInputBridge } from "./preload"

interface WindowDouble {
  __korriInput?: unknown
  __korriInputDispatch?: (payload: unknown) => void
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

describe("installDesktopInputBridge", () => {
  it("installs window.__korriInput with action and status subscriptions", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )

    expect(w.__korriInput).toBe(bridge)
    expect(typeof w.__korriInputDispatch).toBe("function")
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
    w.__korriInputDispatch?.(INPUT_ACTION)
    bridge.subscribeAction(action => second.push(action))

    expect(first).toEqual([INPUT_ACTION.action])
    expect(second).toEqual([])
  })

  it("continues delivering actions when Electrobun owns receiveMessageFromBun", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    const actions: DesktopInputActionBridgePayload["action"][] = []
    const electrobunReceived: unknown[] = []
    bridge.subscribeAction(action => actions.push(action))

    w.__electrobun = {
      receiveMessageFromBun: msg => electrobunReceived.push(msg),
    }
    w.__electrobun.receiveMessageFromBun?.({ kind: "electrobun-owned" })
    w.__korriInputDispatch?.(INPUT_ACTION)

    expect(electrobunReceived).toEqual([{ kind: "electrobun-owned" }])
    expect(actions).toEqual([INPUT_ACTION.action])
  })

  it("stores and publishes broker status snapshots", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    const statuses: DesktopInputStatusBridgePayload["status"][] = []
    bridge.subscribeStatus(status => statuses.push(status))

    w.__korriInputDispatch?.(INPUT_STATUS)

    expect(statuses).toEqual([INPUT_STATUS.status])
    expect(bridge.getStatus()).toEqual(INPUT_STATUS.status)
  })

  it("ignores non-input payloads (no collision with connection/runtime shapes)", () => {
    // Connection-state and runtime-config are no longer pushed over
    // the preload bridge (U6); the input bridge must still ignore
    // payloads shaped like the old wire formats so a future revival
    // of either contract on a different channel wouldn't accidentally
    // dispatch as input.
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    const actions: DesktopInputActionBridgePayload["action"][] = []
    bridge.subscribeAction(action => actions.push(action))

    w.__korriInputDispatch?.({
      status: "connected",
      server: { hostId: "x", controlUrl: "http://x" },
    })
    w.__korriInputDispatch?.({ desktopInput: true })

    expect(actions).toEqual([])
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
      w.__korriInputDispatch?.({
        kind: "korri.input.action",
        sequence: 1,
        timestamp: 123,
        action: { type: "direction", source: "native" },
      })
      w.__korriInputDispatch?.(INPUT_ACTION)
      w.__korriInputDispatch?.(INPUT_STATUS)
    }).not.toThrow()

    expect(statuses).toEqual([INPUT_STATUS.status])
  })
})
