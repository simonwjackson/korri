import { describe, expect, it } from "bun:test"
import type { InputListener } from "@platform/input/types"
import { plainDemoTheme } from "./entry"

describe("plain demo theme entrypoint", () => {
  it("mounts without React and consumes platform library + input capabilities", async () => {
    let inputListener: InputListener | undefined
    const host = document.createElement("section")

    const dispose = plainDemoTheme.mount(host, {
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
