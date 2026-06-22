import { isAbsolute } from "node:path"
import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import {
  buildRemapWrapperLaunchSpec,
  type RemapWrapperLaunchSpecInput,
} from "./src/launch-wrapper"
import {
  KORRI_REMAP_PLUGIN_ID,
  decodeRemapPolicy,
  normalizeRemapPolicy,
  type RemapPolicy,
} from "./src/policy"

export { decodeRemapBindings } from "./src/bindings"
export type { RemapBinding } from "./src/bindings"
export { createRemapEngine, type RemapEngine } from "./src/bridge-process"
export {
  buildRemapWrapperLaunchSpec,
  remapWrapperEnv,
  type RemapWrapperLaunchSpecInput,
} from "./src/launch-wrapper"
export {
  KORRI_REMAP_RUNNER_GROUP,
  KORRI_REMAP_RUNNER_USER,
  assertNativeIsolationProbe,
  type NativeRemapIsolationProbe,
} from "./src/native-sink"
export {
  isControllerRef,
  parseControlRef,
  type RemapButton,
  type RemapControlRef,
  type RemapControllerControl,
  type RemapControllerRef,
  type RemapDirection,
  type RemapKeyboardRef,
  type RemapPlayerSlot,
  type RemapStick,
} from "./src/control-ref"
export {
  type RemapControllerSourceResolution,
  type RemapResolvedControllerSource,
  type ResolveRemapControllerSourcesOptions,
  resolveRemapControllerSources,
  slugify,
} from "./src/sources"
export {
  KORRI_REMAP_PLUGIN_ID,
  decodeRemapPolicy,
  normalizeRemapPolicy,
  remapPolicyFromLaunch,
  type NormalizedRemapPolicy,
  type RemapControllerPolicy,
  type RemapControllerPreference,
  type RemapPolicy,
  type RemapRawPolicy,
  type RemapSourceKind,
} from "./src/policy"
export {
  createMemoryRemapSink,
  pressTarget,
  releaseTarget,
  validateSinkCapabilities,
  type MemoryRemapSink,
  type RemapSink,
  type RemapSinkCapabilities,
  type RemapSinkEvent,
} from "./src/sinks"

export interface RemapLaunchComposeInput {
  readonly spec: LaunchSpec
  readonly policy: RemapPolicy
  readonly launchId: string
  readonly wrapperCommand: RemapWrapperLaunchSpecInput["wrapperCommand"]
}

export type RemapPluginDiagnostic =
  | {
      readonly provider: typeof KORRI_REMAP_PLUGIN_ID
      readonly status: "ok"
      readonly isolation: "wrapper-scoped"
    }
  | {
      readonly provider: typeof KORRI_REMAP_PLUGIN_ID
      readonly status: "unavailable"
      readonly isolation: "wrapper-scoped"
      readonly reason: string
    }

export const remapPlugin = plugin({
  namespace: "@korri",
  name: "remap",
  title: "Remap",
  description:
    "Launch-scoped InputPlumber controller remapping for wrapper-launched games.",
  contributes: {
    config: {
      modules: {
        "launch-wrapper": {
          id: "launch-wrapper",
          kind: "launch-wrapper",
          capabilities: ["launch.compose", "launch.wrapper", "input.remap"],
        },
      },
    },
    handlers: [
      {
        id: "remap.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose", "launch.wrapper", "input.remap"],
        run: context => {
          const input = decodeRemapLaunchComposeInput(context.input)
          return buildRemapWrapperLaunchSpec({
            child: input.spec,
            policy: normalizeRemapPolicy(input.policy),
            wrapperCommand: input.wrapperCommand,
            launchId: input.launchId,
          })
        },
      },
      {
        id: "remap.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["diagnostics.collect", "input.remap"],
        run: (): RemapPluginDiagnostic => remapDiagnosticsFromEnv(process.env),
      },
    ],
  },
})

if (remapPlugin.id !== KORRI_REMAP_PLUGIN_ID) {
  throw new Error("Remap plugin id mismatch")
}

function remapDiagnosticsFromEnv(env: NodeJS.ProcessEnv): RemapPluginDiagnostic {
  if (env.KORRI_REMAP_NATIVE_DRIVER === "enabled") {
    return {
      provider: KORRI_REMAP_PLUGIN_ID,
      status: "ok",
      isolation: "wrapper-scoped",
    }
  }
  return {
    provider: KORRI_REMAP_PLUGIN_ID,
    status: "unavailable",
    isolation: "wrapper-scoped",
    reason: "native Remap driver is not enabled",
  }
}

function decodeRemapLaunchComposeInput(input: unknown): RemapLaunchComposeInput {
  if (!isRecord(input)) {
    throw new Error("Remap launch.compose input must be an object")
  }
  const launchId = isRecord(input.options) ? input.options.launchId : undefined
  if (typeof launchId !== "string" || launchId.trim().length === 0) {
    throw new Error("Remap launch.compose requires options.launchId")
  }
  return {
    spec: decodeHandlerLaunchSpec(input.spec),
    policy: decodeRemapPolicy(input.policy ?? {}),
    launchId,
    wrapperCommand: remapBridgeCommandFromEnv(process.env),
  }
}

function remapBridgeCommandFromEnv(env: NodeJS.ProcessEnv): string {
  const command = env.KORRI_REMAP_BRIDGE_COMMAND?.trim() || "/run/wrappers/bin/korri-remap-bridge"
  if (!isAbsolute(command)) {
    throw new Error("Remap bridge command must be an absolute path")
  }
  return command
}

function decodeHandlerLaunchSpec(value: unknown): LaunchSpec {
  try {
    return decodeLaunchSpec(value)
  } catch (error) {
    throw new Error(
      `Remap launch.compose input.spec must be a launch spec: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
