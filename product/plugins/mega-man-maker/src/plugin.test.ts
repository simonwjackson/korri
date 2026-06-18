import { describe, expect, it } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  Acquisition,
  makeLiveAcquisitionLayer,
} from "@platform/acquisition/acquisition-service"
import { createStaticAcquisitionPluginRegistry } from "@platform/acquisition/plugin-loader"
import { acquisitionPluginDefinitionsFromPluginRegistry } from "@platform/acquisition/product-plugin-adapter"
import { createPluginRegistry } from "@platform/plugin/registry"
import { Effect } from "effect"
import {
  createMegaManMakerPlugin,
  KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
  megaManMakerPlugin,
  parseMegaManMakerUrl,
} from ".."

const level = {
  id: 594470,
  name: "Sniper Joe 7 - Intro Stage",
  authorId: 573151,
  authorIcon: 160,
  authorName: "faz69",
  created: "2026-06-18T04:34:50.012",
  boss: 78,
  likes: 1,
  dislikes: 0,
  downloads: 1,
  difficulty: 0,
  tags: [],
}

const artifactUrl = "https://cdn.megamanmaker.com/levels/70/4470/594470.mmlv.gz"

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input))
  if (url.hostname === "api.megamanmaker.test") {
    if (url.pathname === "/level/search") {
      return jsonResponse({ page: 0, total: 1, results: 1, items: [level] })
    }
    if (url.pathname === "/level/594470") {
      return jsonResponse(level)
    }
    if (url.pathname === "/level/download/594470") {
      return jsonResponse({ id: 594470, location: artifactUrl, content: null })
    }
  }
  if (url.href === artifactUrl) {
    return Promise.resolve(
      new Response(Buffer.from("mega man maker level bytes"), {
        status: 200,
        headers: { "content-type": "application/gzip" },
      }),
    )
  }
  return jsonResponse({ message: "not found" }, 404)
}

function jsonResponse(payload: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )
}

describe("Mega Man Maker plugin", () => {
  it("declares a stable provider-backed product plugin", () => {
    expect(KORRI_MEGA_MAN_MAKER_PLUGIN_ID).toBe("@korri:mega-man-maker")
    expect(megaManMakerPlugin.id).toBe(KORRI_MEGA_MAN_MAKER_PLUGIN_ID)
    expect(
      megaManMakerPlugin.contributes.config.providers[
        KORRI_MEGA_MAN_MAKER_PLUGIN_ID
      ],
    ).toMatchObject({ title: "Mega Man Maker" })
    expect(
      megaManMakerPlugin.handlers.map(handler => handler.operation),
    ).toEqual([
      "claims.search",
      "claims.details",
      "claims.parse-url",
      "provider.validate",
      "artifact.resolve-download",
      "artifact.acquire",
      "diagnostics.collect",
    ])
  })

  it("parses Mega Man Maker level, API, download, and CDN URLs", () => {
    expect(
      parseMegaManMakerUrl("https://megamanmaker.com/?level=594470"),
    ).toMatchObject({ id: "594470" })
    expect(
      parseMegaManMakerUrl("https://api.megamanmaker.com/level/594470"),
    ).toMatchObject({ id: "594470" })
    expect(
      parseMegaManMakerUrl(
        "https://api.megamanmaker.com/level/download/594470",
      ),
    ).toMatchObject({ id: "594470" })
    expect(parseMegaManMakerUrl(artifactUrl)).toMatchObject({ id: "594470" })
    expect(parseMegaManMakerUrl("https://megamanmaker.com/explore")).toBeNull()
  })

  it("runs search, details, health, download, and acquire through the acquisition safety boundary", async () => {
    const plugin = createMegaManMakerPlugin({
      apiBaseUrl: "https://api.megamanmaker.test",
      fetchImpl: fakeFetch as typeof fetch,
    })
    const productRegistry = createPluginRegistry([plugin], {
      enabledPluginIds: [KORRI_MEGA_MAN_MAKER_PLUGIN_ID],
    })
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const stagingRoot = await mkdtemp(join(tmpdir(), "korri-mmm-acquire-"))
    const layer = makeLiveAcquisitionLayer({
      registry: acquisitionRegistry,
      artifactStagingRoot: stagingRoot,
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "sniper joe" }),
          details: yield* acquisition.detailsByUrl(
            "https://megamanmaker.com/?level=594470",
          ),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_MEGA_MAN_MAKER_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
            candidateUrl: "https://megamanmaker.com/?level=594470",
          }),
          acquired: yield* acquisition.acquireArtifact({
            providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
            id: "594470",
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims).toHaveLength(1)
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      id: "594470",
      title: "Sniper Joe 7 - Intro Stage",
      platform: "mega-man-maker",
      artifact: {
        kind: "content",
        system: "mega-man-maker",
        format: { id: "mega-man-maker-level" },
      },
      playable: {
        id: "594470",
        releases: [{ id: "level", system: "mega-man-maker" }],
      },
    })
    expect(result.details).toMatchObject({
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      id: "594470",
      title: "Sniper Joe 7 - Intro Stage",
      downloadPageUrl: "https://api.megamanmaker.test/level/download/594470",
    })
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      providerId: KORRI_MEGA_MAN_MAKER_PLUGIN_ID,
      url: artifactUrl,
      filename: "594470.mmlv.gz",
      contentType: "application/gzip",
    })
    expect(result.acquired).toMatchObject({
      kind: "content",
      system: "mega-man-maker",
      format: { id: "mega-man-maker-level" },
      file: {
        name: "594470.mmlv.gz",
        extension: "gz",
        mediaType: "application/gzip",
      },
      provenance: {
        source: "Mega Man Maker",
        url: "https://megamanmaker.com/?level=594470",
      },
    })
    expect(result.acquired.id).toMatch(/^sha256:/)
  })
})
