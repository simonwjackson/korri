import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import {
  KORRI_YFS_LAUNCHER_ID,
  KORRI_YFS_PLUGIN_ID,
  yoshisFabricationStationPlugin,
} from "."

describe("Yoshi's Fabrication Station plugin", () => {
  it("contributes its playable and executable resources only when enabled", () => {
    const disabled = createPluginRegistry([yoshisFabricationStationPlugin])
    expect(disabled.catalog).toEqual({})

    const enabled = createPluginRegistry([yoshisFabricationStationPlugin], {
      enabledPluginIds: [KORRI_YFS_PLUGIN_ID],
    })

    expect(Object.keys(enabled.catalog)).toEqual([
      "@korri:yoshis-fabrication-station/yoshis-fabrication-station",
    ])
    expect(executableResources(enabled).map(entry => entry.resource)).toEqual([
      expect.objectContaining({
        id: "yoshis-fabrication-station",
        fulfill: expect.objectContaining({
          provider: "nix",
          binary: "yfs",
        }),
      }),
      expect.objectContaining({
        id: "yfs-launch",
        fulfill: expect.objectContaining({
          provider: "nix",
          binary: "yfs-launch",
        }),
      }),
    ])
  })

  it("exposes a YFS launcher without leaking web-canvas authoring", () => {
    const launchers = yoshisFabricationStationPlugin.contributes.config
      .launchers as Record<string, Record<string, unknown>>

    expect(launchers.level).toMatchObject({
      id: KORRI_YFS_LAUNCHER_ID,
      plugin: KORRI_YFS_PLUGIN_ID,
      command: "yfs-launch",
      args: ["{target}"],
      env: { KORRI_YFS_SETTINGS: "{settings}" },
    })
    expect(JSON.stringify(launchers.level)).not.toContain("@korri:web-canvas")
    expect(JSON.stringify(launchers.level)).not.toContain("korri-web-canvas")
  })

  it("documents YFS-specific launcher settings", () => {
    const launcher = yoshisFabricationStationPlugin.contributes.config.launchers
      ?.level as { settings?: { plugin?: Record<string, unknown> } }

    expect(Object.keys(launcher.settings?.plugin ?? {})).toEqual([
      "audio",
      "gbaSounds",
      "quickDeath",
      "playTimer",
      "bgmVolume",
      "sfxVolume",
      "debug",
      "metrics",
    ])
  })
})
