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
  createSmwCentralPlugin,
  KORRI_SMWCENTRAL_PLUGIN_ID,
  parseSmwCentralUrl,
  smwCentralPlugin,
} from ".."

const API_URL = "https://smwc.fixture.test/ajax.php"
const WEB_URL = "https://smwc.fixture.test"
const DOWNLOAD_HOST = "dl.fixture.test"
const FILE_ID = "42504"
const DETAILS_URL = `${WEB_URL}/?p=section&a=details&id=${FILE_ID}`
const DOWNLOAD_URL = `https://${DOWNLOAD_HOST}/${FILE_ID}/Tower%20of%20Glory%202%20%281%29.zip`
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00])

const smwHackFile = {
  id: 42504,
  section: "smwhacks",
  name: "Tower Of Glory 2",
  submitted_at: 1780854399,
  moderated_at: 1781760993,
  authors: [{ id: 52996, name: "ShoopDaWhoop" }],
  tags: ["kaizo", "vanilla"],
  images: ["https://dl.smwcentral.net/image/124366.png"],
  rating: 5,
  size: 1025181,
  downloads: 96,
  download_url: DOWNLOAD_URL,
  obsoleted_by: null,
  fields: {
    version: "1.1",
    difficulty: "Advanced",
    type: "Kaizo",
    length: "0 exit(s)",
    description: "Welcome to my second Kaizo Mario Rom Hack.",
  },
  raw_fields: {
    version: "1.1",
    difficulty: "diff_4",
    type: ["kaizo"],
    length: 0,
    demo: false,
    sa1: false,
    description: "Welcome to my second Kaizo Mario Rom Hack.",
  },
}

const sm64HackFile = {
  id: 29003,
  section: "sm64hacks",
  name: "SM64: The Search For The 120 Stars Ver 2.0",
  authors: [{ id: 1234, name: "SM64Author" }],
  tags: [],
  images: [],
  rating: 4,
  size: 2048,
  downloads: 12,
  download_url: `https://${DOWNLOAD_HOST}/29003/SM64%20The%20Search%20For%20The%20120%20Stars%20Ver%202.0.zip`,
  fields: {
    difficulty: "Intermediate",
    length: "150 star(s)",
    description: "A Super Mario 64 hack fixture.",
  },
  raw_fields: {
    difficulty: "diff_3",
    length: 150,
    demo: false,
    description: "A Super Mario 64 hack fixture.",
  },
}

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input))
  if (url.hostname === "smwc.fixture.test" && url.pathname === "/ajax.php") {
    if (url.searchParams.get("a") === "getsectionlist") {
      const section = url.searchParams.get("s")
      const query = url.searchParams.get("f[name]")?.toLowerCase() ?? ""
      if (section === "smwhacks") {
        return jsonResponse({
          data: query.includes("tower") ? [smwHackFile] : [],
        })
      }
      if (section === "sm64hacks") {
        return jsonResponse({
          data: query.includes("120 stars") ? [sm64HackFile] : [],
        })
      }
      return jsonResponse({ data: [] })
    }
    if (
      url.searchParams.get("a") === "getfile" &&
      url.searchParams.get("id") === FILE_ID
    ) {
      return jsonResponse(smwHackFile)
    }
    return jsonResponse(null, 404)
  }
  if (url.hostname === DOWNLOAD_HOST) {
    return Promise.resolve(
      new Response(ZIP_BYTES, {
        status: 200,
        headers: { "content-type": "application/zip" },
      }),
    )
  }
  return jsonResponse(null, 404)
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  )
}

describe("SMW Central plugin", () => {
  it("declares a stable provider-backed product plugin", () => {
    expect(KORRI_SMWCENTRAL_PLUGIN_ID).toBe("@korri:smwcentral")
    expect(smwCentralPlugin.id).toBe(KORRI_SMWCENTRAL_PLUGIN_ID)
    expect(
      smwCentralPlugin.contributes.config.providers[KORRI_SMWCENTRAL_PLUGIN_ID],
    ).toMatchObject({ title: "SMW Central Hacks" })
    expect(smwCentralPlugin.handlers.map(handler => handler.operation)).toEqual(
      [
        "claims.search",
        "claims.details",
        "claims.parse-url",
        "provider.validate",
        "artifact.resolve-download",
        "artifact.acquire",
        "diagnostics.collect",
      ],
    )
  })

  it("parses details and download URLs for the configured hosts", () => {
    expect(
      parseSmwCentralUrl(DETAILS_URL, {
        webBaseUrl: WEB_URL,
        downloadHost: DOWNLOAD_HOST,
      }),
    ).toEqual({ id: FILE_ID, kind: "details" })
    expect(
      parseSmwCentralUrl(DOWNLOAD_URL, {
        webBaseUrl: WEB_URL,
        downloadHost: DOWNLOAD_HOST,
      }),
    ).toEqual({ id: FILE_ID, kind: "download" })
    expect(parseSmwCentralUrl("not a url")).toBeNull()
  })

  it("runs search, details, health, download resolution, and acquire through acquisition", async () => {
    const plugin = createSmwCentralPlugin({
      apiBaseUrl: API_URL,
      webBaseUrl: WEB_URL,
      downloadHost: DOWNLOAD_HOST,
      fetchImpl: fakeFetch as typeof fetch,
    })
    const productRegistry = createPluginRegistry([plugin], {
      enabledPluginIds: [KORRI_SMWCENTRAL_PLUGIN_ID],
    })
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const layer = makeLiveAcquisitionLayer({ registry: acquisitionRegistry })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "Tower" }),
          sm64Search: yield* acquisition.search({
            query: "120 Stars",
            platforms: ["super-mario-64"],
          }),
          details: yield* acquisition.detailsByUrl(DETAILS_URL),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_SMWCENTRAL_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
            candidateUrl: DETAILS_URL,
          }),
          acquired: yield* acquisition.acquireArtifact({
            providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
            id: FILE_ID,
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims).toHaveLength(1)
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
      id: FILE_ID,
      title: "Tower Of Glory 2",
      platform: "super-mario-world",
      artifact: {
        kind: "patch",
        system: "super-mario-world",
        format: { id: "smwcentral-smw-hack-archive" },
      },
    })
    expect(result.sm64Search.claims).toHaveLength(1)
    expect(result.sm64Search.claims[0]).toMatchObject({
      id: "29003",
      platform: "super-mario-64",
      artifact: {
        kind: "patch",
        system: "super-mario-64",
        format: { id: "smwcentral-sm64-hack-archive" },
      },
    })
    expect(result.details).toMatchObject({
      providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
      id: FILE_ID,
      title: "Tower Of Glory 2",
      downloadPageUrl: DOWNLOAD_URL,
      facets: {
        credits: { authors: [{ name: "ShoopDaWhoop" }] },
        communityStats: { rating: 5, downloads: 96 },
      },
    })
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "FinalDownload",
      providerId: KORRI_SMWCENTRAL_PLUGIN_ID,
      url: DOWNLOAD_URL,
      filename: "Tower of Glory 2 (1).zip",
      contentType: "application/zip",
    })
    expect(result.acquired).toMatchObject({
      kind: "patch",
      system: "super-mario-world",
      format: { id: "smwcentral-smw-hack-archive" },
      file: {
        name: "Tower of Glory 2 (1).zip",
        extension: "zip",
        mediaType: "application/zip",
        sizeBytes: ZIP_BYTES.length,
      },
      facets: { title: { text: "Tower Of Glory 2" } },
    })
  })
})
