import { plugin } from "@platform/plugin"

export const KORRI_TURNIP_PLUGIN_ID = "@korri:turnip" as const
export const KORRI_TURNIP_WRAPPER_PACKAGE = "korri-turnip-wrapper" as const

export const turnipPlugin = plugin({
  namespace: "@korri",
  name: "turnip",
  title: "Turnip Graphics Runtime",
  description:
    "Contributes Korri's first-party Mesa Turnip/Freedreno Vulkan wrapper for Adreno aarch64 devices.",
  contributes: {
    config: {
      modules: {
        "turnip-wrapper-package": {
          id: "turnip-wrapper-package",
          kind: "nix-package",
          package: KORRI_TURNIP_WRAPPER_PACKAGE,
          path: "product/plugins/turnip/packages/turnip-wrapper",
          capabilities: ["graphics.vulkan", "package.wrap"],
        },
      },
      runtimes: {
        "adreno-vulkan": {
          id: "adreno-vulkan",
          kind: "graphics-driver",
          host: "aarch64-linux",
          driver: "turnip",
          capabilities: ["graphics.vulkan"],
        },
      },
    },
    handlers: [
      {
        id: "turnip.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["graphics.vulkan"],
        run: () => ({ provider: KORRI_TURNIP_PLUGIN_ID, status: "ok" as const }),
      },
    ],
  },
})
