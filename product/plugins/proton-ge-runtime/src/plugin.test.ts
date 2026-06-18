import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import {
  KORRI_PROTON_GE_PLUGIN_ID,
  type ProtonGeRuntimeResolveOutput,
  protonGeRuntimePlugin,
} from ".."

describe("Proton-GE runtime plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_PROTON_GE_PLUGIN_ID).toBe("@korri:proton-ge")
    expect(protonGeRuntimePlugin.id).toBe(KORRI_PROTON_GE_PLUGIN_ID)
  })

  it("contributes pinned GE-Proton10-34 as an optional runtime", () => {
    expect(
      protonGeRuntimePlugin.contributes.config.runtimes?.["ge-proton-10-34"],
    ).toMatchObject({
      id: "ge-proton-10-34",
      kind: "windows-compatibility",
      title: "GE-Proton10-34",
      source: "gloriouseggroll-release",
      capabilities: [
        "runtime.resolve",
        "windows.x86_64",
        "direct3d.dxvk",
        "arm.aarch64",
      ],
    })
    expect(
      protonGeRuntimePlugin.contributes.config.modules?.["runtime-package"],
    ).toMatchObject({
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
    })
  })

  it("resolves the pinned package proton-launcher contract", async () => {
    const handler = protonGeRuntimePlugin.handlers.find(
      candidate => candidate.operation === "runtime.resolve",
    )
    if (!handler) throw new Error("Proton-GE runtime.resolve handler missing")

    const result = (await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "runtime.resolve",
        provider: KORRI_PROTON_GE_PLUGIN_ID,
        input: {
          installRoot: "/nix/store/example-korri-proton-ge-runtime",
          winePrefix:
            "/var/lib/korri/content/games/mega-man-arena/4.20/.wine-ge",
        },
      }),
    )) as ProtonGeRuntimeResolveOutput

    expect(result).toMatchObject({
      provider: KORRI_PROTON_GE_PLUGIN_ID,
      runtime: "ge-proton-10-34",
      status: "resolved",
      version: "GE-Proton10-34",
      protonRoot:
        "/nix/store/example-korri-proton-ge-runtime/share/korri/proton-ge-runtime/GE-Proton10-34",
      protonFiles:
        "/nix/store/example-korri-proton-ge-runtime/share/korri/proton-ge-runtime/GE-Proton10-34/files",
      proton:
        "/nix/store/example-korri-proton-ge-runtime/share/korri/proton-ge-runtime/GE-Proton10-34/proton",
      python: "/usr/bin/python3",
      wine64:
        "/nix/store/example-korri-proton-ge-runtime/share/korri/proton-ge-runtime/GE-Proton10-34/files/bin/wine64",
      env: {
        WINEPREFIX: "/var/lib/korri/content/games/mega-man-arena/4.20/.wine-ge",
        WINEDLLOVERRIDES: "dxgi,d3d11=n,b",
        LIBGL_DRIVERS_PATH: "/run/opengl-driver/lib/dri",
      },
    })
  })
})
