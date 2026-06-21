import { describe, expect, it } from "bun:test"
import {
  KORRI_WEB_RUNTIME_LAUNCHER_ID,
  KORRI_WEB_RUNTIME_PLUGIN_ID,
  webRuntimePlugin,
} from "./index"

describe("@korri:web-runtime plugin", () => {
  it("has the expected id", () => {
    expect(webRuntimePlugin.id).toBe(KORRI_WEB_RUNTIME_PLUGIN_ID)
  })

  it("contributes a single chromium launcher keyed by the url target", () => {
    const launchers = webRuntimePlugin.contributes.config.launchers as Record<
      string,
      Record<string, unknown>
    >
    expect(Object.keys(launchers)).toEqual(["chromium"])
    expect(launchers.chromium).toMatchObject({
      id: KORRI_WEB_RUNTIME_LAUNCHER_ID,
      plugin: KORRI_WEB_RUNTIME_PLUGIN_ID,
      command: "korri-web-runtime",
      args: ["{target}"],
    })
  })

  it("does not embed engine, native-res, or gamescope config", () => {
    const chromium = JSON.stringify(
      webRuntimePlugin.contributes.config.launchers?.chromium,
    )
    expect(chromium).not.toContain("gamescope")
    expect(chromium).not.toContain("native")
    expect(chromium).not.toContain("engine")
  })
})
