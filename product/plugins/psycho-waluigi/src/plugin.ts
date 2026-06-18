import { plugin } from "@platform/plugin"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_GE_PLUGIN_ID } from "../../proton-ge-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"

export const KORRI_PSYCHO_WALUIGI_PLUGIN_ID = "@korri:psycho-waluigi" as const

export const psychoWaluigiPlugin = plugin({
  namespace: "@korri",
  name: "psycho-waluigi",
  title: "Psycho Waluigi",
  description:
    "Adds Psycho Waluigi as a first-party Windows playable for FEX/Proton-capable Korri devices.",
  requires: [
    {
      capability: "runtime.resolve",
      ref: { provider: KORRI_FEX_PLUGIN_ID, id: "linux-user" },
      reason:
        "Psycho Waluigi's aarch64 launch path runs the Windows i386 payload through FEX.",
    },
    {
      capability: "runtime.resolve",
      ref: { provider: KORRI_PROTON_PLUGIN_ID, id: "proton-10" },
      reason: "Psycho Waluigi keeps Proton 10 as its fallback Windows runtime.",
    },
    {
      capability: "runtime.resolve",
      ref: { provider: KORRI_PROTON_GE_PLUGIN_ID, id: "ge-proton-10-34" },
      reason:
        "Psycho Waluigi defaults to the GloriousEggroll runtime lane for 32-bit Windows fangames on Bandai.",
    },
  ],
  contributes: {
    config: {
      catalog: {
        "psycho-waluigi": {
          id: "psycho-waluigi",
          title: "Psycho Waluigi",
          kind: "game",
          releases: [
            {
              id: "windows-fex-proton",
              title: "Psycho Waluigi for Windows via FEX/Proton",
              launch: {
                kind: "process",
                executable: { resource: "psycho-waluigi" },
                cwd: "/home/korri",
              },
            },
          ],
        },
      },
      modules: {
        "psycho-waluigi": {
          id: "psycho-waluigi",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: ".#psycho-waluigi",
            binary: "psycho-waluigi",
          },
        },
      },
    },
  },
})
