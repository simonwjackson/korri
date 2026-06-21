import { describe, expect, it } from "bun:test"
import {
  KORRI_WEBPAGE_LAUNCHER_ID,
  KORRI_WEBPAGE_PLUGIN_ID,
  webpagePlugin,
} from "./index"

describe("@korri:webpage plugin", () => {
  it("has the expected id and a content-agnostic launcher", () => {
    expect(webpagePlugin.id).toBe(KORRI_WEBPAGE_PLUGIN_ID)
    const launchers = webpagePlugin.contributes.config.launchers as Record<
      string,
      Record<string, unknown>
    >
    expect(launchers.chromium).toMatchObject({
      id: KORRI_WEBPAGE_LAUNCHER_ID,
      command: "korri-webpage",
      args: ["{target}"],
    })
  })
})
