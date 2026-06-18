import { plugin } from "@platform/plugin"

export const KORRI_PROTON_GE_PLUGIN_ID = "@korri:proton-ge" as const

export interface ProtonGeRuntimeResolveInput {
  readonly installRoot?: string
  readonly protonRoot?: string
  readonly protonFiles?: string
  readonly winePrefix?: string
}

export interface ProtonGeRuntimeResolveOutput {
  readonly provider: typeof KORRI_PROTON_GE_PLUGIN_ID
  readonly runtime: "ge-proton-10-34"
  readonly status: "resolved"
  readonly version: "GE-Proton10-34"
  readonly protonRoot: string
  readonly protonFiles: string
  readonly proton: string
  readonly python: string
  readonly wine64: string
  readonly env: Readonly<Record<string, string>>
}

const VERSION = "GE-Proton10-34" as const
const DEFAULT_INSTALL_ROOT = "/run/current-system/sw"
const DEFAULT_WINE_DLL_OVERRIDES = "dxgi,d3d11=n,b"
const DEFAULT_LIBGL_DRIVERS_PATH = "/run/opengl-driver/lib/dri"
const DEFAULT_FEX_PYTHON = "/usr/bin/python3"

export const protonGeRuntimePlugin = plugin({
  namespace: "@korri",
  name: "proton-ge",
  title: "Proton-GE",
  description:
    "Contributes Korri's optional pinned Proton-GE runtime for Windows x86_64 payloads on aarch64/FEX-capable devices.",
  contributes: {
    config: {
      runtimes: {
        "ge-proton-10-34": {
          id: "ge-proton-10-34",
          kind: "windows-compatibility",
          title: VERSION,
          source: "gloriouseggroll-release",
          version: VERSION,
          capabilities: [
            "runtime.resolve",
            "windows.x86_64",
            "direct3d.dxvk",
            "arm.aarch64",
          ],
        },
      },
      modules: {
        "runtime-package": {
          id: "runtime-package",
          kind: "nix-package",
          package: "korri-proton-ge-runtime",
          path: "product/plugins/proton-ge-runtime/packages/proton-ge-runtime",
          capabilities: [
            "runtime.resolve",
            "windows.x86_64",
            "direct3d.dxvk",
            "arm.aarch64",
          ],
        },
      },
    },
    handlers: [
      {
        id: "proton-ge.runtime-resolve",
        operation: "runtime.resolve",
        capabilities: [
          "runtime.resolve",
          "windows.x86_64",
          "direct3d.dxvk",
          "arm.aarch64",
        ],
        run: context => resolveProtonGeRuntime(context.input),
      },
      {
        id: "proton-ge.diagnostics",
        operation: "diagnostics.collect",
        capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
        run: () => ({
          provider: KORRI_PROTON_GE_PLUGIN_ID,
          status: "ok" as const,
          version: VERSION,
        }),
      },
    ],
  },
})

function resolveProtonGeRuntime(input: unknown): ProtonGeRuntimeResolveOutput {
  const value = decodeResolveInput(input)
  const protonRoot =
    value.protonRoot ??
    `${value.installRoot ?? DEFAULT_INSTALL_ROOT}/share/korri/proton-ge-runtime/${VERSION}`
  const protonFiles = value.protonFiles ?? `${protonRoot}/files`
  const proton = `${protonRoot}/proton`
  const python = DEFAULT_FEX_PYTHON
  const wine64 = `${protonFiles}/bin/wine64`
  const env: Record<string, string> = {
    WINEDLLOVERRIDES: DEFAULT_WINE_DLL_OVERRIDES,
    LIBGL_DRIVERS_PATH: DEFAULT_LIBGL_DRIVERS_PATH,
  }

  if (value.winePrefix !== undefined) {
    env.WINEPREFIX = value.winePrefix
  }

  return {
    provider: KORRI_PROTON_GE_PLUGIN_ID,
    runtime: "ge-proton-10-34",
    status: "resolved",
    version: VERSION,
    protonRoot,
    protonFiles,
    proton,
    python,
    wine64,
    env,
  }
}

function decodeResolveInput(input: unknown): ProtonGeRuntimeResolveInput {
  if (input === undefined) return {}
  if (!isRecord(input)) {
    throw new Error("Proton-GE runtime.resolve input must be an object")
  }
  return {
    installRoot: optionalString(input.installRoot, "installRoot"),
    protonRoot: optionalString(input.protonRoot, "protonRoot"),
    protonFiles: optionalString(input.protonFiles, "protonFiles"),
    winePrefix: optionalString(input.winePrefix, "winePrefix"),
  }
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `Proton-GE runtime.resolve input.${field} must be a non-empty string`,
    )
  }
  return value
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
