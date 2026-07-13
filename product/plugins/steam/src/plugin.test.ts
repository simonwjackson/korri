import { describe, expect, it } from "bun:test"
import { decodeAppRecord } from "@platform/library/config/records/app"
import { createFirstPartyPluginRegistryFromEnv } from "@product/plugin-host"
import { KORRI_GAMESCOPE_PLUGIN_ID } from "../../gamescope"
import {
  KORRI_STEAM_APP_ID,
  KORRI_STEAM_APP_LOCAL_ID,
  KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID,
  KORRI_STEAM_PLUGIN_ID,
  KORRI_STEAM_STORAGE_ID,
  defaultX86SteamPluginPolicy,
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
      // korri-steam-app owns the inner Gamescope service; the outer host-level
      // Gamescope companion is explicitly disabled to avoid double-wrapping.
      launch: {
        with: {
          [KORRI_GAMESCOPE_PLUGIN_ID]: { enable: false },
        },
      },
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
        },
      },
    })
  })

  it("opts the Steam launcher out of the outer Gamescope companion", () => {
    const app = decodeAppRecord(steamPlugin.contributes.config.launchers?.steam)
    expect(app.launch?.with?.[KORRI_GAMESCOPE_PLUGIN_ID]).toEqual({
      enable: false,
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
    expect(
      steamPlugin.contributes.config.modules?.["steam-source-machine-module"],
    ).toMatchObject({
      kind: "nixos-module",
      path: "product/plugins/steam/nix/source-machine-module.nix",
      capabilities: ["system.service", "steam.runtime", "steam.x86"],
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

  it("declares an x86 CachyOS Proton policy distinct from Bandai ARM", () => {
    expect(defaultX86SteamPluginPolicy["compat-tool"]).toBe(
      "proton-cachyos-11.0-20260601-slr-x86_64",
    )
    expect(defaultX86SteamPluginPolicy["compat-tool"]).not.toBe(
      "proton-cachyos-11.0-20260601-slr-arm64",
    )
    expect(defaultX86SteamPluginPolicy).toMatchObject({
      state: { root: `{storage:${KORRI_STEAM_STORAGE_ID}}` },
      "first-launch": {
        "suppress-interstitials": true,
        "accept-eulas": true,
      },
    })
  })

  it("models Gamescope as an explicit non-auto-enabled launch requirement", () => {
    expect(steamPlugin.requires).toContainEqual({
      capability: "launch.compose",
      ref: { provider: KORRI_GAMESCOPE_PLUGIN_ID, id: "launch-wrapper" },
      autoEnable: false,
      reason: "Steam AppID launches run inside Korri's Gamescope companion.",
    })
  })

  it("contributes installed-app discovery only when Steam is enabled", () => {
    const disabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: undefined,
    })
    const enabled = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_STEAM_PLUGIN_ID,
    })

    expect(
      steamPlugin.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID])
    expect(
      disabled.discoveryProviders.map(provider => provider.id),
    ).not.toContain(KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID)
    expect(enabled.discoveryProviders.map(provider => provider.id)).toContain(
      KORRI_STEAM_INSTALLED_APPS_DISCOVERY_PROVIDER_ID,
    )
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
