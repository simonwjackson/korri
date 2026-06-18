import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import {
  type FexRuntimeResolveOutput,
  fexRuntimePlugin,
  KORRI_FEX_PLUGIN_ID,
} from ".."

describe("FEX runtime plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_FEX_PLUGIN_ID).toBe("@korri:fex")
    expect(fexRuntimePlugin.id).toBe(KORRI_FEX_PLUGIN_ID)
  })

  it("contributes the reusable FEX runtime and package surfaces", () => {
    expect(
      fexRuntimePlugin.contributes.config.runtimes?.["linux-user"],
    ).toMatchObject({
      id: "linux-user",
      kind: "cpu-translation",
      host: "aarch64-linux",
      guest: "x86_64-linux",
      capabilities: ["runtime.resolve", "graphics.vulkan", "graphics.gl"],
    })
    expect(
      fexRuntimePlugin.contributes.config.modules?.["runtime-package"],
    ).toMatchObject({
      id: "runtime-package",
      kind: "nix-package",
      package: "korri-fex-runtime",
      path: "product/plugins/fex-runtime/packages/fex-runtime",
      capabilities: ["runtime.resolve", "graphics.vulkan", "graphics.gl"],
    })
    expect(
      fexRuntimePlugin.contributes.handlers?.map(handler => handler.operation),
    ).toEqual(["runtime.resolve", "diagnostics.collect"])
  })

  it("resolves the known-good Bandai FEX environment contract", async () => {
    const handler = fexRuntimePlugin.handlers.find(
      candidate => candidate.operation === "runtime.resolve",
    )
    if (!handler) throw new Error("FEX runtime.resolve handler missing")

    const result = (await Effect.runPromise(
      runPluginHandler(handler, {
        operation: "runtime.resolve",
        provider: KORRI_FEX_PLUGIN_ID,
        input: {
          appId: "mega-man-arena",
          runDir: "/var/lib/korri/content/games/mega-man-arena/4.20",
        },
      }),
    )) as FexRuntimeResolveOutput

    expect(result).toMatchObject({
      provider: KORRI_FEX_PLUGIN_ID,
      runtime: "linux-user",
      status: "resolved",
      env: {
        FEX_ROOTFS: "/var/lib/korri/steam/fex-rootfs",
        FEX_APP_CONFIG:
          "/var/lib/korri/content/games/mega-man-arena/4.20/fex-mega-man-arena.json",
        VK_ICD_FILENAMES: "/usr/share/vulkan/icd.d/freedreno_icd.x86_64.json",
      },
      thunks: {
        GL: 1,
        Vulkan: 1,
        drm: 1,
        WaylandClient: 1,
      },
    })
  })
})
