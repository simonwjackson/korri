import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { Effect } from "effect"
import { acquireArtifact } from "../artifact-acquisition"
import { createItchioPluginDefinition, parseItchioCandidateUrl } from "./itchio"
import { createAcquisitionPluginRegistry } from "./registry"

const checkedAt = "2026-06-18T00:00:00.000Z"
const context = {
  clock: { nowIso: () => checkedAt },
  logger: {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
}

const platformerFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"><channel><title>Top Platformer games - itch.io</title>
  <item>
    <guid>https://maddymakesgamesinc.itch.io/celeste</guid>
    <title>Celeste [$19.99] [Platformer] [Windows] [macOS] [Linux]</title>
    <plainTitle>Celeste</plainTitle>
    <imageurl>https://img.itch.zone/celeste.png</imageurl>
    <price>$19.99</price>
    <currency>USD</currency>
    <link>https://maddymakesgamesinc.itch.io/celeste</link>
    <description><![CDATA[Brave hundreds of hand-crafted challenges.<img alt="Celeste" src="https://img.itch.zone/celeste.png"/>]]></description>
    <platforms><windows>yes</windows><osx>yes</osx><linux>yes</linux></platforms>
  </item>
  <item>
    <guid>https://cookiecrayon.itch.io/pikwip</guid>
    <title>Pikwip [Free] [Platformer] [Windows] [macOS]</title>
    <plainTitle>Pikwip</plainTitle>
    <imageurl>https://img.itch.zone/pikwip.png</imageurl>
    <price>$0.00</price>
    <currency>USD</currency>
    <link>https://cookiecrayon.itch.io/pikwip</link>
    <description><![CDATA[Head to the summit. Local co-op or single player.]]></description>
    <platforms><windows>yes</windows><osx>yes</osx></platforms>
  </item>
</channel></rss>`

const freeLinuxFeed = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0"><channel><title>Top free games for Linux - itch.io</title>
  <item>
    <guid>https://studio-laaya.itch.io/foghorns-drown</guid>
    <plainTitle>Foghorns Drown - DEMO</plainTitle>
    <imageurl>https://img.itch.zone/foghorns.gif</imageurl>
    <price>$0.00</price>
    <currency>USD</currency>
    <link>https://studio-laaya.itch.io/foghorns-drown</link>
    <description><![CDATA[The chain is stubborn.]]></description>
    <platforms><windows>yes</windows><linux>yes</linux></platforms>
  </item>
</channel></rss>`

const searchPage = `<!doctype html><html><body>
  <div data-game_id="1116521" class="game_cell has_cover lazy_images">
    <div class="game_thumb"><a class="thumb_link game_link" href="https://jonnys-games.itch.io/slide-in-the-woods"><img data-lazy_src="https://img.itch.zone/slide.png" /></a></div>
    <div class="game_cell_data">
      <div class="game_title"><a class="title game_link" href="https://jonnys-games.itch.io/slide-in-the-woods">Slide in the woods</a></div>
      <div title="Ride it, see where it takes you." class="game_text">Ride it, see where it takes you.</div>
      <div class="game_author"><a href="https://jonnys-games.itch.io">Jonny&#039;s Games</a></div>
      <div class="game_platform"><span title="Download for Windows" class="icon icon-windows8"></span></div>
    </div>
  </div>
  <div class="game_cell has_cover lazy_images" data-game_id="222">
    <div class="game_cell_data">
      <div class="game_title"><a class="title game_link" href="https://linux-maker.itch.io/example">Linux Example</a></div>
      <div class="game_platform"><span title="Download for Linux" class="icon icon-tux"></span></div>
    </div>
  </div>
</body></html>`

describe("itch.io acquisition plugin", () => {
  it("parses public creator game URLs into provider ids", () => {
    expect(parseItchioCandidateUrl("https://creator.itch.io/game")).toBe(
      "creator/game",
    )
    expect(
      parseItchioCandidateUrl("https://creator.itch.io/game/download"),
    ).toBe("creator/game")
    expect(parseItchioCandidateUrl("https://itch.io/games")).toBeNull()
    expect(parseItchioCandidateUrl("https://example.com/game")).toBeNull()
  })

  it("searches public browse RSS feeds without credentials", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        fetchedUrls.push(url)
        return new Response(platformerFeed, {
          status:
            url === "https://itch.io/games/tag-platformer.xml" ? 200 : 404,
        })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, { query: "platformer" }) ??
        Effect.die("missing search handler"),
    )

    expect(fetchedUrls).toEqual(["https://itch.io/games/tag-platformer.xml"])
    expect(claims.map(claim => claim.id)).toEqual([
      "maddymakesgamesinc/celeste",
      "cookiecrayon/pikwip",
    ])
    expect(claims[0]).toMatchObject({
      _tag: "ProviderClaim",
      providerId: "@korri:itchio",
      id: "maddymakesgamesinc/celeste",
      title: "Celeste",
      url: "https://maddymakesgamesinc.itch.io/celeste",
      thumbnailUrl: "https://img.itch.zone/celeste.png",
      platform: "windows, macos, linux",
      playable: {
        display: { price: "$19.99", currency: "USD" },
      },
    })
  })

  it("uses platform-specific public RSS feeds when filtering", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        fetchedUrls.push(url)
        return new Response(freeLinuxFeed, {
          status:
            url === "https://itch.io/games/free/platform-linux.xml" ? 200 : 404,
        })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, { query: "free", platforms: ["linux"] }) ??
        Effect.die("missing search handler"),
    )

    expect(fetchedUrls).toEqual([
      "https://itch.io/games/free/platform-linux.xml",
    ])
    expect(claims).toHaveLength(1)
    expect(claims[0]?.id).toBe("studio-laaya/foghorns-drown")
    expect(claims[0]?.platform).toBe("windows, linux")
  })

  it("returns no search results when public RSS feeds are unavailable", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async () => new Response("not found", { status: 404 }),
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, { query: "missing" }) ??
        Effect.die("missing search handler"),
    )

    expect(claims).toEqual([])
  })

  it("uses optional official API credentials for profile games search", async () => {
    const requests: Array<{
      readonly url: string
      readonly init?: RequestInit
    }> = []
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async (url, init) => {
        requests.push({ url, init })
        if (url === "https://api.itch.io/profile/games") {
          return Response.json({
            games: [
              {
                id: 3,
                title: "X-Moon",
                url: "https://leafo.itch.io/x-moon",
                short_text: "Humans have been colonizing planets.",
                cover_url: "https://img.itch.zone/xmoon.png",
                min_price: 0,
                traits: ["p_windows", "p_linux", "p_osx"],
              },
            ],
          })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, {
        query: "profile:games",
        platforms: ["linux"],
      }) ?? Effect.die("missing search handler"),
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      url: "https://api.itch.io/profile/games",
      init: { headers: { Authorization: "Bearer secret-token" } },
    })
    expect(requests[0]?.url).not.toContain("secret-token")
    expect(claims).toHaveLength(1)
    expect(claims[0]).toMatchObject({
      providerId: "@korri:itchio",
      id: "leafo/x-moon",
      title: "X-Moon",
      platform: "windows, linux, macos",
      thumbnailUrl: "https://img.itch.zone/xmoon.png",
      playable: { display: { gameId: 3, price: "$0.00" } },
    })
  })

  it("searches authenticated owned purchases with official profile:owned credentials", async () => {
    const requests: Array<{
      readonly url: string
      readonly init?: RequestInit
    }> = []
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async (url, init) => {
        requests.push({ url, init })
        if (url === "https://api.itch.io/profile/owned-keys") {
          return Response.json({
            owned_keys: [
              {
                id: 77,
                game_id: 125437,
                key: "purchase-key",
                game: {
                  id: 125437,
                  title: "Meganoid(2017)",
                  url: "https://orangepixel.itch.io/meganoid",
                  cover_url: "https://img.itch.zone/meganoid.png",
                  traits: ["p_windows", "p_linux", "p_osx"],
                },
              },
            ],
          })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, {
        query: "profile:owned",
        platforms: ["linux"],
      }) ?? Effect.die("missing search handler"),
    )

    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      url: "https://api.itch.io/profile/owned-keys",
      init: { headers: { Authorization: "Bearer secret-token" } },
    })
    expect(JSON.stringify(claims)).not.toContain("purchase-key")
    expect(claims).toEqual([
      {
        _tag: "ProviderClaim",
        providerId: "@korri:itchio",
        id: "orangepixel/meganoid",
        ref: { kind: "provider-item-id", value: "orangepixel/meganoid" },
        title: "Meganoid(2017)",
        url: "https://orangepixel.itch.io/meganoid",
        platform: "windows, linux, macos",
        thumbnailUrl: "https://img.itch.zone/meganoid.png",
        playable: {
          id: "orangepixel/meganoid",
          title: "Meganoid(2017)",
          providerId: "@korri:itchio",
          display: { gameId: 125437, source: "owned-key", ownedKeyId: 77 },
          releases: [
            {
              id: "windows",
              providerId: "@korri:itchio",
              system: "windows",
              target: { kind: "url", value: "https://orangepixel.itch.io/meganoid" },
            },
            {
              id: "linux",
              providerId: "@korri:itchio",
              system: "linux",
              target: { kind: "url", value: "https://orangepixel.itch.io/meganoid" },
            },
            {
              id: "macos",
              providerId: "@korri:itchio",
              system: "macos",
              target: { kind: "url", value: "https://orangepixel.itch.io/meganoid" },
            },
          ],
        },
      },
    ])
  })

  it("reads optional API credentials from acquisition runtime env", async () => {
    const requestedHeaders: RequestInit["headers"][] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async (url, init) => {
        requestedHeaders.push(init?.headers)
        if (url === "https://api.itch.io/profile/games") {
          return Response.json({ games: [] })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(
        { ...context, env: { ITCHIO_API_KEY: "env-secret-token" } },
        { query: "profile:games" },
      ) ?? Effect.die("missing search handler"),
    )

    expect(claims).toEqual([])
    expect(requestedHeaders).toEqual([
      { Authorization: "Bearer env-secret-token" },
    ])
  })

  it("keeps public search behavior unchanged when credentials are configured", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async url => {
        fetchedUrls.push(url)
        return new Response(platformerFeed, {
          status:
            url === "https://itch.io/games/tag-platformer.xml" ? 200 : 404,
        })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, { query: "platformer" }) ??
        Effect.die("missing search handler"),
    )

    expect(fetchedUrls).toEqual(["https://itch.io/games/tag-platformer.xml"])
    expect(claims.map(claim => claim.id)).toContain("cookiecrayon/pikwip")
  })

  it("keeps authenticated profile search empty when no credential is configured", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        fetchedUrls.push(url)
        return new Response("not found", { status: 404 })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, { query: "profile:games" }) ??
        Effect.die("missing search handler"),
    )

    expect(fetchedUrls).toEqual([])
    expect(claims).toEqual([])
  })

  it("reports healthy provider status for valid official API credentials", async () => {
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async url =>
        url === "https://api.itch.io/credentials/info"
          ? Response.json({
              type: "key",
              scopes: ["profile:me", "profile:games"],
            })
          : new Response("not found", { status: 404 }),
    })

    const health = await Effect.runPromise(
      plugin.validateProvider?.({ ...context, checkedAt }) ??
        Effect.die("missing health handler"),
    )

    expect(health).toEqual({
      _tag: "HealthyProvider",
      providerId: "@korri:itchio",
      checkedAt,
    })
  })

  it("validates official API credentials without exposing the token", async () => {
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async () =>
        Response.json({ errors: ["secret-token is invalid"] }, { status: 200 }),
    })

    const health = await Effect.runPromise(
      plugin.validateProvider?.({ ...context, checkedAt }) ??
        Effect.die("missing health handler"),
    )

    expect(health).toEqual({
      _tag: "UnhealthyProvider",
      providerId: "@korri:itchio",
      checkedAt,
      reason: "credentials",
      message: "itch.io API returned errors: [redacted] is invalid",
    })
  })

  it("falls back to public search result pages for natural-language queries", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        fetchedUrls.push(url)
        if (url === "https://itch.io/search?q=slide+in+the+woods&type=games") {
          return new Response(searchPage)
        }
        return new Response("not found", { status: 404 })
      },
    })

    const claims = await Effect.runPromise(
      plugin.search?.(context, {
        query: "slide in the woods",
        platforms: ["windows"],
      }) ?? Effect.die("missing search handler"),
    )

    expect(fetchedUrls).toEqual([
      "https://itch.io/games/tag-slide-in-the-woods/platform-windows.xml",
      "https://itch.io/search?q=slide+in+the+woods&type=games",
    ])
    expect(claims).toHaveLength(1)
    expect(claims[0]).toMatchObject({
      _tag: "ProviderClaim",
      providerId: "@korri:itchio",
      id: "jonnys-games/slide-in-the-woods",
      title: "Slide in the woods",
      url: "https://jonnys-games.itch.io/slide-in-the-woods",
      thumbnailUrl: "https://img.itch.zone/slide.png",
      platform: "windows",
      playable: {
        display: { gameId: 1116521 },
      },
    })
  })

  it("returns public page details without requiring credentials", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url =>
        new Response(
          `<!doctype html>
          <html>
            <head>
              <meta property="og:title" content="Example Game">
              <meta property="og:description" content="A public itch.io game&#039;s page.">
              <meta property="og:image" content="https://img.itch.zone/example.png">
              <link rel="canonical" href="https://creator.itch.io/game">
            </head>
            <body></body>
          </html>`,
          { status: url === "https://creator.itch.io/game" ? 200 : 404 },
        ),
    })

    const details = await Effect.runPromise(
      plugin.details?.(context, {
        providerId: "@korri:itchio",
        id: "creator/game",
      }) ?? Effect.die("missing details handler"),
    )

    expect(details).toMatchObject({
      _tag: "ProviderClaimDetails",
      providerId: "@korri:itchio",
      id: "creator/game",
      title: "Example Game",
      url: "https://creator.itch.io/game",
      description: "A public itch.io game's page.",
      downloadPageUrl: "https://creator.itch.io/game",
      playable: {
        id: "creator/game",
        title: "Example Game",
        providerId: "@korri:itchio",
        releases: [
          {
            id: "itchio",
            providerId: "@korri:itchio",
            system: "itchio",
            target: { kind: "url", value: "https://creator.itch.io/game" },
          },
        ],
      },
    })
  })

  it("reports browser-playable public pages as container-required HTML releases", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url =>
        new Response(
          `<!doctype html>
          <html>
            <head>
              <meta property="og:title" content="Browser Game">
              <link rel="canonical" href="https://creator.itch.io/browser-game">
            </head>
            <body><span title="Play in browser" class="icon icon-html5"></span></body>
          </html>`,
          {
            status: url === "https://creator.itch.io/browser-game" ? 200 : 404,
          },
        ),
    })

    const details = await Effect.runPromise(
      plugin.details?.(context, {
        providerId: "@korri:itchio",
        id: "creator/browser-game",
      }) ?? Effect.die("missing details handler"),
    )

    expect(details.playable?.releases).toEqual([
      {
        id: "html",
        providerId: "@korri:itchio",
        system: "html",
        display: { acquisition: "container-required" },
      },
    ])
  })

  it("enriches public details with itch.io game data when available", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        fetchedUrls.push(url)
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({
            id: 123,
            title: "Official Game Title",
            price: "$2.00",
            original_price: "$4.00",
            sale: { id: 456, title: "Launch Sale", rate: 50 },
          })
        }
        return new Response(
          `<!doctype html>
          <html>
            <head>
              <meta property="og:title" content="Fallback Game by creator">
              <meta property="og:description" content="Fallback description.">
              <link rel="canonical" href="https://creator.itch.io/game">
            </head>
          </html>`,
          { status: url === "https://creator.itch.io/game" ? 200 : 404 },
        )
      },
    })

    const details = await Effect.runPromise(
      plugin.details?.(context, {
        providerId: "@korri:itchio",
        id: "creator/game",
      }) ?? Effect.die("missing details handler"),
    )

    expect(fetchedUrls).toEqual([
      "https://creator.itch.io/game",
      "https://creator.itch.io/game/data.json",
    ])
    expect(details.title).toBe("Official Game Title")
    expect(details.playable?.display).toMatchObject({
      gameId: 123,
      price: "$2.00",
      originalPrice: "$4.00",
      sale: { id: 456, title: "Launch Sale", rate: 50 },
    })
  })

  it("keeps page details when itch.io game data is unavailable", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return new Response("no data", { status: 404 })
        }
        return new Response(
          `<!doctype html>
          <html>
            <head>
              <meta property="og:title" content="Fallback Game">
              <link rel="canonical" href="https://creator.itch.io/game">
            </head>
          </html>`,
          { status: url === "https://creator.itch.io/game" ? 200 : 404 },
        )
      },
    })

    const details = await Effect.runPromise(
      plugin.details?.(context, {
        providerId: "@korri:itchio",
        id: "creator/game",
      }) ?? Effect.die("missing details handler"),
    )

    expect(details.title).toBe("Fallback Game")
    expect(details.playable?.display).toBeUndefined()
  })

  it("reports missing or private public pages as caller errors", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async () => new Response("not found", { status: 404 }),
    })

    const error = await Effect.runPromise(
      Effect.flip(
        plugin.details?.(context, {
          providerId: "@korri:itchio",
          id: "creator/missing-game",
        }) ?? Effect.die("missing details handler"),
      ),
    )

    expect(error.message).toContain("Unknown itch.io candidate")
  })

  it("resolves a clearly free public page with one upload to a final URL", async () => {
    const requests: Array<{
      readonly url: string
      readonly init?: RequestInit
    }> = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async (url, init) => {
        requests.push({ url, init })
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          const headers = new Headers()
          headers.append("Set-Cookie", "itchio=session; Path=/")
          return Response.json(
            { url: "https://creator.itch.io/game/download/signed" },
            { headers },
          )
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload">
              <a data-upload_id="42" href="javascript:void(0);" class="button download_btn">Download</a>
              <div class="info_column"><div class="upload_name"><strong title="game.zip" class="name">game.zip</strong></div></div>
            </div>`,
          )
        }
        if (
          url ===
          "https://creator.itch.io/game/file/42?source=view_game&as_props=1&after_download_lightbox=true"
        ) {
          return Response.json({ url: "https://cdn.example.com/game.zip" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://cdn.example.com/game.zip",
      filename: "game.zip",
    })
    expect(requests.map(request => request.url)).toEqual([
      "https://creator.itch.io/game/data.json",
      "https://creator.itch.io/game/download_url",
      "https://creator.itch.io/game/download/signed",
      "https://creator.itch.io/game/file/42?source=view_game&as_props=1&after_download_lightbox=true",
    ])
    expect(requests.at(-1)?.init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "csrf_token=csrf-token",
    })
  })

  it("resolves entitled download-key pages without requiring public free metadata", async () => {
    const requestedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        requestedUrls.push(url)
        if (url === "https://creator.itch.io/game/download/purchase-key") {
          return new Response(
            `<meta value="csrf-token" name="csrf_token">
            <script>init_GameDownload('#game_download', {"key":"purchase-key","game":{"slug":"game","id":123}});</script>
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">Windows + Steam key</strong> <span class="file_size"><span>78 MB</span></span><span title="Download for Windows"></span></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">Linux + Steam key</strong> <span class="file_size"><span>81 MB</span></span><span title="Download for Linux"></span></div></div></div>`,
          )
        }
        if (
          url ===
          "https://creator.itch.io/game/file/2?source=view_game&as_props=1&after_download_lightbox=true&key=purchase-key"
        ) {
          return Response.json({ url: "https://cdn.example.com/linux.zip" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game/download/purchase-key",
        fileName: "Linux + Steam key",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUrls).not.toContain(
      "https://creator.itch.io/game/data.json",
    )
    expect(resolution).toEqual({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://cdn.example.com/linux.zip",
      filename: "Linux + Steam key",
    })
  })

  it("keeps inaccessible entitled download-key pages non-final without leaking the URL", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/download/purchase-key") {
          return new Response("<title>Log in - itch.io</title>")
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game/download/purchase-key",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
    })
  })

  it("returns entitled upload choices without leaking download-key URLs", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/download/purchase-key") {
          return new Response(
            `<meta value="csrf-token" name="csrf_token">
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">Windows + Steam key</strong> <span class="file_size"><span>78 MB</span></span><span title="Download for Windows"></span></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">Linux + Steam key</strong> <span class="file_size"><span>81 MB</span></span><span title="Download for Linux"></span></div></div></div>`,
          )
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game/download/purchase-key",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
      choices: [
        {
          id: "1",
          fileName: "Windows + Steam key",
          size: "78 MB",
          platforms: ["windows"],
        },
        {
          id: "2",
          fileName: "Linux + Steam key",
          size: "81 MB",
          platforms: ["linux"],
        },
      ],
    })
  })

  it("resolves authenticated owned uploads through official API credentials", async () => {
    const requestedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async (url, init) => {
        requestedUrls.push(url)
        if (url === "https://creator.itch.io/paid/data.json") {
          return Response.json({ id: 42, price: "$4.99" })
        }
        expect(init?.headers).toMatchObject(
          url.startsWith("https://api.itch.io")
            ? { Authorization: "Bearer secret-token" }
            : {},
        )
        if (url === "https://api.itch.io/profile/owned-keys") {
          return Response.json({
            owned_keys: [
              {
                id: 9,
                game_id: 42,
                game: {
                  id: 42,
                  title: "Paid Game",
                  url: "https://creator.itch.io/paid",
                },
              },
            ],
          })
        }
        if (url === "https://api.itch.io/games/42/uploads") {
          return Response.json({
            uploads: [
              {
                id: 1001,
                display_name: "Windows build.zip",
                size: "78 MB",
                traits: ["p_windows"],
              },
              {
                id: 1002,
                display_name: "Linux build.zip",
                size: "81 MB",
                traits: ["p_linux"],
              },
            ],
          })
        }
        if (url === "https://api.itch.io/upload/1002/download") {
          return Response.json({ url: "https://cdn.example.com/linux.zip" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/paid",
        fileName: "Linux build.zip",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUrls).toEqual([
      "https://creator.itch.io/paid/data.json",
      "https://api.itch.io/profile/owned-keys",
      "https://api.itch.io/games/42/uploads",
      "https://api.itch.io/upload/1002/download",
    ])
    expect(resolution).toEqual({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://cdn.example.com/linux.zip",
      filename: "Linux build.zip",
    })
  })

  it("returns authenticated owned upload choices when hints are ambiguous", async () => {
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/paid/data.json") {
          return Response.json({ id: 42, price: "$4.99" })
        }
        if (url === "https://api.itch.io/profile/owned-keys") {
          return Response.json({
            owned_keys: [
              {
                game_id: 42,
                game: {
                  id: 42,
                  title: "Paid Game",
                  url: "https://creator.itch.io/paid",
                },
              },
            ],
          })
        }
        if (url === "https://api.itch.io/games/42/uploads") {
          return Response.json({
            uploads: [
              { id: 1, display_name: "Windows.zip", size: "78 MB" },
              { id: 2, display_name: "Linux.zip", size: "81 MB" },
            ],
          })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/paid",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
      choices: [
        { id: "1", fileName: "Windows.zip", size: "78 MB" },
        { id: "2", fileName: "Linux.zip", size: "81 MB" },
      ],
    })
  })

  it("uses butlerd upload choices when authenticated API uploads are empty", async () => {
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      butlerClient: {
        listGameUploads: async input => {
          expect(input).toMatchObject({
            apiKey: "secret-token",
            command: ["butler"],
            gameId: 42,
          })
          return [
            {
              id: "1001",
              filename: "Windows build.zip",
              size: "78 MB",
              platforms: ["windows"],
            },
            {
              id: "1002",
              filename: "Linux build.zip",
              size: "81 MB",
              platforms: ["linux"],
            },
          ]
        },
        acquireGameUpload: async () => {
          throw new Error("not used")
        },
      },
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/paid/data.json") {
          return Response.json({ id: 42, price: "$4.99" })
        }
        if (url === "https://api.itch.io/profile/owned-keys") {
          return Response.json({
            owned_keys: [
              {
                game_id: 42,
                game: {
                  id: 42,
                  title: "Paid Game",
                  url: "https://creator.itch.io/paid",
                },
              },
            ],
          })
        }
        if (url === "https://api.itch.io/games/42/uploads") {
          return Response.json({ uploads: {} })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/paid",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
      choices: [
        {
          id: "1001",
          fileName: "Windows build.zip",
          size: "78 MB",
          platforms: ["windows"],
        },
        {
          id: "1002",
          fileName: "Linux build.zip",
          size: "81 MB",
          platforms: ["linux"],
        },
      ],
    })
  })

  it("handles free labels and download-page markup variants safely", async () => {
    const requestedUploads: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "Free" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta value="csrf-token" name="csrf_token">
            <div data-extra="ok" class="upload featured">
              <a class="button download_btn" data-upload_id="9">Download</a>
              <div class="info_column"><div class="upload_name"><strong class="name">variant.zip</strong></div></div>
            </div>`,
          )
        }
        if (url.includes("/file/9")) {
          requestedUploads.push(url)
          return Response.json({ url: "https://cdn.example.com/variant.zip" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUploads).toEqual([
      "https://creator.itch.io/game/file/9?source=view_game&as_props=1&after_download_lightbox=true",
    ])
    expect(resolution).toMatchObject({
      _tag: "FinalDownload",
      filename: "variant.zip",
      url: "https://cdn.example.com/variant.zip",
    })
  })

  it("keeps unsafe final download URLs non-final", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="9" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">unsafe.zip</strong></div></div></div>`,
          )
        }
        if (url.includes("/file/9")) {
          return Response.json({ url: "http://127.0.0.1/unsafe.zip" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
    })
  })

  it("keeps malformed final download payloads non-final", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="9" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">broken.zip</strong></div></div></div>`,
          )
        }
        if (url.includes("/file/9")) {
          return Response.json({
            not_url: "https://cdn.example.com/broken.zip",
          })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
    })
  })

  it("keeps paid itch.io pages non-final", async () => {
    const fetchedUrls: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        fetchedUrls.push(url)
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$2.00" })
        }
        return new Response("not found", { status: 404 })
      },
    })
    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
      }) ?? Effect.die("missing download handler"),
    )

    expect(fetchedUrls).toEqual(["https://creator.itch.io/game/data.json"])
    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
    })
  })

  it("keeps ambiguous multi-upload pages non-final", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">windows.zip</strong></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">linux.zip</strong></div></div></div>`,
          )
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
      }) ?? Effect.die("missing download handler"),
    )

    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
      choices: [
        { id: "1", fileName: "windows.zip" },
        { id: "2", fileName: "linux.zip" },
      ],
    })
  })

  it("uses file-name hints to resolve one upload from a free multi-upload page", async () => {
    const requestedUploads: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">windows.zip</strong> <span class="file_size"><span>2 MB</span></span> <span class="download_platforms"><span title="Download for Windows" class="icon icon-windows8"></span></span></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">linux.tar.gz</strong> <span class="file_size"><span>3 MB</span></span> <span class="download_platforms"><span title="Download for Linux" class="icon icon-tux"></span></span></div></div></div>`,
          )
        }
        if (url.includes("/file/")) {
          requestedUploads.push(url)
          return Response.json({ url: "https://cdn.example.com/linux.tar.gz" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
        fileName: "linux.tar.gz",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUploads).toEqual([
      "https://creator.itch.io/game/file/2?source=view_game&as_props=1&after_download_lightbox=true",
    ])
    expect(resolution).toEqual({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://cdn.example.com/linux.tar.gz",
      filename: "linux.tar.gz",
    })
  })

  it("uses size hints when exactly one upload has that displayed size", async () => {
    const requestedUploads: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">windows.zip</strong> <span class="file_size"><span>2 MB</span></span></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">linux.tar.gz</strong> <span class="file_size"><span>3 MB</span></span></div></div></div>`,
          )
        }
        if (url.includes("/file/")) {
          requestedUploads.push(url)
          return Response.json({ url: "https://cdn.example.com/linux.tar.gz" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
        size: "3MB",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUploads).toEqual([
      "https://creator.itch.io/game/file/2?source=view_game&as_props=1&after_download_lightbox=true",
    ])
    expect(resolution).toEqual({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://cdn.example.com/linux.tar.gz",
      filename: "linux.tar.gz",
    })
  })

  it("uses artifact-format hints when exactly one upload has that extension", async () => {
    const requestedUploads: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">windows.zip</strong> <span class="file_size"><span>2 MB</span></span></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">linux.love</strong> <span class="file_size"><span>3 MB</span></span></div></div></div>`,
          )
        }
        if (url.includes("/file/")) {
          requestedUploads.push(url)
          return Response.json({ url: "https://cdn.example.com/linux.love" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
        artifactFormat: "love",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUploads).toEqual([
      "https://creator.itch.io/game/file/2?source=view_game&as_props=1&after_download_lightbox=true",
    ])
    expect(resolution).toEqual({
      _tag: "FinalDownload",
      providerId: "@korri:itchio",
      url: "https://cdn.example.com/linux.love",
      filename: "linux.love",
    })
  })

  it("acquires a resolved public upload into acquisition staging", async () => {
    const artifactBytes = Buffer.from("itch artifact bytes")
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="7" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">game.zip</strong> <span class="file_size"><span>18 B</span></span></div></div></div>`,
          )
        }
        if (
          url ===
          "https://creator.itch.io/game/file/7?source=view_game&as_props=1&after_download_lightbox=true"
        ) {
          return Response.json({ url: "https://cdn.example.com/game.zip" })
        }
        if (url === "https://cdn.example.com/game.zip") {
          return new Response(artifactBytes, {
            headers: {
              "content-length": String(artifactBytes.length),
              "content-type": "application/zip",
            },
          })
        }
        return new Response("not found", { status: 404 })
      },
    })
    const root = await mkdtemp(`${tmpdir()}/korri-itchio-acquire-`)
    try {
      const acquired = await Effect.runPromise(
        acquireArtifact({
          registry: createAcquisitionPluginRegistry([plugin]),
          context,
          stagingRoot: root,
          request: {
            providerId: "@korri:itchio",
            id: "https://creator.itch.io/game",
          },
        }),
      )

      expect(acquired.format.id).toBe("itchio-public-download")
      expect(acquired.file).toMatchObject({
        name: "game.zip",
        extension: "zip",
        mediaType: "application/zip",
        sizeBytes: artifactBytes.length,
      })
      expect(acquired.provenance).toMatchObject({
        source: "@korri:itchio",
        acquiredAt: checkedAt,
        url: "https://creator.itch.io/game",
      })
      expect(acquired.sourceData?.["itchio.v1"]).toMatchObject({
        id: "creator/game",
        filename: "game.zip",
      })
      expect(await readFile(acquired.stagedPath)).toEqual(artifactBytes)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("acquires entitled download-key artifacts without storing the key", async () => {
    const artifactBytes = Buffer.from("entitled artifact bytes")
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/download/purchase-key") {
          return new Response(
            `<meta value="csrf-token" name="csrf_token">
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">Linux + Steam key.zip</strong> <span class="file_size"><span>81 MB</span></span><span title="Download for Linux"></span></div></div></div>`,
          )
        }
        if (url.includes("/file/2?") && url.includes("key=purchase-key")) {
          return Response.json({ url: "https://cdn.example.com/linux.zip" })
        }
        if (url === "https://cdn.example.com/linux.zip") {
          return new Response(artifactBytes)
        }
        return new Response("not found", { status: 404 })
      },
    })

    const output = await Effect.runPromise(
      plugin.acquireArtifact?.(context, {
        providerId: "@korri:itchio",
        id: "https://creator.itch.io/game/download/purchase-key",
      }) ?? Effect.die("missing acquire handler"),
    )

    expect(output.provenance?.url).toBe("https://creator.itch.io/game")
    expect(output.sourceData?.["itchio.v1"]).toMatchObject({
      id: "creator/game",
      pageUrl: "https://creator.itch.io/game",
    })
    expect(JSON.stringify(output)).not.toContain("purchase-key")
  })

  it("acquires authenticated owned artifacts without storing credentials", async () => {
    const artifactBytes = Buffer.from("owned artifact bytes")
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/paid/data.json") {
          return Response.json({ id: 42, price: "$4.99" })
        }
        if (url === "https://api.itch.io/profile/owned-keys") {
          return Response.json({
            owned_keys: [
              {
                key: "purchase-key",
                game_id: 42,
                game: {
                  id: 42,
                  title: "Paid Game",
                  url: "https://creator.itch.io/paid",
                },
              },
            ],
          })
        }
        if (url === "https://api.itch.io/games/42/uploads") {
          return Response.json({
            uploads: [{ id: 2, display_name: "Linux.zip", size: "81 MB" }],
          })
        }
        if (url === "https://api.itch.io/upload/2/download") {
          return Response.json({ url: "https://cdn.example.com/linux.zip" })
        }
        if (url === "https://cdn.example.com/linux.zip") {
          return new Response(artifactBytes)
        }
        return new Response("not found", { status: 404 })
      },
    })

    const output = await Effect.runPromise(
      plugin.acquireArtifact?.(context, {
        providerId: "@korri:itchio",
        id: "https://creator.itch.io/paid",
      }) ?? Effect.die("missing acquire handler"),
    )

    expect(output.provenance?.url).toBe("https://creator.itch.io/paid")
    expect(output.sourceData?.["itchio.v1"]).toMatchObject({
      id: "creator/paid",
      pageUrl: "https://creator.itch.io/paid",
    })
    expect(JSON.stringify(output)).not.toContain("secret-token")
    expect(JSON.stringify(output)).not.toContain("purchase-key")
  })

  it("acquires authenticated owned artifacts through butlerd when API uploads are empty", async () => {
    const plugin = createItchioPluginDefinition({
      apiKey: "secret-token",
      butlerCommand: ["custom-butler"],
      butlerClient: {
        listGameUploads: async () => [
          {
            id: "1002",
            filename: "Linux build.zip",
            size: "81 MB",
            platforms: ["linux"],
          },
        ],
        acquireGameUpload: async input => {
          expect(input).toMatchObject({
            apiKey: "secret-token",
            command: ["custom-butler"],
            gameId: 42,
            uploadId: "1002",
            filename: "Linux build.zip",
          })
          return {
            bytes: Buffer.from("butler tarball"),
            filename: "Linux build.zip.tar.gz",
            sizeBytes: Buffer.byteLength("butler tarball"),
          }
        },
      },
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/paid/data.json") {
          return Response.json({ id: 42, price: "$4.99" })
        }
        if (url === "https://api.itch.io/profile/owned-keys") {
          return Response.json({
            owned_keys: [
              {
                key: "purchase-key",
                game_id: 42,
                game: {
                  id: 42,
                  title: "Paid Game",
                  url: "https://creator.itch.io/paid",
                },
              },
            ],
          })
        }
        if (url === "https://api.itch.io/games/42/uploads") {
          return Response.json({ uploads: {} })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const output = await Effect.runPromise(
      plugin.acquireArtifact?.(context, {
        providerId: "@korri:itchio",
        id: "https://creator.itch.io/paid",
        fileName: "Linux build.zip",
      }) ?? Effect.die("missing acquire handler"),
    )

    expect(output).toMatchObject({
      kind: "content",
      format: { id: "itchio-butler-install-tar" },
      file: {
        name: "Linux build.zip.tar.gz",
        extension: "gz",
        mediaType: "application/gzip",
        sizeBytes: Buffer.byteLength("butler tarball"),
      },
      provenance: {
        source: "@korri:itchio",
        acquiredAt: checkedAt,
        url: "https://creator.itch.io/paid",
      },
    })
    expect(output.bytesBase64).toBe(
      Buffer.from("butler tarball").toString("base64"),
    )
    expect(JSON.stringify(output)).not.toContain("secret-token")
    expect(JSON.stringify(output)).not.toContain("purchase-key")
  })

  it("rejects oversized public artifacts before staging", async () => {
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="7" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">huge.zip</strong></div></div></div>`,
          )
        }
        if (url.includes("/file/7")) {
          return Response.json({ url: "https://cdn.example.com/huge.zip" })
        }
        if (url === "https://cdn.example.com/huge.zip") {
          return new Response("too big", {
            headers: { "content-length": String(257 * 1024 * 1024) },
          })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const error = await Effect.runPromise(
      Effect.flip(
        plugin.acquireArtifact?.(context, {
          providerId: "@korri:itchio",
          id: "https://creator.itch.io/game",
        }) ?? Effect.die("missing acquire handler"),
      ),
    )

    expect(error.reason).toBe("caller")
    expect(error.message).toContain("too large")
  })

  it("sanitizes artifact filenames before returning staged metadata", async () => {
    const artifactBytes = Buffer.from("safe bytes")
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="7" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">../evil.zip</strong></div></div></div>`,
          )
        }
        if (url.includes("/file/7")) {
          return Response.json({ url: "https://cdn.example.com/evil.zip" })
        }
        if (url === "https://cdn.example.com/evil.zip") {
          return new Response(artifactBytes)
        }
        return new Response("not found", { status: 404 })
      },
    })

    const output = await Effect.runPromise(
      plugin.acquireArtifact?.(context, {
        providerId: "@korri:itchio",
        id: "https://creator.itch.io/game",
      }) ?? Effect.die("missing acquire handler"),
    )

    expect(output.file.name).toBe("evil.zip")
    expect(output.file.extension).toBe("zip")
  })

  it("keeps multi-upload pages non-final when hints do not choose exactly one upload", async () => {
    const requestedUploads: string[] = []
    const plugin = createItchioPluginDefinition({
      fetchImpl: async url => {
        if (url === "https://creator.itch.io/game/data.json") {
          return Response.json({ price: "$0.00" })
        }
        if (url === "https://creator.itch.io/game/download_url") {
          return Response.json({
            url: "https://creator.itch.io/game/download/signed",
          })
        }
        if (url === "https://creator.itch.io/game/download/signed") {
          return new Response(
            `<meta name="csrf_token" value="csrf-token">
            <div class="upload"><a data-upload_id="1" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">windows.zip</strong> <span class="file_size"><span>2 MB</span></span></div></div></div>
            <div class="upload"><a data-upload_id="2" class="button download_btn">Download</a><div class="info_column"><div class="upload_name"><strong class="name">linux.zip</strong> <span class="file_size"><span>3 MB</span></span></div></div></div>`,
          )
        }
        if (url.includes("/file/")) {
          requestedUploads.push(url)
          return Response.json({ url: "https://cdn.example.com/ambiguous.zip" })
        }
        return new Response("not found", { status: 404 })
      },
    })

    const resolution = await Effect.runPromise(
      plugin.resolveDownload?.(context, {
        providerId: "@korri:itchio",
        candidateUrl: "https://creator.itch.io/game",
        artifactFormat: "zip",
      }) ?? Effect.die("missing download handler"),
    )

    expect(requestedUploads).toEqual([])
    expect(resolution).toEqual({
      _tag: "NonFinalDownload",
      providerId: "@korri:itchio",
      reason: "requires-user-action",
      choices: [
        { id: "1", fileName: "windows.zip", size: "2 MB" },
        { id: "2", fileName: "linux.zip", size: "3 MB" },
      ],
    })
  })
})
