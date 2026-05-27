import { afterEach, describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import {
  PeerDiscovery,
  PeerDiscoveryNoop,
  type PeerRecord,
} from "@app/peers/peer-discovery"
import {
  makePeerSourceFetcherLive,
  type PeerSourceCatalogEntry,
  PeerSourceFetcher,
  PeerSourceFetcherLive,
} from "@app/peers/peer-source-fetcher"
import { DataError } from "@shared/api/rpc/errors"
import type { GameAssetRecord } from "@shared/library/config/records/game-asset"
import type { GameAssetRole } from "@shared/library/config/records/game-asset-assignment"
import { gameAssetBlobPath } from "@shared/library/game-assets/game-assets-service"
import { LibrarySourceLayerLive } from "@shared/library/library-source-layer-live"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Cause, Effect, Exit, Layer, SubscriptionRef } from "effect"

// All list.rpc-handler tests share the same default federation layers:
// no peers (Noop) + the real fetcher (irrelevant when there are no peers).
const LocalLibraryLayer = Layer.mergeAll(
  LibrarySourceLayerLive,
  PeerDiscoveryNoop,
  PeerSourceFetcherLive,
)

import { handleListLibrary } from "./list.rpc-handler"

const tileAssetBytes = "tile-asset"
const bannerAssetBytes = "banner-asset"
const posterAssetBytes = "poster-asset"
const missingFileAssetBytes = "missing-file-asset"

const tileAssetId = assetIdForBytes(tileAssetBytes)
const bannerAssetId = assetIdForBytes(bannerAssetBytes)
const posterAssetId = assetIdForBytes(posterAssetBytes)
const missingFileAssetId = assetIdForBytes(missingFileAssetBytes)

const originalEnv = {
  libraryRoot: process.env.KORRI_LIBRARY_ROOT,
  publicApiBaseUrl: process.env.KORRI_PUBLIC_API_BASE_URL,
  xdgDataHome: process.env.XDG_DATA_HOME,
  nodeEnv: process.env.NODE_ENV,
}
const cleanups: Array<() => Promise<void>> = []

function track<T extends { cleanup: () => Promise<void> }>(lib: T): T {
  cleanups.push(lib.cleanup)
  return lib
}

afterEach(async () => {
  setOptionalEnv("KORRI_LIBRARY_ROOT", originalEnv.libraryRoot)
  setOptionalEnv("KORRI_PUBLIC_API_BASE_URL", originalEnv.publicApiBaseUrl)
  setOptionalEnv("XDG_DATA_HOME", originalEnv.xdgDataHome)
  setOptionalEnv("NODE_ENV", originalEnv.nodeEnv)
  while (cleanups.length > 0) {
    const c = cleanups.pop()
    if (c) await c()
  }
})

