import { describe, expect, it } from "bun:test"
import { plugin } from "."
import { createPluginRegistry, executableResources } from "./registry"

describe("plugin executable resources", () => {
  it("are provider-owned generic module config records", () => {
    const registry = createPluginRegistry(
      [
        plugin({
          namespace: "@korri",
          name: "tool",
          contributes: {
            config: {
              modules: {
                tool: {
                  id: "tool",
                  kind: "executable",
                  fulfill: {
                    provider: "nix",
                    installable: "nixpkgs#tool",
                    binary: "tool",
                  },
                },
              },
            },
          },
        }),
      ],
      { enabledPluginIds: ["@korri:tool"] },
    )

    expect(registry.modules["@korri:tool/tool"]).toMatchObject({
      kind: "executable",
    })
    expect(executableResources(registry)).toEqual([
      {
        pluginId: "@korri:tool",
        localId: "tool",
        recordId: "@korri:tool/tool",
        resource: {
          id: "tool",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: "nixpkgs#tool",
            binary: "tool",
          },
        },
      },
    ])
  })
})
