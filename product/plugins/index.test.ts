import { describe, expect, it } from "bun:test"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@platform/plugin/ids"

import { createFirstPartyPluginRegistryFromEnv, firstPartyPlugins } from "."

describe("first-party plugins", () => {
  it("registers Gamescope as a first-party launch companion plugin", () => {
    const gamescope = firstPartyPlugins.find(
      plugin => plugin.id === KORRI_GAMESCOPE_PLUGIN_ID,
    )

    expect(gamescope?.contributes.launchCompanions).toEqual([
      {
        id: KORRI_GAMESCOPE_PLUGIN_ID,
        role: "launch-wrapper",
        supports: { systems: ["*"] },
      },
    ])
  })

  it("enables Gamescope infrastructure even when catalog plugins are disabled", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(true)
    expect(registry.launchCompanions.map(entry => entry.companion.id)).toEqual([
      KORRI_GAMESCOPE_PLUGIN_ID,
    ])
    expect(registry.catalog).toEqual([])
  })

  it("preserves env-enabled first-party catalog plugins", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: "@korri:neverball",
    })

    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has("@korri:neverball")).toBe(true)
    expect(registry.launchCompanions.map(entry => entry.companion.id)).toEqual([
      KORRI_GAMESCOPE_PLUGIN_ID,
    ])
    expect(registry.catalog.map(entry => entry.item.id)).toEqual(["neverball"])
    expect(registry.resources.map(entry => entry.resource.id)).toEqual([
      "neverball",
    ])
  })
})
