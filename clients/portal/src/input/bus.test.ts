import { describe, expect, it } from "bun:test"
import { createInputBus } from "./bus"

/**
 * Tests for the device-agnostic input bus.
 */

describe("createInputBus", () => {
  it("emits actions to all listeners and supports unsubscribe", () => {
    const bus = createInputBus()
    const seen: string[] = []

    const offA = bus.on(action => seen.push(`a:${action.type}`))
    bus.on(action => seen.push(`b:${action.type}`))

    bus.emit({ type: "confirm" })
    offA()
    bus.emit({ type: "back" })

    expect(seen).toEqual(["a:confirm", "b:confirm", "b:back"])
  })

  it("filters listeners by action type", () => {
    const bus = createInputBus()
    const seen: string[] = []

    bus.onAction("confirm", () => seen.push("confirm"))
    bus.emit({ type: "direction", direction: "right" })
    bus.emit({ type: "confirm" })
    bus.emit({ type: "back" })

    expect(seen).toEqual(["confirm"])
  })

  it("snapshots listeners so they can unsubscribe during dispatch", () => {
    const bus = createInputBus()
    const seen: string[] = []

    const offA = bus.on(() => {
      seen.push("a")
      offA()
    })
    bus.on(() => seen.push("b"))

    bus.emit({ type: "confirm" })
    bus.emit({ type: "confirm" })

    expect(seen).toEqual(["a", "b", "b"])
  })

  it("attaches adapters and disposes them", () => {
    const bus = createInputBus()
    const seen: string[] = []
    let disposed = false

    const detach = bus.use({
      name: "test-adapter",
      start(emit) {
        emit({ type: "menu" })
        return () => {
          disposed = true
        }
      },
    })

    bus.on(action => seen.push(action.type))
    bus.emit({ type: "back" })
    detach()

    expect(seen).toEqual(["back"])
    expect(disposed).toBe(true)
  })

  it("dispose removes listeners and adapter disposers", () => {
    const bus = createInputBus()
    const seen: string[] = []
    let disposed = false

    bus.on(action => seen.push(action.type))
    bus.use({
      name: "test-adapter",
      start() {
        return () => {
          disposed = true
        }
      },
    })

    bus.dispose()
    bus.emit({ type: "confirm" })

    expect(seen).toEqual([])
    expect(disposed).toBe(true)
  })
})
