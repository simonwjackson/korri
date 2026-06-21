import { decodeLaunchSpec, type LaunchSpec } from "@platform/library/launcher"
import { plugin } from "@platform/plugin"
import {
  type Box64Policy,
  composeBox64LaunchSpec,
  decodeBox64Policy,
} from "./launch-companion"

export const KORRI_BOX64_RUNTIME_PLUGIN_ID = "@korri:box64-runtime" as const
export const KORRI_BOX64_RUNTIME_PACKAGE = "korri-box64-runtime" as const

export interface Box64RuntimeResolveInput {
  readonly cwd?: string
  readonly gameLibraryPath?: string
  readonly nativeLibraryPath?: string
}

export interface Box64RuntimeResolveOutput {
  readonly provider: typeof KORRI_BOX64_RUNTIME_PLUGIN_ID
  readonly runtime: "linux-user"
  readonly status: "resolved"
  readonly env: Readonly<Record<string, string>>
}

export interface Box64LaunchComposeInput {
  readonly spec: LaunchSpec
  readonly policy: Box64Policy
}

export const box64RuntimePlugin = plugin({
  namespace: "@korri",
  name: "box64-runtime",
  title: "Box64 Runtime",
  description:
    "Contributes Korri's first-party Box64 runtime and launch companion for aarch64 devices running x86_64 Linux payloads.",
  contributes: {
    config: {
      runtimes: {
        "linux-user": {
          id: "linux-user",
          kind: "cpu-translation",
          host: "aarch64-linux",
          guest: "x86_64-linux",
          capabilities: ["runtime.resolve", "launch.compose"],
        },
      },
      modules: {
        "runtime-package": {
          id: "runtime-package",
          kind: "nix-package",
          package: KORRI_BOX64_RUNTIME_PACKAGE,
          path: "product/plugins/box64-runtime/packages/box64-runtime",
          capabilities: ["runtime.resolve", "launch.compose", "launch.wrapper"],
        },
        "launch-wrapper": {
          id: "launch-wrapper",
          kind: "launch-wrapper",
          supports: { systems: ["*"] },
          capabilities: ["launch.compose", "launch.wrapper"],
        },
      },
    },
    handlers: [
      {
        id: "box64-runtime.runtime-resolve",
        operation: "runtime.resolve",
        capabilities: ["runtime.resolve"],
        run: context => resolveBox64Runtime(context.input),
      },
      {
        id: "box64-runtime.launch-compose",
        operation: "launch.compose",
        capabilities: ["launch.compose", "launch.wrapper"],
        run: context => {
          const input = decodeLaunchComposeInput(context.input)
          return composeBox64LaunchSpec(input.spec, input.policy)
        },
      },
      {
        id: "box64-runtime.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["runtime.resolve", "launch.compose"],
        run: () => ({
          provider: KORRI_BOX64_RUNTIME_PLUGIN_ID,
          status: "ok" as const,
        }),
      },
    ],
  },
})

function resolveBox64Runtime(input: unknown): Box64RuntimeResolveOutput {
  const value = decodeResolveInput(input)
  const env: Record<string, string> = {
    BOX64_PREFER_EMULATED: "0",
  }
  if (value.gameLibraryPath) env.BOX64_LD_LIBRARY_PATH = value.gameLibraryPath
  if (value.nativeLibraryPath) env.LD_LIBRARY_PATH = value.nativeLibraryPath
  if (value.cwd && !value.gameLibraryPath) {
    env.BOX64_LD_LIBRARY_PATH = [
      value.cwd,
      `${value.cwd}/lib`,
      `${value.cwd}/lib64`,
      `${value.cwd}/MonoBleedingEdge/x86_64`,
    ].join(":")
  }
  return {
    provider: KORRI_BOX64_RUNTIME_PLUGIN_ID,
    runtime: "linux-user",
    status: "resolved",
    env,
  }
}

function decodeLaunchComposeInput(input: unknown): Box64LaunchComposeInput {
  if (!isRecord(input)) {
    throw new Error("Box64 launch.compose input must be an object")
  }
  if (!("spec" in input)) {
    throw new Error("Box64 launch.compose input.spec must be a launch spec")
  }
  return {
    spec: decodeLaunchSpec(input.spec),
    policy: decodeBox64Policy(input.policy ?? {}),
  }
}

function decodeResolveInput(input: unknown): Box64RuntimeResolveInput {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    throw new Error("Box64 runtime.resolve input must be an object")
  }
  return {
    cwd: optionalString(input.cwd, "cwd"),
    gameLibraryPath: optionalString(input.gameLibraryPath, "gameLibraryPath"),
    nativeLibraryPath: optionalString(
      input.nativeLibraryPath,
      "nativeLibraryPath",
    ),
  }
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Box64 input.${field} must be a non-empty string`)
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
