import { describe, expect, it } from "bun:test"
import { runPluginHandler, type KorriPlugin } from "@platform/plugin"
import { Effect } from "effect"
import { createFirstPartyPluginRegistryFromEnv, firstPartyPlugins } from "."
import { createFirstPartyAcquisitionPluginDefinitionsFromEnv } from "./acquisition"
import {
  KORRI_AM2RLAUNCHER_PLUGIN_ID,
  am2rLauncherPlugin,
} from "./am2rlauncher"
import {
  KORRI_DOME_ROMANTIK_PLUGIN_ID,
  domeRomantikPlugin,
} from "./dome-romantik"
import { KORRI_GLOBEBA_PLUGIN_ID, globebaPlugin } from "./globeba"
import { KORRI_ITCHIO_PLUGIN_ID } from "./itchio"
import {
  KORRI_MEGA_MAN_ROCK_N_ROLL_PLUGIN_ID,
  megaManRockNRollPlugin,
} from "./mega-man-rock-n-roll"
import { KORRI_SHIPWRIGHT_PLUGIN_ID, shipwrightPlugin } from "./shipwright"
import { KORRI_SONIC_3_AIR_PLUGIN_ID, sonic3AirPlugin } from "./sonic-3-air"
import {
  KORRI_SONIC_TIME_TWISTED_PLUGIN_ID,
  sonicTimeTwistedPlugin,
} from "./sonic-time-twisted"
import {
  KORRI_SPELUNKY_CLASSIC_HD_PLUGIN_ID,
  spelunkyClassicHdPlugin,
} from "./spelunky-classic-hd"
import { KORRI_SRB2KART_PLUGIN_ID, srb2KartPlugin } from "./srb2kart"
import {
  KORRI_STARGROVE_SCRAMBLE_PLUGIN_ID,
  stargroveScramblePlugin,
} from "./stargrove-scramble"
import { KORRI_TINY_CRATE_PLUGIN_ID, tinyCratePlugin } from "./tiny-crate"
import {
  KORRI_TMNT_RESCUE_PALOOZA_PLUGIN_ID,
  tmntRescuePaloozaPlugin,
} from "./tmnt-rescue-palooza"
import { KORRI_XJLT_PLUGIN_ID, xjltPlugin } from "./xjlt"

const requestedSourcePlugins = [
  {
    id: KORRI_XJLT_PLUGIN_ID,
    plugin: xjltPlugin,
    url: "https://kamekaze.world/xjlt/",
    candidate: "xjlt",
    query: "justice league turbo",
    download: "requires-user-action",
  },
  {
    id: KORRI_TMNT_RESCUE_PALOOZA_PLUGIN_ID,
    plugin: tmntRescuePaloozaPlugin,
    url: "https://gamejolt.com/games/TMNT-Rescue-Palooza/39658",
    candidate: "tmnt-rescue-palooza",
    query: "rescue palooza",
    download: "requires-user-action",
  },
  {
    id: KORRI_AM2RLAUNCHER_PLUGIN_ID,
    plugin: am2rLauncherPlugin,
    url: "https://github.com/AM2R-Community-Developers/AM2RLauncher",
    candidate: "am2rlauncher",
    query: "am2r launcher",
    download: "requires-user-action",
  },
  {
    id: KORRI_SONIC_3_AIR_PLUGIN_ID,
    plugin: sonic3AirPlugin,
    url: "https://github.com/Eukaryot/sonic3air",
    candidate: "sonic-3-air",
    query: "angel island revisited",
    download: "requires-user-action",
  },
  {
    id: KORRI_SHIPWRIGHT_PLUGIN_ID,
    plugin: shipwrightPlugin,
    url: "https://github.com/HarbourMasters/Shipwright",
    candidate: "shipwright",
    query: "ship of harkinian",
    download: "requires-user-action",
  },
  {
    id: KORRI_SPELUNKY_CLASSIC_HD_PLUGIN_ID,
    plugin: spelunkyClassicHdPlugin,
    url: "https://github.com/JanTrueno/SpelunkyClassicHD",
    candidate: "spelunky-classic-hd",
    query: "spelunky classic hd",
    download: "unsupported",
  },
  {
    id: KORRI_SRB2KART_PLUGIN_ID,
    plugin: srb2KartPlugin,
    url: "https://github.com/STJr/Kart-Public",
    candidate: "srb2kart",
    query: "srb2 kart",
    download: "unsupported",
  },
  {
    id: KORRI_STARGROVE_SCRAMBLE_PLUGIN_ID,
    plugin: stargroveScramblePlugin,
    url: "https://team-bugulon.itch.io/stargrove-scramble",
    candidate: "stargrove-scramble",
    query: "stargrove",
    download: "requires-user-action",
    requiresItchio: true,
  },
  {
    id: KORRI_DOME_ROMANTIK_PLUGIN_ID,
    plugin: domeRomantikPlugin,
    url: "https://bippinbits.itch.io/dome-romantik",
    candidate: "dome-romantik",
    query: "dome romantik",
    download: "requires-user-action",
    requiresItchio: true,
  },
  {
    id: KORRI_GLOBEBA_PLUGIN_ID,
    plugin: globebaPlugin,
    url: "https://team-bugulon.itch.io/globeba",
    candidate: "globeba",
    query: "globeba",
    download: "requires-user-action",
    requiresItchio: true,
  },
  {
    id: KORRI_MEGA_MAN_ROCK_N_ROLL_PLUGIN_ID,
    plugin: megaManRockNRollPlugin,
    url: "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip",
    candidate: "mega-man-rock-n-roll",
    query: "mega man rock n roll",
    download: "final",
  },
  {
    id: KORRI_TINY_CRATE_PLUGIN_ID,
    plugin: tinyCratePlugin,
    url: "https://github.com/HarmonyHoney/tiny_crate",
    candidate: "tiny-crate",
    query: "tiny crate",
    download: "unsupported",
  },
  {
    id: KORRI_SONIC_TIME_TWISTED_PLUGIN_ID,
    plugin: sonicTimeTwistedPlugin,
    url: "https://github.com/overbound/SonicTimeTwisted",
    candidate: "sonic-time-twisted",
    query: "sonic time twisted",
    download: "unsupported",
  },
] as const satisfies readonly {
  readonly id: string
  readonly plugin: KorriPlugin
  readonly url: string
  readonly candidate: string
  readonly query: string
  readonly download: "final" | "requires-user-action" | "unsupported"
  readonly requiresItchio?: boolean
}[]

