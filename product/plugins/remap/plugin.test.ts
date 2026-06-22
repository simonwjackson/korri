import { describe, expect, it } from "bun:test"
import { firstPartyPlugins } from ".."
import { KORRI_REMAP_PLUGIN_ID, remapPlugin } from "."

describe("Remap plugin", () => {
  it("declares the product-facing provider id", () => {
    expect(KORRI_REMAP_PLUGIN_ID).toBe("@korri:remap")
    expect(remapPlugin.id).toBe(KORRI_REMAP_PLUGIN_ID)
  })

  it("registers Remap as a first-party launch companion plugin", () => {
    const plugin = firstPartyPlugins.find(
      candidate => candidate.id === KORRI_REMAP_PLUGIN_ID,
    )

    expect(plugin?.contributes.config.modules?.["launch-wrapper"]).toMatchObject({
      id: "launch-wrapper",
      kind: "launch-wrapper",
      capabilities: ["launch.compose", "launch.wrapper", "input.remap"],
    })
    expect(plugin?.contributes.handlers?.map(handler => handler.operation)).toContain(
      "diagnostics.collect",
    )
  })
})
