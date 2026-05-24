import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { serverRpcGroup } from "@app/api/server/rpc-group"
import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { korriCachePath } from "@shared/config/xdg-paths"
import {
  createCandidateCache,
  type GameAssetCandidate,
} from "@shared/library/game-assets/candidate-cache"
import { createGameAssetsRepository } from "@shared/library/game-assets/game-assets-repository"
import {
  createGameAssetsService,
  GameAssets,
  gameAssetBlobPath,
} from "@shared/library/game-assets/game-assets-service"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { RpcClient } from "effect/unstable/rpc"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"
import { AssignGameAssetResponse } from "./assign.rpc"
import { handleAssignGameAsset } from "./assign.rpc-handler"
import { ListGameAssetCandidatesResponse } from "./list-candidates.rpc"
import { handleListGameAssetCandidates } from "./list-candidates.rpc-handler"
import { UnassignGameAssetResponse } from "./unassign.rpc"
import { handleUnassignGameAsset } from "./unassign.rpc-handler"

const gameId = "nix/supertuxkart"
const trustedWritesEnv = "KORRI_GAME_ASSETS_TRUSTED_WRITES"

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

const originalEnv = {
  KORRI_LIBRARY_ROOT: process.env.KORRI_LIBRARY_ROOT,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  HOME: process.env.HOME,
  KORRI_GAME_ASSETS_TRUSTED_WRITES:
    process.env.KORRI_GAME_ASSETS_TRUSTED_WRITES,
}

const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  setWindowLocation(originalLocation)
})

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-game-assets-rpc-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function tempEnv(root: string) {
  return {
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"),
    HOME: join(root, "home"),
  } as const
}

function configureProcessEnv(root: string, trustedWrites = false) {
  const env = tempEnv(root)
  process.env.KORRI_LIBRARY_ROOT = join(root, "library")
  process.env.XDG_CACHE_HOME = env.XDG_CACHE_HOME
  process.env.XDG_DATA_HOME = env.XDG_DATA_HOME
  process.env.HOME = env.HOME
  if (trustedWrites) process.env[trustedWritesEnv] = "1"
  else delete process.env[trustedWritesEnv]
  return env
}

function pointWindowAt(baseUrl: string): void {
  const url = new URL(baseUrl)
  setWindowLocation({
    origin: url.origin,
    href: `${url.origin}/`,
    hostname: url.hostname,
    pathname: "/",
  })
}

function setWindowLocation(location: {
  readonly origin: string
  readonly href: string
  readonly hostname: string
  readonly pathname: string
}): void {
  Object.defineProperty(window.location, "origin", {
    value: location.origin,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "href", {
    value: location.href,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "hostname", {
    value: location.hostname,
    writable: true,
    configurable: true,
  })
  Object.defineProperty(window.location, "pathname", {
    value: location.pathname,
    writable: true,
    configurable: true,
  })
}

async function seedGame(root: string): Promise<void> {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: join(root, "library"),
          writeDebounce: 1,
        })
        yield* db.games.upsert({
          where: { id: gameId },
          create: {
            id: gameId,
            system: "nix",
            contentPath: "/nix/store/supertuxkart/bin/supertuxkart",
            metadata: { name: "SuperTuxKart" },
          },
          update: {
            id: gameId,
            system: "nix",
            contentPath: "/nix/store/supertuxkart/bin/supertuxkart",
            metadata: { name: "SuperTuxKart" },
          },
        })
        yield* Effect.promise(() => db.flush())
      }),
    ),
  )
}

async function writeCandidateManifest(
  env: ReturnType<typeof tempEnv>,
  entries: readonly Record<string, unknown>[],
): Promise<void> {
  const root = korriCachePath(env, "game-assets", "candidates")
  await mkdir(join(root, "steamgriddb"), { recursive: true })
  await writeFile(
    join(root, "steamgriddb", "manifest.jsonl"),
    `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`,
    "utf8",
  )
}

async function writeCandidateFile(
  env: ReturnType<typeof tempEnv>,
  relativePath: string,
  bytes: Buffer | string,
): Promise<void> {
  const path = korriCachePath(env, "game-assets", "candidates", relativePath)
  await mkdir(join(path, ".."), { recursive: true })
  await writeFile(path, bytes)
}

function steamGridDbEntry(overrides: Record<string, unknown> = {}) {
  return {
    gameId,
    ratio: "1x1",
    dimensions: "512x512",
    imageId: "624901",
    sgdbId: "1234",
    url: "https://user:pass@cdn2.steamgriddb.com/grid/624901.png?token=secret#frag",
    file: "steamgriddb/nix_supertuxkart/1x1/624901.png",
    ...overrides,
  }
}

