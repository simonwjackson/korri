import { describe, expect, it } from "bun:test"
import {
  KORRI_WEB_CANVAS_LAUNCHER_ID,
  KORRI_WEB_CANVAS_PLUGIN_ID,
  webCanvasPlugin,
} from "./index"

describe("@korri:web-canvas plugin", () => {
  it("has the expected id and canvas launcher", () => {
    expect(webCanvasPlugin.id).toBe(KORRI_WEB_CANVAS_PLUGIN_ID)
    const launchers = webCanvasPlugin.contributes.config.launchers as Record<
      string,
      Record<string, unknown>
    >
    expect(launchers.chromium).toMatchObject({
      id: KORRI_WEB_CANVAS_LAUNCHER_ID,
      command: "korri-web-canvas",
      args: ["{target}"],
    })
  })
  it("requires the webpage core", () => {
    expect(
      webCanvasPlugin.requires?.some(r => r.ref?.provider === "@korri:webpage"),
    ).toBe(true)
  })
})
