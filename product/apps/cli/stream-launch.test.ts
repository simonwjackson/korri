import { describe, expect, it } from "bun:test"
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { GameRecord } from "@platform/fixtures/games/game"
import type { LaunchArtifacts } from "@platform/library/launch-artifacts"
import type { LaunchSpec } from "@platform/library/launcher"
import {
  LibraryError,
  LibrarySource,
  type LibrarySourceService,
} from "@platform/library/library-services"
import { LibrarySourceLayerLive } from "@platform/library/library-source-layer-live"
import { Effect } from "effect"
import { withTempProseqlLibrary } from "../../../tools/testing/library/with-temp-proseql-library"
import {
  createFileGameStreamLaunchIntentStore,
  decodeLaunchIntent,
} from "../../services/device/game-stream-launch-intent"
import { createStaticGamePicker } from "./game-picker"
import {
  prepareStreamLaunch,
  prepareStreamLaunchForGame,
  runStreamLaunchCommand,
} from "./stream-launch"

const game: GameRecord = {
  id: "snes/f-zero.smc",
  system: "fixture",
  contentPath: "/storage/fixtures/snes/f-zero.smc.rom",
  metadata: { name: "F-Zero" },
}
const launchSpec: LaunchSpec = { command: "/bin/echo", args: ["race"] }

