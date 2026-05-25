import { describe, expect, it } from "bun:test"
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

describe("desktop input preload dispatch", () => {
  it("installs a Korri-owned dispatch function without creating an Electrobun receive hook", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )

    expect(w.__korriInput).toBe(bridge)
    expect(typeof w.__korriInputDispatch).toBe("function")
    expect(w.__electrobun).toBeUndefined()
  })

  it("does not depend on Electrobun replacing receiveMessageFromBun", () => {
    const w = makeWindow()
    const bridge = installDesktopInputBridge(
      w as unknown as Window & typeof globalThis,
    )
    const actions: unknown[] = []
    const electrobunReceived: unknown[] = []
    bridge.subscribeAction(action => actions.push(action))

    w.__electrobun = {
      receiveMessageFromBun: msg => electrobunReceived.push(msg),
    }
    w.__electrobun.receiveMessageFromBun?.({ kind: "electrobun-owned" })
    w.__korriInputDispatch?.({
      kind: "korri.input.action",
      sequence: 1,
      timestamp: 123,
      action: { type: "confirm", source: "native" },
    })

    expect(electrobunReceived).toEqual([{ kind: "electrobun-owned" }])
    expect(actions).toEqual([{ type: "confirm", source: "native" }])
  })
})
