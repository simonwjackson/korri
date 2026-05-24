import { afterEach, describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { appRpcGroup } from "@app/api/app-rpc-group"
import { createHonoApp } from "@app/api/hono-app"
import { BatchJsonSerializationLive } from "@shared/api/rpc/serialization"
import { korriCachePath } from "@shared/config/xdg-paths"
import type { GameAssetRecord } from "@shared/library/config/records/game-asset"
import type { GameAssetAssignmentRecord } from "@shared/library/config/records/game-asset-assignment"
import { gameAssetBlobPath } from "@shared/library/game-assets/game-assets-service"
import { openKorriLibraryDb } from "@shared/library/proseql/library-db"
import { createLibraryRepository } from "@shared/library/proseql/library-repository"
import { Effect, Layer } from "effect"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpClient from "effect/unstable/http/HttpClient"
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest"
import { RpcClient } from "effect/unstable/rpc"
import { withRpcServer } from "../../../../../tools/testing/library/with-rpc-server"

const REPO_ROOT = resolve(import.meta.dir, "../../../../..")
const FAKE_GAME = join(REPO_ROOT, "tools", "testing", "fake-game.sh")

const gameWithAssetId = "snes/asset-game.smc"
const gameWithoutAssetsId = "snes/plain-game.smc"

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

const originalEnv = {
  HOME: process.env.HOME,
  KORRI_GAME_ASSETS_TRUSTED_WRITES:
    process.env.KORRI_GAME_ASSETS_TRUSTED_WRITES,
  KORRI_GAME_STREAM_INTENT_PATH: process.env.KORRI_GAME_STREAM_INTENT_PATH,
  KORRI_LIBRARY_ROOT: process.env.KORRI_LIBRARY_ROOT,
  KORRI_PUBLIC_API_BASE_URL: process.env.KORRI_PUBLIC_API_BASE_URL,
  KORRI_STREAM_CONTROL_ENABLED: process.env.KORRI_STREAM_CONTROL_ENABLED,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR,
}

const originalLocation = {
  origin: window.location.origin,
  href: window.location.href,
  hostname: window.location.hostname,
  pathname: window.location.pathname,
}

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const [key, value] of Object.entries(originalEnv)) {
    setOptionalEnv(key, value)
  }
  setWindowLocation(originalLocation)

  while (cleanups.length > 0) {
    const cleanup = cleanups.pop()
    if (cleanup) await cleanup()
  }
})

