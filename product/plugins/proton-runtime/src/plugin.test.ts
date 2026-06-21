import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { KORRI_STEAM_PLUGIN_ID } from "../../steam/src/plugin"
import {
  KORRI_PROTON_PLUGIN_ID,
  type ProtonRuntimeResolveOutput,
  protonRuntimePaths,
  protonRuntimePlugin,
} from ".."

describe("Proton runtime plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_PROTON_PLUGIN_ID).toBe("@korri:proton")
    expect(protonRuntimePlugin.id).toBe(KORRI_PROTON_PLUGIN_ID)
  })

  it("declares the Steam runtime contract for its default Proton root", () => {
    expect(protonRuntimePlugin.requires).toContainEqual({
      capability: "steam.runtime",
      ref: { provider: KORRI_STEAM_PLUGIN_ID, id: "steam-korri-package" },
      reason:
        "The default Proton root is provisioned by the Steam plugin runtime.",
    })
  })

  it("contributes the current Steam-contract Proton 10 runtime and package helper", () => {
    expect(
      protonRuntimePlugin.contributes.config.runtimes?.["proton-10"],
    ).toMatchObject({
      id: "proton-10",
      kind: "windows-compatibility",
      title: "Proton 10.0 from Steam",
      capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
    })
    expect(
      protonRuntimePlugin.contributes.config.modules?.["runtime-package"],
    ).toMatchObject({
      id: "runtime-package",
      kind: "nix-package",
      package: "korri-proton-runtime",
      path: "product/plugins/proton-runtime/packages/proton-runtime",
      capabilities: ["runtime.resolve", "windows.x86_64", "direct3d.dxvk"],
    })
    expect(
      protonRuntimePlugin.contributes.config.modules?.[
        "proton-cachyos-arm64-package"
      ],
    ).toMatchObject({
      id: "proton-cachyos-arm64-package",
      kind: "nix-package",
      package: "proton-cachyos-arm64",
      path: "product/plugins/proton-runtime/packages/proton-cachyos-arm64",
      capabilities: ["steam.runtime", "windows.x86", "windows.x86_64"],
    })
    expect(
      protonRuntimePlugin.contributes.handlers?.map(
        handler => handler.operation,
      ),
    ).toEqual(["runtime.resolve", "diagnostics.collect"])
  })

  it("resolves the known-good Bandai Proton 10 direct-wine contract", async () => {
    const handler = protonRuntimePlugin.handlers.find(
      candidate => candidate.operation === "runtime.resolve",
    )
    if (!handler) throw new Error("Proton runtime.resolve handler missing")

    const result = (await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "runtime.resolve",
        provider: KORRI_PROTON_PLUGIN_ID,
        input: {
          winePrefix: "/var/lib/korri/content/games/mega-man-arena/4.20/.wine",
        },
      }),
    )) as ProtonRuntimeResolveOutput

    expect(result).toMatchObject({
      provider: KORRI_PROTON_PLUGIN_ID,
      runtime: "proton-10",
      status: "resolved",
      protonRoot: protonRuntimePaths.proton10Root,
      protonFiles: `${protonRuntimePaths.proton10Root}/files`,
      wine64: `${protonRuntimePaths.proton10Root}/files/bin/wine64`,
      env: {
        WINEPREFIX: "/var/lib/korri/content/games/mega-man-arena/4.20/.wine",
        WINEDLLOVERRIDES: protonRuntimePaths.wineDllOverrides,
        LIBGL_DRIVERS_PATH: protonRuntimePaths.libglDriversPath,
      },
    })
  })

  it("respects caller-provided Proton root and files overrides", async () => {
    const handler = protonRuntimePlugin.handlers.find(
      candidate => candidate.operation === "runtime.resolve",
    )
    if (!handler) throw new Error("Proton runtime.resolve handler missing")

    const result = (await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "runtime.resolve",
        provider: KORRI_PROTON_PLUGIN_ID,
        input: {
          protonRoot: "/custom/proton",
          protonFiles: "/custom/proton/files-alt",
        },
      }),
    )) as ProtonRuntimeResolveOutput

    expect(result).toMatchObject({
      protonRoot: "/custom/proton",
      protonFiles: "/custom/proton/files-alt",
      wine64: "/custom/proton/files-alt/bin/wine64",
    })
  })
})
