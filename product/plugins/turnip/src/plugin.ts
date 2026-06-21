import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import {
  composeTurnipLaunchSpec,
  decodeTurnipPolicy,
  type TurnipPolicy,
} from "./launch-companion"

export const KORRI_TURNIP_PLUGIN_ID = "@korri:turnip" as const
export const KORRI_TURNIP_WRAPPER_PACKAGE = "korri-turnip-wrapper" as const

export interface TurnipLaunchComposeInput {
  readonly spec: LaunchSpec
  readonly policy: TurnipPolicy
}

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
          capabilities: ["graphics.vulkan", "package.wrap", "launch.compose"],
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
        id: "turnip.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose", "graphics.vulkan"],
        run: context => {
          const input = decodeLaunchComposeInput(context.input)
          return composeTurnipLaunchSpec(input.spec, input.policy)
        },
      },
      {
        id: "turnip.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["graphics.vulkan"],
        run: () => ({
          provider: KORRI_TURNIP_PLUGIN_ID,
          status: "ok" as const,
        }),
      },
    ],
  },
})

function decodeLaunchComposeInput(input: unknown): TurnipLaunchComposeInput {
  if (!isRecord(input)) {
    throw new Error("Turnip launch.compose input must be an object")
  }
  if (!("spec" in input)) {
    throw new Error("Turnip launch.compose input.spec must be a launch spec")
  }
  return {
    spec: decodeLaunchSpec(input.spec),
    policy: decodeTurnipPolicy(input.policy ?? {}),
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
