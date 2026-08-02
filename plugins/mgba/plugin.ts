// Declaration-only mGBA libretro-core plugin for the Android target.
//
// This plugin owns the pinned mGBA build and its runtime identity. The core is
// temporarily packaged in the RetroArch APK so that Android can install it in
// RetroArch's private executable directory; that packaging does not transfer
// runtime ownership to the RetroArch launcher plugin.
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
          supports: {
            systems: ["gba"],
          },
        },
      },
    },
  },
} as const

declaration
