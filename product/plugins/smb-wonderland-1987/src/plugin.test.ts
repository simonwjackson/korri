import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_GE_PLUGIN_ID } from "../../proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"
import {
  KORRI_SMB_WONDERLAND_1987_PLUGIN_ID,
  smbWonderland1987Plugin,
} from ".."

describe("Super Mario Bros. Wonderland 1987 plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_SMB_WONDERLAND_1987_PLUGIN_ID).toBe(
      "@korri:smb-wonderland-1987",
    )
    expect(smbWonderland1987Plugin.id).toBe(KORRI_SMB_WONDERLAND_1987_PLUGIN_ID)
  })

  it("contributes catalog and Nix executable config", () => {
    expect(
      smbWonderland1987Plugin.contributes.config.catalog?.[
        "smb-wonderland-1987"
      ],
    ).toMatchObject({
      id: "smb-wonderland-1987",
      title: "Super Mario Bros. Wonderland 1987",
      kind: "game",
      releases: [
        {
          id: "windows-fex-proton-ge",
          launch: {
            kind: "process",
            executable: { resource: "smb-wonderland-1987" },
            cwd: "/home/korri",
          },
        },
      ],
    })
    expect(
      smbWonderland1987Plugin.contributes.config.modules?.[
        "smb-wonderland-1987"
      ],
    ).toEqual({
      id: "smb-wonderland-1987",
      kind: "executable",
      fulfill: {
        provider: "nix",
        installable: ".#smb-wonderland-1987",
        binary: "smb-wonderland-1987",
      },
    })
    expect(smbWonderland1987Plugin.requires).toEqual([
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_FEX_PLUGIN_ID, id: "linux-user" },
        reason:
          "Super Mario Bros. Wonderland 1987's aarch64 launch path runs the Windows i386 payload through FEX.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_PLUGIN_ID, id: "proton-10" },
        reason:
          "Super Mario Bros. Wonderland 1987 keeps Proton 10 as its fallback Windows runtime.",
      },
      {
        capability: "runtime.resolve",
        ref: { provider: KORRI_PROTON_GE_PLUGIN_ID, id: "ge-proton-10-34" },
        reason:
          "Super Mario Bros. Wonderland 1987 defaults to the GloriousEggroll runtime lane for 32-bit Windows fangames on Bandai.",
      },
    ])
  })

  it("is enabled explicitly by the plugin registry", () => {
    const registry = createPluginRegistry([smbWonderland1987Plugin], {
      enabledPluginIds: [KORRI_SMB_WONDERLAND_1987_PLUGIN_ID],
    })

    expect(
      registry.catalog[
        `${KORRI_SMB_WONDERLAND_1987_PLUGIN_ID}/smb-wonderland-1987`
      ],
    ).toMatchObject({
      title: "Super Mario Bros. Wonderland 1987",
    })
    expect(
      executableResources(registry).map(entry => entry.resource.id),
    ).toEqual(["smb-wonderland-1987"])
  })
})
