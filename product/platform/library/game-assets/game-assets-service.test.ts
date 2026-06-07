import { describe, expect, it } from "bun:test"
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { korriCachePath, korriDataPath } from "@platform/config/xdg-paths"
import {
  type KorriLibraryDb,
  openKorriLibraryDb,
} from "@platform/library/proseql/library-db"
import { Effect } from "effect"

import { createCandidateCache } from "./candidate-cache"
import { createGameAssetsRepository } from "./game-assets-repository"
import {
  createGameAssetsService,
  gameAssetBlobPath,
} from "./game-assets-service"

const gameId = "nix/supertuxkart"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-game-assets-service-"))
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
    url: "https://cdn2.steamgriddb.com/grid/624901.png?token=secret#frag",
    file: "steamgriddb/nix_supertuxkart/1x1/624901.png",
    ...overrides,
  }
}

const validPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
)

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write("IHDR", 12, "ascii")
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  bytes[24] = 8
  bytes[25] = 6
  return bytes
}

async function runWithService<T>(
  root: string,
  fn: (args: {
    readonly env: ReturnType<typeof tempEnv>
    readonly service: ReturnType<typeof createGameAssetsService>
    readonly db: KorriLibraryDb
  }) => Effect.Effect<T, unknown>,
): Promise<T> {
  const env = tempEnv(root)
  return await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* openDbForTest(root)
        const repository = createGameAssetsRepository(db)
        const service = createGameAssetsService({
          env,
          candidateCache: createCandidateCache({ env }),
          repository,
          limits: {
            maxByteSize: 128,
            maxDimension: 8192,
            maxPixels: 16_777_216,
          },
        })
        yield* db.library.upsert({
          where: { id: "nix" },
          create: {
            id: "nix",
            contains: {
              supertuxkart: { title: "SuperTuxKart" },
            },
            releases: [
              {
                id: "default",
                system: "nix",
                target: "store/supertuxkart/bin/supertuxkart",
              },
            ],
          },
          update: {
            id: "nix",
            contains: {
              supertuxkart: { title: "SuperTuxKart" },
            },
            releases: [
              {
                id: "default",
                system: "nix",
                target: "store/supertuxkart/bin/supertuxkart",
              },
            ],
          },
        })
        yield* Effect.promise(() => db.flush())
        return yield* fn({ env, service, db })
      }),
    ),
  )
}

function openDbForTest(root: string) {
  return openKorriLibraryDb({ root: join(root, "library"), writeDebounce: 1 })
}

describe("game-assets service candidate cache", () => {
  it("lists SteamGridDB candidates from XDG cache without exposing local paths", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])

      const candidates = await runWithService(root, ({ service }) =>
        service.listCandidates({ gameId }),
      )

      expect(candidates).toHaveLength(1)
      expect(candidates[0]).toMatchObject({
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
      expect(candidates[0]?.candidateId).toStartWith("candidate:")
      expect(JSON.stringify(candidates[0])).not.toContain(root)
      expect(JSON.stringify(candidates[0])).not.toContain("token=secret")
    })
  })

  it("returns an empty list for missing and empty manifests", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      await expect(
        runWithService(root, ({ service }) =>
          service.listCandidates({ gameId }),
        ),
      ).resolves.toEqual([])

      await writeCandidateManifest(env, [])
      await expect(
        runWithService(root, ({ service }) =>
          service.listCandidates({ gameId }),
        ),
      ).resolves.toEqual([])
    })
  })
})

