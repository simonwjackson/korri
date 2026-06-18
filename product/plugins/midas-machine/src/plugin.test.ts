import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_GE_PLUGIN_ID } from "../../proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"
import { KORRI_MIDAS_MACHINE_PLUGIN_ID, midasMachinePlugin } from ".."

describe("Midas Machine plugin", () => {
  it("declares catalog, Nix executable config, and runtime dependencies", () => {
    expect(KORRI_MIDAS_MACHINE_PLUGIN_ID).toBe("@korri:midas-machine")
    expect(midasMachinePlugin.id).toBe(KORRI_MIDAS_MACHINE_PLUGIN_ID)
    expect(
      midasMachinePlugin.contributes.config.catalog?.["midas-machine"],
    ).toMatchObject({
      id: "midas-machine",
      title: "Super Mario Bros. & The Midas Machine",
      releases: [
        {
          id: "windows-fex-proton-ge",
          launch: {
            kind: "process",
            executable: { resource: "midas-machine" },
            cwd: "/home/korri",
          },
        },
      ],
    })
    expect(
      midasMachinePlugin.contributes.config.modules?.["midas-machine"],
    ).toMatchObject({
      id: "midas-machine",
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#midas-machine",
        binary: "midas-machine",
      },
    })
    expect(midasMachinePlugin.requires).toEqual([
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_FEX_PLUGIN_ID, id: "linux-user" },
        reason:
          "Midas Machine's aarch64 launch path runs the Windows i386 payload through FEX.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_PLUGIN_ID, id: "proton-10" },
        reason: "Midas Machine keeps Proton 10 as a fallback Windows runtime.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_GE_PLUGIN_ID, id: "ge-proton-10-34" },
        reason:
          "Midas Machine defaults to the GloriousEggroll runtime lane for 32-bit Windows fangames on Bandai.",
      },
    ])
  })

  it("is enabled explicitly by the plugin registry", () => {
    const registry = createPluginRegistry([midasMachinePlugin], {
      enabledPluginIds: [KORRI_MIDAS_MACHINE_PLUGIN_ID],
    })

    expect(
      registry.catalog[`${KORRI_MIDAS_MACHINE_PLUGIN_ID}/midas-machine`],
    ).toMatchObject({
      title: "Super Mario Bros. & The Midas Machine",
    })
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["midas-machine"])
  })
})