describe("app.library.list handler (configured-real source)", () => {
  it("returns { games } sorted by lastPlayed desc", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "snes/old.smc",
            system: "fixture",
            contentPath: "/storage/fixtures/snes/old.smc.rom",
            metadata: { name: "Old" },
            userData: { lastPlayed: new Date("2024-01-01T00:00:00.000Z") },
          },
          {
            id: "snes/new.smc",
            system: "fixture",
            contentPath: "/storage/fixtures/snes/new.smc.rom",
            metadata: { name: "New" },
            userData: { lastPlayed: new Date("2026-05-01T00:00:00.000Z") },
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )
    expect(result.games.map(g => g.metadata?.name)).toEqual(["New", "Old"])
  })

  it("returns { games: [] } for an empty ProseQL library", async () => {
    const lib = track(await withTempProseqlLibrary({ games: [] }))
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )
    expect(result.games).toEqual([])
  })

  it("tags every entry with the local server's EntrySource", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "snes/local-tagged.smc",
            system: "fixture",
            contentPath: "/storage/fixtures/snes/local-tagged.smc.rom",
            metadata: { name: "Local Tagged" },
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.KORRI_STREAM_ADVERTISE_HOST_ID = "test-host"
    process.env.HOST = "127.0.0.1"
    process.env.PORT = "3001"

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games).toHaveLength(1)
    expect(result.games[0]?.source).toEqual({
      hostId: "test-host",
      controlUrl: "http://127.0.0.1:3001",
      isLocal: true,
    })

    delete process.env.KORRI_STREAM_ADVERTISE_HOST_ID
  })

  it("derives EntrySource.controlUrl from KORRI_PUBLIC_API_BASE_URL when set", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "snes/explicit-url.smc",
            system: "fixture",
            contentPath: "/storage/fixtures/snes/explicit-url.smc.rom",
            metadata: { name: "Explicit URL" },
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.KORRI_STREAM_ADVERTISE_HOST_ID = "aka"
    process.env.KORRI_PUBLIC_API_BASE_URL = "http://192.168.1.117:3001/"

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games[0]?.source?.controlUrl).toBe(
      "http://192.168.1.117:3001",
    )

    delete process.env.KORRI_STREAM_ADVERTISE_HOST_ID
  })

  it("returns assigned tile, banner, and poster assets as absolute resolved media URLs", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "snes/art.smc",
            system: "snes",
            contentPath: "/storage/fixtures/snes/art.smc",
            metadata: { name: "Art Game" },
          },
        ],
        assets: [
          assetRecord(tileAssetId, 512, 512, tileAssetBytes),
          assetRecord(bannerAssetId, 1280, 720, bannerAssetBytes),
          assetRecord(posterAssetId, 600, 900, posterAssetBytes),
        ],
        assignments: [
          assignment("snes/art.smc", "tile", tileAssetId),
          assignment("snes/art.smc", "banner", bannerAssetId),
          assignment("snes/art.smc", "poster", posterAssetId),
        ],
        writeAssetBytes: true,
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.XDG_DATA_HOME = lib.dataRoot
    process.env.KORRI_PUBLIC_API_BASE_URL = "https://korri.example.test/control"

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games[0]?.media?.map(media => media.role)).toEqual([
      "tile",
      "banner",
      "poster",
    ])
    expect(result.games[0]?.media?.map(media => media.url)).toEqual([
      `https://korri.example.test/control/api/game-assets/${encodeURIComponent(tileAssetId)}`,
      `https://korri.example.test/control/api/game-assets/${encodeURIComponent(bannerAssetId)}`,
      `https://korri.example.test/control/api/game-assets/${encodeURIComponent(posterAssetId)}`,
    ])
    expect(result.games[0]?.media?.[0]).toMatchObject({
      assetId: tileAssetId,
      type: "image",
      width: 512,
      height: 512,
      source: { provider: "steamgriddb", id: "asset" },
    })
  })

  it("lists games with no assignments without media and keeps launch fields", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "snes/no-art.smc",
            system: "snes",
            contentPath: "/storage/fixtures/snes/no-art.smc",
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games[0]).toMatchObject({
      id: "snes/no-art.smc",
      system: "snes",
      contentPath: "/storage/fixtures/snes/no-art.smc",
    })
    expect(result.games[0]?.media).toBeUndefined()
  })

  it("omits assignments that reference a missing asset record", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [{ id: "snes/missing-asset.smc" }],
        assignments: [
          assignment(
            "snes/missing-asset.smc",
            "tile",
            "sha256:4444444444444444444444444444444444444444444444444444444444444444",
          ),
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games[0]?.media).toBeUndefined()
  })

  it("omits assignments whose asset bytes do not match their content-addressed id", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [{ id: "snes/corrupt-file.smc" }],
        assets: [assetRecord(tileAssetId, 512, 512, tileAssetBytes)],
        assignments: [assignment("snes/corrupt-file.smc", "tile", tileAssetId)],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.XDG_DATA_HOME = lib.dataRoot
    const blobPath = gameAssetBlobPath(
      { KORRI_LIBRARY_ROOT: lib.root },
      assetRecord(tileAssetId, 512, 512, tileAssetBytes),
    )
    await mkdir(dirname(blobPath), { recursive: true })
    await writeFile(blobPath, "xxxxxxxxxx")

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games[0]?.media).toBeUndefined()
  })

  it("omits assignments whose asset bytes are missing", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [{ id: "snes/missing-file.smc" }],
        assets: [
          assetRecord(missingFileAssetId, 512, 512, missingFileAssetBytes),
        ],
        assignments: [
          assignment("snes/missing-file.smc", "tile", missingFileAssetId),
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.XDG_DATA_HOME = lib.dataRoot

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games[0]?.media).toBeUndefined()
  })

  it("rejects assignment records whose key does not match gameId and role", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [{ id: "snes/bad-assignment.smc" }],
        assignments: [
          {
            id: "snes/bad-assignment.smc:banner",
            gameId: "snes/bad-assignment.smc",
            role: "tile",
            assetId: tileAssetId,
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const exit = await Effect.runPromiseExit(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(DataError)
      expect(String((error as Error).message)).toContain(
        "invalid game asset assignment id",
      )
    }
  })

  it("does not require KORRI_PUBLIC_API_BASE_URL when no assets need URLs", async () => {
    const lib = track(await withTempProseqlLibrary({ games: [] }))
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.NODE_ENV = "production"
    delete process.env.KORRI_PUBLIC_API_BASE_URL

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(result.games).toEqual([])
  })

  it("fails deterministically when server-like config omits KORRI_PUBLIC_API_BASE_URL for assigned assets", async () => {
    const lib = track(await withTempProseqlLibrary(assetUrlFixture()))
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.XDG_DATA_HOME = lib.dataRoot
    process.env.NODE_ENV = "production"
    delete process.env.KORRI_PUBLIC_API_BASE_URL

    const exit = await Effect.runPromiseExit(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(DataError)
      expect(String((error as Error).message)).toContain(
        "KORRI_PUBLIC_API_BASE_URL is required",
      )
    }
  })

  it("rejects unsafe public API base URLs", async () => {
    const lib = track(await withTempProseqlLibrary(assetUrlFixture()))
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.XDG_DATA_HOME = lib.dataRoot
    const unsafe = [
      "http://korri.example.test",
      "https://user:pass@korri.example.test",
      "https://korri.example.test?token=secret",
      "https://korri.example.test/#fragment",
      "ftp://korri.example.test",
      "https://korri.example.test/a b",
    ]

    for (const value of unsafe) {
      process.env.KORRI_PUBLIC_API_BASE_URL = value
      const exit = await Effect.runPromiseExit(
        handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBeInstanceOf(DataError)
      }
    }
  })

  it("allows http public API base URLs for loopback and private network hosts", async () => {
    const lib = track(await withTempProseqlLibrary({ games: [] }))
    process.env.KORRI_LIBRARY_ROOT = lib.root
    const accepted = [
      "http://127.0.0.1:3001",
      "http://localhost:3001",
      "http://192.168.1.117:3001",
      "http://10.20.30.40:3001",
      "http://172.16.5.1:3001",
      "http://172.31.255.254:3001",
      "http://169.254.1.1:3001",
      "http://aka.local:3001",
      "http://server.lan:3001",
    ]

    for (const value of accepted) {
      process.env.KORRI_PUBLIC_API_BASE_URL = value
      const result = await Effect.runPromise(
        handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
      )
      expect(result.games).toEqual([])
    }
  })

  it("rejects http public API base URLs for public/routable hosts", async () => {
    const lib = track(await withTempProseqlLibrary(assetUrlFixture()))
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.XDG_DATA_HOME = lib.dataRoot
    const rejected = [
      "http://korri.example.test",
      "http://8.8.8.8",
      "http://172.15.0.1", // just outside 172.16/12
      "http://172.32.0.1", // just outside 172.16/12
      "http://192.169.0.1", // not 192.168/16
    ]

    for (const value of rejected) {
      process.env.KORRI_PUBLIC_API_BASE_URL = value
      const exit = await Effect.runPromiseExit(
        handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        expect(Cause.squash(exit.cause)).toBeInstanceOf(DataError)
      }
    }
  })

  it("fails with DataError(ReadFailed) when ProseQL data is invalid", async () => {
    const lib = track(await withInvalidProseqlLibrary())
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const exit = await Effect.runPromiseExit(
      handleListLibrary({}).pipe(Effect.provide(LocalLibraryLayer)),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.squash(exit.cause)
      expect(error).toBeInstanceOf(DataError)
      if (error instanceof DataError) {
        expect(error.reason).toBe("ReadFailed")
      }
    }
  })

  it("integration: app.library.list is registered on appRpcGroup", () => {
    const tags = Array.from(appRpcGroup.requests.keys())
    expect(tags).toContain("app.library.list")
  })
})

