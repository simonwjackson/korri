import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { superMarioBrosRemasteredPlugin } from "."

describe("Super Mario Bros. Remastered plugin", () => {
  it("contributes its playable and executable resource only when enabled", () => {
    const disabled = createPluginRegistry([superMarioBrosRemasteredPlugin])
    expect(disabled.catalog).toEqual({})

    const enabled = createPluginRegistry([superMarioBrosRemasteredPlugin], {
      enabledPluginIds: ["@korri:super-mario-bros-remastered"],
    })

    expect(Object.keys(enabled.catalog)).toEqual([
      "@korri:super-mario-bros-remastered/super-mario-bros-remastered",
    ])
    expect(executableResources(enabled).map(entry => entry.resource)).toEqual([
      expect.objectContaining({
        id: "super-mario-bros-remastered",
        fulfill: expect.objectContaining({
          provider: "nix",
          binary: "smb-remastered",
        }),
      }),
    ])
  })
})
