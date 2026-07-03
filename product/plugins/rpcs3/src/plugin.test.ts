import { describe, expect, it } from "bun:test"

import {
  KORRI_RPCS3_APP_ID,
  KORRI_RPCS3_APP_LOCAL_ID,
  KORRI_RPCS3_GAMES_STORAGE_ID,
  KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID,
  KORRI_RPCS3_PLUGIN_ID,
  KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID,
  KORRI_RPCS3_PS3_SYSTEM_ID,
  KORRI_RPCS3_RUNTIME_ID,
  KORRI_RPCS3_RUNTIME_LOCAL_ID,
  KORRI_RPCS3_STATE_STORAGE_ID,
  KORRI_RPCS3_STATE_STORAGE_LOCAL_ID,
  rpcs3Plugin,
} from ".."

describe("RPCS3 plugin", () => {
  it("declares RPCS3 as a plugin-qualified PS3 app host", () => {
    expect(KORRI_RPCS3_PLUGIN_ID).toBe("@korri:rpcs3")
    expect(rpcs3Plugin.id).toBe(KORRI_RPCS3_PLUGIN_ID)
    expect(
      rpcs3Plugin.contributes.config.providers[KORRI_RPCS3_PLUGIN_ID],
    ).toMatchObject({ title: "RPCS3" })

    expect(
      rpcs3Plugin.contributes.config.launchers?.[KORRI_RPCS3_APP_LOCAL_ID],
    ).toMatchObject({
      id: KORRI_RPCS3_APP_ID,
      plugin: KORRI_RPCS3_PLUGIN_ID,
      command: "/run/current-system/sw/bin/rpcs3",
      args: ["--no-gui", "{content.path}"],
      settings: {
        plugin: {
          state: { root: `{storage:${KORRI_RPCS3_STATE_STORAGE_ID}}` },
          boot: { suppressPopups: true, exitOnFinish: true },
        },
      },
      policy: { allowedCommands: ["/run/current-system/sw/bin/rpcs3"] },
    })
  })

  it("contributes PS3 storage, system, and standalone runtime records", () => {
    expect(KORRI_RPCS3_GAMES_STORAGE_ID).toBe("@korri:rpcs3/ps3-games")
    expect(KORRI_RPCS3_STATE_STORAGE_ID).toBe("@korri:rpcs3/state")
    expect(
      rpcs3Plugin.contributes.config.storage?.[
        KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID
      ],
    ).toMatchObject({
      id: KORRI_RPCS3_GAMES_STORAGE_LOCAL_ID,
      root: "/srv/lakes/towada/gaming/games/sony-playstation-3",
    })
    expect(
      rpcs3Plugin.contributes.config.storage?.[
        KORRI_RPCS3_STATE_STORAGE_LOCAL_ID
      ],
    ).toMatchObject({
      id: KORRI_RPCS3_STATE_STORAGE_LOCAL_ID,
      root: "/var/lib/korri/rpcs3",
    })
    expect(rpcs3Plugin.contributes.config.systems?.ps3).toMatchObject({
      id: KORRI_RPCS3_PS3_SYSTEM_ID,
      title: "Sony PlayStation 3",
    })
    expect(
      rpcs3Plugin.contributes.config.runtimes?.[KORRI_RPCS3_RUNTIME_LOCAL_ID],
    ).toMatchObject({
      id: KORRI_RPCS3_RUNTIME_ID,
      kind: "emulator",
      app: KORRI_RPCS3_APP_ID,
      path: "/run/current-system/sw/bin/rpcs3",
      supports: { systems: [KORRI_RPCS3_PS3_SYSTEM_ID] },
    })
  })

  it("attaches the PS3 disc folder discovery provider", () => {
    expect(
      rpcs3Plugin.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_RPCS3_PS3_DISC_DISCOVERY_PROVIDER_ID])
  })
})