describe("app.library.list federation (fan-out across LAN peers)", () => {
  it("unions local entries with one peer's source catalog (AE2 happy path)", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "local/native-game.rom",
            system: "fixture",
            contentPath: "/storage/fixtures/native-game.rom",
            metadata: { name: "Native Game" },
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root
    process.env.KORRI_STREAM_ADVERTISE_HOST_ID = "local-host"

    const akaPeer = {
      hostId: "aka",
      controlUrl: "http://192.168.1.117:3001",
      displayName: "aka",
      caps: ["source"],
    }
    const peerCatalog = [
      { id: "pico-8/celeste", displayName: "Celeste", streamable: true },
      {
        id: "pico-8/porklike",
        displayName: "Porklike",
        streamable: true,
      },
    ]

    const layer = federationLayerWith({
      peers: [akaPeer],
      peerCatalogs: { [akaPeer.controlUrl]: peerCatalog },
    })

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(layer)),
    )

    expect(result.games).toHaveLength(3)
    const local = result.games.find(g => g.id === "local/native-game.rom")
    const celeste = result.games.find(
      g => g.id === "pico-8/celeste" && g.source.hostId === "aka",
    )
    const porklike = result.games.find(
      g => g.id === "pico-8/porklike" && g.source.hostId === "aka",
    )
    expect(local?.source.isLocal).toBe(true)
    expect(celeste?.source.isLocal).toBe(false)
    expect(celeste?.source.controlUrl).toBe("http://192.168.1.117:3001")
    expect(porklike).toBeDefined()

    delete process.env.KORRI_STREAM_ADVERTISE_HOST_ID
  })

  it("renders same-id entries from two different peers as separate rows (AE3)", async () => {
    const lib = track(await withTempProseqlLibrary({ games: [] }))
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const akaPeer = {
      hostId: "aka",
      controlUrl: "http://aka:3001",
      displayName: "aka",
      caps: ["source"],
    }
    const soboPeer = {
      hostId: "sobo",
      controlUrl: "http://sobo:3001",
      displayName: "sobo",
      caps: ["source"],
    }
    const duplicatedCelestEntry = [
      { id: "pico-8/celeste", displayName: "Celeste", streamable: true },
    ]

    const layer = federationLayerWith({
      peers: [akaPeer, soboPeer],
      peerCatalogs: {
        [akaPeer.controlUrl]: duplicatedCelestEntry,
        [soboPeer.controlUrl]: duplicatedCelestEntry,
      },
    })

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(layer)),
    )

    expect(result.games).toHaveLength(2)
    const hosts = result.games.map(g => g.source.hostId).sort()
    expect(hosts).toEqual(["aka", "sobo"])
    // Same id but two distinct entries — structurally identified.
    expect(result.games.every(g => g.id === "pico-8/celeste")).toBe(true)
  })

  it("degrades gracefully when a peer is unreachable (R9 / AE2 partial failure)", async () => {
    const lib = track(await withTempProseqlLibrary({ games: [] }))
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const reachable: PeerRecord = {
      hostId: "reachable",
      controlUrl: "http://reachable:3001",
      displayName: "reachable",
      caps: ["source"],
    }
    const unreachable: PeerRecord = {
      hostId: "unreachable",
      controlUrl: "http://unreachable:3001",
      displayName: "unreachable",
      caps: ["source"],
    }

    const layer = federationLayerWith({
      peers: [reachable, unreachable],
      peerCatalogs: {
        [reachable.controlUrl]: [
          {
            id: "reachable/game",
            displayName: "Reachable Game",
            streamable: true,
          },
        ],
        // unreachable peer omitted from the map — the stub client
        // throws for any controlUrl without an entry, simulating
        // ECONNREFUSED.
      },
    })

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(layer)),
    )

    expect(result.games).toHaveLength(1)
    expect(result.games[0]?.id).toBe("reachable/game")
    expect(result.games[0]?.source.hostId).toBe("reachable")
  })

  it("returns only local entries when no peers have been discovered", async () => {
    const lib = track(
      await withTempProseqlLibrary({
        games: [
          {
            id: "local/solo.rom",
            system: "fixture",
            contentPath: "/storage/fixtures/solo.rom",
            metadata: { name: "Solo" },
          },
        ],
      }),
    )
    process.env.KORRI_LIBRARY_ROOT = lib.root

    const layer = federationLayerWith({ peers: [], peerCatalogs: {} })

    const result = await Effect.runPromise(
      handleListLibrary({}).pipe(Effect.provide(layer)),
    )

    expect(result.games).toHaveLength(1)
    expect(result.games[0]?.id).toBe("local/solo.rom")
    expect(result.games[0]?.source.isLocal).toBe(true)
  })
})

