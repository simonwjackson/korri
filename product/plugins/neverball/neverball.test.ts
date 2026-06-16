import { describe, expect, it } from "bun:test"
import { createPluginRegistry } from "@platform/plugin/registry"
import { neverballPlugin } from "."

describe("Neverball plugin descriptor", () => {
  it("contributes a playable and Nix-fulfilled executable resource without an app record", () => {
    expect(neverballPlugin.id).toBe("@korri:neverball")
    expect(neverballPlugin.contributes.catalog).toHaveLength(1)
    expect(neverballPlugin.contributes.resources).toEqual([
      {
        id: "neverball-executable",
        kind: "executable",
        fulfill: {
          provider: "nix",
          installable: "nixpkgs#neverball",
          binary: "neverball",
        },
      },
    ])
    expect("apps" in neverballPlugin.contributes).toBe(false)
  })

  it("is enabled explicitly by the first-party registry", () => {
    const registry = createPluginRegistry([neverballPlugin], {
      enabledPluginIds: ["@korri:neverball"],
    })

    expect(registry.catalog.map(entry => entry.item.title)).toEqual([
      "Neverball",
    ])
  })
})
