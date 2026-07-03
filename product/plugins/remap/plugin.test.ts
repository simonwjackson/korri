import { afterEach, describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { firstPartyPlugins } from ".."
import { KORRI_REMAP_PLUGIN_ID, remapPlugin } from "."

const originalNativeDriver = process.env.KORRI_REMAP_NATIVE_DRIVER

afterEach(() => {
  if (originalNativeDriver === undefined)
    delete process.env.KORRI_REMAP_NATIVE_DRIVER
  else process.env.KORRI_REMAP_NATIVE_DRIVER = originalNativeDriver
})

describe("Remap plugin", () => {
  it("declares the product-facing provider id", () => {
    expect(KORRI_REMAP_PLUGIN_ID).toBe("@korri:remap")
    expect(remapPlugin.id).toBe(KORRI_REMAP_PLUGIN_ID)
  })

  it("registers Remap as a first-party launch companion plugin", () => {
    const plugin = firstPartyPlugins.find(
      candidate => candidate.id === KORRI_REMAP_PLUGIN_ID,
    )

    expect(
      plugin?.contributes.config.modules?.["launch-wrapper"],
    ).toMatchObject({
      id: "launch-wrapper",
      kind: "launch-wrapper",
      capabilities: ["launch.compose", "launch.wrapper", "input.remap"],
    })
    expect(
      plugin?.contributes.handlers?.map(handler => handler.operation),
    ).toContain("diagnostics.collect")
  })

  it("reports unavailable diagnostics until the native driver is enabled", async () => {
    delete process.env.KORRI_REMAP_NATIVE_DRIVER
    const handler = remapPlugin.handlers.find(
      candidate => candidate.operation === "diagnostics.collect",
    )
    if (!handler) throw new Error("missing Remap diagnostics handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(handler, {
          operation: "diagnostics.collect",
          provider: KORRI_REMAP_PLUGIN_ID,
          input: {},
        }),
      ),
    ).resolves.toMatchObject({
      provider: KORRI_REMAP_PLUGIN_ID,
      status: "unavailable",
      reason: expect.stringContaining("native Remap driver"),
    })
  })

  it("reports ok diagnostics when the native driver is enabled", async () => {
    process.env.KORRI_REMAP_NATIVE_DRIVER = "enabled"
    const handler = remapPlugin.handlers.find(
      candidate => candidate.operation === "diagnostics.collect",
    )
    if (!handler) throw new Error("missing Remap diagnostics handler")

    await expect(
      Effect.runPromise(
        runPluginHandler(handler, {
          operation: "diagnostics.collect",
          provider: KORRI_REMAP_PLUGIN_ID,
          input: {},
        }),
      ),
    ).resolves.toMatchObject({
      provider: KORRI_REMAP_PLUGIN_ID,
      status: "ok",
      isolation: "wrapper-scoped",
    })
  })
})
