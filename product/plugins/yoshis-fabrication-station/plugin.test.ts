import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { yoshisFabricationStationPlugin } from "."

describe("Yoshi's Fabrication Station plugin", () => {
  it("contributes its playable and executable resource only when enabled", () => {
    const disabled = createPluginRegistry([yoshisFabricationStationPlugin])
    expect(disabled.catalog).toEqual({})

    const enabled = createPluginRegistry([yoshisFabricationStationPlugin], {
      enabledPluginIds: ["@korri:yoshis-fabrication-station"],
    })

    expect(Object.keys(enabled.catalog)).toEqual([
      "@korri:yoshis-fabrication-station/yoshis-fabrication-station",
    ])
    expect(executableResources(enabled).map(entry => entry.resource)).toEqual([
      expect.objectContaining({
        id: "yoshis-fabrication-station",
        fulfill: expect.objectContaining({
          provider: "nix",
          binary: "yfs",
        }),
      }),
    ])
  })
})
