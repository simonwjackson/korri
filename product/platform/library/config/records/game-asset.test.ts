import { describe, expect, it } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { Effect } from "effect"

import { decodeGameAssetRecord } from "./game-asset"
import { decodeGameAssetAssignmentRecord } from "./game-asset-assignment"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-game-assets-schema-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const assetId =
  "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

const durableAsset = {
  id: assetId,
  type: "image",
  mimeType: "image/png",
  extension: "png",
  width: 512,
  height: 512,
  byteSize: 184233,
  pixelCount: 262144,
  storage: {
    strategy: "content-addressed",
  },
  source: {
    provider: "steamgriddb",
    id: "624901",
  },
} as const

describe("GameAssetRecord schema", () => {
  it("decodes a durable image asset with SteamGridDB provenance", () => {
    expect(decodeGameAssetRecord(durableAsset)).toEqual(durableAsset)
  })

  it("rejects unsupported MIME types", () => {
    expect(() =>
      decodeGameAssetRecord({
        ...durableAsset,
        mimeType: "image/svg+xml",
      }),
    ).toThrow()
  })

  it("rejects unsupported extensions", () => {
    expect(() =>
      decodeGameAssetRecord({
        ...durableAsset,
        extension: "svg",
      }),
    ).toThrow()
  })

  it("rejects impossible decoded dimensions", () => {
    expect(() =>
      decodeGameAssetRecord({
        ...durableAsset,
        width: 0,
      }),
    ).toThrow()
  })

  it("rejects inconsistent pixel counts", () => {
    expect(() =>
      decodeGameAssetRecord({
        ...durableAsset,
        pixelCount: 1,
      }),
    ).toThrow()
  })

  it("rejects unsafe storage metadata", () => {
    expect(() =>
      decodeGameAssetRecord({
        ...durableAsset,
        storage: {
          strategy: "content-addressed",
          path: "/tmp/asset.png",
        },
      }),
    ).toThrow()
  })

  it("rejects invalid content-addressed asset ids", () => {
    expect(() =>
      decodeGameAssetRecord({
        ...durableAsset,
        id: "sha256:not-a-digest",
      }),
    ).toThrow()
  })
})

describe("GameAssetAssignmentRecord schema", () => {
  it("decodes a normalized game-to-role assignment", () => {
    expect(
      decodeGameAssetAssignmentRecord({
        id: `nix/supertuxkart:tile`,
        gameId: "nix/supertuxkart",
        role: "tile",
        assetId,
      }),
    ).toEqual({
      id: `nix/supertuxkart:tile`,
      gameId: "nix/supertuxkart",
      role: "tile",
      assetId,
    })
  })

  it("rejects unknown roles", () => {
    expect(() =>
      decodeGameAssetAssignmentRecord({
        id: `nix/supertuxkart:thumbnail`,
        gameId: "nix/supertuxkart",
        role: "thumbnail",
        assetId,
      }),
    ).toThrow()
  })
})

describe("game-assets ProseQL collections", () => {
  it("opens and queries game-assets and game-asset-assignments YAML", async () => {
    await withTempRoot(async root => {
      await mkdir(root, { recursive: true })
      await writeFile(
        join(root, "library.yaml"),
        [
          "games:",
          "  nix/supertuxkart:",
          "    system: nix",
          "    contentPath: /nix/store/supertuxkart/bin/supertuxkart",
          "game-assets:",
          `  ${assetId}:`,
          "    type: image",
          "    mimeType: image/png",
          "    extension: png",
          "    width: 512",
          "    height: 512",
          "    byteSize: 184233",
          "    pixelCount: 262144",
          "    storage:",
          "      strategy: content-addressed",
          "    source:",
          "      provider: steamgriddb",
          '      id: "624901"',
          "game-asset-assignments:",
          "  nix/supertuxkart:tile:",
          "    gameId: nix/supertuxkart",
          "    role: tile",
          `    assetId: ${assetId}`,
          "",
        ].join("\n"),
        "utf8",
      )

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
            return {
              assets: yield* Effect.promise(
                () => db["game-assets"].query().runPromise,
              ),
              assignments: yield* Effect.promise(
                () => db["game-asset-assignments"].query().runPromise,
              ),
            }
          }),
        ),
      )

      expect(result.assets).toHaveLength(1)
      expect(result.assets[0]?.id).toBe(assetId)
      expect(result.assignments).toEqual([
        {
          id: "nix/supertuxkart:tile",
          gameId: "nix/supertuxkart",
          role: "tile",
          assetId,
        },
      ])
    })
  })
})
