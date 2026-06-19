import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"
import { KORRI_MEGA_MAN_ARENA_PLUGIN_ID, megaManArenaPlugin } from ".."

describe("Mega Man Arena plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_MEGA_MAN_ARENA_PLUGIN_ID).toBe("@korri:mega-man-arena")
    expect(megaManArenaPlugin.id).toBe(KORRI_MEGA_MAN_ARENA_PLUGIN_ID)
  })

  it("contributes catalog and Nix executable config", () => {
    expect(
      megaManArenaPlugin.contributes.config.catalog?.["mega-man-arena"],
    ).toMatchObject({
      id: "mega-man-arena",
      title: "Mega Man Arena",
      kind: "game",
      releases: [
        {
          id: "windows-fex-proton",
          launch: {
            kind: "process",
            executable: { resource: "mega-man-arena" },
            with: {
              [KORRI_FEX_PLUGIN_ID]: { runtime: "linux-user" },
              [KORRI_PROTON_PLUGIN_ID]: { runtime: "proton-10" },
            },
          },
        },
      ],
    })
    expect(
      megaManArenaPlugin.contributes.config.modules?.["mega-man-arena"],
    ).toEqual({
      id: "mega-man-arena",
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#mega-man-arena",
        binary: "mega-man-arena",
      },
    })
    expect(megaManArenaPlugin.requires).toEqual([
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_FEX_PLUGIN_ID, id: "linux-user" },
        reason:
          "Mega Man Arena's aarch64 launch path runs the Windows x86_64 payload through FEX.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_PLUGIN_ID, id: "proton-10" },
        reason:
          "Mega Man Arena's Windows payload uses Proton 10's wine64, DXVK, and VKD3D runtime files.",
      },
    ])
    expect(megaManArenaPlugin.contributes.config.launchers).toBeUndefined()
  })

  it("is enabled explicitly by the plugin registry", () => {
    const registry = createPluginRegistry([megaManArenaPlugin], {
      enabledPluginIds: [KORRI_MEGA_MAN_ARENA_PLUGIN_ID],
    })

    expect(
      registry.catalog[`${KORRI_MEGA_MAN_ARENA_PLUGIN_ID}/mega-man-arena`],
    ).toMatchObject({
      title: "Mega Man Arena",
    })
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["mega-man-arena"])
  })
})
