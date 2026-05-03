import { afterEach, describe, expect, it } from "bun:test"
import { createInputBus } from "@shared/input/bus"
import { installNavigationDiagnostics } from "./diagnostics"

describe("installNavigationDiagnostics", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("logs input actions and DOM focus changes", () => {
    document.body.innerHTML = `
      <button id="first" data-tile-id="game-1" aria-label="First Game">First</button>
    `
    const first = document.getElementById("first") as HTMLButtonElement
    const bus = createInputBus()
    const entries: Array<{
      fields: Readonly<Record<string, unknown>>
      message: string
    }> = []

    const dispose = installNavigationDiagnostics(bus, {
      log: (fields, message) => entries.push({ fields, message }),
    })

    bus.emit({ type: "direction", direction: "right", source: "gamepad" })
    first.focus()

    expect(entries).toEqual([
      {
        message: "navigation: input action",
        fields: {
          event: "input-action",
          action: "direction",
          source: "gamepad",
          direction: "right",
        },
      },
      {
        message: "navigation: focus changed",
        fields: {
          event: "focus",
          target: {
            tag: "button",
            id: "first",
            ariaLabel: "First Game",
            tileId: "game-1",
            text: "First",
          },
        },
      },
    ])

    dispose()
  })

  it("skips high-volume pointer activity unless explicitly enabled", () => {
    const bus = createInputBus()
    const entries: Array<{
      fields: Readonly<Record<string, unknown>>
      message: string
    }> = []

    const dispose = installNavigationDiagnostics(bus, {
      log: (fields, message) => entries.push({ fields, message }),
    })

    bus.emit({ type: "pointer-activity", source: "pointer" })
    expect(entries).toEqual([])

    dispose()

    const disposeVerbose = installNavigationDiagnostics(bus, {
      includePointerActivity: true,
      log: (fields, message) => entries.push({ fields, message }),
    })

    bus.emit({ type: "pointer-activity", source: "pointer" })

    expect(entries).toEqual([
      {
        message: "navigation: input action",
        fields: {
          event: "input-action",
          action: "pointer-activity",
          source: "pointer",
        },
      },
    ])

    disposeVerbose()
  })

  it("stops logging after dispose", () => {
    document.body.innerHTML = `<button id="first">First</button>`
    const first = document.getElementById("first") as HTMLButtonElement
    const bus = createInputBus()
    const entries: Array<{
      fields: Readonly<Record<string, unknown>>
      message: string
    }> = []

    const dispose = installNavigationDiagnostics(bus, {
      log: (fields, message) => entries.push({ fields, message }),
    })
    dispose()

    bus.emit({ type: "confirm", source: "keyboard" })
    first.focus()

    expect(entries).toEqual([])
  })
})
