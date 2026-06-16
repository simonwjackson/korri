import { describe, expect, it } from "bun:test"
import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BunServices } from "@effect/platform-bun"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { Effect, Exit } from "effect"
import { Command } from "effect/unstable/cli"
import { captureCliOutput } from "../test-helpers/capture-cli-output"
import { artifactCommand } from "./artifact-import-command"

async function withTempRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-artifact-cli-"))
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function parseEnvelope(stdout: string) {
  const lines = stdout.trimEnd().split("\n")
  expect(lines).toHaveLength(1)
  return JSON.parse(lines[0] ?? "{}") as {
    command: string
    exitCategory: string
    data: {
      lifecycle: { staged: boolean; durable: boolean; launched: boolean }
      artifact: { id: string; localPath: string; format: { id: string } }
      game?: { id: string; system: string; content: { artifactId: string } }
    }
  }
}

async function runArtifactCommand(root: string, args: readonly string[]) {
  const previousLibraryRoot = process.env.KORRI_LIBRARY_ROOT
  const previousArtifactsRoot = process.env.KORRI_ARTIFACTS_ROOT
  process.env.KORRI_LIBRARY_ROOT = join(root, "library")
  process.env.KORRI_ARTIFACTS_ROOT = join(root, "artifacts")
  try {
    return await captureCliOutput(() =>
      Effect.runPromise(
        Command.runWith(artifactCommand, { version: "test" })([...args]).pipe(
          Effect.provide(BunServices.layer),
        ),
      ),
    )
  } finally {
    if (previousLibraryRoot === undefined) delete process.env.KORRI_LIBRARY_ROOT
    else process.env.KORRI_LIBRARY_ROOT = previousLibraryRoot
    if (previousArtifactsRoot === undefined)
      delete process.env.KORRI_ARTIFACTS_ROOT
    else process.env.KORRI_ARTIFACTS_ROOT = previousArtifactsRoot
  }
}

const levelBytes = Buffer.from('{"Info":{"Name":"Island"},"Levels":[{}]}')

