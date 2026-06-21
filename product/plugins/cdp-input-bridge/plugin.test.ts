import { describe, expect, it } from "bun:test"
import { createPluginRegistry } from "@platform/plugin/registry"
import { CDP_INPUT_BRIDGE_PLUGIN_ID, cdpInputBridgePlugin } from "."

describe("CDP input bridge plugin", () => {
  it("registers as the provider that owns bridge annotations", () => {
    const registry = createPluginRegistry([cdpInputBridgePlugin], {
      enabledPluginIds: [CDP_INPUT_BRIDGE_PLUGIN_ID],
    })

    expect(cdpInputBridgePlugin.id).toBe(CDP_INPUT_BRIDGE_PLUGIN_ID)
    expect(registry.enabledPluginIds.has(CDP_INPUT_BRIDGE_PLUGIN_ID)).toBe(true)
    expect(registry.providers[CDP_INPUT_BRIDGE_PLUGIN_ID]).toMatchObject({
      title: "CDP Input Bridge",
    })
    expect(
      cdpInputBridgePlugin.handlers.map(handler => handler.operation),
    ).toEqual(["diagnostics.collect"])
  })
})
