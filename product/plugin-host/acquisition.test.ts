import { describe, expect, it } from "bun:test"
import { KORRI_COMMUNITY_CATALOG_PLUGIN_ID } from "@product/plugins/community-catalog"
import { KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID } from "@product/plugins/levelsharesquare"
import { KORRI_MEGA_MAN_MAKER_PLUGIN_ID } from "@product/plugins/mega-man-maker"
import { KORRI_PICO8_PLUGIN_ID } from "@product/plugins/pico8"
import { KORRI_SMBXGAME_PLUGIN_ID } from "@product/plugins/smbxgame"
import { KORRI_SMWCENTRAL_PLUGIN_ID } from "@product/plugins/smwcentral"
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "./acquisition"

const migratedFixtureProviderIds = [
  "@korri:chip8archive",
  "@korri:homebrewhub",
  "@korri:itchio",
  "@korri:portmaster",
  "@korri:puzzlescript",
  "@korri:retrobrews",
  "@korri:tic80gallery",
  "@korri:wasm4gallery",
] as const

describe("first-party acquisition plugin composition", () => {
  it("exposes acquisition product plugins only when enabled", () => {
    const defaultProviderIds =
      createFirstPartyAcquisitionPluginDefinitionsFromEnv({
        KORRI_ENABLED_PLUGINS: undefined,
      }).map(definition => definition.metadata.providerId)

    expect(defaultProviderIds).not.toContain(KORRI_PICO8_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_COMMUNITY_CATALOG_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_SMBXGAME_PLUGIN_ID)
    expect(defaultProviderIds).not.toContain(KORRI_SMWCENTRAL_PLUGIN_ID)
    for (const providerId of migratedFixtureProviderIds) {
      expect(defaultProviderIds).not.toContain(providerId)
    }

    const providerIds = createFirstPartyAcquisitionPluginDefinitionsFromEnv({
      KORRI_ENABLED_PLUGINS: `${KORRI_PICO8_PLUGIN_ID},${KORRI_MEGA_MAN_MAKER_PLUGIN_ID},${KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID},${KORRI_COMMUNITY_CATALOG_PLUGIN_ID},${KORRI_SMBXGAME_PLUGIN_ID},${KORRI_SMWCENTRAL_PLUGIN_ID},${migratedFixtureProviderIds.join(",")}`,
    }).map(definition => definition.metadata.providerId)

    expect(providerIds).toContain(KORRI_PICO8_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_COMMUNITY_CATALOG_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_SMBXGAME_PLUGIN_ID)
    expect(providerIds).toContain(KORRI_SMWCENTRAL_PLUGIN_ID)
    for (const providerId of migratedFixtureProviderIds) {
      expect(providerIds).toContain(providerId)
    }
  })
})
