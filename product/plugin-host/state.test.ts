import { afterEach, describe, expect, it } from "bun:test"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { KORRI_STEAM_PLUGIN_ID } from "@product/plugins/steam"
import {
  createFirstPartyPluginState,
  resetFirstPartyPluginStateForTests,
} from "./state"

afterEach(() => resetFirstPartyPluginStateForTests())

describe("createFirstPartyPluginState", () => {
  it("returns one cached state for repeated equivalent runtime inputs", () => {
    const first = createFirstPartyPluginState({
      env: { KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID },
    })
    const second = createFirstPartyPluginState({
      env: { KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID },
    })

    expect(second).toBe(first)
    expect(first.registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(
      true,
    )
  })

  it("keeps runtime mode fail-closed when no policy has been supplied", () => {
    const state = createFirstPartyPluginState({ env: {} })

    expect(state.registry.enabledPluginIds.size).toBe(0)
  })

  it("uses explicit interactive mode instead of scattered env-absence checks", () => {
    const state = createFirstPartyPluginState({ env: {}, mode: "interactive" })

    expect(state.registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(
      true,
    )
    expect(state.registry.enabledPlugins.length).toBe(
      state.installedPlugins.length,
    )
  })

  it("keeps explicit plugin policy authoritative in interactive mode", () => {
    const state = createFirstPartyPluginState({
      env: { KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID },
      mode: "interactive",
    })

    expect(state.registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(
      true,
    )
    expect(state.registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(
      false,
    )
  })
})