describe("game-assets service assignment", () => {
  it("promotes a valid candidate to XDG data and persists asset + assignment", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      await writeCandidateFile(
        env,
        "steamgriddb/nix_supertuxkart/1x1/624901.png",
        validPng,
      )

      const result = await runWithService(root, ({ service }) =>
        Effect.gen(function* () {
          const [candidate] = yield* service.listCandidates({ gameId })
          return yield* service.assignCandidate({
            gameId,
            role: "tile",
            candidateId: candidate?.candidateId ?? "missing",
          })
        }),
      )

      expect(result.asset.id).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(result.asset).toMatchObject({
        type: "image",
        mimeType: "image/png",
        extension: "png",
        width: 1,
        height: 1,
        byteSize: validPng.byteLength,
        pixelCount: 1,
        source: { provider: "steamgriddb", id: "624901" },
      })
      expect(result.assignment).toEqual({
        id: `${gameId}:tile`,
        gameId,
        role: "tile",
        assetId: result.asset.id,
      })

      const durablePath = gameAssetBlobPath(env, result.asset)
      expect(await readFile(durablePath)).toEqual(validPng)

      const persisted = await runWithService(root, ({ db }) =>
        Effect.all({
          assets: Effect.promise(() => db["game-assets"].query().runPromise),
          assignments: Effect.promise(
            () => db["game-asset-assignments"].query().runPromise,
          ),
        }),
      )
      expect(persisted.assets.map(asset => asset.id)).toEqual([result.asset.id])
      expect(persisted.assignments).toEqual([result.assignment])
    })
  })

  it("keeps different roles and replacing a role leaves the old durable file", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      await writeCandidateManifest(env, [
        steamGridDbEntry({
          role: "tile",
          imageId: "tile-a",
          file: "steamgriddb/tile-a.png",
        }),
        steamGridDbEntry({
          role: "banner",
          ratio: "92x43",
          dimensions: "920x430",
          imageId: "banner-a",
          file: "steamgriddb/banner-a.png",
        }),
        steamGridDbEntry({
          role: "tile",
          imageId: "tile-b",
          file: "steamgriddb/tile-b.png",
        }),
      ])
      await writeCandidateFile(env, "steamgriddb/tile-a.png", pngHeader(1, 1))
      await writeCandidateFile(env, "steamgriddb/banner-a.png", pngHeader(2, 1))
      await writeCandidateFile(env, "steamgriddb/tile-b.png", pngHeader(3, 1))

      const result = await runWithService(root, ({ service, db }) =>
        Effect.gen(function* () {
          const candidates = yield* service.listCandidates({ gameId })
          const bySource = new Map(candidates.map(c => [c.source.id, c]))
          const tileA = yield* service.assignCandidate({
            gameId,
            role: "tile",
            candidateId: bySource.get("tile-a")?.candidateId ?? "missing",
          })
          const bannerA = yield* service.assignCandidate({
            gameId,
            role: "banner",
            candidateId: bySource.get("banner-a")?.candidateId ?? "missing",
          })
          const tileB = yield* service.assignCandidate({
            gameId,
            role: "tile",
            candidateId: bySource.get("tile-b")?.candidateId ?? "missing",
          })
          const assignments = yield* Effect.promise(
            () => db["game-asset-assignments"].query().runPromise,
          )
          return { tileA, bannerA, tileB, assignments }
        }),
      )

      expect(result.assignments).toEqual(
        expect.arrayContaining([
          {
            id: `${gameId}:tile`,
            gameId,
            role: "tile",
            assetId: result.tileB.asset.id,
          },
          {
            id: `${gameId}:banner`,
            gameId,
            role: "banner",
            assetId: result.bannerA.asset.id,
          },
        ]),
      )
      expect(result.assignments).toHaveLength(2)
      expect(
        (await lstat(gameAssetBlobPath(env, result.tileA.asset))).isFile(),
      ).toBe(true)
    })
  })

  it("returns typed not-found errors for missing game or candidate without writing assignments", async () => {
    await withTempRoot(async root => {
      const missingCandidate = await runWithService(root, ({ service }) =>
        service
          .assignCandidate({
            gameId,
            role: "tile",
            candidateId: "candidate:missing",
          })
          .pipe(
            Effect.match({
              onFailure: error => error,
              onSuccess: value => value,
            }),
          ),
      )
      expect(missingCandidate).toMatchObject({ _tag: "NotFoundError" })

      const missingGame = await runWithService(root, asyncContext =>
        asyncContext.service
          .assignCandidate({
            gameId: "nix/missing",
            role: "tile",
            candidateId: "candidate:missing",
          })
          .pipe(
            Effect.match({
              onFailure: error => error,
              onSuccess: value => value,
            }),
          ),
      )
      expect(missingGame).toMatchObject({ _tag: "NotFoundError" })

      const assignments = await runWithService(root, ({ db }) =>
        Effect.promise(() => db["game-asset-assignments"].query().runPromise),
      )
      expect(assignments).toEqual([])
    })
  })

  it("rejects traversal, absolute, and symlink-escape candidate paths", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      const outside = join(root, "outside.png")
      await writeFile(outside, validPng)
      await writeCandidateFile(env, "steamgriddb/good.png", validPng)
      await mkdir(
        korriCachePath(
          env,
          "game-assets",
          "candidates",
          "steamgriddb",
          "link-dir",
        ),
        {
          recursive: true,
        },
      )
      await symlink(
        outside,
        korriCachePath(
          env,
          "game-assets",
          "candidates",
          "steamgriddb",
          "link-dir",
          "escape.png",
        ),
      )
      await writeCandidateManifest(env, [
        steamGridDbEntry({ imageId: "traversal", file: "../outside.png" }),
        steamGridDbEntry({ imageId: "absolute", file: outside }),
        steamGridDbEntry({
          imageId: "symlink",
          file: "steamgriddb/link-dir/escape.png",
        }),
      ])

      const errors = await runWithService(root, ({ service }) =>
        Effect.gen(function* () {
          const candidates = yield* service.listCandidates({ gameId })
          return yield* Effect.all(
            candidates.map(candidate =>
              service
                .assignCandidate({
                  gameId,
                  role: "tile",
                  candidateId: candidate.candidateId,
                })
                .pipe(
                  Effect.match({
                    onFailure: error => error,
                    onSuccess: value => value,
                  }),
                ),
            ),
          )
        }),
      )

      expect(errors.map(error => "_tag" in error && error._tag)).toEqual([
        "ValidationError",
        "ValidationError",
        "ValidationError",
      ])
    })
  })

  it("rejects unsupported, empty, oversized, and oversized-dimension candidate bytes before catalog writes", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      const cases = [
        ["html", Buffer.from("<html></html>")],
        ["svg", Buffer.from("<svg></svg>")],
        ["unknown", Buffer.from("not an image")],
        ["empty", Buffer.alloc(0)],
        ["oversized-bytes", Buffer.alloc(129, 0x89)],
        ["oversized-dimensions", pngHeader(9000, 1)],
      ] as const
      await writeCandidateManifest(
        env,
        cases.map(([id]) =>
          steamGridDbEntry({ imageId: id, file: `steamgriddb/${id}.png` }),
        ),
      )
      await Promise.all(
        cases.map(([id, bytes]) =>
          writeCandidateFile(env, `steamgriddb/${id}.png`, bytes),
        ),
      )

      const errors = await runWithService(root, ({ service }) =>
        Effect.gen(function* () {
          const candidates = yield* service.listCandidates({ gameId })
          return yield* Effect.all(
            candidates.map(candidate =>
              service
                .assignCandidate({
                  gameId,
                  role: "tile",
                  candidateId: candidate.candidateId,
                })
                .pipe(
                  Effect.match({
                    onFailure: error => error,
                    onSuccess: value => value,
                  }),
                ),
            ),
          )
        }),
      )
      expect(errors.map(error => "_tag" in error && error._tag)).toEqual(
        Array(cases.length).fill("ValidationError"),
      )

      const assignments = await runWithService(root, ({ db }) =>
        Effect.promise(() => db["game-asset-assignments"].query().runPromise),
      )
      expect(assignments).toEqual([])
    })
  })

  it("returns a typed data error when durable writes fail and leaves no dangling assignment", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      await writeCandidateFile(
        env,
        "steamgriddb/nix_supertuxkart/1x1/624901.png",
        validPng,
      )
      await mkdir(korriDataPath(env, "game-assets"), { recursive: true })
      await writeFile(
        korriDataPath(env, "game-assets", "blobs"),
        "not a directory",
      )

      const error = await runWithService(root, ({ service }) =>
        Effect.gen(function* () {
          const [candidate] = yield* service.listCandidates({ gameId })
          return yield* service
            .assignCandidate({
              gameId,
              role: "tile",
              candidateId: candidate?.candidateId ?? "missing",
            })
            .pipe(
              Effect.match({
                onFailure: error => error,
                onSuccess: value => value,
              }),
            )
        }),
      )
      expect(error).toMatchObject({ _tag: "DataError", reason: "WriteFailed" })

      const assignments = await runWithService(root, ({ db }) =>
        Effect.promise(() => db["game-asset-assignments"].query().runPromise),
      )
      expect(assignments).toEqual([])
    })
  })

  it("unassign deletes a dangling assignment even when the asset record is missing", async () => {
    await withTempRoot(async root => {
      const error = await runWithService(root, ({ service, db }) =>
        Effect.gen(function* () {
          yield* db["game-asset-assignments"].upsert({
            where: { id: `${gameId}:tile` },
            create: {
              id: `${gameId}:tile`,
              gameId,
              role: "tile",
              assetId:
                "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            },
            update: {
              id: `${gameId}:tile`,
              gameId,
              role: "tile",
              assetId:
                "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
            },
          })
          yield* Effect.promise(() => db.flush())
          return yield* service.unassign({ gameId, role: "tile" }).pipe(
            Effect.match({
              onFailure: error => error,
              onSuccess: value => value,
            }),
          )
        }),
      )

      expect(error).toMatchObject({ _tag: "NotFoundError" })
      const assignments = await runWithService(root, ({ db }) =>
        Effect.promise(() => db["game-asset-assignments"].query().runPromise),
      )
      expect(assignments).toEqual([])
    })
  })

  it("reopens the ProseQL library from disk with the assignment and durable file intact", async () => {
    await withTempRoot(async root => {
      const env = tempEnv(root)
      await writeCandidateManifest(env, [steamGridDbEntry()])
      await writeCandidateFile(
        env,
        "steamgriddb/nix_supertuxkart/1x1/624901.png",
        validPng,
      )

      const result = await runWithService(root, ({ service }) =>
        Effect.gen(function* () {
          const [candidate] = yield* service.listCandidates({ gameId })
          return yield* service.assignCandidate({
            gameId,
            role: "tile",
            candidateId: candidate?.candidateId ?? "missing",
          })
        }),
      )

      const reopened = await runWithService(root, ({ db }) =>
        Effect.all({
          asset: db["game-assets"].findById(result.asset.id),
          assignment: db["game-asset-assignments"].findById(`${gameId}:tile`),
        }),
      )

      expect(reopened.asset).toEqual(result.asset)
      expect(reopened.assignment).toEqual(result.assignment)
      expect(await readFile(gameAssetBlobPath(env, result.asset))).toEqual(
        validPng,
      )
    })
  })
})
