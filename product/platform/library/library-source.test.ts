import { describe, expect, it } from "bun:test"

import type { GameRecord } from "@platform/fixtures/games/game"
import type { Launcher, LaunchResult, LaunchSpec } from "./launcher"
import type { LibrarySource } from "./library-source"

/**
 * Unit 1 contract test: a hand-rolled in-test fake (not a `Stub*` class)
 * proves the `LibrarySource` and `Launcher` interfaces compose. We are not
 * asserting behavior here — that lives in Units 3, 4, 6, 7. This file's
 * only job is to fail typecheck if the seam shapes drift.
 */

describe("LibrarySource + Launcher seams", () => {
  it("can be implemented by a literal that satisfies the interface", async () => {
    const game: GameRecord = {
      id: "snes/zelda",
      system: "snes",
      contentPath: "/storage/roms/snes/zelda.smc",
    }

    const source: LibrarySource = {
      list: async () => [game] as const,
      launchSpecFor: async id =>
        id === game.id ? { command: "/bin/true", args: [] } : undefined,
      resolveLaunchForGame: async id => {
        if (id !== game.id) throw new Error("unknown id")
        return {
          spec: { command: "/bin/true", args: [] },
          artifacts: {
            root: "/tmp/korri-launch-artifacts/game",
            paths: {
              contentPath: "/tmp/korri-launch-artifacts/game/zelda.smc",
            },
          },
        }
      },
    }

    const launcher: Launcher = {
      run: async (_spec: LaunchSpec): Promise<LaunchResult> => ({
        status: "launched",
      }),
    }

    const games = await source.list()
    expect(games).toHaveLength(1)
    expect(games[0]?.id).toBe("snes/zelda")

    const spec = await source.launchSpecFor("snes/zelda")
    expect(spec?.command).toBe("/bin/true")

    const missing = await source.launchSpecFor("does-not-exist")
    expect(missing).toBeUndefined()

    const resolved = await source.resolveLaunchForGame("snes/zelda")
    expect(resolved.artifacts?.root).toBe("/tmp/korri-launch-artifacts/game")

    const result = await launcher.run({ command: "/bin/true", args: [] })
    expect(result.status).toBe("launched")
  })

  it("LaunchResult discriminated union narrows on `status`", async () => {
    const launcher: Launcher = {
      run: async () => ({ status: "failed", exitCode: 7, stderrTail: "boom" }),
    }
    const result = await launcher.run({ command: "/bin/false", args: [] })
    if (result.status === "failed") {
      expect(result.exitCode).toBe(7)
      expect(result.stderrTail).toBe("boom")
    } else {
      throw new Error("expected failed result")
    }
  })
})
