import { describe, expect, it } from "bun:test"
import { createInputDispatchBootstrapScript } from "./input-dispatch-bootstrap"

type WindowDouble = {
  __korriInput?: {
    subscribeAction: (listener: (action: unknown) => void) => () => void
    getStatus: () => unknown
    subscribeStatus: (listener: (status: unknown) => void) => () => void
  }
  __korriInputDispatch?: (payload: unknown) => void
}

function installOn(window: WindowDouble) {
  const fn = new Function("window", createInputDispatchBootstrapScript())
  fn(window)
}

describe("input dispatch bootstrap", () => {
  it("installs a Korri-owned bridge and dispatch function", () => {
    const window: WindowDouble = {}
    installOn(window)

    expect(typeof window.__korriInput?.subscribeAction).toBe("function")
    expect(typeof window.__korriInput?.getStatus).toBe("function")
    expect(typeof window.__korriInput?.subscribeStatus).toBe("function")
    expect(typeof window.__korriInputDispatch).toBe("function")
  })

  it("delivers actions without replay and keeps status replayable", () => {
    const window: WindowDouble = {}
    installOn(window)
    const first: unknown[] = []
    const second: unknown[] = []
    const statuses: unknown[] = []

    window.__korriInput?.subscribeAction(action => first.push(action))
    window.__korriInputDispatch?.({
      kind: "korri.input.action",
      action: { type: "confirm", source: "native" },
    })
    window.__korriInput?.subscribeAction(action => second.push(action))
    window.__korriInput?.subscribeStatus(status => statuses.push(status))
    window.__korriInputDispatch?.({
      kind: "korri.input.status",
      status: {
        inputd: "connected",
        active: true,
        decodedFrames: 1,
        emittedActions: 1,
        droppedActions: 0,
        pushFailures: 0,
        lastError: null,
      },
    })

    expect(first).toEqual([{ type: "confirm", source: "native" }])
    expect(second).toEqual([])
    expect(statuses).toEqual([window.__korriInput?.getStatus()])
  })

  it("does not replace an existing preload dispatch", () => {
    const dispatches: unknown[] = []
    const window: WindowDouble = {
      __korriInputDispatch: payload => dispatches.push(payload),
    }

    installOn(window)
    window.__korriInputDispatch?.({ kind: "kept" })

    expect(dispatches).toEqual([{ kind: "kept" }])
    expect(window.__korriInput).toBeUndefined()
  })
})