async function withArtifactRoot<T>(fn: (root: string) => Promise<T>) {
  const parent = await mkdtemp(join(tmpdir(), "korri-cli-stream-artifacts-"))
  const root = join(parent, "game-launch")
  await mkdir(root, { recursive: true })
  await writeFile(join(root, "retroarch.cfg"), "temporary config")
  try {
    return await fn(root)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
}

async function expectArtifactRootRemoved(root: string) {
  await expect(readFile(join(root, "retroarch.cfg"), "utf8")).rejects.toThrow()
}

describe("runStreamLaunchCommand", () => {
  it("prints the next step after preparing a known game", async () => {
    const intentPath = await tempIntentPath()
    const output: string[] = []
    const exitCode = await runStreamLaunchCommand({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      intentPath,
      output: line => output.push(line),
      errorOutput: line => output.push(line),
    })

    expect(exitCode).toBe(0)
    expect(output.join("\n")).toContain(
      "Prepared F-Zero (snes/f-zero.smc) for Korri Stream",
    )
    expect(output.join("\n")).toContain("connect to the Korri Stream app")
    expect(output.join("\n")).toContain(intentPath)
  })

  it("prints categorized failures without writing an intent", async () => {
    const intentPath = await tempIntentPath()
    const errors: string[] = []
    const exitCode = await runStreamLaunchCommand({
      gameId: "missing",
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      errorOutput: line => errors.push(line),
    })

    expect(exitCode).toBe(3)
    expect(errors.join("\n")).toContain("No game exists with id missing")
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("maps usage, config, prepare, and cancellation failures to stable exit codes", async () => {
    const intentPath = await tempIntentPath()
    const base = {
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      errorOutput: () => undefined,
    }

    await expect(
      runStreamLaunchCommand({ ...base, gameId: "   " }),
    ).resolves.toBe(2)
    await expect(
      runStreamLaunchCommand({
        ...base,
        gameId: game.id,
        librarySource: librarySource({ games: [game], launchSpecs: new Map() }),
      }),
    ).resolves.toBe(5)

    const untrustedDir = await mkdtemp(join(tmpdir(), "korri-cli-exit-code-"))
    await chmod(untrustedDir, 0o755)
    await expect(
      runStreamLaunchCommand({
        ...base,
        gameId: game.id,
        intentStore: createFileGameStreamLaunchIntentStore(
          join(untrustedDir, "next-launch.json"),
        ),
      }),
    ).resolves.toBe(6)

    await expect(
      runStreamLaunchCommand({
        ...base,
        gamePicker: async () => undefined,
        stdinIsTty: true,
      }),
    ).resolves.toBe(130)
  })

  it("uses the live library source configuration with a temp ProseQL library", async () => {
    await using library = await withTempProseqlLibrary({
      systems: [{ id: game.system, apps: [{ id: "echo" }] }],
      launchers: [
        {
          id: "echo",
          command: "/bin/echo",
          args: ["{contentPath}"],
          systems: [game.system],
        },
      ],
      games: [{ ...game, contentPath: "content.smc" }],
    })
    const previousRoot = process.env.KORRI_LIBRARY_ROOT
    const previousConfigRoots = process.env.KORRI_CONFIG_ROOTS
    const previousSource = process.env.KORRI_LIBRARY_SOURCE
    process.env.KORRI_LIBRARY_ROOT = library.root
    process.env.KORRI_CONFIG_ROOTS = library.root
    process.env.KORRI_LIBRARY_SOURCE = "proseql"
    try {
      const source = await Effect.runPromise(
        Effect.gen(function* () {
          return yield* LibrarySource
        }).pipe(Effect.provide(LibrarySourceLayerLive)),
      )
      const intentPath = await tempIntentPath()
      const output: string[] = []
      const exitCode = await runStreamLaunchCommand({
        gameId: game.id,
        librarySource: source,
        intentStore: createFileGameStreamLaunchIntentStore(intentPath),
        output: line => output.push(line),
      })

      expect(exitCode).toBe(0)
      const intent = decodeLaunchIntent(
        JSON.parse(await readFile(intentPath, "utf8")) as unknown,
      )
      expect(intent.launch).toEqual({
        command: "/bin/echo",
        args: ["/content.smc"],
      })
      expect(output.join("\n")).toContain("Korri Stream")
    } finally {
      if (previousRoot === undefined) delete process.env.KORRI_LIBRARY_ROOT
      else process.env.KORRI_LIBRARY_ROOT = previousRoot
      if (previousConfigRoots === undefined)
        delete process.env.KORRI_CONFIG_ROOTS
      else process.env.KORRI_CONFIG_ROOTS = previousConfigRoots
      if (previousSource === undefined) delete process.env.KORRI_LIBRARY_SOURCE
      else process.env.KORRI_LIBRARY_SOURCE = previousSource
    }
  })
})

describe("prepareStreamLaunch", () => {
  it("prepares the selected game from the interactive picker", async () => {
    const intentPath = await tempIntentPath()
    const otherGame: GameRecord = {
      id: "snes/other.smc",
      system: "fixture",
      contentPath: "/storage/fixtures/snes/other.smc.rom",
      metadata: { name: "Other" },
    }
    const result = await prepareStreamLaunch({
      librarySource: librarySource({
        games: [otherGame, game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      gamePicker: createStaticGamePicker(game.id),
      stdinIsTty: true,
    })

    expect(result.status).toBe("prepared")
    const intent = decodeLaunchIntent(
      JSON.parse(await readFile(intentPath, "utf8")) as unknown,
    )
    expect(intent.launch).toEqual(launchSpec)
  })

  it("reports whitespace-only game ids as usage failures", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunch({
      gameId: "   ",
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({ status: "failed", category: "usage" })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("does not invoke the picker when an explicit game id is supplied", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunch({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      gamePicker: async () => {
        throw new Error("picker should not run")
      },
      stdinIsTty: false,
    })

    expect(result.status).toBe("prepared")
  })

  it("fails without writing an intent when no terminal is available", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunch({
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      stdinIsTty: false,
    })

    expect(result).toMatchObject({ status: "failed", category: "usage" })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("fails without writing an intent when the configured library is empty", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunch({
      librarySource: librarySource({ games: [], launchSpecs: new Map() }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      gamePicker: createStaticGamePicker(game.id),
      stdinIsTty: true,
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "library-config",
    })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("treats picker cancellation as a no-write cancellation", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunch({
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      gamePicker: async () => undefined,
      stdinIsTty: true,
    })

    expect(result).toMatchObject({ status: "failed", category: "cancelled" })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("converts picker failures to prepare-failed without writing an intent", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunch({
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      gamePicker: async () => {
        throw new Error("terminal unavailable")
      },
      stdinIsTty: true,
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "prepare-failed",
      message: "Interactive game selection failed",
      diagnostic: "terminal unavailable",
    })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })
})

describe("prepareStreamLaunchForGame", () => {
  it("writes a foreground launch intent with resolved wrapper policy for a known game id", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
        launchCompanions: new Map([
          [game.id, { "@fixture:frame": { enable: false } }],
        ]),
        artifacts: new Map([
          [
            game.id,
            {
              root: "/tmp/korri-launch-artifacts/snes",
              paths: {
                contentPath: "/tmp/korri-launch-artifacts/snes/f-zero.smc",
              },
            },
          ],
        ]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result.status).toBe("prepared")
    if (result.status !== "prepared") throw new Error("expected prepared")
    expect(result.displayName).toBe("F-Zero")

    const intent = decodeLaunchIntent(
      JSON.parse(await readFile(intentPath, "utf8")) as unknown,
    )
    expect(intent.lifecycle).toBe("foreground")
    expect(intent.launch).toEqual(launchSpec)
    expect(intent.launchCompanions).toEqual({
      "@fixture:frame": { enable: false },
    })
    expect(intent.artifacts).toEqual({
      root: "/tmp/korri-launch-artifacts/snes",
      paths: { contentPath: "/tmp/korri-launch-artifacts/snes/f-zero.smc" },
    })
  })

  it("writes provider-qualified metadata for resolved Steam plugin launches", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
        launchMetadata: new Map([[game.id, { appProviderId: "@korri:steam" }]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result.status).toBe("prepared")
    const raw = JSON.parse(await readFile(intentPath, "utf8")) as Record<
      string,
      unknown
    >
    const intent = decodeLaunchIntent(raw)
    expect(intent.launchMetadata).toEqual({ appProviderId: "@korri:steam" })
    expect(raw).not.toHaveProperty("appIntegration")
  })

  it("reports no-such-game without writing an intent", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: "missing",
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({ status: "failed", category: "no-such-game" })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("reports a library-config failure when a known game has no launch target", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: librarySource({ games: [game], launchSpecs: new Map() }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "library-config",
    })
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("maps invalid stream launch specs to library-config before writing", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, { command: "echo", args: [] }]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "library-config",
    })
    expect(result.status === "failed" ? result.diagnostic : "").toContain(
      "absolute",
    )
    await expect(readFile(intentPath, "utf8")).rejects.toThrow()
  })

  it("cleans resolved artifacts when preparing the trusted intent fails", async () => {
    await withArtifactRoot(async root => {
      const dir = await mkdtemp(join(tmpdir(), "korri-cli-untrusted-intent-"))
      await chmod(dir, 0o755)
      const intentPath = join(dir, "next-launch.json")

      const result = await prepareStreamLaunchForGame({
        gameId: game.id,
        librarySource: librarySource({
          games: [game],
          launchSpecs: new Map([[game.id, launchSpec]]),
          artifacts: new Map([
            [
              game.id,
              {
                root,
                paths: { configPath: join(root, "retroarch.cfg") },
              },
            ],
          ]),
        }),
        intentStore: createFileGameStreamLaunchIntentStore(intentPath),
      })

      expect(result).toMatchObject({
        status: "failed",
        category: "prepare-failed",
      })
      await expectArtifactRootRemoved(root)
    })
  })

  it("preserves prepare failure diagnostics from the trusted intent store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "korri-cli-untrusted-intent-"))
    await chmod(dir, 0o755)
    const intentPath = join(dir, "next-launch.json")

    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
      }),
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "prepare-failed",
    })
    expect(result.status === "failed" ? result.diagnostic : "").toContain(
      "launch intent parent must not be group/world accessible",
    )
  })

  it("maps library source errors to library-config failures", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: {
        list: () =>
          Effect.fail(
            new LibraryError({ reason: "io", message: "disk missing" }),
          ),
        launchSpecFor: () => Effect.succeed(undefined),
        resolveLaunchForGame: () =>
          Effect.fail(
            new LibraryError({ reason: "config", message: "not implemented" }),
          ),
      },
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "library-config",
      message: "disk missing",
    })
  })

  it.each([
    ["config", "Library configuration problem"],
    ["io", "Could not read the configured library"],
    ["unavailable", "Library source is unavailable"],
  ] as const)("maps message-less %s library errors to actionable messages", async (reason, message) => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: {
        list: () => Effect.fail(new LibraryError({ reason })),
        launchSpecFor: () => Effect.succeed(undefined),
        resolveLaunchForGame: () =>
          Effect.fail(
            new LibraryError({ reason: "config", message: "not implemented" }),
          ),
      },
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "library-config",
      message,
    })
  })
})

