import { describe, expect, it } from "bun:test"
import { decodeAppRecord } from "@platform/library/config/records/app"
import { createFirstPartyPluginRegistryFromEnv } from "../.."
import { KORRI_GAMESCOPE_PLUGIN_ID } from "../../gamescope"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_APP_LOCAL_ID,
  KORRI_STEAM_PLUGIN_ID,
  KORRI_STEAM_STORAGE_ID,
  steamPlugin,
} from ".."

describe("Steam plugin descriptor", () => {
  it("declares Steam as a plugin-qualified first-party app provider", () => {
    expect(KORRI_STEAM_PLUGIN_ID).toBe("@korri:steam")
    expect(KORRI_STEAM_APP_LOCAL_ID).toBe("steam")
    expect(KORRI_STEAM_APP_ID).toBe("@korri:steam/steam")
    expect(steamPlugin.id).toBe(KORRI_STEAM_PLUGIN_ID)
    expect(
      steamPlugin.contributes.config.providers[KORRI_STEAM_PLUGIN_ID],
    ).toMatchObject({ title: "Steam" })
    expect(steamPlugin.contributes.config.launchers?.steam).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      plugin: KORRI_STEAM_PLUGIN_ID,
      command: "steam",
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
          extra: { args: ["-silent", "-gamepadui"] },
        },
      },
    })
  })

  it("keeps Steam authored policy under the plugin payload", () => {
    const app = steamPlugin.contributes.config.launchers?.steam

    expect(app).toBeDefined()
    expect(app).not.toHaveProperty("state")
    expect(app).not.toHaveProperty("extra")
    expect(app).not.toHaveProperty("launch-options")
    expect(decodeAppRecord(app)).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      plugin: KORRI_STEAM_PLUGIN_ID,
      command: "steam",
      launch: {
        with: {
          [KORRI_GAMESCOPE_PLUGIN_ID]: { enable: true },
        },
      },
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
          extra: { args: ["-silent", "-gamepadui"] },
        },
      },
    })
  })

  it("contributes typed session cleanup and plugin-owned Nix surfaces", () => {
    expect(
      steamPlugin.contributes.config.modules?.["session-cleanup"],
    ).toMatchObject({
      kind: "session-hook",
      capabilities: ["session.cleanup"],
    })
    expect(
      steamPlugin.contributes.config.modules?.["steam-korri-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "steam-korri",
      path: "product/plugins/steam/packages/steam-korri",
      capabilities: ["package.expose", "steam.runtime"],
    })
    expect(
      steamPlugin.contributes.config.modules?.["steam-nixos-module"],
    ).toMatchObject({
      kind: "nixos-module",
      path: "product/plugins/steam/nix/nixos-module.nix",
      capabilities: ["system.service", "steam.runtime"],
    })
    expect(steamPlugin.handlers).toContainEqual(
      expect.objectContaining({ operation: "session.cleanup" }),
    )
    expect(steamPlugin.handlers).toContainEqual(
      expect.objectContaining({
        operation: "install.request",
        capabilities: ["install.request"],
      }),
    )
    expect(steamPlugin.handlers).toContainEqual(
      expect.objectContaining({
        operation: "install.status",
        capabilities: ["install.status"],
      }),
    )
  })

  it("models Gamescope as an explicit non-auto-enabled launch requirement", () => {
    expect(steamPlugin.requires).toContainEqual({
      capability: "launch.compose",
      ref: { provider: KORRI_GAMESCOPE_PLUGIN_ID, id: "launch-wrapper" },
      autoEnable: false,
      reason: "Steam AppID launches run inside Korri's Gamescope companion.",
    })
  })

  it("is available to first-party composition only when explicitly enabled", () => {
    const disabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })
    const enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID,
    })

    expect(disabled.pluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(true)
    expect(disabled.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(false)
    expect(disabled.launchers[KORRI_STEAM_APP_ID]).toBeUndefined()
    expect(enabled.enabledPluginIds.has(KORRI_STEAM_PLUGIN_ID)).toBe(true)
    expect(enabled.enabledPluginIds.has(KORRI_GAMESCOPE_PLUGIN_ID)).toBe(false)
    expect(enabled.launchers[KORRI_STEAM_APP_ID]).toMatchObject({
      id: KORRI_STEAM_APP_ID,
      plugin: KORRI_STEAM_PLUGIN_ID,
      command: "steam",
    })
  })
})
