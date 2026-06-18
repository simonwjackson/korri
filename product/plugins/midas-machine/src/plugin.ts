import { plugin } from "@platform/plugin"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_GE_PLUGIN_ID } from "../../proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"

export const KORRI_MIDAS_MACHINE_PLUGIN_ID = "@korri:midas-machine" as const

export const midasMachinePlugin = plugin({
  namespace: "@korri",
  name: "midas-machine",
  title: "Super Mario Bros. & The Midas Machine",
  description:
    "Adds Super Mario Bros. & The Midas Machine as a first-party Windows playable for FEX/Proton-capable Korri devices.",
  requires: [
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
  ],
  contributes: {
    config: {
      catalog: {
        "midas-machine": {
          id: "midas-machine",
          title: "Super Mario Bros. & The Midas Machine",
          kind: "game",
          releases: [
            {
              id: "windows-fex-proton-ge",
              title:
                "Super Mario Bros. & The Midas Machine final demo for Windows via FEX/Proton-GE",
              launch: {
                kind: "process",
                executable: { resource: "midas-machine" },
                cwd: "/home/korri",
              },
            },
          ],
        },
      },
      modules: {
        "midas-machine": {
          id: "midas-machine",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: ".#midas-machine",
            binary: "midas-machine",
          },
        },
      },
    },
  },
})
