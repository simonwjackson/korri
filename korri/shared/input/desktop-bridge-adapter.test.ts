import { describe, expect, it } from "bun:test"
import { createDesktopBridgeAdapter } from "./desktop-bridge-adapter"
import type { InputAction } from "./types"

interface BridgeDouble {
  listener?: (action: InputAction) => void
  unsubscribed: boolean
  subscribeAction(listener: (action: InputAction) => void): () => void
}

function createBridge(): BridgeDouble {
  return {
    unsubscribed: false,
    subscribeAction(listener) {
      this.listener = listener
      return () => {
        this.unsubscribed = true
      }
    },
  }
}

describe("createDesktopBridgeAdapter", () => {
  it("emits semantic actions received from the desktop input bridge", () => {
    const bridge = createBridge()
    const emitted: InputAction[] = []

    createDesktopBridgeAdapter({ bridge }).start(action => emitted.push(action))
    bridge.listener?.({
      type: "direction",
      direction: "right",
      source: "native",
    })
    bridge.listener?.({ type: "confirm", source: "native" })

    expect(emitted).toEqual([
      { type: "direction", direction: "right", source: "native" },
      { type: "confirm", source: "native" },
    ])
  })

  it("unsubscribes from the desktop bridge on dispose", () => {
    const bridge = createBridge()
    const dispose = createDesktopBridgeAdapter({ bridge }).start(() => {})

    dispose()

    expect(bridge.unsubscribed).toBe(true)
  })

  it("subscribes when the global desktop bridge appears after startup", async () => {
    const bridge = createBridge()
    const emitted: InputAction[] = []
    const globalWithWindow = globalThis as unknown as {
      window?: { __korriInput?: unknown }
    }
    const previousWindow = globalWithWindow.window

    globalWithWindow.window = {}
    const dispose = createDesktopBridgeAdapter().start(action =>
      emitted.push(action),
    )

    try {
      globalWithWindow.window.__korriInput = bridge
      await Bun.sleep(120)

      bridge.listener?.({
        type: "direction",
        direction: "right",
        source: "native",
      })

      expect(emitted).toEqual([
        { type: "direction", direction: "right", source: "native" },
      ])
    } finally {
      dispose()
      globalWithWindow.window = previousWindow
    }
  })

  it("is a safe no-op when no desktop bridge is available", () => {
    const emitted: InputAction[] = []
    const dispose = createDesktopBridgeAdapter({ bridge: undefined }).start(
      action => emitted.push(action),
    )

    dispose()

    expect(emitted).toEqual([])
  })
})
