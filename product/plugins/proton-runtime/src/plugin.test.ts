import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { steamRuntimePaths } from "../../steam/src/plugin"
import {
  KORRI_PROTON_PLUGIN_ID,
  type ProtonRuntimeResolveOutput,
  protonRuntimePlugin,
} from ".."

describe("Proton runtime plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_PROTON_PLUGIN_ID).toBe("@korri:proton")
    expect(protonRuntimePlugin.id).toBe(KORRI_PROTON_PLUGIN_ID)
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
      protonRoot: steamRuntimePaths.proton10Root,
      protonFiles: `${steamRuntimePaths.proton10Root}/files`,
      wine64: `${steamRuntimePaths.proton10Root}/files/bin/wine64`,
      env: {
        WINEPREFIX: "/var/lib/korri/content/games/mega-man-arena/4.20/.wine",
        WINEDLLOVERRIDES: "dxgi,d3d11=n,b",
        LIBGL_DRIVERS_PATH: "/run/opengl-driver/lib/dri",
      },
    })
  })
})
