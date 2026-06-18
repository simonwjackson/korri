import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_GE_PLUGIN_ID } from "../../proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"
import { KORRI_PSYCHO_WALUIGI_PLUGIN_ID, psychoWaluigiPlugin } from ".."

describe("Psycho Waluigi plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_PSYCHO_WALUIGI_PLUGIN_ID).toBe("@korri:psycho-waluigi")
    expect(psychoWaluigiPlugin.id).toBe(KORRI_PSYCHO_WALUIGI_PLUGIN_ID)
  })

  it("contributes catalog and Nix executable config", () => {
    expect(
      psychoWaluigiPlugin.contributes.config.catalog?.["psycho-waluigi"],
    ).toMatchObject({
      id: "psycho-waluigi",
      title: "Psycho Waluigi",
      kind: "game",
      releases: [
        {
          id: "windows-fex-proton",
          launch: {
            kind: "process",
            executable: { resource: "psycho-waluigi" },
            cwd: "/home/korri",
          },
        },
      ],
    })
    expect(
      psychoWaluigiPlugin.contributes.config.modules?.["psycho-waluigi"],
    ).toEqual({
      id: "psycho-waluigi",
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#psycho-waluigi",
        binary: "psycho-waluigi",
      },
    })
    expect(psychoWaluigiPlugin.requires).toEqual([
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_FEX_PLUGIN_ID, id: "linux-user" },
        reason:
          "Psycho Waluigi's aarch64 launch path runs the Windows i386 payload through FEX.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_PLUGIN_ID, id: "proton-10" },
        reason:
          "Psycho Waluigi keeps Proton 10 as its fallback Windows runtime.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_GE_PLUGIN_ID, id: "ge-proton-10-34" },
        reason:
          "Psycho Waluigi defaults to the GloriousEggroll runtime lane for 32-bit Windows fangames on Bandai.",
      },
    ])
  })

  it("is enabled explicitly by the plugin registry", () => {
    const registry = createPluginRegistry([psychoWaluigiPlugin], {
      enabledPluginIds: [KORRI_PSYCHO_WALUIGI_PLUGIN_ID],
    })

    expect(
      registry.catalog[`${KORRI_PSYCHO_WALUIGI_PLUGIN_ID}/psycho-waluigi`],
    ).toMatchObject({
      title: "Psycho Waluigi",
    })
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["psycho-waluigi"])
  })
})
