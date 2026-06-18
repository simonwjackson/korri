import { plugin } from "@platform/plugin"
import { steamRuntimePaths } from "../../steam/src/plugin"

export const KORRI_FEX_PLUGIN_ID = "@korri:fex" as const

export interface FexRuntimeResolveInput {
  readonly appId?: string
  readonly runDir?: string
  readonly rootfs?: string
  readonly enableThunks?: boolean
}

export interface FexRuntimeResolveOutput {
  readonly provider: typeof KORRI_FEX_PLUGIN_ID
  readonly runtime: "linux-user"
  readonly status: "resolved"
  readonly env: Readonly<Record<string, string>>
  readonly thunks: {
    readonly GL: 1
    readonly Vulkan: 1
    readonly drm: 1
    readonly WaylandClient: 1
  }
}

const DEFAULT_FEX_ROOTFS = steamRuntimePaths.fexRootfs
const DEFAULT_VULKAN_ICD = "/usr/share/vulkan/icd.d/freedreno_icd.x86_64.json"

export const fexRuntimePlugin = plugin({
  namespace: "@korri",
  name: "fex",
  title: "FEX",
  description:
    "Contributes Korri's first-party FEX runtime resolver for aarch64 devices running x86_64 Linux userland payloads.",
  contributes: {
    config: {
      runtimes: {
        "linux-user": {
          id: "linux-user",
          kind: "cpu-translation",
          host: "aarch64-linux",
          guest: "x86_64-linux",
          capabilities: ["runtime.resolve", "graphics.vulkan", "graphics.gl"],
        },
      },
      modules: {
        "runtime-package": {
          id: "runtime-package",
          kind: "nix-package",
          package: "korri-fex-runtime",
          path: "product/plugins/fex-runtime/packages/fex-runtime",
          capabilities: ["runtime.resolve", "graphics.vulkan", "graphics.gl"],
        },
      },
    },
    handlers: [
      {
        id: "fex.runtime-resolve",
        operation: "runtime.resolve",
        capabilities: ["runtime.resolve", "graphics.vulkan", "graphics.gl"],
        run: context => resolveFexRuntime(context.input),
      },
      {
        id: "fex.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["runtime.resolve", "graphics.vulkan", "graphics.gl"],
        run: () => ({ provider: KORRI_FEX_PLUGIN_ID, status: "ok" as const }),
      },
    ],
  },
})

function resolveFexRuntime(input: unknown): FexRuntimeResolveOutput {
  const value = decodeResolveInput(input)
  const rootfs = value.rootfs ?? DEFAULT_FEX_ROOTFS
  const appId = value.appId ?? "korri-app"
  const env: Record<string, string> = {
    FEX_ROOTFS: rootfs,
  }

  if (value.runDir !== undefined) {
    env.FEX_APP_CONFIG = `${value.runDir}/fex-${appId}.json`
  }

  if (value.enableThunks !== false) {
    env.VK_ICD_FILENAMES = DEFAULT_VULKAN_ICD
  }

  return {
    provider: KORRI_FEX_PLUGIN_ID,
    runtime: "linux-user",
    status: "resolved",
    env,
    thunks: {
      GL: 1,
      Vulkan: 1,
      drm: 1,
      WaylandClient: 1,
    },
  }
}

function decodeResolveInput(input: unknown): FexRuntimeResolveInput {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    throw new Error("FEX runtime.resolve input must be an object")
  }
  return {
    appId: optionalString(input.appId, "appId"),
    runDir: optionalString(input.runDir, "runDir"),
    rootfs: optionalString(input.rootfs, "rootfs"),
    enableThunks: optionalBoolean(input.enableThunks, "enableThunks"),
  }
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `FEX runtime.resolve input.${field} must be a non-empty string`,
    )
  }
  return value
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "boolean") {
    throw new Error(`FEX runtime.resolve input.${field} must be a boolean`)
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
