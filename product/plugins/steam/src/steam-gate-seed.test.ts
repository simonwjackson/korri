import { describe, expect, it } from "bun:test"
import { parseVdf, renderVdf } from "./state-materializer"
import {
  applySteamGateSeeds,
  DECK_CONFIGURATOR_INTERSTITIALS,
  type VdfObject,
} from "./steam-gate-seed"

const steamRoot = (vdf: VdfObject): VdfObject =>
  (
    ((vdf.UserLocalConfigStore as VdfObject).Software as VdfObject)
      .Valve as VdfObject
  ).Steam as VdfObject

describe("applySteamGateSeeds", () => {
  it("globally suppresses suppressible Deck configurator interstitials", () => {
    const localconfig: VdfObject = {}

    applySteamGateSeeds(localconfig, { suppressInterstitials: true })

    const steam = steamRoot(localconfig)
    for (const interstitial of DECK_CONFIGURATOR_INTERSTITIALS) {
      if (interstitial.mode === "every-time") {
        expect(
          steam[
            `Deck_ConfiguratorInterstitialsVersionSeen_${interstitial.base}`
          ],
        ).toBeUndefined()
        expect(
          steam[`Deck_ConfiguratorInterstitialsCheckbox_${interstitial.base}`],
        ).toBeUndefined()
        continue
      }
      expect(
        steam[`Deck_ConfiguratorInterstitialsVersionSeen_${interstitial.base}`],
      ).toBe("99")
      if (interstitial.mode === "once-per-game") {
        expect(
          steam[`Deck_ConfiguratorInterstitialsCheckbox_${interstitial.base}`],
        ).toBe("1")
      } else {
        expect(
          steam[`Deck_ConfiguratorInterstitialsCheckbox_${interstitial.base}`],
        ).toBeUndefined()
      }
    }
  })

  it("accepts EULAs under each managed app block", () => {
    const localconfig: VdfObject = {}

    applySteamGateSeeds(localconfig, {
      acceptEulas: true,
      appIds: ["400", "1029210"],
    })

    const apps = steamRoot(localconfig).apps as VdfObject
    expect(apps["400"]).toMatchObject({
      "400_eula_0": "1",
      "400_eula_1": "1",
      "400_eula_2": "1",
    })
    expect(apps["1029210"]).toMatchObject({
      "1029210_eula_0": "1",
      "1029210_eula_1": "1",
      "1029210_eula_2": "1",
    })
  })

  it("is idempotent and preserves unrelated localconfig state", () => {
    const localconfig = parseVdf(`"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"999"
					{
						"LaunchOptions"		"legacy"
					}
				}
				"Unrelated"		"keep-me"
			}
		}
	}
}
`)

    applySteamGateSeeds(localconfig, {
      suppressInterstitials: true,
      acceptEulas: true,
      appIds: ["400"],
    })
    const once = renderVdf(localconfig)
    applySteamGateSeeds(localconfig, {
      suppressInterstitials: true,
      acceptEulas: true,
      appIds: ["400"],
    })

    expect(renderVdf(localconfig)).toBe(once)
    expect(steamRoot(localconfig)).toMatchObject({
      Unrelated: "keep-me",
      apps: {
        "999": { LaunchOptions: "legacy" },
        "400": {
          "400_eula_0": "1",
          "400_eula_1": "1",
          "400_eula_2": "1",
        },
      },
    })
  })
})
