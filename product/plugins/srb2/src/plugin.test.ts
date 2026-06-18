import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { KORRI_SRB2_PLUGIN_ID, srb2Plugin } from ".."

describe("SRB2 plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_SRB2_PLUGIN_ID).toBe("@korri:srb2")
    expect(srb2Plugin.id).toBe(KORRI_SRB2_PLUGIN_ID)
  })

  it("contributes catalog and Nix executable config", () => {
    expect(srb2Plugin.contributes.config.catalog?.srb2).toMatchObject({
      id: "srb2",
      title: "Sonic Robo Blast 2",
      kind: "game",
      releases: [
        {
          id: "nixpkgs-2.2.15",
          title: "Sonic Robo Blast 2 2.2.15 from nixpkgs",
          launch: {
            kind: "process",
            executable: { resource: "srb2" },
          },
        },
      ],
    })
    expect(srb2Plugin.contributes.config.modules?.srb2).toEqual({
      id: "srb2",
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#srb2",
        binary: "srb2",
      },
    })
    expect(srb2Plugin.requires).toBeUndefined()
  })

  it("is enabled explicitly by the plugin registry", () => {
    const registry = createPluginRegistry([srb2Plugin], {
      enabledPluginIds: [KORRI_SRB2_PLUGIN_ID],
    })

    expect(registry.catalog[`${KORRI_SRB2_PLUGIN_ID}/srb2`]).toMatchObject({
      title: "Sonic Robo Blast 2",
    })
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["srb2"])
  })
})
