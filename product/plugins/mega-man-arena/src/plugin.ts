import { plugin } from "@platform/plugin"
import { KORRI_FEX_PLUGIN_ID } from "../../fex-runtime"
import { KORRI_PROTON_PLUGIN_ID } from "../../proton-runtime"

export const KORRI_MEGA_MAN_ARENA_PLUGIN_ID = "@korri:mega-man-arena" as const

export const megaManArenaPlugin = plugin({
  namespace: "@korri",
  name: "mega-man-arena",
  title: "Mega Man Arena",
  description:
    "Adds Mega Man Arena as a first-party Windows playable for FEX/Proton-capable Korri devices.",
  requires: [
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
  ],
  contributes: {
    config: {
      catalog: {
        "mega-man-arena": {
          id: "mega-man-arena",
          title: "Mega Man Arena",
          kind: "game",
          releases: [
            {
              id: "windows-fex-proton",
              title: "Mega Man Arena 4.20 for Windows via FEX/Proton",
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
        },
      },
      modules: {
        "mega-man-arena": {
          id: "mega-man-arena",
          kind: "executable",
          fulfill: {
            provider: "nix",
            installable: ".#mega-man-arena",
            binary: "mega-man-arena",
          },
        },
      },
    },
  },
})
