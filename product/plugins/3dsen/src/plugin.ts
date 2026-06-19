import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import { KORRI_BOX64_RUNTIME_PLUGIN_ID } from "../../box64-runtime"
import { KORRI_TURNIP_PLUGIN_ID } from "../../turnip"
import {
  decodeThreeDSenLaunchPreparePolicy,
  prepareThreeDSenLaunch,
  type ThreeDSenLaunchPreparePolicy,
} from "./launch-prepare"

export const KORRI_3DSEN_PLUGIN_ID = "@korri:3dsen" as const
export const KORRI_3DSEN_APP_LOCAL_ID = "3dsen" as const
export const KORRI_3DSEN_APP_ID =
  `${KORRI_3DSEN_PLUGIN_ID}/${KORRI_3DSEN_APP_LOCAL_ID}` as const

export interface ThreeDSenLaunchPrepareHandlerInput {
  readonly spec: LaunchSpec
  readonly policy: ThreeDSenLaunchPreparePolicy
  readonly mode: "check" | "commit"
}

export const threeDSenPlugin = plugin({
  namespace: "@korri",
  name: "3dsen",
  title: "3dSen",
  description:
    "Owns Korri's 3dSen app integration for profile-id launches backed by configured NES ROM mappings.",
  requires: [
    {
      capability: "launch.compose",
      ref: { provider: KORRI_BOX64_RUNTIME_PLUGIN_ID, id: "launch-wrapper" },
      reason: "3dSen's Linux build is an x86_64 Unity payload launched through Box64 on aarch64 devices.",
    },
    {
      capability: "graphics.vulkan",
      ref: { provider: KORRI_TURNIP_PLUGIN_ID, id: "adreno-vulkan" },
      reason: "3dSen's validated Bandai path renders through native ARM64 Turnip/Freedreno Vulkan.",
    },
  ],
  contributes: {
    config: {
      apps: {
        [KORRI_3DSEN_APP_LOCAL_ID]: {
          id: KORRI_3DSEN_APP_ID,
          kind: KORRI_3DSEN_PLUGIN_ID,
          command: "3dSen.exe",
          systems: ["3dsen"],
          launch: {
            with: {
              [KORRI_BOX64_RUNTIME_PLUGIN_ID]: {
                unityMode: true,
                strongMem: 3,
                bigBlock: 0,
                safeFlags: 2,
                fastNan: false,
                fastRound: false,
                nativeFlags: false,
                x87Double: true,
                syncRounding: true,
                maxCpu: 1,
                preferEmulated: false,
                sdlVideoDriver: "x11",
              },
              [KORRI_TURNIP_PLUGIN_ID]: { enable: true },
            },
          },
          plugin: {
            [KORRI_3DSEN_PLUGIN_ID]: {},
          },
          policy: { allowedCommands: ["3dSen.exe"] },
        },
      },
      systems: {
        "3dsen": {
          id: "3dsen",
          title: "3dSen",
          apps: [{ id: KORRI_3DSEN_APP_ID }],
        },
      },
      modules: {
        "3dsen-app": {
          id: "3dsen-app",
          kind: "executable",
          fulfill: {
            provider: "staged-path",
            root: "{plugin:@korri:3dsen.executableRoot}",
            binary: "3dSen.exe",
          },
        },
      },
    },
    handlers: [
      {
        id: "3dsen.launch-prepare",
        operation: "launch.prepare",
        capabilities: ["launch.prepare"],
        run: context => {
          const input = decodeLaunchPrepareInput(context.input)
          return prepareThreeDSenLaunch(input)
        },
      },
      {
        id: "3dsen.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect"],
        run: () => ({ provider: KORRI_3DSEN_PLUGIN_ID, status: "ok" as const }),
      },
    ],
  },
})

function decodeLaunchPrepareInput(
  input: unknown,
): ThreeDSenLaunchPrepareHandlerInput {
  if (!isRecord(input)) {
    throw new Error("3dSen launch.prepare input must be an object")
  }
  return {
    spec: decodeLaunchSpec(input.spec),
    policy: decodeThreeDSenLaunchPreparePolicy(input.policy),
    mode: input.mode === "commit" ? "commit" : "check",
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