describe("game-assets end-to-end integration", () => {
  it("promotes a cache candidate, resolves a library URL, serves bytes, persists after reopen, and leaves assetless launch/stream flows usable", async () => {
    const root = await mkdtemp(join(tmpdir(), "korri-game-assets-e2e-"))
    cleanups.push(() => rm(root, { recursive: true, force: true }))
    const env = configureTempEnv(root)

    await seedLibrary(root)
    await seedCandidate(env)

    await using server = await withRpcServer({ fetch: createHonoApp().fetch })
    pointWindowAt(server.url)
    process.env.KORRI_PUBLIC_API_BASE_URL = server.url

    const candidates = await listCandidates(server.rpcUrl)
    const candidate = candidates.candidates[0]
    if (!candidate) throw new Error("expected seeded game-asset candidate")
    expect(candidate).toMatchObject({
      gameId: gameWithAssetId,
      role: "tile",
      source: {
        provider: "steamgriddb",
        id: "624901",
        url: "https://cdn2.steamgriddb.com/grid/624901.png",
      },
    })

    const assigned = await assignCandidate(server.rpcUrl, candidate.candidateId)
    expect(assigned.assignment).toEqual({
      id: `${gameWithAssetId}:tile`,
      gameId: gameWithAssetId,
      role: "tile",
      assetId: assigned.asset.id,
    })

    const durablePath = gameAssetBlobPath(env, assigned.asset)
    expect(await readFile(durablePath)).toEqual(validPng)

    const listed = await listLibrary(server.rpcUrl)
    const listedGame = gameById(listed.games, gameWithAssetId)
    const resolvedMedia = listedGame.media?.[0]
    expect(resolvedMedia).toMatchObject({
      role: "tile",
      type: "image",
      assetId: assigned.asset.id,
      url: `${server.url}/api/game-assets/${encodeURIComponent(assigned.asset.id)}`,
    })

    const imageResponse = await fetch(resolvedMedia?.url ?? "")
    expect(imageResponse.status).toBe(200)
    expect(imageResponse.headers.get("content-type")).toBe("image/png")
    expect(Buffer.from(await imageResponse.arrayBuffer())).toEqual(validPng)

    const plainGame = gameById(listed.games, gameWithoutAssetsId)
    expect(plainGame.media).toBeUndefined()
    await expectAssetlessLaunchAndStreamFlows(server.rpcUrl, root)

    const catalog = await readCatalog(root)
    expect(catalog.assets).toContainEqual(assigned.asset)
    expect(catalog.assignments).toContainEqual(assigned.assignment)
    expect(
      catalog.assignments.every(assignment =>
        catalog.assets.some(asset => asset.id === assignment.assetId),
      ),
    ).toBe(true)
    expect(
      catalog.assignments.every(assignment =>
        [gameWithAssetId, gameWithoutAssetsId].includes(assignment.gameId),
      ),
    ).toBe(true)
    expect(await readFile(durablePath)).toEqual(validPng)

    const listedAfterReopen = await listLibrary(server.rpcUrl)
    const reopenedMedia = gameById(listedAfterReopen.games, gameWithAssetId)
      .media?.[0]
    expect(reopenedMedia?.url).toBe(resolvedMedia?.url)
    const reopenedImageResponse = await fetch(reopenedMedia?.url ?? "")
    expect(reopenedImageResponse.status).toBe(200)
    expect(Buffer.from(await reopenedImageResponse.arrayBuffer())).toEqual(
      validPng,
    )
  })
})

function configureTempEnv(root: string) {
  const env = {
    HOME: join(root, "home"),
    XDG_CACHE_HOME: join(root, "cache"),
    XDG_DATA_HOME: join(root, "data"),
  } as const

  process.env.HOME = env.HOME
  process.env.KORRI_GAME_ASSETS_TRUSTED_WRITES = "1"
  process.env.KORRI_LIBRARY_ROOT = join(root, "library")
  process.env.KORRI_STREAM_CONTROL_ENABLED = "1"
  process.env.KORRI_GAME_STREAM_INTENT_PATH = join(
    root,
    "runtime",
    "next-launch.json",
  )
  process.env.XDG_CACHE_HOME = env.XDG_CACHE_HOME
  process.env.XDG_DATA_HOME = env.XDG_DATA_HOME
  delete process.env.XDG_RUNTIME_DIR

  return env
}

async function seedLibrary(root: string): Promise<void> {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: join(root, "library"),
          writeDebounce: 1,
        })
        const repository = createLibraryRepository(db)
        yield* repository.upsertSystem({
          id: "snes",
          launcher: "fake-game",
        })
        yield* repository.upsertLauncher({
          id: "fake-game",
          command: FAKE_GAME,
          args: ["{contentPath}"],
          systems: ["snes"],
        })
        yield* repository.upsertGame({
          id: gameWithAssetId,
          system: "snes",
          contentPath: "/storage/roms/snes/asset-game.smc",
          metadata: { name: "Asset Game" },
        })
        yield* repository.upsertGame({
          id: gameWithoutAssetsId,
          system: "snes",
          contentPath: "/storage/roms/snes/plain-game.smc",
          metadata: { name: "Plain Game" },
        })
        yield* Effect.promise(() => db.flush())
      }),
    ),
  )
}

