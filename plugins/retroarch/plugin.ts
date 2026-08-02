// Declaration-only RetroArch launcher plugin for the Android target.
//
// The adjacent android/ package owns acquisition and provisioning of the
// signed com.korri.retroarch launcher. Libretro cores are separate plugins;
// korrid composes explicitly compatible runtime and launcher declarations.
const declaration = {
  namespace: "@korri",
  name: "retroarch",
  title: "RetroArch",
  description: "Owns the Android RetroArch launcher.",
  contributes: {
    config: {
      launchers: {
        retroarch: {
          id: "@korri:retroarch/retroarch",
          plugin: "@korri:retroarch",
          command: "retroarch",
          android: {
            packageName: "com.korri.retroarch",
            className:
              "com.retroarch.browser.retroactivity.RetroActivityFuture",
          },
        },
      },
    },
  },
} as const

declaration
