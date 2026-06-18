import { describe, expect, it } from "bun:test"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { sessionLifecycleHooksFromEnv } from "./sessiond-plugin-composition"

describe("sessiond plugin composition", () => {
  it("installs the Gamescope lifecycle hook only when the plugin is enabled", () => {
    expect(sessionLifecycleHooksFromEnv({})).toEqual([])

    const hooks = sessionLifecycleHooksFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_GAMESCOPE_PLUGIN_ID,
      KORRI_GAMESCOPE_CONTROL_BRIDGE: "0",
    })

    expect(hooks.map(hook => hook.id)).toEqual([KORRI_GAMESCOPE_PLUGIN_ID])
  })
})
