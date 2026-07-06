import { describe, expect, it } from "bun:test"
import { createPluginRegistry } from "@platform/plugin/registry"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "@product/plugins/gamescope"
import { KORRI_PICO8_PLUGIN_ID } from "@product/plugins/pico8"
import { KORRI_STEAM_PLUGIN_ID } from "@product/plugins/steam"
import { bundledPluginInventory } from "./bundled-plugins.generated"
import { discoverBundledPlugins } from "./roots"

describe("bundled plugin roots", () => {
  it("discovers the statically emitted bundled plugin inventory", () => {
    const result = discoverBundledPlugins()

    expect(result.diagnostics).toEqual([])
    expect(result.plugins).toBe(bundledPluginInventory)
    expect(result.plugins.map(plugin => plugin.id)).toContain(
      KORRI_GAMESCOPE_PLUGIN_ID,
    )
    expect(result.plugins.map(plugin => plugin.id)).toContain(
      KORRI_STEAM_PLUGIN_ID,
    )
    expect(result.plugins.map(plugin => plugin.id)).toContain(
      KORRI_PICO8_PLUGIN_ID,
    )
  })

  it("reports a clear diagnostic when the bundled inventory is absent", () => {
    const result = discoverBundledPlugins([])

    expect(result.plugins).toEqual([])
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "missing-root",
        source: "bundled-plugin-inventory",
      }),
    ])
  })

  it("feeds bundled descriptors into the normal registry path", () => {
    const result = discoverBundledPlugins()
    const registry = createPluginRegistry(result.plugins, {
      enabledPluginIds: [KORRI_GAMESCOPE_PLUGIN_ID, KORRI_STEAM_PLUGIN_ID],
    })

    expect(registry.policyDiagnostics).toEqual([])
    expect(registry.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(true)
    expect(registry.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(true)
    expect(registry.lifecycleHooks.map(hook => hook.pluginId)).toEqual([
      KORRI_GAMESCOPE_PLUGIN_ID,
      KORRI_STEAM_PLUGIN_ID,
    ])
    expect(registry.daemons.map(daemon => daemon.pluginId)).toEqual([
      KORRI_STEAM_PLUGIN_ID,
    ])
  })

  it("keeps bundled plugin ids unique before registry construction", () => {
    const result = discoverBundledPlugins()
    const ids = result.plugins.map(plugin => plugin.id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})
