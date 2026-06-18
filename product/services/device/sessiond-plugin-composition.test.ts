import { describe, expect, it } from "bun:test"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { KORRI_STEAM_PLUGIN_ID } from "@product/plugins/steam"
import { sessionLifecycleHooksFromEnv } from "./sessiond-plugin-composition"

describe("sessiond plugin composition", () => {
  it("installs lifecycle hooks for enabled first-party plugins", () => {
    expect(sessionLifecycleHooksFromEnv({})).toEqual([])

    const hooks = sessionLifecycleHooksFromEnv({
      KORRI_ENABLED_PLUGINS: `${KORRI_GAMESCOPE_PLUGIN_ID},${KORRI_STEAM_PLUGIN_ID}`,
      KORRI_GAMESCOPE_CONTROL_BRIDGE: "0",
    })

    expect(hooks.map(hook => hook.id)).toEqual([
      KORRI_GAMESCOPE_PLUGIN_ID,
      KORRI_STEAM_PLUGIN_ID,
    ])
  })
})
