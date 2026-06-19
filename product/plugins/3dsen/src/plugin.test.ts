import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { Effect } from "effect"
import { KORRI_BOX64_RUNTIME_PLUGIN_ID } from "../../box64-runtime"
import { KORRI_TURNIP_PLUGIN_ID } from "../../turnip"
import {
  KORRI_3DSEN_APP_ID,
  KORRI_3DSEN_PLUGIN_ID,
  threeDSenPlugin,
} from "./plugin"

describe("3dSen plugin descriptor", () => {
  it("uses a stable first-party app plugin identity", () => {
    expect(KORRI_3DSEN_PLUGIN_ID).toBe("@korri:3dsen")
    expect(threeDSenPlugin.id).toBe(KORRI_3DSEN_PLUGIN_ID)
  })

  it("requires Box64 and Turnip and contributes an app-like launch policy", () => {
    expect(threeDSenPlugin.requires).toEqual([
      expect.objectContaining({
        capability: "launch.compose",
        ref: { provider: KORRI_BOX64_RUNTIME_PLUGIN_ID, id: "launch-wrapper" },
      }),
      expect.objectContaining({
        capability: "graphics.vulkan",
        ref: { provider: KORRI_TURNIP_PLUGIN_ID, id: "adreno-vulkan" },
      }),
    ])
    expect(threeDSenPlugin.contributes.config.apps?.["3dsen"]).toMatchObject({
      id: KORRI_3DSEN_APP_ID,
      kind: KORRI_3DSEN_PLUGIN_ID,
      launch: {
        with: {
          [KORRI_BOX64_RUNTIME_PLUGIN_ID]: {
            unityMode: true,
            maxCpu: 1,
            sdlVideoDriver: "x11",
          },
          [KORRI_TURNIP_PLUGIN_ID]: { enable: true },
        },
      },
    })
  })

  it("exposes launch.prepare and diagnostics handlers", () => {
    expect(threeDSenPlugin.handlers.map(handler => handler.operation)).toEqual([
      "launch.prepare",
      "diagnostics.collect",
    ])
  })

  it("rejects malformed launch.prepare input through the handler boundary", async () => {
    const handler = threeDSenPlugin.handlers.find(
      candidate => candidate.operation === "launch.prepare",
    )
    if (!handler) throw new Error("missing 3dSen launch.prepare handler")

    const exit = await Effect.runPromiseExit(
      runPluginHandler(handler, {
        operation: "launch.prepare",
        provider: KORRI_3DSEN_PLUGIN_ID,
        input: { spec: { command: "3dSen.exe", args: [] }, policy: {} },
      }),
    )

    expect(exit._tag).toBe("Failure")
  })
})
