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
  createSmbxGamePlugin,
  KORRI_SMBXGAME_PLUGIN_ID,
  parseSmbxGameTopicUrl,
  smbxGamePlugin,
} from ".."

const BASE_URL = "https://smbx.fixture.test/forums"
const TOPIC_ID = "30650"
const TOPIC_URL = `${BASE_URL}/viewtopic.php?t=${TOPIC_ID}`
const DOWNLOAD_URL =
  "https://drive.google.com/drive/folders/1S52NcPkSlylMYhN5xc5NfdQsGEF-8RKH?usp=drive_link"

const forumHtml = `<!doctype html>
<ul class="topiclist topics">
  <li class="row bg2">
    <a href="./viewtopic.php?t=30650&amp;sid=abc" class="topictitle">[SMBX2] Wario &amp; the Tower of Garlic (V1.0.6)</a>
  </li>
  <li class="row bg1">
    <a href="./viewtopic.php?t=28780&amp;sid=abc" class="topictitle">Super Mario: Spiral [+v2.0 Update]</a>
  </li>
</ul>`

const topicHtml = `<!doctype html>
<h2 class="topic-title"><a href="./viewtopic.php?t=30650&amp;sid=abc">[SMBX2] Wario &amp; the Tower of Garlic (V1.0.6)</a></h2>
<div id="p409556" class="post has-profile bg2">
  <p class="author"><a href="#p409556"><span>Post</span></a><span>by <strong><a href="./memberlist.php?u=165" class="username">Darkonius Mavakar</a></strong> &raquo; </span>Wed Feb 25, 2026 7:48 am</p>
  <div class="content">
    This is a short episode featuring Wario.<br>
    <span>DOWNLOAD:</span><br>
    <a href="${DOWNLOAD_URL}" class="postlink">DOWNLOAD</a>
  </div>
</div>`

function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = new URL(String(input))
  if (url.hostname !== "smbx.fixture.test") {
    return textResponse("not found", 404)
  }
  if (url.pathname.endsWith("/viewforum.php")) return textResponse(forumHtml)
  if (url.pathname.endsWith("/viewtopic.php")) return textResponse(topicHtml)
  return textResponse("not found", 404)
}

function textResponse(body: string, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(body, {
      status,
      headers: { "content-type": "text/html" },
    }),
  )
}

describe("SMBXGame forum plugin", () => {
  it("declares a stable provider-backed product plugin", () => {
    expect(KORRI_SMBXGAME_PLUGIN_ID).toBe("@korri:smbxgame")
    expect(smbxGamePlugin.id).toBe(KORRI_SMBXGAME_PLUGIN_ID)
    expect(
      smbxGamePlugin.contributes.config.providers[KORRI_SMBXGAME_PLUGIN_ID],
    ).toMatchObject({ title: "SMBX Episodes Forum" })
    expect(smbxGamePlugin.handlers.map(handler => handler.operation)).toEqual([
      "claims.search",
      "claims.details",
      "claims.parse-url",
      "provider.validate",
      "artifact.resolve-download",
      "diagnostics.collect",
    ])
  })

  it("parses only SMBXGame topic URLs for the configured forum host", () => {
    expect(
      parseSmbxGameTopicUrl(`${BASE_URL}/viewtopic.php?t=${TOPIC_ID}`, {
        forumBaseUrl: BASE_URL,
      }),
    ).toBe(TOPIC_ID)
    expect(
      parseSmbxGameTopicUrl(`${BASE_URL}/viewforum.php?f=36`, {
        forumBaseUrl: BASE_URL,
      }),
    ).toBeNull()
    expect(parseSmbxGameTopicUrl("not a url")).toBeNull()
  })

  it("runs search, details, health, and download handoff through acquisition", async () => {
    const plugin = createSmbxGamePlugin({
      forumBaseUrl: BASE_URL,
      fetchImpl: fakeFetch as typeof fetch,
      searchPageCount: 1,
    })
    const productRegistry = createPluginRegistry([plugin], {
      enabledPluginIds: [KORRI_SMBXGAME_PLUGIN_ID],
    })
    const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
      acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
    )
    const layer = makeLiveAcquisitionLayer({ registry: acquisitionRegistry })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const acquisition = yield* Acquisition
        return {
          search: yield* acquisition.search({ query: "wario" }),
          details: yield* acquisition.detailsByUrl(TOPIC_URL),
          health: yield* acquisition.validateProviders({
            providerIds: [KORRI_SMBXGAME_PLUGIN_ID],
          }),
          download: yield* acquisition.resolveDownload({
            providerId: KORRI_SMBXGAME_PLUGIN_ID,
            candidateUrl: TOPIC_URL,
          }),
        }
      }).pipe(Effect.provide(layer)),
    )

    expect(result.search.claims).toHaveLength(1)
    expect(result.search.claims[0]).toMatchObject({
      providerId: KORRI_SMBXGAME_PLUGIN_ID,
      id: TOPIC_ID,
      title: "[SMBX2] Wario & the Tower of Garlic (V1.0.6)",
      platform: "smbx-episode",
      artifact: {
        kind: "content",
        system: "smbx-episode",
        format: { id: "smbx-episode-archive" },
      },
    })
    expect(result.details).toMatchObject({
      providerId: KORRI_SMBXGAME_PLUGIN_ID,
      id: TOPIC_ID,
      title: "[SMBX2] Wario & the Tower of Garlic (V1.0.6)",
      downloadPageUrl: DOWNLOAD_URL,
      facets: {
        credits: { authors: [{ name: "Darkonius Mavakar" }] },
      },
    })
    expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
    expect(result.download).toMatchObject({
      _tag: "NonFinalDownload",
      providerId: KORRI_SMBXGAME_PLUGIN_ID,
      reason: "requires-user-action",
      url: DOWNLOAD_URL,
    })
  })
})
