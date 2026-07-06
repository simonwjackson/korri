import { describe, expect, it } from "bun:test"
import {
  Acquisition,
  makeLiveAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import {
  KORRI_RETROARCH_APP_ID,
  KORRI_RETROARCH_PLUGIN_ID,
} from "../../retroarch"
import {
  createPico8Plugin,
  KORRI_PICO8_CART_DISCOVERY_PROVIDER_ID,
  KORRI_PICO8_FAKE08_RUNTIME_ID,
  KORRI_PICO8_PLUGIN_ID,
  KORRI_PICO8_SYSTEM_ID,
  pico8Plugin,
} from ".."

const searchHtml = [
  "<script id=cart_data_script>",
  "  pdat=[",
  '    [\'11722\', 2145, `Celeste`,"/bbs/thumbs/pico15133.png",256,170.66666666667,"2015-07-21 06:06:51",10070,"noel","2026-05-22 20:40:08",0,"",1981,340,0,7,2,\'0\',[],2,4368,7,`Celeste 1.0 (Fixed for P8 v0.1.2)`,``],',
  '    [\'86783\', 41282, `celeste classic 2`,"/bbs/thumbs/pico8_celeste_classic_2-5.png",256,170.66666666667,"2021-01-26 00:31:11",10070,"noel","2026-05-31 03:56:30",0,"",758,131,0,7,2,\'0\',[],2,4373,7,`Celeste Classic 2`,``],',
  "  ];",
  "</script>",
].join("\n")

const detailsHtml = `
<meta property="og:title" content="Celeste"/>
<div style="font-size:16pt; color:#fff; margin-bottom:8px">Celeste 1.0 (Fixed for P8 v0.1.2)</div>
<div style="padding-bottom:12px"><a target="_parent" style="color:#fab" href="/bbs/cposts/1/15133.p8.png">Cart File</a> | <a target="_parent" style="color:#fab" href="https://www.lexaloffle.com/bbs/?pid=15133#p">Forum Post</a> | </div>
<a target="_parent" href=https://www.lexaloffle.com/bbs/?uid=10070><b>noel</b></a>
`

describe("PICO-8 plugin", () => {
  it("declares a stable provider-backed product plugin", () => {
    expect(KORRI_PICO8_PLUGIN_ID).toBe("@korri:pico8")
    expect(pico8Plugin.id).toBe(KORRI_PICO8_PLUGIN_ID)
    expect(
      pico8Plugin.contributes.config.providers["@korri:pico8"],
    ).toMatchObject({
      title: "PICO-8",
    })
    expect(
      pico8Plugin.contributes.config.modules?.["libretro-fake-08-package"],
    ).toMatchObject({
      kind: "nix-package",
      package: "libretro-fake-08",
      path: "product/plugins/pico8/packages/libretro-fake-08",
      capabilities: ["package.expose", "launch.runtime", "pico8"],
    })
    expect(pico8Plugin.contributes.config.runtimes?.fake08).toMatchObject({
      id: KORRI_PICO8_FAKE08_RUNTIME_ID,
      kind: "libretro-core",
      app: KORRI_RETROARCH_APP_ID,
      path: "/etc/korri/cores/fake08_libretro.so",
      supports: { systems: [KORRI_PICO8_SYSTEM_ID] },
    })
    expect(pico8Plugin.contributes.config.systems?.pico8).toMatchObject({
      id: KORRI_PICO8_SYSTEM_ID,
      title: "PICO-8",
    })
    expect(
      pico8Plugin.contributes.discovery?.map(provider => provider.id),
    ).toEqual([KORRI_PICO8_CART_DISCOVERY_PROVIDER_ID])
    expect(pico8Plugin.requires).toContainEqual(
      expect.objectContaining({
        ref: { provider: KORRI_RETROARCH_PLUGIN_ID, id: "retroarch" },
      }),
    )
    expect(pico8Plugin.handlers.map(handler => handler.operation)).toEqual([
      "claims.search",
      "claims.details",
      "claims.parse-url",
      "provider.validate",
      "artifact.resolve-download",
      "diagnostics.collect",
    ])
  })

  it("queries the PICO-8 BBS instead of searching hard-coded catalog rows", async () => {
    const requestedUrls: string[] = []
    const httpText = async (input: string | URL) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url.includes("search=celeste")) return searchHtml
      if (url.includes("search=pico8")) return searchHtml
      if (url.includes("pid=11722")) return detailsHtml
      throw new Error(`unexpected PICO-8 BBS URL: ${url}`)
    }
    const productRegistry = createPluginRegistry(
      [
        createPico8Plugin({
          bbsBaseUrl: "https://www.lexaloffle.com",
        }),
      ],
      { enabledPluginIds: [KORRI_PICO8_PLUGIN_ID] },
    )
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const layer = makeLiveAcquisitionLayer({
      registry: acquisitionRegistry,
      services: { http: { text: httpText } },
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "celeste" }),
          details: yield* acquisition.details({
            providerId: KORRI_PICO8_PLUGIN_ID,
            id: "11722",
          }),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_PICO8_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_PICO8_PLUGIN_ID,
            candidateUrl: "https://www.lexaloffle.com/bbs/?pid=11722#p",
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(requestedUrls).toContain(
      "https://www.lexaloffle.com/bbs/?cat=7&sub=2&mode=carts&orderby=ts&search=celeste&max=50",
    )
    expect(result.search.claims).toHaveLength(2)
    expect(result.search.claims.map(claim => claim.title)).toEqual([
      "Celeste 1.0 (Fixed for P8 v0.1.2)",
      "Celeste Classic 2",
    ])
    expect(result.search.claims.map(claim => claim.title)).not.toContain(
      "No Cart Thread",
    )
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_PICO8_PLUGIN_ID,
      id: "11722",
      platform: "pico8",
      thumbnailUrl: "https://www.lexaloffle.com/bbs/thumbs/pico15133.png",
      playable: {
        id: "11722",
        releases: [{ id: "pico8", system: "pico8" }],
      },
    })
    expect(result.details).toMatchObject({
      id: "11722",
      title: "Celeste 1.0 (Fixed for P8 v0.1.2)",
      downloadPageUrl: "https://www.lexaloffle.com/bbs/cposts/1/15133.p8.png",
    })
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      providerId: KORRI_PICO8_PLUGIN_ID,
      url: "https://www.lexaloffle.com/bbs/cposts/1/15133.p8.png",
      filename: "15133.p8.png",
      contentType: "image/png",
    })
  })
})
