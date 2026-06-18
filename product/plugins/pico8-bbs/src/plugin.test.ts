import { describe, expect, it } from "bun:test"
import {
  Acquisition,
  makeLiveAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import { KORRI_PICO8_BBS_PLUGIN_ID, pico8BbsPlugin } from ".."

describe("PICO-8 BBS plugin", () => {
  it("declares a stable provider-backed product plugin", () => {
    expect(KORRI_PICO8_BBS_PLUGIN_ID).toBe("@korri:pico8bbs")
    expect(pico8BbsPlugin.id).toBe(KORRI_PICO8_BBS_PLUGIN_ID)
    expect(
      pico8BbsPlugin.contributes.config.providers["@korri:pico8bbs"],
    ).toMatchObject({
      title: "PICO-8 BBS",
    })
    expect(
      pico8BbsPlugin.contributes.config.modules?.["libretro-fake-08-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "libretro-fake-08",
      path: "product/plugins/pico8-bbs/packages/libretro-fake-08",
      capabilities: ["package.expose", "launch.runtime", "pico8"],
    })
    expect(pico8BbsPlugin.contributes.config.modules?.fake08).toMatchObject({
      kind: "libretro-core",
      path: "/etc/korri/cores/fake08_libretro.so",
      package: "libretro-fake-08",
    })
    expect(pico8BbsPlugin.contributes.config.systems?.pico8).toMatchObject({
      title: "PICO-8",
      launch: { app: "retroarch", module: "fake08" },
    })
    expect(pico8BbsPlugin.handlers.map(handler => handler.operation)).toEqual([
      "claims.search",
      "claims.details",
      "claims.parse-url",
      "provider.validate",
      "artifact.resolve-download",
      "diagnostics.collect",
    ])
  })

  it("runs PICO-8 search, details, health, and download through the acquisition safety boundary", async () => {
    const productRegistry = createPluginRegistry([pico8BbsPlugin], {
      enabledPluginIds: [KORRI_PICO8_BBS_PLUGIN_ID],
    })
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const layer = makeLiveAcquisitionLayer({ registry: acquisitionRegistry })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "celeste" }),
          details: yield* acquisition.details({
            providerId: KORRI_PICO8_BBS_PLUGIN_ID,
            id: "101",
          }),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_PICO8_BBS_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_PICO8_BBS_PLUGIN_ID,
            candidateUrl: "https://www.lexaloffle.com/bbs/?tid=101",
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims).toHaveLength(1)
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_PICO8_BBS_PLUGIN_ID,
      id: "101",
      title: "Celeste Classic",
      platform: "pico8",
      playable: {
        id: "101",
        releases: [{ id: "pico8", system: "pico8" }],
      },
    })
    expect(result.details.description).toContain("PICO-8 BBS")
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      providerId: KORRI_PICO8_BBS_PLUGIN_ID,
      url: "https://www.lexaloffle.com/bbs/cposts/1/celeste-classic.p8.png",
      filename: "celeste-classic.p8.png",
      contentType: "image/png",
    })
  })
})
