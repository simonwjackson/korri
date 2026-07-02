import { describe, expect, it } from "bun:test"
import {
  KORRI_ZQUEST_CLASSIC_APP_ID,
  KORRI_ZQUEST_CLASSIC_APP_LOCAL_ID,
  KORRI_ZQUEST_CLASSIC_DISCOVERY_PROVIDER_ID,
  KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
  KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
  zquestClassicPlugin,
} from ".."

describe("ZQuest Classic plugin descriptor", () => {
  it("contributes the zplayer launcher and quest discovery provider", () => {
    expect(zquestClassicPlugin.id).toBe(KORRI_ZQUEST_CLASSIC_PLUGIN_ID)
    expect(
      zquestClassicPlugin.contributes.config.launchers?.[
        KORRI_ZQUEST_CLASSIC_APP_LOCAL_ID
      ],
    ).toMatchObject({
      id: KORRI_ZQUEST_CLASSIC_APP_ID,
      plugin: KORRI_ZQUEST_CLASSIC_PLUGIN_ID,
      command: "zplayer",
      systems: [KORRI_ZQUEST_CLASSIC_SYSTEM_ID],
    })
    expect(
      zquestClassicPlugin.contributes.config.systems?.[
        KORRI_ZQUEST_CLASSIC_SYSTEM_ID
      ],
    ).toMatchObject({
      id: KORRI_ZQUEST_CLASSIC_SYSTEM_ID,
      title: "Zelda Classic Quest",
    })
    expect(
      zquestClassicPlugin.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_ZQUEST_CLASSIC_DISCOVERY_PROVIDER_ID])
  })
})
