import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { KORRI_PORTMASTER_PLUGIN_ID, portmasterPlugin } from ".."

describe("PortMaster plugin", () => {
  it("declares a stable executable package resource", () => {
    expect(portmasterPlugin.id).toBe(KORRI_PORTMASTER_PLUGIN_ID)
    expect(
      portmasterPlugin.contributes.config.modules?.portmaster,
    ).toMatchObject({
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#portmaster",
        binary: "portmaster",
      },
    })
  })

  it("exposes PortMaster as a fulfillable executable when enabled", () => {
    const registry = createPluginRegistry([portmasterPlugin], {
      enabledPluginIds: [KORRI_PORTMASTER_PLUGIN_ID],
    })

    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["portmaster"])
  })
})
