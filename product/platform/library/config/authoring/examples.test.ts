import { describe, expect, it } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openKorriLibraryDb } from "@platform/library/proseql/library-db"
import { createLibraryRepository } from "@platform/library/proseql/library-repository"
import { Effect } from "effect"

const EXAMPLE_PATH = "korri-catalog-display-metadata.example.yaml"

async function withExampleLibrary<T>(
  fn: (args: {
    readonly root: string
    readonly repository: ReturnType<typeof createLibraryRepository>
  }) => Effect.Effect<T, unknown>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "korri-readable-example-"))
  try {
    const example = await readFile(EXAMPLE_PATH, "utf8")
    await writeFile(join(root, "library.yaml"), example, "utf8")
    return await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const db = yield* openKorriLibraryDb({ root, writeDebounce: 1 })
          return yield* fn({ root, repository: createLibraryRepository(db) })
        }),
      ),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("checked-in readable library example", () => {
  it("decodes, lists derived playables, and preserves release order", async () => {
    const result = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        const entries = yield* repository.listPlayableEntries()
        return { entries }
      }),
    )

    expect(result.entries.map(entry => entry.id)).toEqual([
      "downwell",
      "sonic-the-hedgehog",
      "super-mario-advance-2/super-mario-world",
      "super-mario-advance-2/mario-bros",
    ])
    expect(
      result.entries
        .find(entry => entry.id === "sonic-the-hedgehog")
        ?.releases.map(release => release.id),
    ).toEqual(["genesis", "windows-known", "steam"])
    expect(
      result.entries.find(
        entry => entry.id === "super-mario-advance-2/super-mario-world",
      )?.containedId,
    ).toBe("super-mario-world")
  })

  it("resolves representative Steam URI and ROM launches", async () => {
    const launches = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        return {
          downwell: yield* repository.resolveLaunchForPlayable("downwell"),
          sonicGenesis: yield* repository.resolveLaunchForPlayable(
            "sonic-the-hedgehog",
            { releaseId: "genesis" },
          ),
          sonicSteam: yield* repository.resolveLaunchForPlayable(
            "sonic-the-hedgehog",
            { releaseId: "steam" },
          ),
          containedGba: yield* repository.resolveLaunchForPlayable(
            "super-mario-advance-2/super-mario-world",
          ),
        }
      }),
    )

    expect(launches.downwell.spec).toEqual({
      command: "steam",
      args: ["steam://rungameid/360740"],
    })
    expect(launches.sonicSteam.spec).toEqual({
      command: "steam",
      args: ["steam://rungameid/71113"],
    })
    expect(launches.sonicGenesis.spec).toEqual({
      command: "retroarch",
      args: [
        "-L",
        "/run/current-system/sw/lib/libretro/genesis_plus_gx_libretro.so",
        "/roms/genesis/Sonic The Hedgehog.md",
      ],
    })
    expect(launches.containedGba.spec).toEqual({
      command: "retroarch",
      args: [
        "-L",
        "/run/current-system/sw/lib/libretro/mgba_libretro.so",
        "/roms/gba/Super Mario Advance 2.gba",
      ],
    })
  })

  it("rejects ambiguous and known-only release launches", async () => {
    const result = await withExampleLibrary(({ repository }) =>
      Effect.gen(function* () {
        return {
          ambiguous: yield* Effect.exit(
            repository.resolveLaunchForPlayable("sonic-the-hedgehog"),
          ),
          knownOnly: yield* Effect.exit(
            repository.resolveLaunchForPlayable("sonic-the-hedgehog", {
              releaseId: "windows-known",
            }),
          ),
        }
      }),
    )

    expect(result.ambiguous._tag).toBe("Failure")
    expect(String(result.ambiguous)).toContain("AmbiguousRelease")
    expect(result.knownOnly._tag).toBe("Failure")
    expect(String(result.knownOnly)).toContain("ReleaseNotLaunchable")
  })

  it("does not contain retired persisted-schema vocabulary", async () => {
    const example = await readFile(EXAMPLE_PATH, "utf8")
    const forbidden = [
      /\blauncher\b/i,
      /\bmodules\b/i,
      /\bgames\b/i,
      /\bconfig\.global\b/i,
      /\bprovider\b/i,
      /\bsettings\.appid\b/i,
      /\bcontentPath\b/,
      /\bmodulePath\b/,
    ]

    for (const pattern of forbidden) {
      expect(example).not.toMatch(pattern)
    }
  })
})