describe("artifact import CLI", () => {
  it("imports a staged artifact path and returns a durable artifact id", async () => {
    await withTempRoot(async root => {
      const stagedPath = join(root, "staged", "island.lvl")
      await mkdir(join(root, "staged"), { recursive: true })
      await writeFile(stagedPath, levelBytes)

      const result = await runArtifactCommand(root, [
        "import-staged",
        stagedPath,
        "--kind",
        "content",
        "--system",
        "smbr",
        "--format-id",
        "smbr-level",
        "--name",
        "island.lvl",
        "--extension",
        "lvl",
      ])

      expect(result.stderr).toBe("")
      expect(result.exitCode).toBe(0)
      const envelope = parseEnvelope(result.stdout)
      expect(envelope.command).toBe("import-staged")
      expect(envelope.exitCategory).toBe("success")
      expect(envelope.data.lifecycle).toEqual({
        staged: true,
        durable: true,
        launched: false,
      })
      expect(envelope.data.artifact.id).toBe(`sha256:${sha256(levelBytes)}`)
      expect(await readFile(envelope.data.artifact.localPath)).toEqual(
        levelBytes,
      )
    })
  })

  it("local-file import produces the same artifact id as staged import for identical bytes", async () => {
    await withTempRoot(async root => {
      const stagedPath = join(root, "staged.sfc")
      const localPath = join(root, "local.sfc")
      const bytes = Buffer.from("SNES ROM BYTES")
      await writeFile(stagedPath, bytes)
      await writeFile(localPath, bytes)

      const staged = await runArtifactCommand(root, [
        "import-staged",
        stagedPath,
        "--kind",
        "content",
        "--system",
        "snes",
        "--format-id",
        "sfc-rom",
        "--name",
        "staged.sfc",
        "--extension",
        "sfc",
      ])
      const local = await runArtifactCommand(root, [
        "import-file",
        localPath,
        "--kind",
        "content",
        "--system",
        "snes",
        "--format-id",
        "sfc-rom",
        "--name",
        "local.sfc",
        "--extension",
        "sfc",
      ])

      expect(parseEnvelope(local.stdout).data.artifact.id).toBe(
        parseEnvelope(staged.stdout).data.artifact.id,
      )
    })
  })

  it("can adopt imported content into an artifact-backed game record", async () => {
    await withTempRoot(async root => {
      const localPath = join(root, "f-zero.sfc")
      const bytes = Buffer.from("SNES ROM BYTES")
      await writeFile(localPath, bytes)

      const result = await runArtifactCommand(root, [
        "import-file",
        localPath,
        "--kind",
        "content",
        "--system",
        "snes",
        "--format-id",
        "sfc-rom",
        "--name",
        "f-zero.sfc",
        "--extension",
        "sfc",
        "--adopt-game",
        "--game-id",
        "snes-fzero",
        "--title",
        "F-Zero",
      ])

      const envelope = parseEnvelope(result.stdout)
      expect(envelope.data.lifecycle).toEqual({
        staged: false,
        durable: true,
        launched: false,
      })
      expect(envelope.data.game).toEqual({
        id: "snes-fzero",
        system: "snes",
        content: { artifactId: `sha256:${sha256(bytes)}` },
      })

      const persisted = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const db = yield* openKorriLibraryDb({
              root: join(root, "library"),
              writeDebounce: 1,
            })
            const repo = createLibraryRepository(db)
            return {
              storage: yield* db.storage.findById("artifact-imports"),
              entries: yield* repo.listPlayableEntries(),
            }
          }),
        ),
      )
      expect(persisted.storage.root).toBe(join(root, "artifacts"))
      expect(persisted.entries).toHaveLength(1)
      expect(persisted.entries[0]).toMatchObject({
        id: "snes-fzero",
        title: "F-Zero",
        releases: [
          {
            id: "default",
            system: "snes",
            launchable: true,
          },
        ],
      })
      expect(persisted.entries[0]?.releases[0]?.target).toEqual({
        kind: "file",
        storage: "artifact-imports",
        path: `blobs/sha256/68/${sha256(bytes)}.sfc`,
      })
    })
  })

  it("reports a missing library root as a user-actionable import failure", async () => {
    const previousLibraryRoot = process.env.KORRI_LIBRARY_ROOT
    const previousArtifactsRoot = process.env.KORRI_ARTIFACTS_ROOT
    delete process.env.KORRI_LIBRARY_ROOT
    delete process.env.KORRI_ARTIFACTS_ROOT
    try {
      const result = await captureCliOutput(() =>
        Effect.runPromise(
          Command.runWith(artifactCommand, { version: "test" })([
            "import-file",
            "/tmp/does-not-matter.sfc",
            "--kind",
            "content",
            "--system",
            "snes",
            "--format-id",
            "sfc-rom",
            "--name",
            "missing.sfc",
          ]).pipe(Effect.provide(BunServices.layer)),
        ),
      )

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("KORRI_LIBRARY_ROOT is required")
    } finally {
      if (previousLibraryRoot === undefined)
        delete process.env.KORRI_LIBRARY_ROOT
      else process.env.KORRI_LIBRARY_ROOT = previousLibraryRoot
      if (previousArtifactsRoot === undefined)
        delete process.env.KORRI_ARTIFACTS_ROOT
      else process.env.KORRI_ARTIFACTS_ROOT = previousArtifactsRoot
    }
  })

  it("reports missing staged files as user-actionable import failures", async () => {
    await withTempRoot(async root => {
      const result = await runArtifactCommand(root, [
        "import-staged",
        join(root, "missing.lvl"),
        "--kind",
        "content",
        "--system",
        "smbr",
        "--format-id",
        "smbr-level",
        "--name",
        "missing.lvl",
        "--extension",
        "lvl",
      ])

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("failed to read artifact import file")
    })
  })

  it("has no acquire-and-play command", async () => {
    const exit = await Effect.runPromiseExit(
      Command.runWith(artifactCommand, { version: "test" })([
        "acquire-and-play",
      ]).pipe(Effect.provide(BunServices.layer)),
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })
})
