import { plugin } from "@platform/plugin"

export const KORRI_RYUBING_PLUGIN_ID = "@korri:ryubing" as const

export const ryubingPlugin = plugin({
  namespace: "@korri",
  name: "ryubing",
  title: "Ryubing",
  description:
    "Adds Korri's Ryubing runtime package and Switch emulator launch integration.",
  contributes: {
    config: {
      modules: {
        "ryubing-korri-package": {
          id: "ryubing-korri-package",
          kind: "nix-package",
          package: "ryubing-korri",
          path: "product/plugins/ryubing/packages/ryubing-korri",
          capabilities: ["package.expose", "launch.runtime"],
          binaries: ["Ryujinx"],
        },
      },
    },
  },
})
