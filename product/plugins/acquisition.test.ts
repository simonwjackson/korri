import { describe, expect, it } from "bun:test"
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "./acquisition"
import { KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID } from "./levelsharesquare"
import { KORRI_MEGA_MAN_MAKER_PLUGIN_ID } from "./mega-man-maker"
import { KORRI_PICO8_PLUGIN_ID } from "./pico8"
import { KORRI_SMBXGAME_PLUGIN_ID } from "./smbxgame"

describe("first-party acquisition plugin composition", () => {
  it("exposes acquisition product plugins only when enabled", () => {
    const defaultProviderIds =
      createFirstPartyAcquisitionPluginDefinitionsFromEnv({
        KORRI_ENABLED_PLUGINS: undefined,
      }).map(definition => definition.metadata.providerId)

    expect(defaultProviderIds).not.toContain(KORRI_PICO8_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_SMBXGAME_PLUGIN_ID)

    const providerIds = createFirstPartyAcquisitionPluginDefinitionsFromEnv({
      KORRI_ENABLED_PLUGINS: `${KORRI_PICO8_PLUGIN_ID},${KORRI_MEGA_MAN_MAKER_PLUGIN_ID},${KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID},${KORRI_SMBXGAME_PLUGIN_ID}`,
    }).map(definition => definition.metadata.providerId)

    expect(providerIds).toContain(KORRI_PICO8_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_SMBXGAME_PLUGIN_ID)
  })
})
