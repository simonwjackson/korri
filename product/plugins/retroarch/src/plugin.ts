import { plugin } from "@platform/plugin"

export const KORRI_RETROARCH_PLUGIN_ID = "@korri:retroarch" as const
export const KORRI_RETROARCH_APP_LOCAL_ID = "retroarch" as const
export const KORRI_RETROARCH_APP_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_APP_LOCAL_ID}` as const
export const KORRI_RETROARCH_GBA_SYSTEM_ID = "gba" as const
export const KORRI_RETROARCH_GENESIS_SYSTEM_ID = "genesis" as const
export const KORRI_RETROARCH_NES_SYSTEM_ID = "nes" as const
export const KORRI_RETROARCH_PSP_SYSTEM_ID = "psp" as const
export const KORRI_RETROARCH_PSX_SYSTEM_ID = "psx" as const
export const KORRI_RETROARCH_SNES_SYSTEM_ID = "snes" as const
export const KORRI_RETROARCH_MGBA_RUNTIME_LOCAL_ID = "mgba" as const
export const KORRI_RETROARCH_MGBA_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_MGBA_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_MESEN_RUNTIME_LOCAL_ID = "mesen" as const
export const KORRI_RETROARCH_MESEN_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_MESEN_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_LOCAL_ID =
  "genesis-plus-gx" as const
export const KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_PCSX_REARMED_RUNTIME_LOCAL_ID =
  "pcsx-rearmed" as const
export const KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_PCSX_REARMED_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_PPSSPP_RUNTIME_LOCAL_ID = "ppsspp" as const
export const KORRI_RETROARCH_PPSSPP_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_PPSSPP_RUNTIME_LOCAL_ID}` as const
export const KORRI_RETROARCH_BSNES_RUNTIME_LOCAL_ID = "bsnes" as const
export const KORRI_RETROARCH_BSNES_RUNTIME_ID =
  `${KORRI_RETROARCH_PLUGIN_ID}/${KORRI_RETROARCH_BSNES_RUNTIME_LOCAL_ID}` as const

export const retroarchPlugin = plugin({
  namespace: "@korri",
  name: "retroarch",
  title: "RetroArch",
  description:
    "Owns the RetroArch app/runtime host integration for libretro core launches.",
  contributes: {
    config: {
      apps: {
        [KORRI_RETROARCH_APP_LOCAL_ID]: {
          id: KORRI_RETROARCH_APP_ID,
          kind: KORRI_RETROARCH_PLUGIN_ID,
          command: "retroarch",
          args: [
            "--config",
            "{configPath}",
            "-L",
            "{runtime.path}",
            "{content.path}",
          ],
          plugin: {
            [KORRI_RETROARCH_PLUGIN_ID]: {},
          },
          policy: { allowedCommands: ["retroarch"] },
        },
      },
      systems: {
        [KORRI_RETROARCH_GBA_SYSTEM_ID]: {
          id: KORRI_RETROARCH_GBA_SYSTEM_ID,
          title: "Game Boy Advance",
          apps: [
            {
              id: KORRI_RETROARCH_APP_ID,
              runtime: KORRI_RETROARCH_MGBA_RUNTIME_ID,
            },
          ],
        },
        [KORRI_RETROARCH_GENESIS_SYSTEM_ID]: {
          id: KORRI_RETROARCH_GENESIS_SYSTEM_ID,
          title: "Sega Genesis",
          apps: [
            {
              id: KORRI_RETROARCH_APP_ID,
              runtime: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
            },
          ],
        },
        [KORRI_RETROARCH_NES_SYSTEM_ID]: {
          id: KORRI_RETROARCH_NES_SYSTEM_ID,
          title: "Nintendo Entertainment System",
          apps: [
            {
              id: KORRI_RETROARCH_APP_ID,
              runtime: KORRI_RETROARCH_MESEN_RUNTIME_ID,
            },
          ],
        },
        [KORRI_RETROARCH_PSP_SYSTEM_ID]: {
          id: KORRI_RETROARCH_PSP_SYSTEM_ID,
          title: "Sony PlayStation Portable",
          apps: [
            {
              id: KORRI_RETROARCH_APP_ID,
              runtime: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
            },
          ],
        },
        [KORRI_RETROARCH_PSX_SYSTEM_ID]: {
          id: KORRI_RETROARCH_PSX_SYSTEM_ID,
          title: "Sony PlayStation",
          apps: [
            {
              id: KORRI_RETROARCH_APP_ID,
              runtime: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
            },
          ],
        },
        [KORRI_RETROARCH_SNES_SYSTEM_ID]: {
          id: KORRI_RETROARCH_SNES_SYSTEM_ID,
          title: "Super Nintendo Entertainment System",
          apps: [
            {
              id: KORRI_RETROARCH_APP_ID,
              runtime: KORRI_RETROARCH_BSNES_RUNTIME_ID,
            },
          ],
        },
      },
      runtimes: {
        [KORRI_RETROARCH_MGBA_RUNTIME_LOCAL_ID]: {
          id: KORRI_RETROARCH_MGBA_RUNTIME_ID,
          kind: "libretro-core",
          app: KORRI_RETROARCH_APP_ID,
          path: "/etc/korri/cores/mgba_libretro.so",
          supports: { systems: [KORRI_RETROARCH_GBA_SYSTEM_ID] },
        },
        [KORRI_RETROARCH_MESEN_RUNTIME_LOCAL_ID]: {
          id: KORRI_RETROARCH_MESEN_RUNTIME_ID,
          kind: "libretro-core",
          app: KORRI_RETROARCH_APP_ID,
          path: "/etc/korri/cores/mesen_libretro.so",
          supports: { systems: [KORRI_RETROARCH_NES_SYSTEM_ID] },
        },
        [KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_LOCAL_ID]: {
          id: KORRI_RETROARCH_GENESIS_PLUS_GX_RUNTIME_ID,
          kind: "libretro-core",
          app: KORRI_RETROARCH_APP_ID,
          path: "/etc/korri/cores/genesis_plus_gx_libretro.so",
          supports: { systems: [KORRI_RETROARCH_GENESIS_SYSTEM_ID] },
        },
        [KORRI_RETROARCH_PCSX_REARMED_RUNTIME_LOCAL_ID]: {
          id: KORRI_RETROARCH_PCSX_REARMED_RUNTIME_ID,
          kind: "libretro-core",
          app: KORRI_RETROARCH_APP_ID,
          path: "/etc/korri/cores/pcsx_rearmed_libretro.so",
          supports: { systems: [KORRI_RETROARCH_PSX_SYSTEM_ID] },
        },
        [KORRI_RETROARCH_PPSSPP_RUNTIME_LOCAL_ID]: {
          id: KORRI_RETROARCH_PPSSPP_RUNTIME_ID,
          kind: "libretro-core",
          app: KORRI_RETROARCH_APP_ID,
          path: "/etc/korri/cores/ppsspp_libretro.so",
          supports: { systems: [KORRI_RETROARCH_PSP_SYSTEM_ID] },
        },
        [KORRI_RETROARCH_BSNES_RUNTIME_LOCAL_ID]: {
          id: KORRI_RETROARCH_BSNES_RUNTIME_ID,
          kind: "libretro-core",
          app: KORRI_RETROARCH_APP_ID,
          path: "/etc/korri/cores/bsnes_libretro.so",
          supports: { systems: [KORRI_RETROARCH_SNES_SYSTEM_ID] },
        },
      },
    },
  },
})