async function tempIntentPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "korri-cli-intent-"))
  return join(dir, "next-launch.json")
}

function librarySource(options: {
  readonly games: readonly GameRecord[]
  readonly launchSpecs: ReadonlyMap<string, LaunchSpec>
  readonly launchCompanions?: ReadonlyMap<
    string,
    Readonly<Record<`@${string}:${string}`, unknown>>
  >
  readonly artifacts?: ReadonlyMap<string, LaunchArtifacts>
  readonly launchMetadata?: ReadonlyMap<
    string,
    { readonly appProviderId?: `@${string}:${string}` }
  >
}): LibrarySourceService {
  return {
    list: () => Effect.succeed(options.games),
    launchSpecFor: id => Effect.succeed(options.launchSpecs.get(id)),
    resolveLaunchForGame: id => {
      const spec = options.launchSpecs.get(id)
      const launchCompanions = options.launchCompanions?.get(id)
      const artifacts = options.artifacts?.get(id)
      const launchMetadata = options.launchMetadata?.get(id)
      return spec
        ? Effect.succeed({
            spec,
            ...(launchCompanions ? { launchCompanions } : {}),
            ...(launchMetadata ? { launchMetadata } : {}),
            ...(artifacts ? { artifacts } : {}),
          })
        : Effect.fail(
            new LibraryError({ reason: "config", message: "no spec" }),
          )
    },
  }
}
