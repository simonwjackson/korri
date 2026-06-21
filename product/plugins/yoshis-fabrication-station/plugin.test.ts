import { describe, expect, it } from "bun:test"
import {
  createPluginRegistry,
  executableResources,
} from "@platform/plugin/registry"
import { CDP_INPUT_BRIDGE_PLUGIN_ID } from "../cdp-input-bridge"
import {
  KORRI_YFS_LAUNCHER_ID,
  KORRI_YFS_PLUGIN_ID,
  yfsLauncherSettingDescriptors,
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
      command: "yfs-launch",
      args: ["{content.path}"],
      env: { KORRI_YFS_SETTINGS: "{settings.plugin}" },
    })
    expect(launchers.level).not.toHaveProperty("plugin")
    expect(JSON.stringify(launchers.level)).not.toContain("@korri:web-canvas")
    expect(JSON.stringify(launchers.level)).not.toContain("korri-web-canvas")
  })

  it("keeps launcher settings as runtime defaults", () => {
    const launcher = yoshisFabricationStationPlugin.contributes.config.launchers
      ?.level as { settings?: { plugin?: Record<string, unknown> } }

    expect(launcher.settings?.plugin).toEqual({})
  })

  it("documents YFS-specific launcher settings", () => {
    expect(Object.keys(yfsLauncherSettingDescriptors)).toEqual([
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

  it("opts its Chromium launch into the CDP input bridge with the validated mapping", () => {
    const release =
      yoshisFabricationStationPlugin.contributes.config.catalog?.[
        "yoshis-fabrication-station"
      ]?.releases[0]

    expect(yoshisFabricationStationPlugin.requires).toContainEqual(
      expect.objectContaining({
        ref: { provider: CDP_INPUT_BRIDGE_PLUGIN_ID, id: "self" },
      }),
    )
    expect(release?.launch.env).toMatchObject({
      KORRI_CDP_INPUT_BRIDGE_PORT: "9333",
    })
    expect(release?.launch.launchMetadata).toEqual({
      annotations: {
        [CDP_INPUT_BRIDGE_PLUGIN_ID]: {
          enable: true,
          cdpPort: 9333,
          mapping: "yfs-default",
          sourcePreference: {
            names: ["Microsoft Xbox Series S|X Controller"],
          },
          target: { type: "page", urlPattern: "index.html" },
        },
      },
    })
  })
})
