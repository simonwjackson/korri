import { describe, expect, it } from "bun:test"
import { runPluginHandler } from "@platform/plugin"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import {
  COMMUNITY_CATALOG_ENTRIES,
  KORRI_COMMUNITY_CATALOG_PLUGIN_ID,
  communityCatalogPlugin,
} from "./plugin"

const provider = KORRI_COMMUNITY_CATALOG_PLUGIN_ID

function handler(operation: string) {
  const candidate = communityCatalogPlugin.handlers.find(
    handler => handler.operation === operation,
  )
  if (!candidate) throw new Error(`missing ${operation} handler`)
  return candidate
}

describe("community catalog plugin", () => {
  it("covers every requested goal source", () => {
    expect(COMMUNITY_CATALOG_ENTRIES.map(entry => entry.id)).toEqual([
      "xjlt",
      "tmnt-rescue-palooza",
      "am2rlauncher",
      "sonic-3-air",
      "shipwright",
      "spelunky-classic-hd",
      "srb2kart",
      "stargrove-scramble",
      "dome-romantik",
      "globeba",
      "mega-man-rock-n-roll",
      "tiny-crate",
      "sonic-time-twisted",
    ])
  })

  it("is available as an acquisition provider only when enabled", () => {
    const disabled = createPluginRegistry([communityCatalogPlugin], {
      enabledPluginIds: [],
    })
    expect(disabled.enabledPluginIds.has(provider)).toBe(false)
    expect(disabled.providers[provider]).toBeUndefined()

    const enabled = createPluginRegistry([communityCatalogPlugin], {
      enabledPluginIds: [provider],
    })
    expect(enabled.providers[provider]).toMatchObject({
      legalRisk: "medium",
      credentialRequired: false,
      enabledByDefault: true,
    })
    expect(enabled.handlers.map(handler => handler.operation)).toEqual([
      "claims.search",
      "claims.details",
      "claims.parse-url",
      "provider.validate",
      "artifact.resolve-download",
      "diagnostics.collect",
    ])
  })

  it("parses each goal URL to the curated candidate id", async () => {
    const parse = handler("claims.parse-url")
    const urls = [
      ["https://kamekaze.world/xjlt/", "xjlt"],
      [
        "https://gamejolt.com/games/TMNT-Rescue-Palooza/39658",
        "tmnt-rescue-palooza",
      ],
      [
        "https://github.com/AM2R-Community-Developers/AM2RLauncher",
        "am2rlauncher",
      ],
      ["https://github.com/Eukaryot/sonic3air", "sonic-3-air"],
      ["https://github.com/HarbourMasters/Shipwright", "shipwright"],
      ["https://github.com/JanTrueno/SpelunkyClassicHD", "spelunky-classic-hd"],
      ["https://github.com/STJr/Kart-Public", "srb2kart"],
      ["https://team-bugulon.itch.io/stargrove-scramble", "stargrove-scramble"],
      ["https://bippinbits.itch.io/dome-romantik", "dome-romantik"],
      ["https://team-bugulon.itch.io/globeba", "globeba"],
      [
        "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip",
        "mega-man-rock-n-roll",
      ],
      ["https://github.com/HarmonyHoney/tiny_crate", "tiny-crate"],
      ["https://github.com/overbound/SonicTimeTwisted", "sonic-time-twisted"],
    ] as const

    for (const [url, id] of urls) {
      await expect(
        Effect.runPromise(
          runPluginHandler(parse, {
            operation: "claims.parse-url",
            provider,
            input: { url },
          }),
        ),
      ).resolves.toBe(id)
    }
  })

  it("searches and returns playable acquisition hints", async () => {
    const search = handler("claims.search")
    const claims = await Effect.runPromise(
      runPluginHandler(search, {
        operation: "claims.search",
        provider,
        input: { query: "sonic" },
      }),
    )

    expect(claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "sonic-3-air" }),
        expect.objectContaining({ id: "sonic-time-twisted" }),
        expect.objectContaining({ id: "srb2kart" }),
      ]),
    )
  })

  it("resolves only stable direct public artifacts as final downloads", async () => {
    const resolve = handler("artifact.resolve-download")
    await expect(
      Effect.runPromise(
        runPluginHandler(resolve, {
          operation: "artifact.resolve-download",
          provider,
          input: {
            candidateUrl:
              "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip",
          },
        }),
      ),
    ).resolves.toMatchObject({
      _tag: "FinalDownload",
      url: "https://dennisengelhard.com/wp-content/uploads/2021/01/megaman_rocknroll_linux_1.3.zip",
      filename: "megaman_rocknroll_linux_1.3.zip",
      contentType: "application/zip",
    })

    await expect(
      Effect.runPromise(
        runPluginHandler(resolve, {
          operation: "artifact.resolve-download",
          provider,
          input: {
            candidateUrl: "https://github.com/HarbourMasters/Shipwright",
          },
        }),
      ),
    ).resolves.toMatchObject({
      _tag: "NonFinalDownload",
      reason: "requires-user-action",
    })
  })
})