async function seedCandidate(env: {
  readonly XDG_CACHE_HOME: string
  readonly XDG_DATA_HOME: string
  readonly HOME: string
}): Promise<void> {
  const candidatesRoot = korriCachePath(env, "game-assets", "candidates")
  const relativeFile = "steamgriddb/snes_asset-game/1x1/624901.png"
  const filePath = join(candidatesRoot, relativeFile)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, validPng)
  await writeFile(
    join(candidatesRoot, "steamgriddb", "manifest.jsonl"),
    `${JSON.stringify({
      gameId: gameWithAssetId,
      ratio: "1x1",
      dimensions: "512x512",
      imageId: "624901",
      sgdbId: "1234",
      url: "https://user:pass@cdn2.steamgriddb.com/grid/624901.png?token=secret#frag",
      file: relativeFile,
    })}\n`,
    "utf8",
  )
}

function rpcClientLayer(rpcUrl: string) {
  return RpcClient.layerProtocolHttp({
    url: "",
    transformClient: client =>
      HttpClient.mapRequest(client, HttpClientRequest.prependUrl(rpcUrl)),
  }).pipe(
    Layer.provide(BatchJsonSerializationLive),
    Layer.provide(FetchHttpClient.layer),
  )
}

async function listCandidates(rpcUrl: string) {
  return await Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client =>
          client["app.gameAssets.candidates.list"]({
            gameId: gameWithAssetId,
            role: "tile",
          }),
        ),
        Effect.provide(rpcClientLayer(rpcUrl)),
      ),
    ),
  )
}

async function assignCandidate(rpcUrl: string, candidateId: string) {
  return await Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client =>
          client["app.gameAssets.assign"]({
            gameId: gameWithAssetId,
            role: "tile",
            candidateId,
          }),
        ),
        Effect.provide(rpcClientLayer(rpcUrl)),
      ),
    ),
  )
}

async function listLibrary(rpcUrl: string) {
  return await Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client => client["app.library.list"]({})),
        Effect.provide(rpcClientLayer(rpcUrl)),
      ),
    ),
  )
}

async function launchGame(rpcUrl: string) {
  return await Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client =>
          client["app.library.launch"]({ id: gameWithoutAssetsId }),
        ),
        Effect.provide(rpcClientLayer(rpcUrl)),
      ),
    ),
  )
}

async function prepareStream(rpcUrl: string) {
  return await Effect.runPromise(
    Effect.scoped(
      RpcClient.make(appRpcGroup).pipe(
        Effect.flatMap(client =>
          client["app.stream.prepare"]({ id: gameWithoutAssetsId }),
        ),
        Effect.provide(rpcClientLayer(rpcUrl)),
      ),
    ),
  )
}

function gameById<Games extends readonly { readonly id: string }[]>(
  games: Games,
  id: string,
): Games[number] {
  const game = games.find(item => item.id === id)
  if (!game) throw new Error(`missing game ${id}`)
  return game
}

async function expectAssetlessLaunchAndStreamFlows(
  rpcUrl: string,
  root: string,
): Promise<void> {
  const launch = await launchGame(rpcUrl)
  expect(launch).toEqual({ status: "launched" })

  const stream = await prepareStream(rpcUrl)
  expect(stream).toMatchObject({
    status: "prepared",
    gameId: gameWithoutAssetsId,
    intentPath: join(root, "runtime", "next-launch.json"),
  })
}

async function readCatalog(root: string): Promise<{
  readonly assets: readonly GameAssetRecord[]
  readonly assignments: readonly GameAssetAssignmentRecord[]
}> {
  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openKorriLibraryDb({
          root: join(root, "library"),
          writeDebounce: 1,
        })
        const assets = yield* Effect.promise(
          () => db.gameAssets.query().runPromise,
        )
        const assignments = yield* Effect.promise(
          () => db.gameAssetAssignments.query().runPromise,
        )
        return {
          assets: assets as readonly GameAssetRecord[],
          assignments: assignments as readonly GameAssetAssignmentRecord[],
        }
      }),
    ),
  )
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

function setOptionalEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}
