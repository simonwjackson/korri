import { plugin } from "@platform/plugin"
import { KORRI_STEAM_PLUGIN_ID } from "../../steam/src/plugin"

export const KORRI_PROTON_PLUGIN_ID = "@korri:proton" as const

export interface ProtonRuntimeResolveInput {
  readonly protonRoot?: string
  readonly protonFiles?: string
  readonly winePrefix?: string
}

export interface ProtonRuntimeResolveOutput {
  readonly provider: typeof KORRI_PROTON_PLUGIN_ID
  readonly runtime: "proton-10"
  readonly status: "resolved"
  readonly protonRoot: string
  readonly protonFiles: string
  readonly wine64: string
  readonly env: Readonly<Record<string, string>>
}

export const protonRuntimePaths = {
  proton10Root: "/var/lib/korri/steam/steamapps/common/Proton 10.0",
  wineDllOverrides: "dxgi,d3d11=n,b",
  libglDriversPath: "/run/opengl-driver/lib/dri",
} as const

const DEFAULT_PROTON_ROOT = protonRuntimePaths.proton10Root
const DEFAULT_WINE_DLL_OVERRIDES = protonRuntimePaths.wineDllOverrides
const DEFAULT_LIBGL_DRIVERS_PATH = protonRuntimePaths.libglDriversPath

export const protonRuntimePlugin = plugin({
  namespace: "@korri",
  name: "proton",
  title: "Proton",
  description:
    "Contributes Korri's first-party Proton runtime resolver for Windows x86_64 payloads on FEX-capable devices.",
  requires: [
    {
      capability: "steam.runtime",
      ref: { provider: KORRI_STEAM_PLUGIN_ID, id: "steam-korri-package" },
      reason:
        "The default Proton root is provisioned by the Steam plugin runtime.",
    },
  ],
  contributes: {
    config: {
      runtimes: {
        "proton-10": {
          id: "proton-10",
          kind: "windows-compatibility",
          title: "Proton 10.0 from Steam",
          source: "steam-library",
          capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
        },
      },
      modules: {
        "runtime-package": {
          id: "runtime-package",
          kind: "nix-package",
          package: "korri-proton-runtime",
          path: "product/plugins/proton-runtime/packages/proton-runtime",
          capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
        },
        "proton-cachyos-arm64-package": {
          id: "proton-cachyos-arm64-package",
          kind: "nix-package",
          package: "proton-cachyos-arm64",
          path: "product/plugins/proton-runtime/packages/proton-cachyos-arm64",
          capabilities: ["steam.runtime", "windows.x86", "windows.x86_64"],
        },
      },
    },
    handlers: [
      {
        id: "proton.runtime-resolve",
        operation: "runtime.resolve",
        capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
        run: context => resolveProtonRuntime(context.input),
      },
      {
        id: "proton.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
        run: () => ({
          provider: KORRI_PROTON_PLUGIN_ID,
          status: "ok" as const,
        }),
      },
    ],
  },
})

function resolveProtonRuntime(input: unknown): ProtonRuntimeResolveOutput {
  const value = decodeResolveInput(input)
  const protonRoot = value.protonRoot ?? DEFAULT_PROTON_ROOT
  const protonFiles = value.protonFiles ?? `${protonRoot}/files`
  const wine64 = `${protonFiles}/bin/wine64`
  const env: Record<string, string> = {
    WINEDLLOVERRIDES: DEFAULT_WINE_DLL_OVERRIDES,
    LIBGL_DRIVERS_PATH: DEFAULT_LIBGL_DRIVERS_PATH,
  }

  if (value.winePrefix !== undefined) {
    env.WINEPREFIX = value.winePrefix
  }

  return {
    provider: KORRI_PROTON_PLUGIN_ID,
    runtime: "proton-10",
    status: "resolved",
    protonRoot,
    protonFiles,
    wine64,
    env,
  }
}

function decodeResolveInput(input: unknown): ProtonRuntimeResolveInput {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    throw new Error("Proton runtime.resolve input must be an object")
  }
  return {
    protonRoot: optionalString(input.protonRoot, "protonRoot"),
    protonFiles: optionalString(input.protonFiles, "protonFiles"),
    winePrefix: optionalString(input.winePrefix, "winePrefix"),
  }
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Proton runtime.resolve input.${field} must be a non-empty string`,
    )
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