// -- Federation test layer ---------------------------------------------------
//
// Builds a real PeerSourceFetcher wired to a stub client factory plus a
// PeerDiscovery seeded with a fixed peer set. The stub client throws for
// any controlUrl without an entry in `peerCatalogs` — simulates an
// unreachable peer to verify graceful degradation (R9).

function federationLayerWith(options: {
  readonly peers: readonly PeerRecord[]
  readonly peerCatalogs: Readonly<
    Record<string, readonly PeerSourceCatalogEntry[]>
  >
}) {
  const PeersLayer = Layer.effect(PeerDiscovery)(
    Effect.gen(function* () {
      const peers = yield* SubscriptionRef.make<
        ReadonlyMap<string, PeerRecord>
      >(new Map(options.peers.map(p => [p.controlUrl, p] as const)))
      return { peers }
    }),
  )
  const fetcherLayer = Layer.succeed(PeerSourceFetcher)(
    makePeerSourceFetcherLive({
      createClient: controlUrl => {
        const catalog = options.peerCatalogs[controlUrl]
        return {
          listSourceGames: async () => {
            if (!catalog) {
              throw new Error(`unreachable peer: ${controlUrl}`)
            }
            return catalog
          },
        }
      },
      timeoutMs: 0,
    }),
  )
  return Layer.mergeAll(LibrarySourceLayerLive, PeersLayer, fetcherLayer)
}