function makeGameAssetsLayer(root: string) {
  const env = tempEnv(root)
  return Effect.scoped(
    Effect.gen(function* () {
      const db = yield* openKorriLibraryDb({
        root: join(root, "library"),
        writeDebounce: 1,
      })
      const service = createGameAssetsService({
        env,
        candidateCache: createCandidateCache({ env }),
        repository: createGameAssetsRepository(db),
        limits: { maxByteSize: 256 },
      })
      return Layer.succeed(GameAssets, service)
    }),
  )
}

async function runWithGameAssets<T>(
  root: string,
  effect: Effect.Effect<T, unknown, GameAssets>,
): Promise<T> {
  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const layer = yield* makeGameAssetsLayer(root)
        return yield* effect.pipe(Effect.provide(layer))
      }),
    ),
  )
}

async function candidateFor(root: string): Promise<GameAssetCandidate> {
  const response = await runWithGameAssets(
    root,
    handleListGameAssetCandidates({ gameId }),
  )
  const candidate = response.candidates[0]
  if (!candidate) throw new Error("candidate missing")
  return candidate
}

describe("game-assets RPC handlers", () => {
  it("lists candidates from XDG cache without local paths while trusted writes are disabled", async () => {
    await withTempRoot(async root => {
      const env = configureProcessEnv(root, false)
      await seedGame(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])

      const response = await runWithGameAssets(
        root,
        handleListGameAssetCandidates({ gameId, role: "tile" }),
      )

      expect(response).toBeInstanceOf(ListGameAssetCandidatesResponse)
      expect(response.candidates).toHaveLength(1)
      expect(response.candidates[0]).toMatchObject({
        candidateId: expect.stringMatching(/^candidate:[a-f0-9]{64}$/),
        gameId,
        role: "tile",
        width: 512,
        height: 512,
        source: {
          provider: "steamgriddb",
          id: "624901",
          url: "https://cdn2.steamgriddb.com/grid/624901.png",
        },
      })
      expect(JSON.stringify(response)).not.toContain(root)
      expect(JSON.stringify(response)).not.toContain("token=secret")
      expect(JSON.stringify(response)).not.toContain("user:pass")
    })
  })

  it("rejects assign and unassign with a validation error when trusted writes are disabled", async () => {
    await withTempRoot(async root => {
      const env = configureProcessEnv(root, false)
      await seedGame(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      const candidate = await candidateFor(root)

      const assignError = await runWithGameAssets(
        root,
        handleAssignGameAsset({
          gameId,
          role: "tile",
          candidateId: candidate.candidateId,
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: value => value,
          }),
        ),
      )
      const unassignError = await runWithGameAssets(
        root,
        handleUnassignGameAsset({ gameId, role: "tile" }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: value => value,
          }),
        ),
      )

      expect(assignError).toMatchObject({ _tag: "ValidationError" })
      expect(unassignError).toMatchObject({ _tag: "ValidationError" })
    })
  })

  it("assigns a candidate when trusted writes are enabled and returns durable asset metadata", async () => {
    await withTempRoot(async root => {
      const env = configureProcessEnv(root, true)
      await seedGame(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      await writeCandidateFile(
        env,
        "steamgriddb/nix_supertuxkart/1x1/624901.png",
        validPng,
      )
      const candidate = await candidateFor(root)

      const response = await runWithGameAssets(
        root,
        handleAssignGameAsset({
          gameId,
          role: "tile",
          candidateId: candidate.candidateId,
        }),
      )

      const asset = response.asset
      expect(await readFile(gameAssetBlobPath(env, asset))).toEqual(validPng)
      expect(response).toBeInstanceOf(AssignGameAssetResponse)
      expect(asset).toMatchObject({
        id: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        mimeType: "image/png",
        extension: "png",
        width: 1,
        height: 1,
        byteSize: validPng.byteLength,
        source: { provider: "steamgriddb", id: "624901" },
      })
      expect(response.assignment).toEqual({
        id: `${gameId}:tile`,
        gameId,
        role: "tile",
        assetId: asset.id,
      })
      expect(JSON.stringify(response)).not.toContain(root)
    })
  })

  it("unassigns an active role without deleting the durable file", async () => {
    await withTempRoot(async root => {
      const env = configureProcessEnv(root, true)
      await seedGame(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      await writeCandidateFile(
        env,
        "steamgriddb/nix_supertuxkart/1x1/624901.png",
        validPng,
      )
      const candidate = await candidateFor(root)

      const assigned = await runWithGameAssets(
        root,
        handleAssignGameAsset({
          gameId,
          role: "tile",
          candidateId: candidate.candidateId,
        }),
      )
      const durablePath = gameAssetBlobPath(env, assigned.asset)
      const unassigned = await runWithGameAssets(
        root,
        handleUnassignGameAsset({ gameId, role: "tile" }),
      )

      expect(unassigned).toBeInstanceOf(UnassignGameAssetResponse)
      expect(unassigned.assignment).toEqual(assigned.assignment)
      expect(unassigned.asset).toEqual(assigned.asset)
      expect(await readFile(durablePath)).toEqual(validPng)

      const assignments = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({
              root: join(root, "library"),
              writeDebounce: 1,
            })
            return yield* Effect.promise(
              () => db.gameAssetAssignments.query().runPromise,
            )
          }),
        ),
      )
      expect(assignments).toEqual([])
    })
  })

  it("returns not-found for missing games, candidates, and active assignments", async () => {
    await withTempRoot(async root => {
      configureProcessEnv(root, true)
      await seedGame(root)

      const missingCandidate = await runWithGameAssets(
        root,
        handleAssignGameAsset({
          gameId,
          role: "tile",
          candidateId:
            "candidate:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: value => value,
          }),
        ),
      )
      const missingGame = await runWithGameAssets(
        root,
        handleAssignGameAsset({
          gameId: "nix/missing",
          role: "tile",
          candidateId:
            "candidate:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: value => value,
          }),
        ),
      )
      const missingAssignment = await runWithGameAssets(
        root,
        handleUnassignGameAsset({ gameId, role: "tile" }).pipe(
          Effect.match({
            onFailure: error => error,
            onSuccess: value => value,
          }),
        ),
      )

      expect(missingCandidate).toMatchObject({ _tag: "NotFoundError" })
      expect(missingGame).toMatchObject({ _tag: "NotFoundError" })
      expect(missingAssignment).toMatchObject({ _tag: "NotFoundError" })
    })
  })

  it("rejects invalid roles, raw paths, raw URLs, and oversized payload strings", async () => {
    await withTempRoot(async root => {
      configureProcessEnv(root, true)
      await seedGame(root)

      const invalidPayloads = [
        {
          gameId,
          role: "boxart",
          candidateId:
            "candidate:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
        { gameId, role: "tile", candidateId: "/tmp/local.png" },
        { gameId, role: "tile", candidateId: "https://example.test/asset.png" },
        {
          gameId: "x".repeat(257),
          role: "tile",
          candidateId:
            "candidate:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      ] as const

      const results = await runWithGameAssets(
        root,
        Effect.all(
          invalidPayloads.map(payload =>
            handleAssignGameAsset(payload as never).pipe(
              Effect.match({
                onFailure: error => error,
                onSuccess: value => value,
              }),
            ),
          ),
        ),
      )

      expect(results.map(result => "_tag" in result && result._tag)).toEqual([
        "ValidationError",
        "ValidationError",
        "ValidationError",
        "ValidationError",
      ])
    })
  })

  it("registers game-assets RPC tags on app and server groups", () => {
    const appTags = Array.from(appRpcGroup.requests.keys())
    const serverTags = Array.from(serverRpcGroup.requests.keys())

    for (const tag of [
      "app.gameAssets.candidates.list",
      "app.gameAssets.assign",
      "app.gameAssets.unassign",
    ]) {
      expect(appTags).toContain(tag)
      expect(serverTags).toContain(tag)
    }
  })

  it("roundtrips candidate listing through the real RPC server with Schema.Class responses", async () => {
    await withTempRoot(async root => {
      const env = configureProcessEnv(root, false)
      await seedGame(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      await using server = await withRpcServer()
      pointWindowAt(server.url)
      const clientLayer = RpcClient.layerProtocolHttp({
        url: "",
        transformClient: client =>
          HttpClient.mapRequest(
            client,
            HttpClientRequest.prependUrl(server.rpcUrl),
          ),
      }).pipe(
        Layer.provide(BatchJsonSerializationLive),
        Layer.provide(FetchHttpClient.layer),
      )

      const response = await Effect.runPromise(
        Effect.scoped(
          RpcClient.make(appRpcGroup).pipe(
            Effect.flatMap(client =>
              client["app.gameAssets.candidates.list"]({
                gameId,
                role: "tile",
              }),
            ),
            Effect.provide(clientLayer),
          ),
        ),
      )

      expect(response).toBeInstanceOf(ListGameAssetCandidatesResponse)
      expect(response.candidates).toHaveLength(1)
      expect(response.candidates[0]?.candidateId).toStartWith("candidate:")
    })
  })
})
