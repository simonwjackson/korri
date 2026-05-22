import { describe, expect, it } from "bun:test"
import { withTempProseqlLibrary } from "../testing/library/with-temp-proseql-library"
import { validateLauncherConfig } from "./launcher-config-cli"

describe("validateLauncherConfig", () => {
  it("resolves a game id to a LaunchSpec via the cascade", async () => {
    await using library = await withTempProseqlLibrary({
      systems: [
        {
          id: "snes",
          launcher: "echo",
          cores: { echo: "snes9x_libretro.so" },
        },
      ],
      launchers: [
        {
          id: "echo",
          command: "/bin/echo",
          args: ["{contentPath}"],
          systems: ["snes"],
        },
      ],
      games: [
        {
          id: "game-1",
          system: "snes",
          contentPath: "content with spaces.smc",
          metadata: { name: "Game 1" },
        },
      ],
    })

    await expect(
      validateLauncherConfig({ root: library.root, gameId: "game-1" }),
    ).resolves.toEqual({
      status: "resolved",
      gameId: "game-1",
      spec: {
        command: "/bin/echo",
        args: ["content with spaces.smc"],
      },
    })
  })

  it("reports a GameNotFound diagnostic for an unknown game", async () => {
    await using library = await withTempProseqlLibrary({})

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "missing",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("GameNotFound")
    }
  })

  it("reports LauncherUnresolvable when no launcher is configured", async () => {
    await using library = await withTempProseqlLibrary({
      games: [
        {
          id: "game-1",
          system: "snes",
          contentPath: "/storage/roms/game-1.smc",
        },
      ],
    })

    const result = await validateLauncherConfig({
      root: library.root,
      gameId: "game-1",
    })

    expect(result.status).toBe("diagnostic")
    if (result.status === "diagnostic") {
      expect(result.reason).toBe("LauncherUnresolvable")
    }
  })
})
