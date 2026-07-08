import { describe, expect, it } from "bun:test"

import {
  KORRI_MELONDS_APP_ID,
  KORRI_MELONDS_APP_LOCAL_ID,
  KORRI_MELONDS_DEFAULT_COMMAND,
  KORRI_MELONDS_DEFAULT_STATE_ROOT,
  KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID,
  KORRI_MELONDS_NDS_SYSTEM_ID,
  KORRI_MELONDS_NIX_PACKAGE,
  KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID,
  KORRI_MELONDS_PLUGIN_ID,
  KORRI_MELONDS_STATE_STORAGE_ID,
  KORRI_MELONDS_STATE_STORAGE_LOCAL_ID,
  melonDsPlugin,
} from ".."

describe("melonDS plugin", () => {
  it("declares melonDS as a plugin-qualified Nintendo DS launcher", () => {
    expect(KORRI_MELONDS_PLUGIN_ID).toBe("@korri:melonds")
    expect(melonDsPlugin.id).toBe(KORRI_MELONDS_PLUGIN_ID)
    expect(
      melonDsPlugin.contributes.config.providers[KORRI_MELONDS_PLUGIN_ID],
    ).toMatchObject({ title: "melonDS" })

    expect(
      melonDsPlugin.contributes.config.launchers?.[KORRI_MELONDS_APP_LOCAL_ID],
    ).toMatchObject({
      id: KORRI_MELONDS_APP_ID,
      plugin: KORRI_MELONDS_PLUGIN_ID,
      command: KORRI_MELONDS_DEFAULT_COMMAND,
      args: ["{content.path}"],
      systems: [KORRI_MELONDS_NDS_SYSTEM_ID],
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_MELONDS_STATE_STORAGE_ID}}` },
          boot: { direct: true },
          display: { mode: "vertical" },
        },
      },
      policy: { allowedCommands: [KORRI_MELONDS_DEFAULT_COMMAND] },
    })
    expect(KORRI_MELONDS_DEFAULT_COMMAND.startsWith("/")).toBe(true)
  })

  it("contributes Nintendo DS storage, system, and package module records", () => {
    expect(KORRI_MELONDS_STATE_STORAGE_ID).toBe("@korri:melonds/state")
    expect(
      melonDsPlugin.contributes.config.storage?.[
        KORRI_MELONDS_STATE_STORAGE_LOCAL_ID
      ],
    ).toMatchObject({
      id: KORRI_MELONDS_STATE_STORAGE_LOCAL_ID,
      root: KORRI_MELONDS_DEFAULT_STATE_ROOT,
    })
    expect(KORRI_MELONDS_DEFAULT_STATE_ROOT).toEndWith("/melonDS")

    expect(melonDsPlugin.contributes.config.systems?.nds).toMatchObject({
      id: KORRI_MELONDS_NDS_SYSTEM_ID,
      title: "Nintendo DS",
    })

    expect(
      melonDsPlugin.contributes.config.modules?.[
        KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID
      ],
    ).toMatchObject({
      id: KORRI_MELONDS_PACKAGE_MODULE_LOCAL_ID,
      kind: "nix-package",
      package: KORRI_MELONDS_NIX_PACKAGE,
      capabilities: ["package.expose", "launch.runtime"],
      binaries: ["melonDS"],
    })
  })

  it("attaches the Nintendo DS file discovery provider", () => {
    expect(
      melonDsPlugin.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_MELONDS_NDS_DISCOVERY_PROVIDER_ID])
  })
})