type TempProseqlLibrary = {
  readonly root: string
  readonly dataRoot: string
  readonly cleanup: () => Promise<void>
}

async function withTempProseqlLibrary(options: {
  readonly games: readonly {
    readonly id: string
    readonly system?: string
    readonly contentPath?: string
    readonly metadata?: { readonly name?: string }
    readonly userData?: { readonly lastPlayed?: Date }
  }[]
  readonly assets?: readonly GameAssetRecord[]
  readonly assignments?: readonly {
    readonly id: string
    readonly gameId: string
    readonly role: GameAssetRole
    readonly assetId: string
  }[]
  readonly writeAssetBytes?: boolean
}): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-list-test-"))
  const dataRoot = await mkdtemp(join(tmpdir(), "korri-proseql-list-data-"))
  let success = false
  try {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          const repository = createLibraryRepository(db)
          for (const game of options.games) {
            yield* repository.upsertGame({
              system: "fixture",
              contentPath: `/storage/fixtures/${game.id}.rom`,
              ...game,
            })
          }
          for (const asset of options.assets ?? []) {
            yield* db["game-assets"].upsert({
              where: { id: asset.id },
              create: asset,
              update: asset,
            })
          }
          for (const item of options.assignments ?? []) {
            yield* db["game-asset-assignments"].upsert({
              where: { id: item.id },
              create: item,
              update: item,
            })
          }
          yield* Effect.promise(() => db.flush())
        }),
      ),
    )

    if (options.writeAssetBytes) {
      for (const asset of options.assets ?? []) {
        const blobPath = gameAssetBlobPath({ KORRI_LIBRARY_ROOT: root }, asset)
        await mkdir(dirname(blobPath), { recursive: true })
        await writeFile(blobPath, bytesForAsset(asset))
      }
    }

    success = true
  } finally {
    if (!success) await cleanupTempProseqlLibrary(root, dataRoot)
  }

  return {
    root,
    dataRoot,
    cleanup: () => cleanupTempProseqlLibrary(root, dataRoot),
  }
}

