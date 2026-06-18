import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
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
  createLevelShareSquarePlugin,
  KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID,
  levelShareSquarePlugin,
  parseLevelShareSquareCandidateUrl,
} from ".."

const LEVEL_ID = "6a1797b85a07d826fd7a5bd0"
const BASE_URL = "https://lss.fixture.test"
const LEVEL_URL = `${BASE_URL}/levels/${LEVEL_ID}`
const LEVEL_BYTES = Buffer.from(
  JSON.stringify({
    Info: {
      Name: "TROPICAL ISLAND ADVENTURE!",
      Author: "ELVEE",
      Description: "MARIO AND PRINCESS TOADSTOOL TOOK A VACATION.",
    },
    Levels: [{ name: "1-1" }],
  }),
)

const smbrGame = {
  internalID: 5,
  name: "Super Mario Bros. Remastered",
  acronym: "SMBR",
  fileExtension: ".lvl",
}

const tropicalLevel = {
  _id: LEVEL_ID,
  name: "Tropical Island Adventure!",
  author: {
    _id: "699e504093c85ab0cd73d54e",
    username: "Elvee",
    avatar: "https://cdn.levelsharesquare.com/avatar/elvee.webp",
  },
  status: "Featured",
  description: "Mario and Princess Toadstool took a vacation.",
  difficulty: "Medium",
  game: "5",
  gameVersion: "1.1",
  tags: ["Traditional", "Adventure", "Themed"],
  plays: 539,
  favourites: 2,
  rating: 5,
  rates: [5, 5, 5, 5],
  raters: 4,
  thumbnail: "https://cdn.levelsharesquare.com/levels/tropical.webp",
  featuredAt: "2026-06-01T00:00:00.000Z",
}

function lssFetch(
  fixtures: {
    readonly games?: unknown
    readonly search?: unknown
    readonly details?: unknown
    readonly code?: unknown
  } = {},
): typeof fetch {
  return (async input => {
    const url = new URL(input.toString())
    if (url.pathname === "/api/app/games/get") {
      return json(fixtures.games ?? { games: [smbrGame] })
    }
    if (url.pathname === "/api/levels/filter/get") {
      expect(url.searchParams.get("page")).toBe("1")
      expect(url.searchParams.get("game")).toBe("5")
      return json(fixtures.search ?? { levels: [tropicalLevel] })
    }
    if (url.pathname === `/api/levels/${LEVEL_ID}`) {
      expect(url.searchParams.get("allAuthors")).toBe("1")
      return json(fixtures.details ?? { level: tropicalLevel })
    }
    if (url.pathname === `/api/levels/${LEVEL_ID}/code`) {
      expect(url.searchParams.get("noDescription")).toBe("1")
      expect(url.searchParams.get("play")).toBe("1")
      return json(
        fixtures.code ?? {
          success: true,
          extension: ".lvl",
          levelData: { type: "Buffer", data: [...LEVEL_BYTES] },
        },
      )
    }
    return new Response("not found", { status: 404 })
  }) as typeof fetch
}

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  })
}

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-lss-product-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("Level Share Square product plugin", () => {
  it("declares a stable provider-backed plugin packaged with SMBR", () => {
    expect(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID).toBe("@korri:levelsharesquare")
    expect(levelShareSquarePlugin.id).toBe(KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID)
    expect(levelShareSquarePlugin.requires).toContainEqual(
      expect.objectContaining({
        capability: "smbr.package",
        ref: { provider: "@korri:super-mario-bros-remastered", id: "self" },
      }),
    )
    expect(
      levelShareSquarePlugin.handlers.map(handler => handler.operation),
    ).toEqual([
      "claims.search",
      "claims.details",
      "claims.parse-url",
      "provider.validate",
      "artifact.acquire",
      "diagnostics.collect",
    ])
  })

  it("parses only Level Share Square level URLs for the configured host", () => {
    expect(
      parseLevelShareSquareCandidateUrl(`${BASE_URL}/levels/${LEVEL_ID}`, {
        webBaseUrl: BASE_URL,
      }),
    ).toBe(LEVEL_ID)
    expect(parseLevelShareSquareCandidateUrl("not a url")).toBeNull()
    expect(
      parseLevelShareSquareCandidateUrl(`${BASE_URL}/SMBR/levels`, {
        webBaseUrl: BASE_URL,
      }),
    ).toBeNull()
  })

  it("runs SMBR search, details, health, and acquire through the acquisition safety boundary", async () => {
    await withTempRoot(async stagingRoot => {
      const plugin = createLevelShareSquarePlugin({
        baseUrl: BASE_URL,
        webBaseUrl: BASE_URL,
        fetchImpl: lssFetch(),
      })
      const productRegistry = createPluginRegistry([plugin], {
        enabledPluginIds: [KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID],
      })
      const acquisitionRegistry = createStaticAcquisitionPluginRegistry(
        acquisitionPluginDefinitionsFromPluginRegistry(productRegistry),
      )
      const layer = makeLiveAcquisitionLayer({
        registry: acquisitionRegistry,
        artifactStagingRoot: stagingRoot,
      })

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const acquisition = yield* Acquisition
          return {
            search: yield* acquisition.search({ query: "tropical" }),
            details: yield* acquisition.detailsByUrl(LEVEL_URL),
            health: yield* acquisition.validateProviders({
              providerIds: [KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID],
            }),
            acquired: yield* acquisition.acquireArtifact({
              providerId: KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID,
              id: LEVEL_ID,
            }),
          }
        }).pipe(Effect.provide(layer)),
      )

      expect(result.search.claims).toHaveLength(1)
      expect(result.search.claims[0]).toMatchObject({
        providerId: KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID,
        id: LEVEL_ID,
        title: "Tropical Island Adventure!",
        platform: "smbr",
        artifact: {
          kind: "content",
          system: "smbr",
          format: { id: "smbr-level" },
          file: { name: `${LEVEL_ID}.lvl`, extension: "lvl" },
        },
        playable: {
          id: LEVEL_ID,
          releases: [{ id: "smbr-level", system: "smbr" }],
        },
      })
      expect(result.details).toMatchObject({
        providerId: KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID,
        id: LEVEL_ID,
        title: "Tropical Island Adventure!",
      })
      expect(result.health.providers[0]?._tag).toBe("HealthyProvider")
      expect(result.acquired).toMatchObject({
        kind: "content",
        system: "smbr",
        format: { id: "smbr-level" },
        file: {
          name: `${LEVEL_ID}.lvl`,
          extension: "lvl",
          mediaType: "application/json",
          sizeBytes: LEVEL_BYTES.length,
        },
        provenance: {
          source: KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID,
          url: LEVEL_URL,
        },
        externalIds: [
          { namespace: KORRI_LEVEL_SHARE_SQUARE_PLUGIN_ID, id: LEVEL_ID },
        ],
      })
      expect(result.acquired.stagedPath).toEndWith(".lvl")
      expect(result.acquired.sourceData?.["levelsharesquare.v1"]).toMatchObject(
        {
          levelId: LEVEL_ID,
          internalGameId: 5,
          status: "Featured",
        },
      )
    })
  })
})