describe("requested community sources as first-party plugins", () => {
  it("registers every requested source as its own first-party Korri plugin", () => {
    expect(requestedSourcePlugins).toHaveLength(13)
    for (const source of requestedSourcePlugins) {
      expect(firstPartyPlugins.map(plugin => plugin.id)).toContain(source.id)
      expect(source.plugin.id).toBe(source.id)
      expect(source.plugin.handlers.map(handler => handler.operation)).toEqual([
        "claims.search",
        "claims.details",
        "claims.parse-url",
        "provider.validate",
        "artifact.resolve-download",
        "diagnostics.collect",
      ])
    }
  })

  it("parses the requested upstream URL at each plugin boundary", async () => {
    for (const source of requestedSourcePlugins) {
      const parse = handler(source.plugin, "claims.parse-url")
      await expect(
        Effect.runPromise(
          runPluginHandler(parse, {
            operation: "claims.parse-url",
            provider: source.id,
            input: { url: source.url },
          }),
        ),
      ).resolves.toBe(source.candidate)
    }
  })

  it("exposes search/details/playable hints from each plugin", async () => {
    for (const source of requestedSourcePlugins) {
      const search = handler(source.plugin, "claims.search")
      const details = handler(source.plugin, "claims.details")
      const claims = await Effect.runPromise(
        runPluginHandler(search, {
          operation: "claims.search",
          provider: source.id,
          input: { query: source.query },
        }),
      )
      expect(claims).toEqual([
        expect.objectContaining({
          _tag: "ProviderClaim",
          providerId: source.id,
          id: source.candidate,
          url: source.url,
        }),
      ])

      await expect(
        Effect.runPromise(
          runPluginHandler(details, {
            operation: "claims.details",
            provider: source.id,
            input: { id: source.candidate },
          }),
        ),
      ).resolves.toMatchObject({
        _tag: "ProviderClaimDetails",
        providerId: source.id,
        id: source.candidate,
        playable: { id: source.candidate },
      })
    }
  })

  it("keeps download resolution safe per plugin", async () => {
    for (const source of requestedSourcePlugins) {
      const resolve = handler(source.plugin, "artifact.resolve-download")
      const result = await Effect.runPromise(
        runPluginHandler(resolve, {
          operation: "artifact.resolve-download",
          provider: source.id,
          input: { candidateUrl: source.url },
        }),
      )
      if (source.download === "final") {
        expect(result).toMatchObject({
          _tag: "FinalDownload",
          providerId: source.id,
          url: source.url,
          filename: "megaman_rocknroll_linux_1.3.zip",
          contentType: "application/zip",
        })
      } else {
        expect(result).toMatchObject({
          _tag: "NonFinalDownload",
          providerId: source.id,
          reason: source.download,
          url: source.url,
        })
      }
    }
  })

  it("exposes every plugin through first-party acquisition composition", () => {
    const enabled = requestedSourcePlugins.map(source => source.id).join(",")
    const providerIds = createFirstPartyAcquisitionPluginDefinitionsFromEnv({
      KORRI_ENABLED_PLUGINS: enabled,
    }).map(definition => definition.metadata.providerId)

    for (const source of requestedSourcePlugins) {
      expect(providerIds).toContain(source.id)
    }
    expect(providerIds).toContain(KORRI_ITCHIO_PLUGIN_ID)
  })

  it("auto-enables the shared itch.io provider for itch-backed game plugins", () => {
    const registry = createFirstPartyPluginRegistryFromEnv({
      KORRI_ENABLED_PLUGINS: [
        KORRI_STARGROVE_SCRAMBLE_PLUGIN_ID,
        KORRI_DOME_ROMANTIK_PLUGIN_ID,
        KORRI_GLOBEBA_PLUGIN_ID,
      ].join(","),
    })

    expect(registry.enabledPluginIds.has(KORRI_ITCHIO_PLUGIN_ID)).toBe(true)
    for (const source of requestedSourcePlugins.filter(
      source => "requiresItchio" in source && source.requiresItchio,
    )) {
      expect(registry.enabledPluginIds.has(source.id)).toBe(true)
    }
  })
})

function handler(plugin: KorriPlugin, operation: string) {
  const candidate = plugin.handlers.find(
    handler => handler.operation === operation,
  )
  if (!candidate)
    throw new Error(`missing ${operation} handler for ${plugin.id}`)
  return candidate
}
