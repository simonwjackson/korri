import { chmod, mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "bun:test"
import type { GameRecord } from "@shared/fixtures/games/game"
import {
  LibraryError,
  type LibrarySourceService,
} from "@shared/library/library-services"
import type { LaunchSpec } from "@shared/library/launcher"
import { Effect } from "effect"
import {
  createFileGameStreamLaunchIntentStore,
  decodeLaunchIntent,
} from "../device/game-stream-launch-intent"
import { prepareStreamLaunchForGame } from "./stream-launch"

const game: GameRecord = { id: "snes/f-zero.smc", metadata: { name: "F-Zero" } }
const launchSpec: LaunchSpec = { command: "/bin/echo", args: ["race"] }

describe("prepareStreamLaunchForGame", () => {
  it("writes a foreground launch intent for a known game id", async () => {
    const intentPath = await tempIntentPath()
    const result = await prepareStreamLaunchForGame({
      gameId: game.id,
      librarySource: librarySource({
        games: [game],
        launchSpecs: new Map([[game.id, launchSpec]]),
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
      },
      intentStore: createFileGameStreamLaunchIntentStore(intentPath),
    })

    expect(result).toMatchObject({
      status: "failed",
      category: "library-config",
      message: "disk missing",
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
}): LibrarySourceService {
  return {
    list: () => Effect.succeed(options.games),
    launchSpecFor: id => Effect.succeed(options.launchSpecs.get(id)),
  }
}
