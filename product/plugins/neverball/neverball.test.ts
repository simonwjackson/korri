import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { neverballPlugin } from "."

describe("Neverball plugin descriptor", () => {
  it("contributes generic catalog and Nix executable config without an app record", () => {
    expect(neverballPlugin.id).toBe("@korri:neverball")
    expect(neverballPlugin.contributes.config.catalog?.neverball).toMatchObject(
      {
        id: "neverball",
        title: "Neverball",
        kind: "game",
      },
    )
    expect(neverballPlugin.contributes.config.modules?.neverball).toEqual({
      id: "neverball",
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: "nixpkgs#neverball",
        binary: "neverball",
      },
    })
    expect(neverballPlugin.contributes.config.launchers).toBeUndefined()
  })

  it("is enabled explicitly by the first-party registry", () => {
    const registry = createPluginRegistry([neverballPlugin], {
      enabledPluginIds: ["@korri:neverball"],
    })

    expect(registry.catalog["@korri:neverball/neverball"]).toMatchObject({
      title: "Neverball",
    })
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["neverball"])
  })
})
