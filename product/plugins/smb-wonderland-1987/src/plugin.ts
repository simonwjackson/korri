import { plugin } from "@platform/plugin"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_GE_PLUGIN_ID } from "../../proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"

export const KORRI_SMB_WONDERLAND_1987_PLUGIN_ID =
  "@korri:smb-wonderland-1987" as const

export const smbWonderland1987Plugin = plugin({
  namespace: "@korri",
  name: "smb-wonderland-1987",
  title: "Super Mario Bros. Wonderland 1987",
  description:
    "Adds Super Mario Bros. Wonderland 1987 as a first-party MFGG Windows fangame for FEX/Proton-capable Korri devices.",
  requires: [
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
  ],
  contributes: {
    config: {
      catalog: {
        "smb-wonderland-1987": {
          id: "smb-wonderland-1987",
          title: "Super Mario Bros. Wonderland 1987",
          kind: "game",
          releases: [
            {
              id: "windows-fex-proton-ge",
              title:
                "Super Mario Bros. Wonderland 1987 Rev 6 for Windows via FEX/Proton-GE",
              launch: {
                kind: "process",
                executable: { resource: "smb-wonderland-1987" },
                cwd: "/home/korri",
              },
            },
          ],
        },
      },
      modules: {
        "smb-wonderland-1987": {
          id: "smb-wonderland-1987",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: ".#smb-wonderland-1987",
            binary: "smb-wonderland-1987",
          },
        },
      },
    },
  },
})