function assetRecord(
  id: GameAssetRecord["id"],
  width: number,
  height: number,
  bytes: string,
): GameAssetRecord {
  return {
    id,
    type: "image",
    mimeType: "image/png",
    extension: "png",
    width,
    height,
    byteSize: Buffer.byteLength(bytes),
    pixelCount: width * height,
    storage: { strategy: "content-addressed" },
    source: { provider: "steamgriddb", id: "asset" },
  }
}

function assetUrlFixture() {
  return {
    games: [{ id: "snes/base-url.smc" }],
    assets: [assetRecord(tileAssetId, 512, 512, tileAssetBytes)],
    assignments: [assignment("snes/base-url.smc", "tile", tileAssetId)],
    writeAssetBytes: true,
  }
}

function assignment(
  gameId: string,
  role: GameAssetRole,
  assetId: GameAssetRecord["id"],
) {
  return {
    id: `${gameId}:${role}`,
    gameId,
    role,
    assetId,
  }
}

function assetIdForBytes(bytes: string): GameAssetRecord["id"] {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

function bytesForAsset(asset: GameAssetRecord): string {
  switch (asset.id) {
    case tileAssetId:
      return tileAssetBytes
    case bannerAssetId:
      return bannerAssetBytes
    case posterAssetId:
      return posterAssetBytes
    case missingFileAssetId:
      return missingFileAssetBytes
    default:
      throw new Error(`unexpected asset id ${asset.id}`)
  }
}

async function withInvalidProseqlLibrary(): Promise<TempProseqlLibrary> {
  const root = await mkdtemp(join(tmpdir(), "korri-proseql-invalid-test-"))
  const dataRoot = await mkdtemp(join(tmpdir(), "korri-proseql-invalid-data-"))
  let success = false
  try {
    await mkdir(root, { recursive: true })
    await writeFile(
      join(root, "games.yaml"),
      ["bad:", "  id: 123", "_version: 1", ""].join("\n"),
      "utf8",
    )
    success = true
  } finally {
    if (!success) await cleanupTempProseqlLibrary(root, dataRoot)
  }

  return {
    root,
    dataRoot,
    cleanup: () => cleanupTempProseqlLibrary(root, dataRoot),
  }
}

async function cleanupTempProseqlLibrary(
  root: string,
  dataRoot: string,
): Promise<void> {
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
}

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
