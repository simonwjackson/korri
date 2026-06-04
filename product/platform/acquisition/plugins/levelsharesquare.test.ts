import { describe, expect, it } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { acquireArtifact } from "../artifact-acquisition"
import { createAcquisitionPluginContext } from "../plugin-runtime"
import {
  createLevelShareSquarePluginDefinition,
  parseLevelShareSquareCandidateUrl,
} from "./levelsharesquare"
import { createAcquisitionPluginRegistry } from "./registry"

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
  abbreviation: "SMB1R",
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

function lssFetch(fixtures: {
  readonly games?: unknown
  readonly search?: unknown
  readonly details?: unknown
  readonly code?: unknown
}): typeof fetch {
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
  const root = await mkdtemp(join(tmpdir(), "korri-lss-acquisition-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function plugin(fixtures: Parameters<typeof lssFetch>[0] = {}) {
  return createLevelShareSquarePluginDefinition({
    baseUrl: BASE_URL,
    webBaseUrl: BASE_URL,
    fetchImpl: lssFetch(fixtures),
  })
}

describe("Level Share Square acquisition plugin", () => {
  it("parses only Level Share Square level URLs for the configured web host", () => {
    expect(
      parseLevelShareSquareCandidateUrl(`${BASE_URL}/levels/${LEVEL_ID}`, {
        webBaseUrl: BASE_URL,
      }),
    ).toBe(LEVEL_ID)
    expect(parseLevelShareSquareCandidateUrl("not a url")).toBeNull()
    expect(
      parseLevelShareSquareCandidateUrl(`${BASE_URL}/games/${LEVEL_ID}`, {
        webBaseUrl: BASE_URL,
      }),
    ).toBeNull()
    expect(
      parseLevelShareSquareCandidateUrl(
        `https://levelsharesquare.com/levels/${LEVEL_ID}`,
        { webBaseUrl: BASE_URL },
      ),
    ).toBeNull()
  })

  it("validates the source when SMBR still advertises .lvl files", async () => {
    const result = await Effect.runPromise(
      plugin().validateSource?.({
        ...createAcquisitionPluginContext(),
        checkedAt: "2026-06-04T00:00:00.000Z",
      }) ?? Effect.die("missing validateSource"),
    )

    expect(result).toEqual({
      _tag: "HealthySource",
      sourceName: "levelsharesquare",
      checkedAt: "2026-06-04T00:00:00.000Z",
    })
  })

  it("reports a defective source when SMBR is absent from the games list", async () => {
    const error = await Effect.runPromise(
      plugin({ games: { games: [] } })
        .validateSource?.({
          ...createAcquisitionPluginContext(),
          checkedAt: "2026-06-04T00:00:00.000Z",
        })
        .pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ) ?? Effect.die("missing validateSource"),
    )

    expect(error).toMatchObject({
      reason: "defective-source",
      sourceName: "levelsharesquare",
    })
  })

  it("searches SMBR levels with artifact hints", async () => {
    const result = await Effect.runPromise(
      plugin().search?.(createAcquisitionPluginContext(), {
        query: "tropical",
      }) ?? Effect.succeed([]),
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      _tag: "SourceCandidate",
      sourceName: "levelsharesquare",
      id: LEVEL_ID,
      title: "Tropical Island Adventure!",
      url: LEVEL_URL,
      platform: "smbr",
      artifact: {
        kind: "content",
        system: "smbr",
        format: { id: "smbr-level" },
        file: { extension: "lvl" },
      },
    })
  })

  it("reports malformed search envelopes as defective source output", async () => {
    const error = await Effect.runPromise(
      plugin({ search: { unexpected: [] } })
        .search?.(createAcquisitionPluginContext(), { query: "tropical" })
        .pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ) ?? Effect.die("missing search"),
    )

    expect(error).toMatchObject({
      reason: "defective-source",
      sourceName: "levelsharesquare",
    })
  })

  it("maps details into standardized facets", async () => {
    const result = await Effect.runPromise(
      plugin().details?.(createAcquisitionPluginContext(), {
        sourceName: "levelsharesquare",
        id: LEVEL_ID,
      }) ?? Effect.die("missing details"),
    )

    expect(result).toMatchObject({
      _tag: "SourceDetails",
      sourceName: "levelsharesquare",
      id: LEVEL_ID,
      title: "Tropical Island Adventure!",
      url: LEVEL_URL,
      description: "Mario and Princess Toadstool took a vacation.",
      artifact: {
        kind: "content",
        system: "smbr",
        format: { id: "smbr-level" },
        file: { name: `${LEVEL_ID}.lvl`, extension: "lvl" },
      },
    })
    expect(result.facets?.title?.text).toBe("Tropical Island Adventure!")
    expect(result.facets?.description?.text).toBe(
      "Mario and Princess Toadstool took a vacation.",
    )
    expect(result.facets?.credits?.authors).toEqual([
      {
        name: "Elvee",
        role: "author",
        url: `${BASE_URL}/users/699e504093c85ab0cd73d54e`,
      },
    ])
    expect(result.facets?.tags).toEqual(["Traditional", "Adventure", "Themed"])
    expect(result.facets?.communityStats).toEqual({
      plays: 539,
      favourites: 2,
      rating: 5,
      raters: 4,
    })
    expect(result.facets?.media).toEqual([
      {
        kind: "image",
        role: "thumbnail",
        url: "https://cdn.levelsharesquare.com/levels/tropical.webp",
      },
    ])
  })

  it("acquires API-wrapped levelData bytes as SMBR level content without launcher or library data", async () => {
    await withTempRoot(async stagingRoot => {
      const registry = createAcquisitionPluginRegistry([plugin()])
      const acquired = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext({
            clock: { nowIso: () => "2026-06-04T00:00:00.000Z" },
          }),
          stagingRoot,
          request: { sourceName: "levelsharesquare", id: LEVEL_ID },
        }),
      )

      expect(acquired.kind).toBe("content")
      expect(acquired.system).toBe("smbr")
      expect(acquired.format.id).toBe("smbr-level")
      expect(acquired.file).toMatchObject({
        name: `${LEVEL_ID}.lvl`,
        extension: "lvl",
        mediaType: "application/json",
        sizeBytes: LEVEL_BYTES.length,
      })
      expect(acquired.facets?.title?.text).toBe("Tropical Island Adventure!")
      expect(acquired.provenance).toEqual({
        source: "levelsharesquare",
        acquiredAt: "2026-06-04T00:00:00.000Z",
        url: LEVEL_URL,
      })
      expect(acquired.externalIds).toEqual([
        { namespace: "levelsharesquare", id: LEVEL_ID },
      ])
      expect(acquired.sourceData?.["levelsharesquare.v1"]).toMatchObject({
        levelId: LEVEL_ID,
        internalGameId: 5,
        status: "Featured",
        difficulty: "Medium",
        gameVersion: "1.1",
      })
      expect(acquired).not.toHaveProperty("launchArgs")
      expect(acquired).not.toHaveProperty("libraryRecord")
      expect(acquired).not.toHaveProperty("installPath")
    })
  })

  it("reports malformed detail envelopes as defective source output", async () => {
    const error = await Effect.runPromise(
      plugin({ details: { level: null } })
        .details?.(createAcquisitionPluginContext(), {
          sourceName: "levelsharesquare",
          id: LEVEL_ID,
        })
        .pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ) ?? Effect.die("missing details"),
    )

    expect(error).toMatchObject({
      reason: "defective-source",
      sourceName: "levelsharesquare",
    })
  })

  it("omits author credits when the API has no known author", async () => {
    const details = await Effect.runPromise(
      plugin({
        details: { level: { ...tropicalLevel, author: undefined } },
      }).details?.(createAcquisitionPluginContext(), {
        sourceName: "levelsharesquare",
        id: LEVEL_ID,
      }) ?? Effect.die("missing details"),
    )

    expect(details.facets?.credits?.authors).toBeUndefined()
  })

  it("rejects missing levelData byte arrays as defective source output", async () => {
    const registry = createAcquisitionPluginRegistry([
      plugin({
        code: {
          success: true,
          extension: ".lvl",
          levelData: { type: "Buffer" },
        },
      }),
    ])

    await withTempRoot(async stagingRoot => {
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot,
          request: { sourceName: "levelsharesquare", id: LEVEL_ID },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-source",
        sourceName: "levelsharesquare",
      })
    })
  })

  it("rejects structurally invalid SMBR level JSON as defective source output", async () => {
    const registry = createAcquisitionPluginRegistry([
      plugin({
        code: {
          success: true,
          extension: ".lvl",
          levelData: {
            type: "Buffer",
            data: [...Buffer.from(JSON.stringify({ Info: {} }))],
          },
        },
      }),
    ])

    await withTempRoot(async stagingRoot => {
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot,
          request: { sourceName: "levelsharesquare", id: LEVEL_ID },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-source",
        sourceName: "levelsharesquare",
      })
    })
  })

  it("rejects malformed levelData buffers as defective source output", async () => {
    const registry = createAcquisitionPluginRegistry([
      plugin({
        code: {
          success: true,
          extension: ".lvl",
          levelData: { type: "Buffer", data: [123, 34, 98, 97, 100] },
        },
      }),
    ])

    await withTempRoot(async stagingRoot => {
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot,
          request: { sourceName: "levelsharesquare", id: LEVEL_ID },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-source",
        sourceName: "levelsharesquare",
      })
    })
  })

  it("rejects non-.lvl code endpoint extensions before staging", async () => {
    const registry = createAcquisitionPluginRegistry([
      plugin({
        code: {
          success: true,
          extension: ".json",
          levelData: { type: "Buffer", data: [...LEVEL_BYTES] },
        },
      }),
    ])

    await withTempRoot(async stagingRoot => {
      const error = await Effect.runPromise(
        acquireArtifact({
          registry,
          context: createAcquisitionPluginContext(),
          stagingRoot,
          request: { sourceName: "levelsharesquare", id: LEVEL_ID },
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ),
      )

      expect(error).toMatchObject({
        reason: "defective-source",
        sourceName: "levelsharesquare",
      })
    })
  })

  it("rejects SMBR game metadata that no longer reports .lvl files", async () => {
    const error = await Effect.runPromise(
      plugin({
        games: { games: [{ ...smbrGame, fileExtension: ".zip" }] },
      })
        .search?.(createAcquisitionPluginContext(), { query: "tropical" })
        .pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: () => undefined,
          }),
        ) ?? Effect.die("missing search"),
    )

    expect(error).toMatchObject({
      reason: "defective-source",
      sourceName: "levelsharesquare",
    })
  })
})
