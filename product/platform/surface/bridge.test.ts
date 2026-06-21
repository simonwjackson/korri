import { describe, expect, it } from "bun:test"
import type { InputListener } from "@platform/input/types"
import type { KorriSurfaceEntrypoint } from "./bridge"

const noReactSurface: KorriSurfaceEntrypoint = {
  id: "bridge-contract",
  mount(host, { bridge }) {
    let disposed = false
    const unsubscribe = bridge.input.subscribe(action => {
      if (disposed) return
      const target = host.querySelector("[data-demo-last-input]")
      if (target) target.textContent = action.type
    })

    host.innerHTML = `
      <main data-bridge-contract-surface>
        <p>Library items: <strong data-demo-library-count>loading</strong></p>
        <p>Last semantic input: <strong data-demo-last-input>none</strong></p>
      </main>
    `

    void bridge.library.list().then(items => {
      if (disposed) return
      const target = host.querySelector("[data-demo-library-count]")
      if (target) target.textContent = String(items.length)
    })

    return () => {
      disposed = true
      unsubscribe()
    }
  },
}

describe("Korri surface bridge contract", () => {
  it("mounts without React and consumes platform library + input capabilities", async () => {
    let inputListener: InputListener | undefined
    const host = document.createElement("section")

    const dispose = noReactSurface.mount(host, {
      bridge: {
        library: {
          list: async () => [{ title: "Celeste" }, { title: "Hades" }],
          launch: async () => {},
        },
        input: {
          subscribe(listener) {
            inputListener = listener
            return () => {
              inputListener = undefined
            }
          },
        },
        foregroundSession: {
          get: async () => ({ _tag: "Ready" }),
        },
        api: {
          rpc: async () => ({}),
        },
      },
    })

    await Promise.resolve()

    expect(host.querySelector("[data-demo-library-count]")?.textContent).toBe(
      "2",
    )

    inputListener?.({ type: "menu", source: "keyboard" })
    expect(host.querySelector("[data-demo-last-input]")?.textContent).toBe(
      "menu",
    )

    if (typeof dispose === "function") dispose()
    expect(inputListener).toBeUndefined()
  })
})
