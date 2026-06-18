import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { superMario127Plugin } from "."

describe("Super Mario 127 plugin", () => {
  it("contributes its playable and executable resource only when enabled", () => {
    const disabled = createPluginRegistry([superMario127Plugin])
    expect(disabled.catalog).toEqual({})

    const enabled = createPluginRegistry([superMario127Plugin], {
      enabledPluginIds: ["@korri:super-mario-127"],
    })

    expect(Object.keys(enabled.catalog)).toEqual([
      "@korri:super-mario-127/super-mario-127",
    ])
    expect(executableResources(enabled).map(entry => entry.resource)).toEqual([
      expect.objectContaining({
        id: "super-mario-127",
        fulfill: expect.objectContaining({
          provider: "nix",
          binary: "super-mario-127",
        }),
      }),
    ])
  })
})
