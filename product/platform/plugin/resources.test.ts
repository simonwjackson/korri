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

  it("surfaces narrow staged-path executable resources", () => {
    const registry = createPluginRegistry(
      [
        plugin({
          namespace: "@korri",
          name: "3dsen",
          contributes: {
            config: {
              modules: {
                "3dsen": {
                  id: "3dsen",
                  kind: "executable",
                  fulfill: {
                    provider: "staged-path",
                    root: "/games/3dsen",
                    binary: "3dSen.exe",
                  },
                },
              },
            },
          },
        }),
      ],
      { enabledPluginIds: ["@korri:3dsen"] },
    )

    expect(executableResources(registry)).toEqual([
      {
        pluginId: "@korri:3dsen",
        localId: "3dsen",
        recordId: "@korri:3dsen/3dsen",
        resource: {
          id: "3dsen",
          kind: "executable",
          fulfill: {
            provider: "staged-path",
            root: "/games/3dsen",
            binary: "3dSen.exe",
          },
        },
      },
    ])
  })
})
