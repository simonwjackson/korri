import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { Effect } from "effect"
import {
  createArtifactImportService,
  createProseqlArtifactRepository,
} from "./artifact-import-service"
import { artifactBlobPath } from "./artifact-store"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-artifact-import-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

async function withService<T>(
  root: string,
  fn: (context: Awaited<ReturnType<typeof openService>>) => Promise<T>,
): Promise<T> {
  const context = await openService(root)
  return await fn(context)
}

async function openService(root: string) {
  const db = await Effect.runPromise(
    Effect.scoped(
      openKorriLibraryDb({ root: join(root, "library"), writeDebounce: 1 }),
    ),
  )
  const env = {
    KORRI_LIBRARY_ROOT: join(root, "library"),
    KORRI_ARTIFACTS_ROOT: join(root, "artifacts"),
  }
  const repository = createProseqlArtifactRepository(db)
  const service = createArtifactImportService({ env, repository })
  return { db, env, service }
}

const snesBytes = Buffer.from("SNES ROM BYTES")
const smbrLevelBytes = Buffer.from('{"Info":{"Name":"Island"},"Levels":[{}]}')

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function sha1(bytes: Buffer): string {
  return createHash("sha1").update(bytes).digest("hex")
}

describe("artifact import service", () => {
  it("imports bytes as a durable content-addressed artifact", async () => {
    await withTempRoot(async root => {
      const result = await withService(root, ({ service }) =>
        service.importBytes({
          bytes: snesBytes,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
        }),
      )

      expect(result.id).toBe(`sha256:${sha256(snesBytes)}`)
      expect(result.localPath).toBe(
        artifactBlobPath(
          { KORRI_ARTIFACTS_ROOT: join(root, "artifacts") },
          result,
        ),
      )
      expect(await readFile(result.localPath ?? "missing")).toEqual(snesBytes)
    })
  })

  it("imports the same bytes twice idempotently without changing the existing record", async () => {
    await withTempRoot(async root => {
      const { service } = await openService(root)

      const first = await service.importBytes({
        bytes: snesBytes,
        kind: "content",
        system: "snes",
        format: { id: "sfc-rom" },
        file: { name: "game.sfc", extension: "sfc" },
      })
      const second = await service.importBytes({
        bytes: snesBytes,
        kind: "content",
        system: "snes",
        format: { id: "smc-rom" },
        file: { name: "game.smc", extension: "smc" },
      })

      expect(second).toEqual(first)
      expect(second.file.extension).toBe("sfc")
      expect(second.localPath).toBe(first.localPath)

      await expect(
        service.importBytes({
          bytes: snesBytes,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
          expectedDigests: { sha1: "0".repeat(40) },
        }),
      ).rejects.toThrow("expected sha1 digest does not match artifact bytes")
    })
  })

  it("re-promotes an existing artifact when the blob is missing", async () => {
    await withTempRoot(async root => {
      const { service } = await openService(root)
      const first = await service.importBytes({
        bytes: snesBytes,
        kind: "content",
        system: "snes",
        format: { id: "sfc-rom" },
        file: { name: "game.sfc", extension: "sfc" },
      })
      await rm(first.localPath ?? "missing", { force: true })

      const second = await service.importBytes({
        bytes: snesBytes,
        kind: "content",
        system: "snes",
        format: { id: "sfc-rom" },
        file: { name: "game.sfc", extension: "sfc" },
      })

      expect(second).toEqual(first)
      expect(await readFile(second.localPath ?? "missing")).toEqual(snesBytes)
    })
  })

  it("computes runtime localPath from the current artifact root", async () => {
    await withTempRoot(async root => {
      const firstContext = await openService(root)
      const first = await firstContext.service.importBytes({
        bytes: snesBytes,
        kind: "content",
        system: "snes",
        format: { id: "sfc-rom" },
        file: { name: "game.sfc", extension: "sfc" },
      })
      const secondArtifactsRoot = join(root, "other-artifacts")
      const secondRepository = createProseqlArtifactRepository(firstContext.db)
      const secondService = createArtifactImportService({
        env: {
          KORRI_LIBRARY_ROOT: join(root, "library"),
          KORRI_ARTIFACTS_ROOT: secondArtifactsRoot,
        },
        repository: secondRepository,
      })

      const second = await secondService.importBytes({
        bytes: snesBytes,
        kind: "content",
        system: "snes",
        format: { id: "sfc-rom" },
        file: { name: "game.sfc", extension: "sfc" },
      })

      expect(second.localPath).not.toBe(first.localPath)
      expect(second.localPath).toContain(secondArtifactsRoot)
      expect(await readFile(second.localPath ?? "missing")).toEqual(snesBytes)
    })
  })

  it("verifies expected digests before persisting them", async () => {
    await withTempRoot(async root => {
      const result = await withService(root, ({ service }) =>
        service.importBytes({
          bytes: snesBytes,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
          expectedDigests: {
            sha256: sha256(snesBytes),
            sha1: sha1(snesBytes),
          },
        }),
      )

      expect(result.digests).toMatchObject({
        sha256: sha256(snesBytes),
        sha1: sha1(snesBytes),
      })
    })
  })

  it("rejects unsupported expected digest algorithms", async () => {
    await withTempRoot(async root => {
      const { service } = await openService(root)

      await expect(
        service.importBytes({
          bytes: snesBytes,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
          expectedDigests: {
            sha256: sha256(snesBytes),
            crc32: "aabbccdd",
          } as never,
        }),
      ).rejects.toThrow("unsupported expected digest algorithm: crc32")
    })
  })

  it("keeps semantic format independent from file extension", async () => {
    await withTempRoot(async root => {
      const result = await withService(root, ({ service }) =>
        service.importBytes({
          bytes: smbrLevelBytes,
          kind: "content",
          system: "smbr",
          format: { id: "smbr-level" },
          file: { name: "6a1797b85a07d826fd7a5bd0.lvl", extension: "lvl" },
        }),
      )

      expect(result.system).toBe("smbr")
      expect(result.format.id).toBe("smbr-level")
      expect(result.file.extension).toBe("lvl")
    })
  })

  it("rejects expected SHA-256 mismatches without writing records", async () => {
    await withTempRoot(async root => {
      const { db, service } = await openService(root)

      await expect(
        service.importBytes({
          bytes: snesBytes,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
          expectedDigests: { sha256: "0".repeat(64) },
        }),
      ).rejects.toThrow("expected sha256 digest does not match artifact bytes")

      const records = await Effect.runPromise(
        Effect.promise(() => db.artifacts.query().runPromise),
      )
      expect(records).toEqual([])
    })
  })

  it("wraps missing import files as read failures", async () => {
    await withTempRoot(async root => {
      const { service } = await openService(root)

      await expect(
        service.importFile({
          sourcePath: join(root, "missing", "game.sfc"),
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
        }),
      ).rejects.toThrow("failed to read artifact import file")
    })
  })

  it("imports file paths through the same durable adoption path", async () => {
    await withTempRoot(async root => {
      const sourcePath = join(root, "usb", "game.sfc")
      await mkdir(join(root, "usb"), { recursive: true })
      await writeFile(sourcePath, snesBytes)

      const result = await withService(root, ({ service }) =>
        service.importFile({
          sourcePath,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
        }),
      )

      expect(result.id).toBe(`sha256:${sha256(snesBytes)}`)
      expect(await readFile(result.localPath ?? "missing")).toEqual(snesBytes)
    })
  })

  it("round-trips artifact records through ProseQL derived-key storage", async () => {
    await withTempRoot(async root => {
      const imported = await withService(root, ({ service }) =>
        service.importBytes({
          bytes: snesBytes,
          kind: "content",
          system: "snes",
          format: { id: "sfc-rom" },
          file: { name: "game.sfc", extension: "sfc" },
        }),
      )

      const reopened = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({
              root: join(root, "library"),
              writeDebounce: 1,
            })
            return yield* db.artifacts.findById(imported.id)
          }),
        ),
      )

      expect(reopened).toEqual({
        id: imported.id,
        kind: imported.kind,
        system: imported.system,
        format: imported.format,
        file: imported.file,
        digests: imported.digests,
      })
      expect("localPath" in reopened).toBe(false)
    })
  })
})
