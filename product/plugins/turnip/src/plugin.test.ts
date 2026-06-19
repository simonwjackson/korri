import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { KORRI_TURNIP_PLUGIN_ID, turnipPlugin } from ".."

describe("Turnip plugin descriptor", () => {
  it("uses a stable first-party plugin identity", () => {
    expect(KORRI_TURNIP_PLUGIN_ID).toBe("@korri:turnip")
    expect(turnipPlugin.id).toBe(KORRI_TURNIP_PLUGIN_ID)
  })

  it("contributes graphics runtime, wrapper package, launch compose, and diagnostics", () => {
    expect(
      turnipPlugin.contributes.config.modules?.["turnip-wrapper-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "korri-turnip-wrapper",
      capabilities: ["graphics.vulkan", "package.wrap", "launch.compose"],
    })
    expect(
      turnipPlugin.contributes.config.runtimes?.["adreno-vulkan"],
    ).toMatchObject({
      kind: "graphics-driver",
      driver: "turnip",
      capabilities: ["graphics.vulkan"],
    })
    expect(turnipPlugin.handlers.map(handler => handler.operation)).toEqual([
      "launch.compose",
      "diagnostics.collect",
    ])
  })

  it("composes Turnip launch environment through the handler boundary", async () => {
    const handler = turnipPlugin.handlers.find(
      candidate => candidate.operation === "launch.compose",
    )
    if (!handler) throw new Error("missing Turnip launch.compose handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(handler, {
          operation: "launch.compose",
          provider: KORRI_TURNIP_PLUGIN_ID,
          input: {
            spec: { command: "game", args: [], env: { BOX64_UNITY: "1" } },
            policy: { icdPath: "/mesa/freedreno_icd.aarch64.json" },
          },
        }),
      ),
    ).resolves.toMatchObject({
      command: "game",
      args: [],
      env: {
        BOX64_UNITY: "1",
        VK_ICD_FILENAMES: "/mesa/freedreno_icd.aarch64.json",
        VK_DRIVER_FILES: "/mesa/freedreno_icd.aarch64.json",
      },
    })
  })
})
