// Declaration-only mGBA libretro-core plugin.
//
// This plugin owns the pinned mGBA build and its runtime identity. Android
// temporarily packages the core inside the RetroArch APK; Nix supplies the
// Linux core at deployment time. Neither packaging choice transfers runtime
// ownership to the RetroArch launcher plugin.
const declaration = {
  namespace: "@korri",
  name: "mgba",
  title: "mGBA",
  description: "Provides the mGBA libretro core for Game Boy Advance games.",
  contributes: {
    config: {
      systems: {
        gba: {
          id: "gba",
          title: "Game Boy Advance",
        },
      },
      runtimes: {
        mgba: {
          id: "@korri:mgba/mgba",
          kind: "libretro-core",
          app: "@korri:retroarch/retroarch",
          path: "/data/data/com.korri.retroarch/cores/mgba_libretro_android.so",
          linux: {
            pathEnv: "KORRI_MGBA_CORE",
          },
          supports: {
            systems: ["gba"],
          },
        },
      },
    },
  },
} as const

declaration
