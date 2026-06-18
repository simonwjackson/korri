import { describe, expect, it } from "bun:test"
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "./acquisition"
import { KORRI_PICO8_BBS_PLUGIN_ID } from "./pico8-bbs"

describe("first-party acquisition plugin composition", () => {
  it("exposes PICO-8 BBS only through enabled product plugin composition", () => {
    expect(
      createFirstPartyAcquisitionPluginDefinitionsFromEnv({
        KORRI_ENABLED_PLUGINS: undefined,
      }).map(definition => definition.metadata.providerId),
    ).not.toContain(KORRI_PICO8_BBS_PLUGIN_ID)

    const providerIds = createFirstPartyAcquisitionPluginDefinitionsFromEnv({
      KORRI_ENABLED_PLUGINS: KORRI_PICO8_BBS_PLUGIN_ID,
    }).map(definition => definition.metadata.providerId)

    expect(providerIds).toContain(KORRI_PICO8_BBS_PLUGIN_ID)
  })
})
